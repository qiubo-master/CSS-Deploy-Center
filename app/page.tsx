"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ProjectId = "css" | "media" | "ai-wms";
type Project = { id: ProjectId; name: string; repository: string; branch: string; description: string; endpoint: string; resourceManaged: boolean; targetIds: string[] };
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
  resourceProfiles: Profile[];
  servers: Server[];
  error?: string;
};

const seed: Dashboard = {
  mode: "demo",
  projects: [
    { id: "css", name: "智能客服", repository: "qiubo-master/CSS", branch: "main", description: "现有智能客服生产服务", endpoint: "等待配置", resourceManaged: false, targetIds: ["aliyun-main"] },
    { id: "media", name: "序章自媒体中台", repository: "qiubo-master/Media", branch: "main", description: "内容生产、账号矩阵与 AI 决策中台", endpoint: "http://47.120.76.166:8080", resourceManaged: true, targetIds: ["aliyun-main"] },
    { id: "ai-wms", name: "AI供应链智能备货", repository: "qiubo-master/AI_WMS", branch: "main", description: "轮胎需求预测、库存监控与AI解释演示系统", endpoint: "http://47.120.61.139:3000", resourceManaged: false, targetIds: ["aliyun-ai-wms"] },
  ],
  project: { id: "media", name: "序章自媒体中台", repository: "qiubo-master/Media", branch: "main", description: "内容生产、账号矩阵与 AI 决策中台", endpoint: "http://47.120.76.166:8080", resourceManaged: true, targetIds: ["aliyun-main"] },
  service: { status: "healthy", version: "—", endpoint: "http://47.120.76.166:8080", latency: "—" },
  version: { latest: null, deployed: null, updateAvailable: false },
  pipelines: [],
  resourceProfiles: [
    { id: "small", name: "轻量", cpu: "1.0", memory: "1g", databaseMemory: "512m", note: "体验和小流量" },
    { id: "standard", name: "标准", cpu: "2.0", memory: "2g", databaseMemory: "1g", note: "推荐生产配置" },
    { id: "large", name: "增强", cpu: "4.0", memory: "4g", databaseMemory: "2g", note: "高并发内容生产" },
  ],
  servers: [{ id: "aliyun-main", name: "阿里云生产服务器", provider: "阿里云", kind: "cloud", region: "华东", address: "47.120.76.166", projectIds: ["css", "media"], status: "unconfigured", snapshot: null, capacity: { eligible: false, level: "unknown", reason: "监控代理未接入，无法安全下发" } }],
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
  const [profile, setProfile] = useState("standard");
  const [hostPort, setHostPort] = useState("8080");
  const [exposure, setExposure] = useState<"direct" | "gateway">("direct");
  const [adminToken, setAdminToken] = useState("");
  const [busy, setBusy] = useState<"release" | "deploy" | "rollback" | null>(null);
  const [notice, setNotice] = useState("");
  const [showProvision, setShowProvision] = useState(false);
  const [targetId, setTargetId] = useState("aliyun-main");
  const [showServerForm, setShowServerForm] = useState(false);
  const [serverForm, setServerForm] = useState({ id: "", name: "", provider: "阿里云", kind: "cloud", region: "", address: "", monitorUrl: "", monitorToken: "", projectIds: ["media"] as string[] });

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

  const selectProject = (id: ProjectId) => {
    const project = data.projects.find((item) => item.id === id);
    setProjectId(id); setTargetId(project?.targetIds[0] ?? ""); setNotice(""); setShowProvision(false); void load(id);
  };

  const trigger = async (action: "release" | "deploy" | "rollback") => {
    setBusy(action); setNotice(""); sessionStorage.setItem("forgeops-admin-token", adminToken);
    try {
      const response = await fetch("/api/control-center", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(adminToken ? { "x-admin-token": adminToken } : {}) },
        body: JSON.stringify({ action, projectId, targetId, branch: data.project.branch, resourceProfile: profile, hostPort, exposure }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "操作失败");
      setNotice(result.message);
      setTimeout(() => void load(), 1800);
    } catch (error) { setNotice(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(null); }
  };

  const addServer = async () => {
    setBusy("deploy"); setNotice(""); sessionStorage.setItem("forgeops-admin-token", adminToken);
    try {
      const response = await fetch("/api/servers", { method: "POST", headers: { "Content-Type": "application/json", ...(adminToken ? { "x-admin-token": adminToken } : {}) }, body: JSON.stringify(serverForm) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "保存服务器失败");
      setNotice(result.message); setShowServerForm(false); setServerForm({ id: "", name: "", provider: "阿里云", kind: "cloud", region: "", address: "", monitorUrl: "", monitorToken: "", projectIds: ["media"] }); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "保存服务器失败"); }
    finally { setBusy(null); }
  };

  const selectedProfile = useMemo(() => data.resourceProfiles.find((item) => item.id === profile), [data.resourceProfiles, profile]);
  const latestRun = data.pipelines[0];
  const latestState = latestRun ? stateOf(latestRun) : null;
  const projectServers = data.servers.filter((server) => data.project.targetIds.includes(server.id));
  const selectedServer = data.servers.find((server) => server.id === targetId);

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brandMark">F</span><div><b>ForgeOps</b><small>Release Center</small></div></div>
      <nav aria-label="主导航"><a className="active" href="#projects"><span>◇</span>项目管理</a><a href="#servers"><span>▦</span>服务器</a><a href="#release"><span>↑</span>版本发布</a><a href="#pipelines"><span>≋</span>流水线</a></nav>
      <div className="sideFoot"><span className="avatar">QB</span><div><b>qiubo-master</b><small>生产管理员</small></div></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><span className="crumb">阿里云 / 共享公网 IP / Docker</span><h1>CI/CD 发布控制中心</h1></div><div className="topActions"><span className={`mode ${data.mode}`}>{data.mode === "live" ? "LIVE" : "DEMO"}</span><button className="iconButton" onClick={() => load()} aria-label="刷新">↻</button></div></header>
      <div className="content">
        <section id="projects" className="overviewHead"><div><span className="kicker">PROJECT PORTFOLIO</span><h2>项目管理</h2><p>以项目为中心管理代码仓库、部署目标、运行状态和发布流水线。</p></div><span>{data.projects.length} 个项目 · {data.servers.length} 台服务器</span></section>
        <section className="projectStrip" aria-label="部署项目">{data.projects.map((project) => { const bound = data.servers.filter((server) => project.targetIds.includes(server.id)); return <button key={project.id} className={projectId === project.id ? "projectCard selected" : "projectCard"} onClick={() => selectProject(project.id)}><span>{project.id === "media" ? "ME" : "AI"}</span><div><b>{project.name}</b><small>{project.repository}</small><small>{bound.length} 个部署目标 · {project.endpoint}</small></div><em>{projectId === project.id ? "当前项目" : "查看项目"}</em></button>})}</section>

        <section className="panel serverPanel" id="servers">
          <div className="panelHead"><div><span className="kicker">SERVER FLEET</span><h3>云服务器与 AutoDL 资源监控</h3></div><div className="serverActions"><span className="refreshNote">每 12 秒刷新 · 下发前保留安全余量</span><button className="secondary" onClick={() => setShowServerForm(!showServerForm)}>＋ 接入服务器</button></div></div>
          {showServerForm && <div className="serverForm"><div className="formGrid"><label>服务器 ID<input value={serverForm.id} onChange={(event) => setServerForm({ ...serverForm, id: event.target.value })} placeholder="autodl-gpu-1"/></label><label>显示名称<input value={serverForm.name} onChange={(event) => setServerForm({ ...serverForm, name: event.target.value })} placeholder="AutoDL GPU 01"/></label><label>类型<select value={serverForm.kind} onChange={(event) => setServerForm({ ...serverForm, kind: event.target.value })}><option value="cloud">云服务器</option><option value="autodl">AutoDL</option><option value="bare-metal">裸金属</option></select></label><label>服务商<input value={serverForm.provider} onChange={(event) => setServerForm({ ...serverForm, provider: event.target.value })} placeholder="阿里云 / AutoDL"/></label><label>区域<input value={serverForm.region} onChange={(event) => setServerForm({ ...serverForm, region: event.target.value })} placeholder="cn-hangzhou"/></label><label>服务器地址<input value={serverForm.address} onChange={(event) => setServerForm({ ...serverForm, address: event.target.value })} placeholder="IP 或主机名"/></label><label>监控接口<input value={serverForm.monitorUrl} onChange={(event) => setServerForm({ ...serverForm, monitorUrl: event.target.value })} placeholder="https://host/v1/resources"/></label><label>监控令牌<input type="password" value={serverForm.monitorToken} onChange={(event) => setServerForm({ ...serverForm, monitorToken: event.target.value })} placeholder="代理的只读令牌"/></label></div><fieldset><legend>绑定项目</legend>{data.projects.map((project) => <label key={project.id}><input type="checkbox" checked={serverForm.projectIds.includes(project.id)} onChange={(event) => setServerForm({ ...serverForm, projectIds: event.target.checked ? [...serverForm.projectIds, project.id] : serverForm.projectIds.filter((id) => id !== project.id) })}/>{project.name}</label>)}</fieldset><div className="serverFormActions"><button className="secondary" onClick={() => setShowServerForm(false)}>取消</button><button className="releaseButton" onClick={addServer} disabled={!!busy}>保存并接入</button></div></div>}
          <div className="serverGrid">{data.servers.map((server) => { const memoryPercent = server.snapshot ? Math.round(server.snapshot.memoryUsedMb / server.snapshot.memoryTotalMb * 100) : 0; const diskPercent = server.snapshot ? Math.round(server.snapshot.diskUsedGb / server.snapshot.diskTotalGb * 100) : 0; return <article key={server.id} className={`serverCard ${server.status}`}><header><div><b>{server.name}</b><small>{server.provider} · {server.region} · {server.address}</small></div><i className={`runState ${server.status === "online" ? "success" : server.status === "offline" ? "failed" : "muted"}`}>{server.status === "online" ? "在线" : server.status === "offline" ? "离线" : "待接入监控"}</i></header>{server.snapshot ? <><div className="metric"><span>CPU <b>{server.snapshot.cpuUsedPercent}%</b></span><progress max="100" value={server.snapshot.cpuUsedPercent}/><small>{server.snapshot.cpuTotal} 核</small></div><div className="metric"><span>内存 <b>{memoryPercent}%</b></span><progress max="100" value={memoryPercent}/><small>{server.snapshot.memoryUsedMb} / {server.snapshot.memoryTotalMb} MB</small></div><div className="metric"><span>磁盘 <b>{diskPercent}%</b></span><progress max="100" value={diskPercent}/><small>{server.snapshot.diskUsedGb} / {server.snapshot.diskTotalGb} GB</small></div>{server.snapshot.gpu?.map((gpu) => <div className="metric" key={gpu.name}><span>GPU {gpu.name} <b>{gpu.utilizationPercent}%</b></span><progress max="100" value={gpu.utilizationPercent}/><small>显存 {gpu.memoryUsedMb} / {gpu.memoryTotalMb} MB</small></div>)}</> : <div className="agentEmpty"><b>尚无资源快照</b><span>{server.error ?? "配置监控代理后显示实时 CPU、内存、磁盘和 GPU"}</span></div>}<div className="projectUsage"><b>项目资源占用</b>{server.projectUsage?.length ? server.projectUsage.map((usage) => <div key={usage.projectId}><span><strong>{data.projects.find((project) => project.id === usage.projectId)?.name ?? (usage.projectId === "deploy-center" ? "CI/CD 控制中心" : usage.projectId)}</strong><small>{usage.containerCount} 个容器 · {usage.containers.join("、")}</small></span><code>CPU {usage.cpuUsedPercent}% · 内存 {usage.memoryUsedMb} MB / {usage.memoryLimitMb} MB</code></div>) : <span className="noUsage">监控接入后自动按 Docker Compose 项目统计</span>}</div><footer><span>绑定 {server.projectIds.length} 个项目</span><strong className={server.capacity.eligible ? "ready" : "blocked"}>{server.capacity.eligible ? "可下发" : "暂不可下发"}</strong></footer><p>{server.capacity.reason}</p></article>})}</div>
        </section>

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
          {showProvision && data.project.resourceManaged && <div className="provisionBody"><div className="profileGrid">{data.resourceProfiles.map((item) => <button key={item.id} onClick={() => setProfile(item.id)} className={profile === item.id ? "profile selected" : "profile"}><b>{item.name}</b><span>{item.cpu} CPU · {item.memory} App</span><small>PostgreSQL {item.databaseMemory} · {item.note}</small></button>)}</div><div className="formGrid"><label>部署目标<select value={targetId} onChange={(event) => setTargetId(event.target.value)}>{projectServers.map((server) => <option value={server.id} key={server.id}>{server.name}（{server.provider}）</option>)}</select></label><label>暴露方式<select value={exposure} onChange={(event) => setExposure(event.target.value as "direct" | "gateway")}><option value="direct">公网 IP + 独立端口</option><option value="gateway">统一 Nginx 网关</option></select></label><label>宿主机端口<input type="number" min="1024" max="65535" value={hostPort} onChange={(event) => setHostPort(event.target.value)}/></label></div><div className="allocationSummary"><span>资源配置与容量判断</span><b>{selectedProfile?.cpu} CPU / {selectedProfile?.memory} 应用 / {selectedProfile?.databaseMemory} 数据库</b><small>{selectedServer?.capacity.reason ?? "请选择部署目标"}</small></div><button className="secondary provisionButton" onClick={() => trigger("deploy")} disabled={!!busy || !selectedServer?.capacity.eligible}>{busy === "deploy" ? "正在下发…" : selectedServer?.capacity.eligible ? "下发资源并部署" : "资源校验未通过"}</button></div>}
        </section>
      </div>
    </section>
  </main>;
}
