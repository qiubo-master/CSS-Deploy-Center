"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type ProjectId = string;
type Project = { id: ProjectId; name: string; repository: string; branch: string; description: string; manualUrl?: string; endpoint: string; resourceManaged: boolean; targetIds: string[] };
type Profile = { id: string; name: string; cpu: string; memory: string; databaseMemory: string; note: string };
type Pipeline = { id: string; number: number; name: string; status: string; conclusion: string | null; commit: string; branch: string; event: string; actor: string; createdAt: string; duration: string; url: string };
type ProjectUsage = { projectId: string; containerCount: number; cpuUsedPercent: number; memoryUsedMb: number; memoryLimitMb: number; containers: string[] };
type Server = { id: string; name: string; provider: string; kind: string; region: string; address: string; projectIds: string[]; status: string; error?: string; projectUsage?: ProjectUsage[]; snapshot: null | { cpuTotal: number; cpuUsedPercent: number; memoryTotalMb: number; memoryUsedMb: number; diskTotalGb: number; diskUsedGb: number; gpu?: { name: string; memoryTotalMb: number; memoryUsedMb: number; utilizationPercent: number }[]; collectedAt: string }; capacity: { eligible: boolean; level: string; reason: string } };
type Dashboard = {
  mode: "demo" | "live";
  projects: Project[];
  project: Project;
  service: { status: string; version: string; endpoint: string; latency: string };
  version: { latest: null | { sha: string; message: string; author: string; date: string; url: string }; deployed: string | null; updateAvailable: boolean };
  pipelines: Pipeline[];
  latestSteps: { name: string; status: string; conclusion: string | null; number: number }[];
  resourceProfiles: Profile[];
  servers: Server[];
  error?: string;
};

const seed: Dashboard = {
  mode: "demo",
  projects: [
    { id: "css", name: "智能客服", repository: "qiubo-master/CSS", branch: "main", description: "现有智能客服生产服务", endpoint: "等待配置", resourceManaged: false, targetIds: ["aliyun-main"] },
    { id: "media", name: "序章自媒体中台", repository: "qiubo-master/Media", branch: "main", description: "内容生产、账号矩阵与 AI 决策中台", endpoint: "http://47.113.191.114:8080", resourceManaged: true, targetIds: ["aliyun-main"] },
    { id: "word-game", name: "WordGame 单词闯关", repository: "qiubo-master/WordGame", branch: "master", description: "支持账号、闯关和进度存档的单词学习游戏", manualUrl: "https://github.com/qiubo-master/WordGame/blob/master/deploy-cloudbase.md", endpoint: "https://wordgame-1-d7gx6qvym115a8f41.tcloudbase.com", resourceManaged: false, targetIds: [] },
    { id: "gfm", name: "GFM 通用大模型基座", repository: "qiubo-master/GFM", branch: "master", description: "统一提供文本、Embedding、视觉检测、OCR 与多模态 API", endpoint: "等待配置访问地址", resourceManaged: false, targetIds: ["autodl2"] },
    { id: "otel", name: "Otel 可观测平台", repository: "qiubo-master/Otel", branch: "main", description: "统一采集指标、链路与日志，提供 Grafana、Prometheus、Tempo 和 Elasticsearch 可观测能力", manualUrl: "https://github.com/qiubo-master/Otel/blob/main/docs/OPERATIONS.md", endpoint: "http://100.103.132.88:3000", resourceManaged: true, targetIds: ["aliyun-main"] },
    { id: "deploy-center", name: "CI/CD 发布控制中心", repository: "qiubo-master/CSS-Deploy-Center", branch: "master", description: "本控制台自身，支持自举发布", endpoint: "http://100.103.132.88", resourceManaged: false, targetIds: ["aliyun-main"] },
  ],
  project: { id: "media", name: "序章自媒体中台", repository: "qiubo-master/Media", branch: "main", description: "内容生产、账号矩阵与 AI 决策中台", endpoint: "http://47.113.191.114:8080", resourceManaged: true, targetIds: ["aliyun-main"] },
  service: { status: "healthy", version: "—", endpoint: "http://47.113.191.114:8080", latency: "—" },
  version: { latest: null, deployed: null, updateAvailable: false },
  pipelines: [],
  latestSteps: [],
  resourceProfiles: [
    { id: "small", name: "轻量", cpu: "1.0", memory: "1g", databaseMemory: "512m", note: "体验和小流量" },
    { id: "standard", name: "标准", cpu: "2.0", memory: "2g", databaseMemory: "1g", note: "推荐生产配置" },
    { id: "large", name: "增强", cpu: "4.0", memory: "4g", databaseMemory: "2g", note: "高并发内容生产" },
  ],
  servers: [{ id: "aliyun-main", name: "新生产服务器", provider: "阿里云", kind: "cloud", region: "Tailscale 私网", address: "100.103.132.88", projectIds: ["css", "media", "otel", "deploy-center"], status: "unconfigured", snapshot: null, capacity: { eligible: false, level: "unknown", reason: "监控代理未接入，无法安全下发" } }],
};

function stateOf(run: Pipeline) {
  if (run.status !== "completed") return { text: "运行中", className: "running" };
  if (run.conclusion === "success") return { text: "成功", className: "success" };
  if (run.conclusion === "cancelled") return { text: "已取消", className: "muted" };
  return { text: "失败", className: "failed" };
}

export default function Home() {
  const [data, setData] = useState(seed);
  const [projectId, setProjectId] = useState<ProjectId>("media");
  const [busy, setBusy] = useState<"release" | "rollback" | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async (selected = projectId) => {
    try {
      const response = await fetch(`/api/control-center?project=${selected}`, { cache: "no-store" });
      if (response.ok) setData(await response.json());
    } catch { /* keep last known data */ }
  }, [projectId]);

  useEffect(() => {
    const initial = setTimeout(() => { void load(); }, 0);
    const timer = setInterval(() => void load(), 12000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [load]);

  const selectProject = (id: ProjectId) => {
    setProjectId(id); setNotice(""); void load(id);
  };

  const trigger = async (action: "release" | "rollback") => {
    setBusy(action); setNotice("");
    try {
      const response = await fetch("/api/control-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, projectId, branch: data.project.branch }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "操作失败");
      setNotice(result.message);
      setTimeout(() => void load(), 1800);
    } catch (error) { setNotice(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(null); }
  };

  const latestRun = data.pipelines[0];
  const latestState = latestRun ? stateOf(latestRun) : null;

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brandMark">F</span><div><b>ForgeOps</b><small>Release Center</small></div></div>
      <nav aria-label="主导航"><Link className="active" href="/#projects"><span>◇</span>项目管理</Link><Link href="/#release"><span>↑</span>版本发布</Link><Link href="/#pipelines"><span>≋</span>流水线</Link><Link href="/resources"><span>＋</span>资源接入</Link><Link href="/servers"><span>▦</span>服务器</Link></nav>
      <div className="sideFoot"><span className="avatar">QB</span><div><b>qiubo-master</b><small>生产管理员</small></div></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><span className="crumb">阿里云 / 共享公网 IP / Docker</span><h1>CI/CD 发布控制中心</h1></div><div className="topActions"><span className={`mode ${data.mode}`}>{data.mode === "live" ? "LIVE" : "DEMO"}</span><button className="iconButton" onClick={() => load()} aria-label="刷新">↻</button></div></header>
      <div className="content">
        <section id="projects" className="overviewHead"><div><span className="kicker">PROJECT PORTFOLIO</span><h2>项目管理</h2><p>以项目为中心管理代码仓库、部署目标、运行状态和发布流水线。</p></div><span>{data.projects.length} 个项目</span></section>
        <section className="projectStrip" aria-label="部署项目">{data.projects.map((project) => <button key={project.id} className={projectId === project.id ? "projectCard selected" : "projectCard"} onClick={() => selectProject(project.id)}><span>{project.id === "media" ? "ME" : "AI"}</span><div><b>{project.name}</b><small>{project.repository}</small><small>{project.endpoint.startsWith("http") ? <a href={project.endpoint} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{project.endpoint}</a> : project.endpoint}</small></div><em>{projectId === project.id ? "当前项目" : "查看项目"}</em></button>)}</section>

        <section className="releaseHero" id="release">
          <div className="releaseInfo"><div className="eyebrow"><span className="pulse"/> VERSION DELIVERY</div><h2>{data.project.name}</h2><p>{data.project.description}</p><div className="projectLinks">{data.project.endpoint.startsWith("http") && <a href={data.project.endpoint} target="_blank" rel="noreferrer">访问项目 ↗</a>}<a href={data.project.manualUrl ?? `https://github.com/${data.project.repository}/blob/${data.project.branch}/README.md`} target="_blank" rel="noreferrer">操作手册 ↗</a></div><div className="versionFlow"><div><small>线上版本</small><code>{data.version.deployed ?? data.service.version}</code></div><span>→</span><div><small>GitHub {data.project.branch}</small><code>{data.version.latest?.sha ?? "等待同步"}</code></div>{data.version.updateAvailable && <b className="updateTag">有新版本</b>}</div>{data.version.latest && <p className="commitMessage">{data.version.latest.message} · {data.version.latest.author}</p>}</div>
          <div className="releaseActions"><button className="releaseButton" onClick={() => trigger("release")} disabled={!!busy || latestRun?.status === "in_progress"}>{busy === "release" ? "正在创建流水线…" : "发布最新版本"}</button><button className="rollbackButton" onClick={() => trigger("rollback")} disabled={!!busy}>回滚上一版本</button></div>
        </section>
        {notice && <div className="notice" role="status">{notice}</div>}{data.error && <div className="notice warning">状态同步提示：{data.error}</div>}

        <section className="panel pipelinePanel" id="pipelines">
          <div className="panelHead"><div><span className="kicker">PIPELINE RUNS</span><h3>流水线列表</h3></div><div className="pipelineHeadActions">{latestState && <span className={`runState ${latestState.className}`}>最新：{latestState.text}</span>}<button className="secondary" onClick={() => trigger("release")} disabled={!!busy}>＋ 新建发布流水线</button></div></div>
          {data.latestSteps.length > 0 && <div className="liveStages"><div><b>最新流水线实时阶段</b><span>页面每 12 秒自动同步 GitHub Actions</span></div><ol>{data.latestSteps.map((step) => <li key={`${step.number}-${step.name}`} className={step.status !== "completed" ? "running" : step.conclusion === "success" ? "success" : "failed"}><i>{step.status !== "completed" ? "↻" : step.conclusion === "success" ? "✓" : "!"}</i><span>{step.name}</span></li>)}</ol></div>}
          {data.pipelines.length ? <div className="pipelineTable"><div className="pipelineRow pipelineHeader"><span>流水线</span><span>版本</span><span>状态</span><span>触发方式</span><span>执行人</span><span>开始时间</span><span>耗时</span><span/></div>{data.pipelines.map((run) => { const state = stateOf(run); return <div className="pipelineRow" key={run.id}><span><b>{run.name}</b><small>#{run.number} · {run.branch}</small></span><code>{run.commit}</code><span><i className={`runState ${state.className}`}>{state.text}</i></span><span>{run.event === "workflow_dispatch" ? "手动发布" : run.event}</span><span>{run.actor}</span><span>{run.createdAt}</span><span>{run.duration}</span><a href={run.url} target="_blank" rel="noreferrer">详情 ↗</a></div>})}</div> : <div className="emptyPipelines"><b>暂无流水线</b><span>点击“新建发布流水线”开始第一次发布。</span></div>}
        </section>
      </div>
    </section>
  </main>;
}
