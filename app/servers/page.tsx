"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Project = { id: string; name: string; repository: string; branch: string; description: string; endpoint: string; resourceManaged: boolean; targetIds: string[] };
type ProjectUsage = { projectId: string; containerCount: number; cpuUsedPercent: number; memoryUsedMb: number; memoryLimitMb: number; containers: string[] };
type Server = { id: string; name: string; provider: string; kind: string; region: string; address: string; projectIds: string[]; status: string; error?: string; projectUsage?: ProjectUsage[]; snapshot: null | { cpuTotal: number; cpuUsedPercent: number; memoryTotalMb: number; memoryUsedMb: number; diskTotalGb: number; diskUsedGb: number; gpu?: { name: string; memoryTotalMb: number; memoryUsedMb: number; utilizationPercent: number }[]; collectedAt: string }; capacity: { eligible: boolean; level: string; reason: string } };

export default function ServersPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [adminToken, setAdminToken] = useState<string>(() => (typeof window !== "undefined" ? sessionStorage.getItem("forgeops-admin-token") ?? "" : ""));
  const [showServerForm, setShowServerForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [serverForm, setServerForm] = useState({ id: "", name: "", provider: "阿里云", kind: "cloud", region: "", address: "", monitorUrl: "", monitorToken: "", projectIds: ["media"] as string[] });

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/control-center?project=media", { cache: "no-store" });
      if (response.ok) { const data = await response.json(); setProjects(data.projects ?? []); setServers(data.servers ?? []); }
    } catch { /* keep last known */ }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => { void load(); }, 0);
    const timer = setInterval(() => void load(), 12000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [load]);

  const addServer = async () => {
    setBusy(true); setNotice(""); sessionStorage.setItem("forgeops-admin-token", adminToken);
    try {
      const response = await fetch("/api/servers", { method: "POST", headers: { "Content-Type": "application/json", ...(adminToken ? { "x-admin-token": adminToken } : {}) }, body: JSON.stringify(serverForm) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "保存服务器失败");
      setNotice(result.message); setShowServerForm(false); setServerForm({ id: "", name: "", provider: "阿里云", kind: "cloud", region: "", address: "", monitorUrl: "", monitorToken: "", projectIds: ["media"] }); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "保存服务器失败"); }
    finally { setBusy(false); }
  };

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brandMark">F</span><div><b>ForgeOps</b><small>Release Center</small></div></div>
      <nav aria-label="主导航"><Link href="/#projects"><span>◇</span>项目管理</Link><Link href="/#release"><span>↑</span>版本发布</Link><Link href="/#pipelines"><span>≋</span>流水线</Link><Link href="/resources"><span>＋</span>资源接入</Link><Link className="active" href="/servers"><span>▦</span>服务器</Link></nav>
      <div className="sideFoot"><span className="avatar">QB</span><div><b>qiubo-master</b><small>生产管理员</small></div></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><span className="crumb">阿里云 / 共享公网 IP / Docker</span><h1>服务器资源</h1></div><div className="topActions"><button className="iconButton" onClick={() => load()} aria-label="刷新">↻</button></div></header>
      <div className="content">
        <section className="panel serverPanel" id="servers">
          <div className="panelHead"><div><span className="kicker">SERVER FLEET</span><h3>云服务器与 AutoDL 资源监控</h3></div><div className="serverActions"><span className="refreshNote">每 12 秒刷新 · 下发前保留安全余量</span><button className="secondary" onClick={() => setShowServerForm(!showServerForm)}>＋ 接入服务器</button></div></div>
          <div className="releaseActions" style={{ marginBottom: 12 }}><label>管理员令牌<input type="password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="接入服务器需要令牌" suppressHydrationWarning /></label></div>
          {showServerForm && <div className="serverForm"><div className="formGrid"><label>服务器 ID<input value={serverForm.id} onChange={(event) => setServerForm({ ...serverForm, id: event.target.value })} placeholder="autodl-gpu-1"/></label><label>显示名称<input value={serverForm.name} onChange={(event) => setServerForm({ ...serverForm, name: event.target.value })} placeholder="AutoDL GPU 01"/></label><label>类型<select value={serverForm.kind} onChange={(event) => setServerForm({ ...serverForm, kind: event.target.value })}><option value="cloud">云服务器</option><option value="autodl">AutoDL</option><option value="bare-metal">裸金属</option></select></label><label>服务商<input value={serverForm.provider} onChange={(event) => setServerForm({ ...serverForm, provider: event.target.value })} placeholder="阿里云 / AutoDL"/></label><label>区域<input value={serverForm.region} onChange={(event) => setServerForm({ ...serverForm, region: event.target.value })} placeholder="cn-hangzhou"/></label><label>服务器地址<input value={serverForm.address} onChange={(event) => setServerForm({ ...serverForm, address: event.target.value })} placeholder="IP 或主机名"/></label><label>监控接口<input value={serverForm.monitorUrl} onChange={(event) => setServerForm({ ...serverForm, monitorUrl: event.target.value })} placeholder="https://host/v1/resources"/></label><label>监控令牌<input type="password" value={serverForm.monitorToken} onChange={(event) => setServerForm({ ...serverForm, monitorToken: event.target.value })} placeholder="代理的只读令牌"/></label></div><fieldset><legend>绑定项目</legend>{projects.map((project) => <label key={project.id}><input type="checkbox" checked={serverForm.projectIds.includes(project.id)} onChange={(event) => setServerForm({ ...serverForm, projectIds: event.target.checked ? [...serverForm.projectIds, project.id] : serverForm.projectIds.filter((id) => id !== project.id) })}/>{project.name}</label>)}</fieldset><div className="serverFormActions"><button className="secondary" onClick={() => setShowServerForm(false)}>取消</button><button onClick={addServer} disabled={busy}>{busy ? "保存中…" : "保存"}</button></div></div>}
          <div className="serverGrid">{servers.map((server) => { const memoryPercent = server.snapshot ? Math.round(server.snapshot.memoryUsedMb / server.snapshot.memoryTotalMb * 100) : 0; const diskPercent = server.snapshot ? Math.round(server.snapshot.diskUsedGb / server.snapshot.diskTotalGb * 100) : 0; return <article key={server.id} className={`serverCard ${server.status}`}><header><div><b>{server.name}</b><small>{server.provider} · {server.region} · {server.address}</small></div><i className={`runState ${server.status === "online" ? "success" : server.status === "offline" ? "failed" : "muted"}`}>{server.status === "online" ? "在线" : server.status === "offline" ? "离线" : "待接入监控"}</i></header>{server.snapshot ? <><div className="metric"><span>CPU <b>{server.snapshot.cpuUsedPercent}%</b></span><progress max="100" value={server.snapshot.cpuUsedPercent}/><small>{server.snapshot.cpuTotal} 核</small></div><div className="metric"><span>内存 <b>{memoryPercent}%</b></span><progress max="100" value={memoryPercent}/><small>{server.snapshot.memoryUsedMb} / {server.snapshot.memoryTotalMb} MB</small></div><div className="metric"><span>磁盘 <b>{diskPercent}%</b></span><progress max="100" value={diskPercent}/><small>{server.snapshot.diskUsedGb} / {server.snapshot.diskTotalGb} GB</small></div>{server.snapshot.gpu?.map((gpu) => <div className="metric" key={gpu.name}><span>GPU {gpu.name} <b>{gpu.utilizationPercent}%</b></span><progress max="100" value={gpu.utilizationPercent}/><small>显存 {gpu.memoryUsedMb} / {gpu.memoryTotalMb} MB</small></div>)}</> : <div className="agentEmpty"><b>尚无资源快照</b><span>{server.error ?? "配置监控代理后显示实时 CPU、内存、磁盘和 GPU"}</span></div>}<div className="projectUsage"><b>项目资源占用</b>{server.projectUsage?.length ? server.projectUsage.map((usage) => <div key={usage.projectId}><span><strong>{projects.find((project) => project.id === usage.projectId)?.name ?? (usage.projectId === "deploy-center" ? "CI/CD 控制中心" : usage.projectId)}</strong><small>{usage.containerCount} 容器 · CPU {usage.cpuUsedPercent}% · 内存 {usage.memoryUsedMb}/{usage.memoryLimitMb} MB</small></span></div>) : <span>暂无占用</span>}</div></article>})}</div>
        </section>
        {notice && <div className="notice" role="status">{notice}</div>}
      </div>
    </section>
  </main>;
}
