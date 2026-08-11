import { NextRequest, NextResponse } from "next/server";
import { deploymentProjects, getProject } from "../../../lib/deployment-projects";
import { assessCapacity, monitorTarget, projectUsage, publicTarget, serverTargets } from "../../../lib/infrastructure";

export const dynamic = "force-dynamic";

type GitHubRun = {
  id: number;
  run_number: number;
  head_sha: string;
  head_branch: string;
  display_title?: string;
  name: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  run_started_at?: string;
  updated_at?: string;
  actor?: { login?: string };
  html_url?: string;
  event?: string;
  workflow_id?: number;
};

const githubHeaders = () => ({
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
});

function authorize(request: NextRequest) {
  const expected = process.env.CONTROL_CENTER_ADMIN_TOKEN;
  const supplied = request.headers.get("x-admin-token") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return !expected || supplied === expected;
}

function stagesFor(status: string, conclusion: string | null) {
  const names = ["代码检出", "自动测试", "构建制品", "下发资源", "健康检查", "激活版本"];
  if (status === "completed") return names.map((name) => ({ name, state: conclusion === "success" ? "success" : "failed" }));
  return names.map((name, index) => ({ name, state: index === 0 ? "running" : "pending" }));
}

function elapsed(start?: string, end?: string) {
  if (!start || !end) return "—";
  const seconds = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000));
  return seconds > 59 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

async function checkHealth(url?: string) {
  if (!url) return { status: "unknown", latency: "—" };
  const started = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    return { status: response.ok ? "healthy" : "degraded", latency: `${Date.now() - started} ms` };
  } catch {
    return { status: "offline", latency: "timeout" };
  }
}

function demoRuns(projectId: string) {
  return projectId === "media" ? [
    { id: "media-ready", version: "待发布", commit: "资源编排已就绪", branch: "main", status: "待下发", actor: "ForgeOps", time: "现在", duration: "—" },
  ] : [
    { id: "css-live", version: "current", commit: "现有生产版本", branch: "main", status: "运行中", actor: "qiubo-master", time: "已部署", duration: "—" },
  ];
}

export async function GET(request: NextRequest) {
  const selected = getProject(request.nextUrl.searchParams.get("project"));
  const targets = await serverTargets();
  const [owner, repo] = selected.repository.split("/");
  const health = await checkHealth(selected.healthUrl);
  const monitoredServers = await Promise.all(targets.map(async (target) => {
    const monitor = await monitorTarget(target);
    return { ...publicTarget(target), ...monitor, projectUsage: projectUsage(monitor.snapshot), capacity: assessCapacity(monitor.snapshot, { cpu: 2, memoryMb: 3072, diskGb: 10 }) };
  }));
  let runs: GitHubRun[] = [];
  let latestCommit: { sha: string; message: string; author: string; date: string; url: string } | null = null;
  let mode: "demo" | "live" = "demo";
  let error: string | undefined;

  if (process.env.GITHUB_TOKEN) {
    try {
      const [runsResponse, commitResponse] = await Promise.all([
        fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=20`, { headers: githubHeaders(), cache: "no-store" }),
        fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${selected.branch}`, { headers: githubHeaders(), cache: "no-store" }),
      ]);
      if (!runsResponse.ok) throw new Error(`GitHub Actions API ${runsResponse.status}`);
      runs = (await runsResponse.json()).workflow_runs ?? [];
      if (commitResponse.ok) {
        const commit = await commitResponse.json();
        latestCommit = {
          sha: String(commit.sha).slice(0, 7),
          message: String(commit.commit?.message ?? "").split("\n")[0],
          author: commit.author?.login ?? commit.commit?.author?.name ?? "unknown",
          date: commit.commit?.committer?.date ?? "",
          url: commit.html_url ?? `https://github.com/${selected.repository}/commit/${commit.sha}`,
        };
      }
      mode = "live";
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "GitHub 状态不可用";
    }
  }

  const latest = runs[0];
  const latestSuccessfulDeploy = runs.find((run) => run.conclusion === "success" && /deploy/i.test(run.name));
  const releases = runs.length ? runs.slice(0, 6).map((run, index) => ({
    id: String(run.id),
    version: run.head_sha.slice(0, 7),
    commit: run.display_title || run.name,
    branch: run.head_branch,
    status: index === 0 && run.conclusion === "success" ? "运行中" : run.conclusion === "success" ? "已归档" : run.conclusion || run.status,
    actor: run.actor?.login ?? "unknown",
    time: new Date(run.created_at).toLocaleString("zh-CN"),
    duration: elapsed(run.run_started_at, run.updated_at),
  })) : demoRuns(selected.id);

  return NextResponse.json({
    mode,
    projects: deploymentProjects.map((project) => ({
      id: project.id,
      name: project.name,
      repository: project.repository,
      branch: project.branch,
      description: project.description,
      endpoint: project.endpoint,
      resourceManaged: project.resourceManaged,
      targetIds: project.targetIds,
    })),
    project: selected,
    servers: monitoredServers,
    service: { ...health, version: latestSuccessfulDeploy?.head_sha.slice(0, 7) ?? (selected.id === "media" ? "待发布" : "current"), endpoint: selected.endpoint },
    version: {
      latest: latestCommit,
      deployed: latestSuccessfulDeploy?.head_sha.slice(0, 7) ?? null,
      updateAvailable: Boolean(latestCommit && latestSuccessfulDeploy && !latestSuccessfulDeploy.head_sha.startsWith(latestCommit.sha)),
    },
    pipeline: latest ? {
      id: `run-${latest.run_number}`,
      status: latest.conclusion ?? latest.status,
      commit: latest.head_sha.slice(0, 7),
      actor: latest.actor?.login ?? "unknown",
      startedAt: new Date(latest.created_at).toLocaleString("zh-CN"),
      stages: stagesFor(latest.status, latest.conclusion),
    } : { id: "ready", status: "ready", commit: "—", actor: "ForgeOps", startedAt: "尚未执行", stages: stagesFor("queued", null) },
    releases,
    pipelines: runs.slice(0, 12).map((run) => ({
      id: String(run.id),
      number: run.run_number,
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      commit: run.head_sha.slice(0, 7),
      branch: run.head_branch,
      event: run.event ?? "workflow_dispatch",
      actor: run.actor?.login ?? "unknown",
      createdAt: new Date(run.created_at).toLocaleString("zh-CN"),
      duration: elapsed(run.run_started_at, run.updated_at),
      url: run.html_url ?? `https://github.com/${selected.repository}/actions/runs/${run.id}`,
    })),
    resourceProfiles: selected.resourceManaged ? [
      { id: "small", name: "轻量", cpu: "1.0", memory: "1g", databaseMemory: "512m", note: "体验和小流量" },
      { id: "standard", name: "标准", cpu: "2.0", memory: "2g", databaseMemory: "1g", note: "推荐生产配置" },
      { id: "large", name: "增强", cpu: "4.0", memory: "4g", databaseMemory: "2g", note: "高并发内容生产" },
    ] : [],
    error,
  });
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ message: "管理员令牌无效" }, { status: 401 });
  const input = await request.json();
  if (!["deploy", "release", "rollback"].includes(input.action)) return NextResponse.json({ message: "不支持的操作" }, { status: 400 });

  const project = getProject(input.projectId);
  const targets = await serverTargets();
  const target = targets.find((item) => item.id === input.targetId) ?? targets.find((item) => project.targetIds.includes(item.id));
  if (!target || !project.targetIds.includes(target.id)) return NextResponse.json({ message: "该项目未绑定此部署目标" }, { status: 400 });
  const profiles = {
    small: { cpu: "1.0", memory: "1g", database_memory: "512m" },
    standard: { cpu: "2.0", memory: "2g", database_memory: "1g" },
    large: { cpu: "4.0", memory: "4g", database_memory: "2g" },
  } as const;
  const profileName = input.resourceProfile in profiles ? input.resourceProfile as keyof typeof profiles : "standard";
  const port = Number(input.hostPort ?? 8080);
  if (project.id === "media" && (!Number.isInteger(port) || port < 1024 || port > 65535)) {
    return NextResponse.json({ message: "服务端口必须在 1024–65535 之间" }, { status: 400 });
  }

  if (!process.env.GITHUB_TOKEN) {
    const demoAction = input.action === "release" ? "发布" : input.action === "deploy" ? "下发" : "回滚";
    return NextResponse.json({ message: `演示模式：已模拟${demoAction}${project.name}` });
  }

  const [owner, repo] = project.repository.split("/");
  const workflowAction = input.action === "release" ? "deploy" : input.action;
  const workflowInputs: Record<string, string> = { action: workflowAction };
  if (project.id === "media") Object.assign(workflowInputs, {
    resource_profile: profileName,
    app_cpu: profiles[profileName].cpu,
    app_memory: profiles[profileName].memory,
    database_memory: profiles[profileName].database_memory,
    host_port: String(port),
    bind_address: input.exposure === "gateway" ? "127.0.0.1" : "0.0.0.0",
  });

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${project.workflow}/dispatches`, {
    method: "POST",
    headers: githubHeaders(),
    body: JSON.stringify({ ref: input.branch || project.branch, inputs: workflowInputs }),
  });
  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json({ message: `GitHub Actions 触发失败（${response.status}）`, detail }, { status: 502 });
  }
  const actionLabel = input.action === "release" ? "版本发布" : input.action === "deploy" ? "资源下发" : "回滚";
  return NextResponse.json({ message: `${project.name}${actionLabel}流水线已触发` });
}
