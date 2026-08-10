"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Project = { id: "css" | "media"; name: string; repository: string; branch: string; description: string; endpoint: string; resourceManaged: boolean };
type Profile = { id: string; name: string; cpu: string; memory: string; databaseMemory: string; note: string };
type Pipeline = { id: string; number: number; name: string; status: string; conclusion: string | null; commit: string; branch: string; event: string; actor: string; createdAt: string; duration: string; url: string };
type Dashboard = {
  mode: "demo" | "live";
  projects: Project[];
  project: Project;
  service: { status: string; version: string; endpoint: string; latency: string };
  version: { latest: null | { sha: string; message: string; author: string; date: string; url: string }; deployed: string | null; updateAvailable: boolean };
  pipelines: Pipeline[];
  resourceProfiles: Profile[];
  error?: string;
};

const seed: Dashboard = {
  mode: "demo",
  projects: [
    { id: "css", name: "智能客服", repository: "qiubo-master/CSS", branch: "main", description: "现有智能客服生产服务", endpoint: "等待配置", resourceManaged: false },
    { id: "media", name: "序章自媒体中台", repository: "qiubo-master/Media", branch: "main", description: "内容生产、账号矩阵与 AI 决策中台", endpoint: "http://47.120.76.166:8080", resourceManaged: true },
  ],
  project: { id: "media", name: "序章自媒体中台", repository: "qiubo-master/Media", branch: "main", description: "内容生产、账号矩阵与 AI 决策中台", endpoint: "http://47.120.76.166:8080", resourceManaged: true },
  service: { status: "healthy", version: "—", endpoint: "http://47.120.76.166:8080", latency: "—" },
  version: { latest: null, deployed: null, updateAvailable: false },
  pipelines: [],
  resourceProfiles: [
    { id: "small", name: "轻量", cpu: "1.0", memory: "1g", databaseMemory: "512m", note: "体验和小流量" },
    { id: "standard", name: "标准", cpu: "2.0", memory: "2g", databaseMemory: "1g", note: "推荐生产配置" },
    { id: "large", name: "增强", cpu: "4.0", memory: "4g", databaseMemory: "2g", note: "高并发内容生产" },
  ],
};

function stateOf(run: Pipeline) {
  if (run.status !== "completed") return { text: "运行中", className: "running" };
  if (run.conclusion === "success") return { text: "成功", className: "success" };
  if (run.conclusion === "cancelled") return { text: "已取消", className: "muted" };
  return { text: "失败", className: "failed" };
}

export default function Home() {
  const [data, setData] = useState(seed);
  const [projectId, setProjectId] = useState<"css" | "media">("media");
  const [profile, setProfile] = useState("standard");
  const [hostPort, setHostPort] = useState("8080");
  const [exposure, setExposure] = useState<"direct" | "gateway">("direct");
  const [adminToken, setAdminToken] = useState("");
  const [busy, setBusy] = useState<"release" | "deploy" | "rollback" | null>(null);
  const [notice, setNotice] = useState("");
  const [showProvision, setShowProvision] = useState(false);

  const load = useCallback(async (selected = projectId) => {
    try {
      const response = await fetch(`/api/control-center?project=${selected}`, { cache: "no-store" });
      if (response.ok) setData(await response.json());
    } catch { /* keep last known data */ }
  }, [projectId]);

  useEffect(() => {
    const initial = setTimeout(() => {
      setAdminToken(sessionStorage.getItem("forgeops-admin-token") ?? "");
      void load();
    }, 0);
    const timer = setInterval(() => void load(), 12000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [load]);

  const selectProject = (id: "css" | "media") => {
    setProjectId(id); setNotice(""); setShowProvision(false); void load(id);
  };

  const trigger = async (action: "release" | "deploy" | "rollback") => {
    setBusy(action); setNotice(""); sessionStorage.setItem("forgeops-admin-token", adminToken);
    try {
      const response = await fetch("/api/control-center", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(adminToken ? { "x-admin-token": adminToken } : {}) },
        body: JSON.stringify({ action, projectId, branch: data.project.branch, resourceProfile: profile, hostPort, exposure }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "操作失败");
      setNotice(result.message);
      setTimeout(() => void load(), 1800);
    } catch (error) { setNotice(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(null); }
  };

  const selectedProfile = useMemo(() => data.resourceProfiles.find((item) => item.id === profile), [data.resourceProfiles, profile]);
  const latestRun = data.pipelines[0];
  const latestState = latestRun ? stateOf(latestRun) : null;

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brandMark">F</span><div><b>ForgeOps</b><small>Release Center</small></div></div>
      <nav aria-label="主导航"><a className="active" href="#release"><span>↑</span>版本发布</a><a href="#pipelines"><span>≋</span>流水线</a><a href="#resources"><span>▦</span>资源管理</a></nav>
      <div className="sideFoot"><span className="avatar">QB</span><div><b>qiubo-master</b><small>生产管理员</small></div></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><span className="crumb">阿里云 / 共享公网 IP / Docker</span><h1>CI/CD 发布控制中心</h1></div><div className="topActions"><span className={`mode ${data.mode}`}>{data.mode === "live" ? "LIVE" : "DEMO"}</span><button className="iconButton" onClick={() => load()} aria-label="刷新">↻</button></div></header>
      <div className="content">
        <section className="projectStrip" aria-label="部署项目">{data.projects.map((project) => <button key={project.id} className={projectId === project.id ? "projectCard selected" : "projectCard"} onClick={() => selectProject(project.id)}><span>{project.id === "media" ? "ME" : "AI"}</span><div><b>{project.name}</b><small>{project.repository}</small></div><em>{projectId === project.id ? "当前项目" : "切换"}</em></button>)}</section>

        <section className="releaseHero" id="release">
          <div className="releaseInfo"><div className="eyebrow"><span className="pulse"/> VERSION DELIVERY</div><h2>{data.project.name}</h2><p>{data.project.description}</p><div className="versionFlow"><div><small>线上版本</small><code>{data.version.deployed ?? data.service.version}</code></div><span>→</span><div><small>GitHub main</small><code>{data.version.latest?.sha ?? "等待同步"}</code></div>{data.version.updateAvailable && <b className="updateTag">有新版本</b>}</div>{data.version.latest && <p className="commitMessage">{data.version.latest.message} · {data.version.latest.author}</p>}</div>
          <div className="releaseActions"><label>管理员令牌<input type="password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="生产操作令牌"/></label><button className="releaseButton" onClick={() => trigger("release")} disabled={!!busy || latestRun?.status === "in_progress"}>{busy === "release" ? "正在创建流水线…" : "发布最新版本"}</button><button className="rollbackButton" onClick={() => trigger("rollback")} disabled={!!busy}>回滚上一版本</button><small>沿用现有 CPU、内存、端口与数据库卷</small></div>
        </section>
        {notice && <div className="notice" role="status">{notice}</div>}{data.error && <div className="notice warning">状态同步提示：{data.error}</div>}

        <section className="panel pipelinePanel" id="pipelines">
          <div className="panelHead"><div><span className="kicker">PIPELINE RUNS</span><h3>流水线列表</h3></div><div className="pipelineHeadActions">{latestState && <span className={`runState ${latestState.className}`}>最新：{latestState.text}</span>}<button className="secondary" onClick={() => trigger("release")} disabled={!!busy}>＋ 新建发布流水线</button></div></div>
          {data.pipelines.length ? <div className="pipelineTable"><div className="pipelineRow pipelineHeader"><span>流水线</span><span>版本</span><span>状态</span><span>触发方式</span><span>执行人</span><span>开始时间</span><span>耗时</span><span/></div>{data.pipelines.map((run) => { const state = stateOf(run); return <div className="pipelineRow" key={run.id}><span><b>{run.name}</b><small>#{run.number} · {run.branch}</small></span><code>{run.commit}</code><span><i className={`runState ${state.className}`}>{state.text}</i></span><span>{run.event === "workflow_dispatch" ? "手动发布" : run.event}</span><span>{run.actor}</span><span>{run.createdAt}</span><span>{run.duration}</span><a href={run.url} target="_blank" rel="noreferrer">详情 ↗</a></div>})}</div> : <div className="emptyPipelines"><b>暂无流水线</b><span>点击“新建发布流水线”开始第一次发布。</span></div>}
        </section>

        <section className="panel provisionPanel" id="resources">
          <div className="panelHead"><div><span className="kicker">INFRASTRUCTURE</span><h3>首次部署与资源调整</h3></div><button className="secondary" onClick={() => setShowProvision(!showProvision)}>{showProvision ? "收起" : "展开高级设置"}</button></div>
          <p className="provisionHint">日常代码更新请使用上方“发布最新版本”。这里只用于首次创建服务或调整容器资源。</p>
          {showProvision && data.project.resourceManaged && <div className="provisionBody"><div className="profileGrid">{data.resourceProfiles.map((item) => <button key={item.id} onClick={() => setProfile(item.id)} className={profile === item.id ? "profile selected" : "profile"}><b>{item.name}</b><span>{item.cpu} CPU · {item.memory} App</span><small>PostgreSQL {item.databaseMemory} · {item.note}</small></button>)}</div><div className="formGrid"><label>暴露方式<select value={exposure} onChange={(event) => setExposure(event.target.value as "direct" | "gateway")}><option value="direct">公网 IP + 独立端口</option><option value="gateway">统一 Nginx 网关</option></select></label><label>宿主机端口<input type="number" min="1024" max="65535" value={hostPort} onChange={(event) => setHostPort(event.target.value)}/></label></div><div className="allocationSummary"><span>资源配置</span><b>{selectedProfile?.cpu} CPU / {selectedProfile?.memory} 应用 / {selectedProfile?.databaseMemory} 数据库</b></div><button className="secondary provisionButton" onClick={() => trigger("deploy")} disabled={!!busy}>{busy === "deploy" ? "正在下发…" : "下发资源并部署"}</button></div>}
        </section>
      </div>
    </section>
  </main>;
}
