"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Project = { id: string; name: string; repository: string };
type Server = { id: string; name: string; provider: string; kind: string; region: string; address: string; sshPort?: number; sshUser?: string; authType?: "key" | "password"; hostKey?: string; deploymentBasePath?: string; credentialConfigured?: boolean; monitorUrl?: string; projectIds: string[]; status: string };
type Result = { workflowReady: boolean; deploymentTriggered: boolean; deploymentError?: string; checks: { path: string; ok: boolean }[]; secretsRequired: string[] };

const emptyProject = { id: "", name: "", repository: "", branch: "main", targetId: "", workflow: "deploy.yml", endpoint: "", healthUrl: "", description: "", bootstrapWorkflow: true, deployNow: true, resourceProfile: "standard", hostPort: "8080", exposure: "direct" };
const emptyServer = { id: "", name: "", provider: "阿里云", kind: "cloud", region: "", address: "", sshPort: "22", sshUser: "root", authType: "key" as "key" | "password", sshPassword: "", sshPrivateKey: "", hostKey: "", deploymentBasePath: "/opt/forgeops", monitorUrl: "", monitorToken: "", projectIds: [] as string[] };

function Help({ text }: { text: string }) { return <span className="fieldHelp" title={text} aria-label={text} tabIndex={0}>?</span>; }

export default function ResourcesPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [projectForm, setProjectForm] = useState(emptyProject);
  const [serverForm, setServerForm] = useState(emptyServer);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState("");
  const [busy, setBusy] = useState<"project" | "server" | null>(null);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const beginEdit = useCallback((server: Server) => {
    setEditingId(server.id); setNotice("");
    setServerForm({ id: server.id, name: server.name, provider: server.provider, kind: server.kind, region: server.region, address: server.address, sshPort: String(server.sshPort ?? 22), sshUser: server.sshUser ?? "root", authType: server.authType ?? "key", sshPassword: "", sshPrivateKey: "", hostKey: server.hostKey ?? "", deploymentBasePath: server.deploymentBasePath ?? "/opt/forgeops", monitorUrl: server.monitorUrl ?? "", monitorToken: "", projectIds: server.projectIds });
    document.getElementById("server-editor")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const load = useCallback(async () => {
    const response = await fetch("/api/control-center?project=media", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    const nextServers = data.servers ?? [];
    setServers(nextServers); setProjects(data.projects ?? []); setMode(data.mode ?? "demo");
    setProjectForm((current) => ({ ...current, targetId: current.targetId || nextServers[0]?.id || "" }));
    const requested = new URLSearchParams(window.location.search).get("server");
    const selected = requested ? nextServers.find((server: Server) => server.id === requested) : undefined;
    if (selected) beginEdit(selected);
  }, [beginEdit]);

  useEffect(() => {
    const initial = setTimeout(() => { setAdminToken(sessionStorage.getItem("forgeops-admin-token") ?? ""); void load(); }, 0);
    return () => clearTimeout(initial);
  }, [load]);

  const resetServer = () => { setEditingId(null); setServerForm(emptyServer); setNotice(""); };

  const saveServer = async () => {
    setBusy("server"); setNotice(""); sessionStorage.setItem("forgeops-admin-token", adminToken);
    try {
      const response = await fetch("/api/servers", { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json", ...(adminToken ? { "x-admin-token": adminToken } : {}) }, body: JSON.stringify(serverForm) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "服务器保存失败");
      setNotice(data.message); resetServer(); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "服务器保存失败"); }
    finally { setBusy(null); }
  };

  const submitProject = async () => {
    setBusy("project"); setNotice(""); setResult(null); sessionStorage.setItem("forgeops-admin-token", adminToken);
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json", ...(adminToken ? { "x-admin-token": adminToken } : {}) }, body: JSON.stringify(projectForm) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "项目接入失败");
      setNotice(data.message); setResult(data); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "项目接入失败"); }
    finally { setBusy(null); }
  };

  return <main className="shell">
    <aside className="sidebar"><div className="brand"><span className="brandMark">F</span><div><b>ForgeOps</b><small>Release Center</small></div></div><nav aria-label="主导航"><Link href="/#projects"><span>◇</span>项目管理</Link><Link href="/#release"><span>↑</span>版本发布</Link><Link href="/#pipelines"><span>≋</span>流水线</Link><Link className="active" href="/resources"><span>＋</span>资源接入</Link><Link href="/servers"><span>▦</span>服务器</Link></nav><div className="sideFoot"><span className="avatar">QB</span><div><b>qiubo-master</b><small>生产管理员</small></div></div></aside>
    <section className="workspace">
      <header className="topbar"><div><span className="crumb">资源管理 / 服务器与项目接入</span><h1>资源接入</h1></div><div className="topActions"><span className={`mode ${mode}`}>{mode === "live" ? "LIVE" : "DEMO"}</span><Link className="secondary pageBack" href="/">返回项目看板</Link></div></header>
      <div className="content resourceContent">
        <section className="overviewHead"><div><span className="kicker">RESOURCE ONBOARDING</span><h2>服务器接入、编辑与项目部署</h2><p>先维护服务器连接，再绑定项目和 GitHub 仓库，最后建立发布流水线。</p></div><span>{servers.length} 台服务器 · {projects.length} 个项目</span></section>
        <div className="sharedAdmin"><label>管理员令牌 <Help text="取自控制中心服务器 .env 的 CONTROL_CENTER_ADMIN_TOKEN；只保存在当前浏览器会话，不写入服务器清单。"/><input type="password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="执行新增、编辑和发布操作时必填"/></label></div>
        {notice && <div className={result ? "notice" : "notice warning"}>{notice}</div>}

        <section className="panel serverAccessPanel">
          <div className="panelHead"><div><span className="kicker">SERVER CONNECTIONS</span><h3>已接入服务器</h3></div><button className="releaseButton" onClick={resetServer}>＋ 接入新服务器</button></div>
          <div className="accessServerGrid">{servers.map((server) => <article className="accessServerCard" key={server.id}><header><div><b>{server.name}</b><small>{server.provider} · {server.kind === "autodl" ? "AutoDL" : "云服务器"}</small></div><i className={`runState ${server.status === "online" ? "success" : server.status === "offline" ? "failed" : "muted"}`}>{server.status === "online" ? "在线" : server.status === "offline" ? "离线" : "待接入"}</i></header><dl><div><dt>连接地址</dt><dd>{server.sshUser ?? "root"}@{server.address}:{server.sshPort ?? 22}</dd></div><div><dt>认证</dt><dd>{server.authType === "password" ? "密码" : "SSH Key"} · {server.credentialConfigured ? "已保存" : "使用外部配置/待填写"}</dd></div><div><dt>部署目录</dt><dd>{server.deploymentBasePath ?? "/opt/forgeops"}</dd></div></dl><div className="boundProjects"><b>部署项目与 GitHub 地址</b>{server.projectIds.length ? server.projectIds.map((id) => { const project = projects.find((item) => item.id === id); return <span key={id}><strong>{project?.name ?? id}</strong><code>{project?.repository ?? "仓库待配置"}</code></span>; }) : <small>尚未绑定项目</small>}</div><button className="secondary" onClick={() => beginEdit(server)}>编辑服务器</button></article>)}</div>
        </section>

        <section className="panel serverEditor" id="server-editor">
          <div className="panelHead"><div><span className="kicker">{editingId ? "EDIT SERVER" : "ADD SERVER"}</span><h3>{editingId ? `编辑服务器 · ${serverForm.name}` : "接入新服务器"}</h3></div>{editingId && <span className="sharedBadge">ID 固定：{editingId}</span>}</div>
          <div className="connectionSteps"><article><b>1</b><span>填写云平台或 AutoDL 提供的连接信息</span></article><article><b>2</b><span>选择密码或 SSH Key，首次保存凭据</span></article><article><b>3</b><span>配置主机指纹、监控代理和部署目录</span></article><article><b>4</b><span>勾选部署项目，核对对应 GitHub 仓库</span></article></div>
          <div className="serverEditorGrid">
            <label>服务器 ID <Help text="自定义稳定标识，只能使用小写字母、数字和连字符，例如 aliyun3。创建后不可修改。"/><input disabled={!!editingId} value={serverForm.id} onChange={(event) => setServerForm({ ...serverForm, id: event.target.value.toLowerCase() })} placeholder="aliyun3"/></label>
            <label>显示名称 <Help text="用于看板展示，可随时修改，例如：阿里云杭州生产机。"/><input value={serverForm.name} onChange={(event) => setServerForm({ ...serverForm, name: event.target.value })} placeholder="阿里云杭州生产机"/></label>
            <label>资源类型 <Help text="阿里云、腾讯云等选云服务器；AutoDL 实例选 AutoDL；自有物理机选裸金属。"/><select value={serverForm.kind} onChange={(event) => setServerForm({ ...serverForm, kind: event.target.value })}><option value="cloud">云服务器</option><option value="autodl">AutoDL</option><option value="bare-metal">裸金属</option></select></label>
            <label>服务商 <Help text="填写资源购买平台，例如阿里云、AutoDL、腾讯云。"/><input value={serverForm.provider} onChange={(event) => setServerForm({ ...serverForm, provider: event.target.value })}/></label>
            <label>区域 <Help text="从云平台实例详情复制地域或可用区；AutoDL 可填写机房区域。"/><input value={serverForm.region} onChange={(event) => setServerForm({ ...serverForm, region: event.target.value })} placeholder="cn-hangzhou"/></label>
            <label>公网 IP / 主机名 <Help text="从实例详情复制公网 IPv4 或 AutoDL SSH 命令中 @ 后面的主机名。IP 变化时只修改这里。"/><input value={serverForm.address} onChange={(event) => setServerForm({ ...serverForm, address: event.target.value })} placeholder="47.x.x.x"/></label>
            <label>SSH 端口 <Help text="从 SSH 命令的 -p 参数取得；阿里云通常为 22，AutoDL 常为动态端口。"/><input type="number" min="1" max="65535" value={serverForm.sshPort} onChange={(event) => setServerForm({ ...serverForm, sshPort: event.target.value })}/></label>
            <label>SSH 用户 <Help text="从 SSH 命令中 @ 前取得，常见为 root、ubuntu 或 ecs-user。"/><input value={serverForm.sshUser} onChange={(event) => setServerForm({ ...serverForm, sshUser: event.target.value })}/></label>
            <label>认证方式 <Help text="有私钥时推荐 SSH Key；AutoDL 只提供临时密码时选择密码。"/><select value={serverForm.authType} onChange={(event) => setServerForm({ ...serverForm, authType: event.target.value as "key" | "password" })}><option value="key">SSH Key</option><option value="password">密码</option></select></label>
            {serverForm.authType === "password" ? <label>SSH 密码 <Help text="从云平台重置或 AutoDL 实例页面复制。编辑时留空表示保留已保存密码；填写后覆盖。密码不会回显。"/><input type="password" value={serverForm.sshPassword} onChange={(event) => setServerForm({ ...serverForm, sshPassword: event.target.value })} placeholder={editingId ? "留空则不修改" : "首次接入时填写"}/></label> : <label className="wideField">SSH 私钥 <Help text="粘贴与服务器 authorized_keys 中公钥配对的完整私钥。编辑时留空表示保留原私钥；推荐使用项目专用部署密钥。"/><textarea value={serverForm.sshPrivateKey} onChange={(event) => setServerForm({ ...serverForm, sshPrivateKey: event.target.value })} placeholder={editingId ? "留空则不修改" : "-----BEGIN OPENSSH PRIVATE KEY-----"}/></label>}
            <label className="wideField">SSH 主机指纹 <Help text="在可信电脑执行 ssh-keyscan -p 端口 主机名取得整行。IP 或端口改变后必须重新获取，防止连接到错误服务器。"/><textarea value={serverForm.hostKey} onChange={(event) => setServerForm({ ...serverForm, hostKey: event.target.value })} placeholder="[host]:port ssh-ed25519 AAAA..."/></label>
            <label>部署根目录 <Help text="应用版本在服务器上的统一目录；普通云服务器推荐 /opt/forgeops，AutoDL 推荐 /root/autodl-tmp。"/><input value={serverForm.deploymentBasePath} onChange={(event) => setServerForm({ ...serverForm, deploymentBasePath: event.target.value })}/></label>
            <label>监控接口 <Help text="由资源监控代理提供，格式如 http://内网地址:9108/v1/resources；通过隧道时填写中台可访问地址。"/><input value={serverForm.monitorUrl} onChange={(event) => setServerForm({ ...serverForm, monitorUrl: event.target.value })} placeholder="http://host:9108/v1/resources"/></label>
            <label>监控令牌 <Help text="安装资源监控代理时生成的只读 Bearer Token。编辑时留空表示保留原令牌。"/><input type="password" value={serverForm.monitorToken} onChange={(event) => setServerForm({ ...serverForm, monitorToken: event.target.value })} placeholder={editingId ? "留空则不修改" : "代理只读令牌"}/></label>
          </div>
          <fieldset className="projectBinding"><legend>绑定部署项目 <Help text="勾选允许部署到这台服务器的项目。GitHub 仓库属于项目，不随服务器 IP 或密码变化。"/></legend>{projects.map((project) => <label key={project.id}><input type="checkbox" checked={serverForm.projectIds.includes(project.id)} onChange={(event) => setServerForm({ ...serverForm, projectIds: event.target.checked ? [...serverForm.projectIds, project.id] : serverForm.projectIds.filter((id) => id !== project.id) })}/><span><b>{project.name}</b><code>{project.repository}</code></span></label>)}</fieldset>
          <div className="credentialNote">🔒 密码、私钥和监控令牌不会在编辑时回显。留空代表保持原值；填写新值才会覆盖。GitHub 仓库连接不因服务器 IP 或密码变化而改变。</div>
          <div className="serverFormActions"><button className="secondary" onClick={resetServer}>清空 / 新增</button><button className="releaseButton" onClick={saveServer} disabled={busy === "server"}>{busy === "server" ? "正在保存…" : editingId ? "保存服务器修改" : "保存并接入服务器"}</button></div>
        </section>

        <section className="panel operationGuide"><div className="panelHead"><div><span className="kicker">VALUE GUIDE</span><h3>后台接入操作与取值来源</h3></div><Link className="secondary pageBack" href="/docs/server-change-guide">查看完整手册</Link></div><ol><li><b>云平台信息</b><span>从实例详情或 SSH 登录命令取得公网 IP、SSH 端口和用户；安全组放行 SSH 与业务入口。</span></li><li><b>SSH 信任</b><span>在可信电脑获取主机指纹；把专用部署公钥加入服务器 authorized_keys，或填写平台提供的密码。</span></li><li><b>运行环境</b><span>云服务器安装 Docker、Compose、Python 3；AutoDL 按项目启动脚本准备运行环境和持久化目录。</span></li><li><b>资源监控</b><span>安装只读监控代理，生成监控令牌；监控端口仅通过内网或 SSH 隧道供中台访问。</span></li><li><b>GitHub 发布</b><span>仓库保持不变。服务器地址改变时更新部署目标的 DEPLOY_HOST 和 DEPLOY_HOST_KEY；只有部署密钥改变时才更新 DEPLOY_SSH_KEY。</span></li><li><b>项目绑定</b><span>在上方勾选允许下发的项目；每个项目旁显示真实 GitHub 仓库，保存后回到看板观察资源。</span></li></ol></section>

        <section className="panel onboardingPanel"><div className="panelHead"><div><span className="kicker">PROJECT ONBOARDING</span><h3>新项目与 GitHub 流水线接入</h3></div><span className="sharedBadge">服务器就绪后执行</span></div><div className="projectOnboardingForm"><div className="formGrid"><label>项目 ID <Help text="项目稳定标识，例如 ai-ops；使用小写字母和连字符。"/><input value={projectForm.id} onChange={(event) => setProjectForm({ ...projectForm, id: event.target.value.toLowerCase() })} placeholder="ai-ops"/></label><label>项目名称 <Help text="看板显示名称。"/><input value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} placeholder="AI运营"/></label><label>GitHub 仓库地址 <Help text="从 GitHub 仓库首页地址栏复制，例如 https://github.com/owner/repo。"/><input value={projectForm.repository} onChange={(event) => setProjectForm({ ...projectForm, repository: event.target.value })} placeholder="https://github.com/owner/repo"/></label><label>代码分支 <Help text="用于发布的默认分支，通常为 main。"/><input value={projectForm.branch} onChange={(event) => setProjectForm({ ...projectForm, branch: event.target.value })}/></label><label>部署服务器 <Help text="选择已完成连接、监控和项目绑定的服务器。"/><select value={projectForm.targetId} onChange={(event) => setProjectForm({ ...projectForm, targetId: event.target.value })}>{servers.map((server) => <option key={server.id} value={server.id}>{server.name} · {server.status === "online" ? "在线" : "未就绪"}</option>)}</select></label><label>资源规格 <Help text="按项目预计负载选择；中台会结合服务器实时余量判断是否可下发。"/><select value={projectForm.resourceProfile} onChange={(event) => setProjectForm({ ...projectForm, resourceProfile: event.target.value })}><option value="small">轻量 · 1 CPU / 1GB</option><option value="standard">标准 · 2 CPU / 2GB</option><option value="large">增强 · 4 CPU / 4GB</option></select></label><label>服务端口 <Help text="业务对外端口，必须与安全组和反向代理配置一致。"/><input type="number" min="1024" max="65535" value={projectForm.hostPort} onChange={(event) => setProjectForm({ ...projectForm, hostPort: event.target.value })}/></label><label>暴露方式 <Help text="独立端口直接用 IP:端口访问；统一网关由 Nginx 按域名或路径转发。"/><select value={projectForm.exposure} onChange={(event) => setProjectForm({ ...projectForm, exposure: event.target.value })}><option value="direct">公网 IP + 独立端口</option><option value="gateway">统一 Nginx 网关</option></select></label><label>流水线文件 <Help text="GitHub 仓库 .github/workflows 下的文件名，默认 deploy.yml。"/><input value={projectForm.workflow} onChange={(event) => setProjectForm({ ...projectForm, workflow: event.target.value })}/></label><label>访问地址 <Help text="最终给用户访问的完整 URL。"/><input value={projectForm.endpoint} onChange={(event) => setProjectForm({ ...projectForm, endpoint: event.target.value })} placeholder="https://app.example.com"/></label><label>健康检查 <Help text="返回 HTTP 200 的轻量接口，用于判断发布是否成功。"/><input value={projectForm.healthUrl} onChange={(event) => setProjectForm({ ...projectForm, healthUrl: event.target.value })} placeholder="https://app.example.com/api/health"/></label></div><div className="checkRow"><label className="bootstrapCheck"><input type="checkbox" checked={projectForm.bootstrapWorkflow} onChange={(event) => setProjectForm({ ...projectForm, bootstrapWorkflow: event.target.checked })}/>缺少流水线时自动创建 deploy.yml</label><label className="bootstrapCheck"><input type="checkbox" checked={projectForm.deployNow} onChange={(event) => setProjectForm({ ...projectForm, deployNow: event.target.checked })}/>校验成功后立即触发第一次发布</label></div><div className="onboardingActions"><button className="releaseButton" onClick={submitProject} disabled={busy === "project" || !projectForm.targetId}>{busy === "project" ? "正在建立并发布…" : "一键建立流水线并发布"}</button></div>{result && <div className="readiness"><b>{result.deploymentTriggered ? "首次发布已触发，请前往流水线查看" : result.workflowReady ? "流水线已就绪" : "项目已登记，流水线待配置"}</b><div>{result.checks.map((check) => <span key={check.path} className={check.ok ? "ok" : "missing"}>{check.ok ? "✓" : "!"} {check.path}</span>)}</div>{result.deploymentError && <small className="errorText">{result.deploymentError}</small>}<small>仓库 Secrets：{result.secretsRequired.join("、")}</small></div>}</div></section>
      </div>
    </section>
  </main>;
}
