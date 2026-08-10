import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const fallback = {
  mode: "demo",
  project: { name: "轮胎智能客服", repository: "qiubo-master/CSS", environment: "Production", branch: "main" },
  service: { status: "healthy", version: "08fe261", endpoint: "等待配置阿里云地址", uptime: "6h 42m", latency: "38 ms" },
  server: { status: "online", cpu: 18, memory: 36, disk: 21, gpu: 0, vram: 58 },
  models: [
    { name: "Qwen3-8B", state: "Ready", processor: "100% GPU", memory: "7.0 GB" },
    { name: "Qwen3-Embedding 0.6B", state: "Ready", processor: "100% GPU", memory: "1.8 GB" },
  ],
  pipeline: { id: "run-184", status: "success", commit: "08fe261", actor: "qiubo-master", startedAt: "今天 03:58", stages: [
    { name: "代码检出", state: "success", duration: "4s" }, { name: "自动测试", state: "success", duration: "13s" },
    { name: "构建制品", state: "success", duration: "21s" }, { name: "部署绿色实例", state: "success", duration: "18s" },
    { name: "健康检查", state: "success", duration: "7s" }, { name: "切换流量", state: "success", duration: "2s" },
  ]},
  releases: [
    { id: "r5", version: "08fe261", commit: "restrict human handoff", branch: "main", status: "运行中", actor: "qiubo-master", time: "今天 03:58", duration: "1m 05s" },
    { id: "r4", version: "0a02262", commit: "expose on port 6006", branch: "main", status: "已归档", actor: "qiubo-master", time: "昨天 23:42", duration: "54s" },
    { id: "r3", version: "8d9e912", commit: "GPU compatible inference", branch: "main", status: "已归档", actor: "qiubo-master", time: "昨天 22:17", duration: "1m 12s" },
  ],
};

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
};

const headers = () => ({
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
});

function config() {
  const repository = process.env.GITHUB_REPOSITORY ?? "qiubo-master/CSS";
  const [owner, repo] = repository.split("/");
  return { owner, repo, repository, workflow: process.env.GITHUB_WORKFLOW_FILE ?? "deploy.yml" };
}

function authorize(request: NextRequest) {
  const expected = process.env.CONTROL_CENTER_ADMIN_TOKEN;
  return !expected || request.headers.get("x-admin-token") === expected;
}

export async function GET() {
  if (!process.env.GITHUB_TOKEN) return NextResponse.json(fallback);
  const { owner, repo, repository } = config();
  try {
    const [runsResponse, healthResult] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=8`, { headers: headers(), cache: "no-store" }),
      checkHealth(),
    ]);
    if (!runsResponse.ok) throw new Error(`GitHub ${runsResponse.status}`);
    const body = await runsResponse.json();
    const runs: GitHubRun[] = body.workflow_runs ?? [];
    const latest = runs[0];
    const releases = runs.slice(0, 6).map((run, index) => ({
      id: String(run.id), version: String(run.head_sha ?? "").slice(0, 7), commit: run.display_title || run.name,
      branch: run.head_branch, status: index === 0 && run.conclusion === "success" ? "运行中" : run.conclusion === "success" ? "已归档" : run.conclusion || run.status,
      actor: run.actor?.login ?? "unknown", time: new Date(run.created_at).toLocaleString("zh-CN"), duration: elapsed(run.run_started_at, run.updated_at),
    }));
    return NextResponse.json({
      ...fallback, mode: "live", project: { ...fallback.project, repository },
      service: { ...fallback.service, ...healthResult, version: latest?.head_sha?.slice(0, 7) ?? "unknown" },
      pipeline: latest ? {
        id: `run-${latest.run_number}`, status: latest.conclusion ?? latest.status, commit: latest.head_sha.slice(0, 7),
        actor: latest.actor?.login ?? "unknown", startedAt: new Date(latest.created_at).toLocaleString("zh-CN"),
        stages: stagesFor(latest.status, latest.conclusion),
      } : fallback.pipeline,
      releases: releases.length ? releases : fallback.releases,
    });
  } catch (error) {
    return NextResponse.json({ ...fallback, service: { ...fallback.service, status: "degraded" }, error: error instanceof Error ? error.message : "status unavailable" });
  }
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ message: "无权执行发布操作" }, { status: 401 });
  const input = await request.json();
  if (!["deploy", "rollback"].includes(input.action)) return NextResponse.json({ message: "不支持的操作" }, { status: 400 });
  if (!process.env.GITHUB_TOKEN) return NextResponse.json({ message: `演示模式：已模拟触发${input.action === "deploy" ? "部署" : "回滚"}流水线` });
  const { owner, repo, workflow } = config();
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST", headers: headers(), body: JSON.stringify({ ref: input.branch || "main", inputs: { action: input.action } }),
  });
  if (!response.ok) return NextResponse.json({ message: `GitHub Actions 触发失败：${response.status}` }, { status: 502 });
  return NextResponse.json({ message: `${input.action === "deploy" ? "部署" : "回滚"}流水线已触发，请稍后刷新状态` });
}

async function checkHealth() {
  const endpoint = process.env.TARGET_HEALTH_URL;
  if (!endpoint) return {};
  const started = Date.now();
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    return { status: response.ok ? "healthy" : "degraded", endpoint: endpoint.replace(/\/api\/v1\/health$/, ""), latency: `${Date.now() - started} ms` };
  } catch { return { status: "offline", endpoint, latency: "timeout" }; }
}

function elapsed(start?: string, end?: string) {
  if (!start || !end) return "—";
  const seconds = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000));
  return seconds > 59 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

function stagesFor(status: string, conclusion: string | null) {
  const names = ["代码检出", "自动测试", "构建制品", "部署绿色实例", "健康检查", "切换流量"];
  if (status === "completed") return names.map(name => ({ name, state: conclusion === "success" ? "success" : "failed" }));
  return names.map((name, index) => ({ name, state: index === 0 ? "running" : "pending" }));
}
