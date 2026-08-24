import { NextRequest, NextResponse } from "next/server";
import { saveCustomProject } from "../../../lib/deployment-projects";
import { saveServerTargets, serverTargets } from "../../../lib/infrastructure";

export const dynamic = "force-dynamic";

const workflow = `name: ForgeOps Deploy

on:
  workflow_dispatch:
    inputs:
      action: { description: Action, required: true, default: deploy, type: choice, options: [deploy, rollback] }
      resource_profile: { description: Resource profile, required: false, default: standard }
      app_cpu: { description: CPU limit, required: false, default: "2.0" }
      app_memory: { description: Memory limit, required: false, default: "2g" }
      database_memory: { description: Database memory, required: false, default: "1g" }
      host_port: { description: Host port, required: false, default: "8080" }
      bind_address: { description: Bind address, required: false, default: "0.0.0.0" }

concurrency: { group: forgeops-production, cancel-in-progress: false }

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Validate repository
        run: test -f docker-compose.yml || test -f compose.yml || test -f Dockerfile
      - name: Configure SSH
        env: { SSH_PRIVATE_KEY: "\${{ secrets.DEPLOY_SSH_KEY }}", SSH_HOST_KEY: "\${{ secrets.DEPLOY_HOST_KEY }}" }
        run: |
          install -m 700 -d ~/.ssh
          printf '%s\n' "$SSH_PRIVATE_KEY" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          printf '%s\n' "$SSH_HOST_KEY" > ~/.ssh/known_hosts
      - name: Upload release
        env: { HOST: "\${{ secrets.DEPLOY_HOST }}", PORT: "\${{ secrets.DEPLOY_PORT }}", USER: "\${{ secrets.DEPLOY_USER }}" }
        run: |
          tar --exclude=.git --exclude=node_modules -czf /tmp/release.tgz .
          scp -i ~/.ssh/deploy_key -P "$PORT" /tmp/release.tgz "$USER@$HOST:/tmp/forgeops-\${GITHUB_SHA}.tgz"
      - name: Activate release
        env:
          HOST: "\${{ secrets.DEPLOY_HOST }}"
          PORT: "\${{ secrets.DEPLOY_PORT }}"
          USER: "\${{ secrets.DEPLOY_USER }}"
          PROJECT_ID: "\${{ github.event.repository.name }}"
          APP_CPU: "\${{ inputs.app_cpu }}"
          APP_MEMORY: "\${{ inputs.app_memory }}"
          HOST_PORT: "\${{ inputs.host_port }}"
          BIND_ADDRESS: "\${{ inputs.bind_address }}"
        run: |
          ssh -i ~/.ssh/deploy_key -p "$PORT" "$USER@$HOST" "PROJECT_ID='$PROJECT_ID' RELEASE_SHA='$GITHUB_SHA' APP_CPU='$APP_CPU' APP_MEMORY='$APP_MEMORY' HOST_PORT='$HOST_PORT' BIND_ADDRESS='$BIND_ADDRESS' bash -s" <<'REMOTE'
          set -euo pipefail
          root="/opt/forgeops/$PROJECT_ID"; release="$root/releases/$RELEASE_SHA"
          mkdir -p "$release" "$root/shared"
          tar -xzf "/tmp/forgeops-$RELEASE_SHA.tgz" -C "$release"
          cd "$release"; test ! -f "$root/shared/.env" || ln -sfn "$root/shared/.env" .env
          export APP_CPU APP_MEMORY HOST_PORT BIND_ADDRESS
          if test -f docker-compose.yml || test -f compose.yml; then docker compose up -d --build; else docker build -t "$PROJECT_ID:$RELEASE_SHA" .; docker rm -f "$PROJECT_ID" 2>/dev/null || true; docker run -d --name "$PROJECT_ID" --restart unless-stopped --cpus "$APP_CPU" --memory "$APP_MEMORY" -p "$BIND_ADDRESS:$HOST_PORT:3000" --env-file "$root/shared/.env" "$PROJECT_ID:$RELEASE_SHA"; fi
          ln -sfn "$release" "$root/current"
          REMOTE
`;

const headers = () => ({ Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", "User-Agent": "ForgeOps-ControlCenter" });

function authorized(request: NextRequest) {
  const expected = process.env.CONTROL_CENTER_ADMIN_TOKEN;
  const supplied = request.headers.get("x-admin-token") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return !expected || supplied === expected;
}

function repositoryName(value: unknown) {
  const input = String(value ?? "").trim().replace(/\.git$/, "");
  const match = input.match(/(?:github\.com\/)?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/);
  return match?.[1] ?? "";
}

async function github(path: string, init?: RequestInit) {
  return fetch(`https://api.github.com${path}`, { ...init, headers: headers(), cache: "no-store" });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ message: "管理员令牌无效" }, { status: 401 });
  if (!process.env.GITHUB_TOKEN) return NextResponse.json({ message: "控制中心未配置 GitHub Token" }, { status: 503 });
  try {
    const input = await request.json();
    const repository = repositoryName(input.repository);
    const id = String(input.id ?? "").trim().toLowerCase();
    if (!repository) throw new Error("请输入正确的 GitHub 仓库地址，例如 https://github.com/owner/repo");
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id)) throw new Error("项目 ID 只能包含小写字母、数字和连字符");
    const repoResponse = await github(`/repos/${repository}`);
    if (!repoResponse.ok) throw new Error(`无法访问仓库（GitHub ${repoResponse.status}）`);
    const repo = await repoResponse.json();
    const branch = String(input.branch || repo.default_branch || "main");
    const checks = await Promise.all(["Dockerfile", "docker-compose.yml", "compose.yml", `.github/workflows/${input.workflow || "deploy.yml"}`].map(async (path) => ({ path, ok: (await github(`/repos/${repository}/contents/${path}?ref=${encodeURIComponent(branch)}`)).ok })));
    let workflowReady = checks[3].ok;
    if (input.bootstrapWorkflow && !workflowReady) {
      if (!repo.default_branch) throw new Error("仓库为空，请先推送至少一个包含 Dockerfile 或 Compose 的提交");
      const put = await github(`/repos/${repository}/contents/.github/workflows/${input.workflow || "deploy.yml"}`, { method: "PUT", body: JSON.stringify({ message: "ci: add ForgeOps deployment workflow", content: Buffer.from(workflow).toString("base64"), branch }) });
      if (!put.ok) throw new Error(`自动创建流水线失败（GitHub ${put.status}），请检查 Contents: Read and write 权限`);
      workflowReady = true;
    }
    const targets = await serverTargets();
    const target = targets.find((item) => item.id === input.targetId);
    if (!target) throw new Error("部署目标不存在");
    if (!target.projectIds.includes(id)) target.projectIds.push(id);
    await saveServerTargets(targets);
    await saveCustomProject({ id, name: String(input.name || id).trim(), repository, workflow: String(input.workflow || "deploy.yml"), branch, description: String(input.description || "由 ForgeOps 管理的部署项目"), healthUrl: String(input.healthUrl || "").trim() || undefined, endpoint: String(input.endpoint || "等待首次发布").trim(), resourceManaged: true, targetIds: [target.id] });
    let deploymentTriggered = false;
    let deploymentError: string | undefined;
    if (input.deployNow && workflowReady) {
      const dispatch = await github(`/repos/${repository}/actions/workflows/${input.workflow || "deploy.yml"}/dispatches`, { method: "POST", body: JSON.stringify({ ref: branch, inputs: { action: "deploy", resource_profile: String(input.resourceProfile || "standard"), app_cpu: input.resourceProfile === "small" ? "1.0" : input.resourceProfile === "large" ? "4.0" : "2.0", app_memory: input.resourceProfile === "small" ? "1g" : input.resourceProfile === "large" ? "4g" : "2g", database_memory: input.resourceProfile === "small" ? "512m" : input.resourceProfile === "large" ? "2g" : "1g", host_port: String(input.hostPort || "8080"), bind_address: input.exposure === "gateway" ? "127.0.0.1" : "0.0.0.0" } }) });
      deploymentTriggered = dispatch.status === 204;
      if (!deploymentTriggered) deploymentError = `流水线触发失败（GitHub ${dispatch.status}），请确认 Actions 权限与 production Secrets`;
    }
    return NextResponse.json({ message: deploymentTriggered ? `${input.name || id} 已接入并开始首次发布` : `${input.name || id} 已接入`, projectId: id, repository, workflowReady, deploymentTriggered, deploymentError, checks, secretsRequired: ["DEPLOY_HOST", "DEPLOY_PORT", "DEPLOY_USER", "DEPLOY_SSH_KEY", "DEPLOY_HOST_KEY"] }, { status: 201 });
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "项目接入失败" }, { status: 400 });
  }
}
