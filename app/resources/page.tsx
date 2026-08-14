"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Server = { id: string; name: string; status: string };
type Result = { workflowReady: boolean; deploymentTriggered: boolean; deploymentError?: string; checks: { path: string; ok: boolean }[]; secretsRequired: string[] };

const emptyForm = { id: "", name: "", repository: "", branch: "main", targetId: "", workflow: "deploy.yml", endpoint: "", healthUrl: "", description: "", bootstrapWorkflow: true, deployNow: true, resourceProfile: "standard", hostPort: "8080", exposure: "direct" };

export default function ResourcesPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [form, setForm] = useState(emptyForm);
  const [adminToken, setAdminToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const initial = setTimeout(() => {
      setAdminToken(sessionStorage.getItem("forgeops-admin-token") ?? "");
      void fetch("/api/control-center?project=media", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        setServers(data.servers ?? []);
        setMode(data.mode ?? "demo");
        setForm((current) => ({ ...current, targetId: current.targetId || data.servers?.[0]?.id || "" }));
      });
    }, 0);
    return () => clearTimeout(initial);
  }, []);

  const submit = async () => {
    setBusy(true); setNotice(""); setResult(null); sessionStorage.setItem("forgeops-admin-token", adminToken);
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json", ...(adminToken ? { "x-admin-token": adminToken } : {}) }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "项目接入失败");
      setNotice(data.message); setResult(data);
    } catch (error) { setNotice(error instanceof Error ? error.message : "项目接入失败"); }
    finally { setBusy(false); }
  };

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brandMark">F</span><div><b>ForgeOps</b><small>Release Center</small></div></div>
      <nav aria-label="主导航"><Link href="/#projects"><span>◇</span>项目管理</Link><Link className="active" href="/resources"><span>＋</span>资源接入</Link><Link href="/#servers"><span>▦</span>服务器</Link><Link href="/#release"><span>↑</span>版本发布</Link><Link href="/#pipelines"><span>≋</span>流水线</Link></nav>
      <div className="sideFoot"><span className="avatar">QB</span><div><b>qiubo-master</b><small>生产管理员</small></div></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div><span className="crumb">资源管理 / 新项目接入</span><h1>资源接入</h1></div><div className="topActions"><span className={`mode ${mode}`}>{mode === "live" ? "LIVE" : "DEMO"}</span><Link className="secondary pageBack" href="/">返回项目看板</Link></div></header>
      <div className="content resourceContent">
        <section className="overviewHead"><div><span className="kicker">RESOURCE ONBOARDING</span><h2>接入资源并建立发布流水线</h2><p>按顺序完成服务器、代码仓库、资源规格和首次发布配置。</p></div><span>{servers.length} 台可选服务器</span></section>
        {notice && <div className={result ? "notice" : "notice warning"}>{notice}</div>}
        <section className="panel onboardingPanel">
          <div className="panelHead"><div><span className="kicker">ONBOARDING WORKFLOW</span><h3>资源接入与一键部署</h3></div><span className="sharedBadge">按步骤执行</span></div>
          <div className="onboardingSteps"><article><b>1</b><div><strong>接入计算资源</strong><span>服务器需可 SSH 登录，安装 Docker、Compose、Python 3；监控代理只允许内网或加密隧道访问。</span></div></article><article><b>2</b><div><strong>确认代码仓库</strong><span>仓库至少包含一个提交，以及 Dockerfile 或 docker-compose.yml；Token 需要 Actions 写入和 Contents 读写权限。</span></div></article><article><b>3</b><div><strong>配置资源与目标</strong><span>选择目标服务器、CPU/内存档位、服务端口及健康检查地址，系统绑定项目与资源。</span></div></article><article><b>4</b><div><strong>建立流水线并发布</strong><span>自动检查或创建 deploy.yml；Secrets 完成后即可一键发布，并在流水线列表实时观察。</span></div></article></div>
          <div className="rules"><b>接入规则</b><span>禁止提交 SSH 私钥和业务 .env</span><span>数据库端口不得暴露公网</span><span>生产服务必须配置健康检查</span><span>资源不足或监控离线时禁止首次下发</span></div>
          <div className="projectOnboardingForm"><h4>新建项目部署</h4><div className="formGrid"><label>项目 ID<input value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value.toLowerCase() })} placeholder="ai-ops"/></label><label>项目名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="AI运营"/></label><label>GitHub 仓库地址<input value={form.repository} onChange={(event) => setForm({ ...form, repository: event.target.value })} placeholder="https://github.com/owner/repo"/></label><label>代码分支<input value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })} placeholder="main"/></label><label>部署服务器<select value={form.targetId} onChange={(event) => setForm({ ...form, targetId: event.target.value })}>{servers.map((server) => <option key={server.id} value={server.id}>{server.name} · {server.status === "online" ? "在线" : "未就绪"}</option>)}</select></label><label>资源规格<select value={form.resourceProfile} onChange={(event) => setForm({ ...form, resourceProfile: event.target.value })}><option value="small">轻量 · 1 CPU / 1GB</option><option value="standard">标准 · 2 CPU / 2GB</option><option value="large">增强 · 4 CPU / 4GB</option></select></label><label>服务端口<input type="number" min="1024" max="65535" value={form.hostPort} onChange={(event) => setForm({ ...form, hostPort: event.target.value })}/></label><label>暴露方式<select value={form.exposure} onChange={(event) => setForm({ ...form, exposure: event.target.value })}><option value="direct">公网 IP + 独立端口</option><option value="gateway">统一 Nginx 网关</option></select></label><label>流水线文件<input value={form.workflow} onChange={(event) => setForm({ ...form, workflow: event.target.value })} placeholder="deploy.yml"/></label><label>访问地址<input value={form.endpoint} onChange={(event) => setForm({ ...form, endpoint: event.target.value })} placeholder="https://app.example.com"/></label><label>健康检查<input value={form.healthUrl} onChange={(event) => setForm({ ...form, healthUrl: event.target.value })} placeholder="https://app.example.com/api/health"/></label></div><div className="checkRow"><label className="bootstrapCheck"><input type="checkbox" checked={form.bootstrapWorkflow} onChange={(event) => setForm({ ...form, bootstrapWorkflow: event.target.checked })}/>缺少流水线时自动创建标准 `deploy.yml`</label><label className="bootstrapCheck"><input type="checkbox" checked={form.deployNow} onChange={(event) => setForm({ ...form, deployNow: event.target.checked })}/>校验成功后立即触发第一次发布</label></div><div className="onboardingActions"><label>管理员令牌<input type="password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="生产操作令牌"/></label><button className="releaseButton" onClick={submit} disabled={busy || !form.targetId}>{busy ? "正在建立并发布…" : "一键建立流水线并发布"}</button></div>{result && <div className="readiness"><b>{result.deploymentTriggered ? "首次发布已触发，请前往流水线查看" : result.workflowReady ? "流水线已就绪" : "项目已登记，流水线待配置"}</b><div>{result.checks.map((check) => <span key={check.path} className={check.ok ? "ok" : "missing"}>{check.ok ? "✓" : "!"} {check.path}</span>)}</div>{result.deploymentError && <small className="errorText">{result.deploymentError}</small>}<small>仓库 Secrets：{result.secretsRequired.join("、")}</small>{result.deploymentTriggered && <Link className="resultLink" href="/#pipelines">查看发布流水线 →</Link>}</div>}</div>
        </section>
      </div>
    </section>
  </main>;
}
