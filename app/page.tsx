"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Stage = { name: string; state: "success" | "running" | "pending" | "failed"; duration?: string };
type Release = { id: string; version: string; commit: string; branch: string; status: string; actor: string; time: string; duration: string };
type DashboardData = {
  mode: "demo" | "live";
  project: { name: string; repository: string; environment: string; branch: string };
  service: { status: string; version: string; endpoint: string; uptime: string; latency: string };
  server: { status: string; cpu: number; memory: number; disk: number; gpu: number; vram: number };
  models: { name: string; state: string; processor: string; memory: string }[];
  pipeline: { id: string; status: string; commit: string; actor: string; startedAt: string; stages: Stage[] };
  releases: Release[];
};

const seed: DashboardData = {
  mode: "demo",
  project: { name: "轮胎智能客服", repository: "qiubo-master/CSS", environment: "Production", branch: "main" },
  service: { status: "healthy", version: "08fe261", endpoint: "等待配置阿里云地址", uptime: "6h 42m", latency: "38 ms" },
  server: { status: "online", cpu: 18, memory: 36, disk: 21, gpu: 0, vram: 58 },
  models: [
    { name: "Qwen3-8B", state: "Ready", processor: "100% GPU", memory: "7.0 GB" },
    { name: "Qwen3-Embedding 0.6B", state: "Ready", processor: "100% GPU", memory: "1.8 GB" },
  ],
  pipeline: {
    id: "run-184", status: "success", commit: "08fe261", actor: "qiubo-master", startedAt: "今天 03:58",
    stages: [
      { name: "代码检出", state: "success", duration: "4s" },
      { name: "自动测试", state: "success", duration: "13s" },
      { name: "构建制品", state: "success", duration: "21s" },
      { name: "部署绿色实例", state: "success", duration: "18s" },
      { name: "健康检查", state: "success", duration: "7s" },
      { name: "切换流量", state: "success", duration: "2s" },
    ],
  },
  releases: [
    { id: "r5", version: "08fe261", commit: "restrict human handoff", branch: "main", status: "运行中", actor: "qiubo-master", time: "今天 03:58", duration: "1m 05s" },
    { id: "r4", version: "0a02262", commit: "expose on port 6006", branch: "main", status: "已归档", actor: "qiubo-master", time: "昨天 23:42", duration: "54s" },
    { id: "r3", version: "8d9e912", commit: "GPU compatible inference", branch: "main", status: "已归档", actor: "qiubo-master", time: "昨天 22:17", duration: "1m 12s" },
  ],
};

const stageLabel = { success: "已完成", running: "执行中", pending: "等待中", failed: "失败" };

export default function Home() {
  const [data, setData] = useState(seed);
  const [busy, setBusy] = useState<"deploy" | "rollback" | null>(null);
  const [notice, setNotice] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("main");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/control-center", { cache: "no-store" });
      if (response.ok) setData(await response.json());
    } catch { /* demo data remains available */ }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 15000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [load]);

  const trigger = async (action: "deploy" | "rollback") => {
    setBusy(action); setNotice("");
    try {
      const response = await fetch("/api/control-center", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, branch: selectedBranch }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "操作失败");
      setNotice(result.message); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(null); }
  };

  const healthScore = useMemo(() => data.service.status === "healthy" && data.server.status === "online" ? 100 : 62, [data]);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brandMark">F</span><div><b>ForgeOps</b><small>Release Control</small></div></div>
        <nav aria-label="主导航">
          <a className="active" href="#overview"><span>⌁</span>发布总览</a>
          <a href="#pipeline"><span>≋</span>流水线</a>
          <a href="#releases"><span>↺</span>发布历史</a>
          <a href="#infra"><span>◇</span>基础设施</a>
          <a href="#models"><span>✦</span>模型运行时</a>
        </nav>
        <div className="sideFoot"><span className="avatar">QB</span><div><b>qiubo-master</b><small>管理员</small></div><button aria-label="设置">•••</button></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><span className="crumb">项目 / {data.project.name}</span><h1>生产发布控制台</h1></div>
          <div className="topActions"><span className={`mode ${data.mode}`}>{data.mode === "live" ? "LIVE" : "DEMO"}</span><button className="iconButton" onClick={load} aria-label="刷新">↻</button></div>
        </header>

        <div className="content" id="overview">
          <section className="heroPanel">
            <div className="heroCopy"><div className="eyebrow"><span className="pulse" /> PRODUCTION HEALTHY</div><h2>{data.project.name}</h2><p>{data.project.repository} · {data.project.branch} · 当前版本 <code>{data.service.version}</code></p></div>
            <div className="deployBox">
              <label>发布分支<select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}><option>main</option><option>develop</option></select></label>
              <button className="primary" onClick={() => trigger("deploy")} disabled={!!busy}>{busy === "deploy" ? "正在触发…" : "部署新版本 →"}</button>
            </div>
          </section>
          {notice && <div className="notice" role="status">{notice}</div>}

          <section className="metrics">
            <article><span>服务状态</span><strong className="healthy"><i />正常运行</strong><small>{data.service.uptime} 持续在线</small></article>
            <article><span>当前版本</span><strong><code>{data.service.version}</code></strong><small>main · production</small></article>
            <article><span>接口延迟</span><strong>{data.service.latency}</strong><small>健康检查 P50</small></article>
            <article><span>健康评分</span><strong>{healthScore}<em>/100</em></strong><small>应用、服务器、模型</small></article>
          </section>

          <div className="grid">
            <section className="panel pipeline" id="pipeline">
              <div className="panelHead"><div><span className="kicker">LATEST PIPELINE</span><h3>流水线 #{data.pipeline.id.replace("run-", "")}</h3></div><span className={`status ${data.pipeline.status}`}>{data.pipeline.status === "success" ? "发布成功" : data.pipeline.status}</span></div>
              <div className="runMeta"><code>{data.pipeline.commit}</code><span>{data.pipeline.actor}</span><span>{data.pipeline.startedAt}</span></div>
              <div className="stages">
                {data.pipeline.stages.map((stage, index) => <div className={`stage ${stage.state}`} key={stage.name}>
                  <div className="stageRail"><b>{stage.state === "success" ? "✓" : index + 1}</b>{index < data.pipeline.stages.length - 1 && <i />}</div>
                  <div><strong>{stage.name}</strong><span>{stageLabel[stage.state]}{stage.duration ? ` · ${stage.duration}` : ""}</span></div>
                </div>)}
              </div>
              <button className="textButton">查看完整构建日志 ↗</button>
            </section>

            <section className="panel infrastructure" id="infra">
              <div className="panelHead"><div><span className="kicker">INFRASTRUCTURE</span><h3>运行资源</h3></div><span className="liveDot">实时</span></div>
              <div className="endpoint"><span>应用端点</span><code>{data.service.endpoint}</code></div>
              {[["CPU", data.server.cpu], ["内存", data.server.memory], ["数据盘", data.server.disk], ["GPU 显存", data.server.vram]].map(([label, value]) => <div className="resource" key={label as string}><div><span>{label}</span><b>{value}%</b></div><div className="bar"><i style={{ width: `${value}%` }} /></div></div>)}
              <div className="models" id="models"><span className="kicker">MODEL RUNTIME</span>{data.models.map(model => <article key={model.name}><span className="modelIcon">AI</span><div><strong>{model.name}</strong><small>{model.processor} · {model.memory}</small></div><em>{model.state}</em></article>)}</div>
            </section>
          </div>

          <section className="panel releases" id="releases">
            <div className="panelHead"><div><span className="kicker">RELEASE HISTORY</span><h3>最近发布</h3></div><button className="secondary" onClick={() => trigger("rollback")} disabled={!!busy}>{busy === "rollback" ? "回滚中…" : "回滚上一版本"}</button></div>
            <div className="tableWrap"><table><thead><tr><th>版本</th><th>变更</th><th>分支</th><th>状态</th><th>执行人</th><th>发布时间</th><th>耗时</th></tr></thead><tbody>{data.releases.map(row => <tr key={row.id}><td><code>{row.version}</code></td><td>{row.commit}</td><td><span className="branch">⑂ {row.branch}</span></td><td><span className={row.status === "运行中" ? "runningBadge" : "archiveBadge"}>{row.status}</span></td><td>{row.actor}</td><td>{row.time}</td><td>{row.duration}</td></tr>)}</tbody></table></div>
          </section>
        </div>
      </section>
    </main>
  );
}
