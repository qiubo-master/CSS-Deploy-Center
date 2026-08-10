"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Stage = { name: string; state: "success" | "running" | "pending" | "failed" };
type Project = { id: "css" | "media"; name: string; repository: string; branch: string; description: string; endpoint: string; resourceManaged: boolean };
type Profile = { id: string; name: string; cpu: string; memory: string; databaseMemory: string; note: string };
type Release = { id: string; version: string; commit: string; branch: string; status: string; actor: string; time: string; duration: string };
type Dashboard = {
  mode: "demo" | "live";
  projects: Project[];
  project: Project;
  service: { status: string; version: string; endpoint: string; latency: string };
  pipeline: { id: string; status: string; commit: string; actor: string; startedAt: string; stages: Stage[] };
  releases: Release[];
  resourceProfiles: Profile[];
  error?: string;
};

const seed: Dashboard = {
  mode: "demo",
  projects: [
    { id: "css", name: "智能客服", repository: "qiubo-master/CSS", branch: "main", description: "现有智能客服生产服务", endpoint: "等待配置", resourceManaged: false },
    { id: "media", name: "序章自媒体中台", repository: "qiubo-master/Media", branch: "main", description: "内容生产、账号矩阵与 AI 决策中台", endpoint: "http://共享公网IP:8080", resourceManaged: true },
  ],
  project: { id: "media", name: "序章自媒体中台", repository: "qiubo-master/Media", branch: "main", description: "内容生产、账号矩阵与 AI 决策中台", endpoint: "http://共享公网IP:8080", resourceManaged: true },
  service: { status: "unknown", version: "待发布", endpoint: "http://共享公网IP:8080", latency: "—" },
  pipeline: { id: "ready", status: "ready", commit: "—", actor: "ForgeOps", startedAt: "尚未执行", stages: ["代码检出", "自动测试", "构建制品", "下发资源", "健康检查", "激活版本"].map((name, index) => ({ name, state: index === 0 ? "running" : "pending" })) },
  releases: [],
  resourceProfiles: [
    { id: "small", name: "轻量", cpu: "1.0", memory: "1g", databaseMemory: "512m", note: "体验和小流量" },
    { id: "standard", name: "标准", cpu: "2.0", memory: "2g", databaseMemory: "1g", note: "推荐生产配置" },
    { id: "large", name: "增强", cpu: "4.0", memory: "4g", databaseMemory: "2g", note: "高并发内容生产" },
  ],
};

const stageLabel = { success: "已完成", running: "执行中", pending: "等待中", failed: "失败" };

export default function Home() {
  const [data, setData] = useState(seed);
  const [projectId, setProjectId] = useState<"css" | "media">("media");
  const [profile, setProfile] = useState("standard");
  const [hostPort, setHostPort] = useState("8080");
  const [exposure, setExposure] = useState<"direct" | "gateway">("direct");
  const [adminToken, setAdminToken] = useState("");
  const [busy, setBusy] = useState<"deploy" | "rollback" | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async (selected = projectId) => {
    try {
      const response = await fetch(`/api/control-center?project=${selected}`, { cache: "no-store" });
      if (response.ok) setData(await response.json());
    } catch { /* seed data remains available */ }
  }, [projectId]);

  useEffect(() => {
    const initial = setTimeout(() => {
      setAdminToken(sessionStorage.getItem("forgeops-admin-token") ?? "");
      void load();
    }, 0);
    const timer = setInterval(() => void load(), 15000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [load]);

  const selectProject = (id: "css" | "media") => {
    setProjectId(id);
    setNotice("");
    void load(id);
  };

  const trigger = async (action: "deploy" | "rollback") => {
    setBusy(action); setNotice("");
    sessionStorage.setItem("forgeops-admin-token", adminToken);
    try {
      const response = await fetch("/api/control-center", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(adminToken ? { "x-admin-token": adminToken } : {}) },
        body: JSON.stringify({ action, projectId, branch: data.project.branch, resourceProfile: profile, hostPort, exposure }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "操作失败");
      setNotice(result.message);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(null);
    }
  };

  const selectedProfile = useMemo(() => data.resourceProfiles.find((item) => item.id === profile), [data.resourceProfiles, profile]);
  const statusText = data.service.status === "healthy" ? "运行正常" : data.service.status === "offline" ? "服务离线" : data.service.status === "degraded" ? "服务异常" : "等待检测";

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brandMark">F</span><div><b>ForgeOps</b><small>Multi-project Delivery</small></div></div>
        <nav aria-label="主导航">
          <a className="active" href="#overview"><span>⌁</span>应用发布</a>
          <a href="#resources"><span>▦</span>资源下发</a>
          <a href="#pipeline"><span>≋</span>流水线</a>
          <a href="#releases"><span>↺</span>版本回滚</a>
        </nav>
        <div className="sideFoot"><span className="avatar">QB</span><div><b>qiubo-master</b><small>生产管理员</small></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><span className="crumb">阿里云 / 共享公网 IP / Docker</span><h1>CI/CD 发布与资源控制台</h1></div>
          <div className="topActions"><span className={`mode ${data.mode}`}>{data.mode === "live" ? "LIVE" : "DEMO"}</span><button className="iconButton" onClick={() => load()} aria-label="刷新">↻</button></div>
        </header>

        <div className="content" id="overview">
          <section className="projectStrip" aria-label="部署项目">
            {data.projects.map((project) => <button key={project.id} className={projectId === project.id ? "projectCard selected" : "projectCard"} onClick={() => selectProject(project.id)}>
              <span>{project.id === "media" ? "ME" : "AI"}</span><div><b>{project.name}</b><small>{project.repository}</small></div><em>{project.id === "media" ? "可下发资源" : "已接入"}</em>
            </button>)}
          </section>

          <section className="heroPanel">
            <div className="heroCopy"><div className="eyebrow"><span className="pulse" /> PRODUCTION TARGET</div><h2>{data.project.name}</h2><p>{data.project.description} · <code>{data.project.branch}</code> · 当前版本 <code>{data.service.version}</code></p></div>
            <div className="healthBox"><small>服务状态</small><b className={data.service.status}>{statusText}</b><code>{data.service.endpoint}</code></div>
          </section>

          {notice && <div className="notice" role="status">{notice}</div>}
          {data.error && <div className="notice warning" role="status">状态同步提示：{data.error}</div>}

          <div className="deploymentGrid">
            <section className="panel resourcePanel" id="resources">
              <div className="panelHead"><div><span className="kicker">RESOURCE DELIVERY</span><h3>部署资源配置</h3></div><span className="sharedBadge">共享公网 IP</span></div>
              {data.project.resourceManaged ? <>
                <div className="profileGrid">
                  {data.resourceProfiles.map((item) => <button key={item.id} onClick={() => setProfile(item.id)} className={profile === item.id ? "profile selected" : "profile"}>
                    <b>{item.name}</b><span>{item.cpu} CPU · {item.memory} App</span><small>PostgreSQL {item.databaseMemory} · {item.note}</small>
                  </button>)}
                </div>
                <div className="formGrid">
                  <label>暴露方式<select value={exposure} onChange={(event) => setExposure(event.target.value as "direct" | "gateway")}><option value="direct">公网 IP + 独立端口</option><option value="gateway">统一 Nginx 网关</option></select></label>
                  <label>宿主机端口<input type="number" min="1024" max="65535" value={hostPort} onChange={(event) => setHostPort(event.target.value)} /></label>
                  <label>管理员令牌<input type="password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="生产环境必填" /></label>
                </div>
                <div className="allocationSummary"><span>将下发</span><b>{selectedProfile?.cpu} CPU / {selectedProfile?.memory} 应用内存 / {selectedProfile?.databaseMemory} 数据库内存</b><small>{exposure === "direct" ? `访问入口：共享公网 IP:${hostPort}` : `内部上游：127.0.0.1:${hostPort}，由宿主机 Nginx 转发`}</small></div>
              </> : <div className="legacyNotice">该项目继续使用仓库现有部署参数；选择“部署”只触发原有流水线。</div>}
              <div className="actionRow"><button className="primary" onClick={() => trigger("deploy")} disabled={!!busy}>{busy === "deploy" ? "正在下发…" : data.project.resourceManaged ? "下发资源并部署" : "部署新版本"}</button><button className="secondary danger" onClick={() => trigger("rollback")} disabled={!!busy}>{busy === "rollback" ? "正在回滚…" : "回滚上一版本"}</button></div>
            </section>

            <section className="panel pipeline" id="pipeline">
              <div className="panelHead"><div><span className="kicker">LATEST PIPELINE</span><h3>{data.pipeline.id}</h3></div><span className={`status ${data.pipeline.status}`}>{data.pipeline.status}</span></div>
              <div className="runMeta"><code>{data.pipeline.commit}</code><span>{data.pipeline.actor}</span><span>{data.pipeline.startedAt}</span></div>
              <div className="stageList">{data.pipeline.stages.map((stage, index) => <div className={`stage ${stage.state}`} key={stage.name}><b>{stage.state === "success" ? "✓" : index + 1}</b><div><strong>{stage.name}</strong><span>{stageLabel[stage.state]}</span></div></div>)}</div>
            </section>
          </div>

          <section className="panel releases" id="releases">
            <div className="panelHead"><div><span className="kicker">RELEASE HISTORY</span><h3>最近发布</h3></div><span className="endpointText">健康延迟 {data.service.latency}</span></div>
            <div className="tableWrap"><table><thead><tr><th>版本</th><th>变更</th><th>分支</th><th>状态</th><th>执行人</th><th>发布时间</th><th>耗时</th></tr></thead><tbody>{data.releases.map((row) => <tr key={row.id}><td><code>{row.version}</code></td><td>{row.commit}</td><td>{row.branch}</td><td><span className={row.status === "运行中" ? "runningBadge" : "archiveBadge"}>{row.status}</span></td><td>{row.actor}</td><td>{row.time}</td><td>{row.duration}</td></tr>)}</tbody></table></div>
          </section>
        </div>
      </section>
    </main>
  );
}
