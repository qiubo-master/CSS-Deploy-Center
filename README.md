# ForgeOps · 多项目 CI/CD 发布控制中心

完整的服务器接入、仓库配置、资源下发、流水线发布和故障处理步骤请查看 [ForgeOps CI/CD 中台操作手册](docs/操作手册.md)。新服务器的私网发布配置请查看 [Tailscale 私网发布配置手册](docs/Tailscale私网发布配置手册.md)。

面向 `qiubo-master/CSS` 与 `qiubo-master/Media` 的可视化发布工作台。它通过 GitHub Actions API 触发部署和回滚，并为 Media 下发 CPU、内存、数据库内存、公网端口和暴露模式。

GFM 通用大模型基座作为独立 GPU 服务接入，使用专用 `deploy.yml` 发布到 AutoDL，并复用服务器上的模型、Redis 和受保护运行配置。

## 当前线上入口

- CI/CD 控制台（Tailscale 私网）：`http://100.103.132.88/`
- Media 自媒体中台（Tailscale 私网）：`http://100.103.132.88:8080/`

当前两个系统部署在同一台新服务器上，通过不同端口提供服务。`100.103.132.88` 是 Tailscale 私网地址，访问端也必须加入相同 tailnet 并获得访问权限。

## 日常发布 Media

1. 将 Media 新版本推送到 `qiubo-master/Media` 的 `master` 分支。
2. 打开 CI/CD 控制台并选择 **Media 自媒体中台**。
3. 刷新页面，确认“GitHub 最新版本”与“线上运行版本”不同，页面出现“有新版本”。
4. 在“管理员令牌”输入框粘贴服务器中配置的 `CONTROL_CENTER_ADMIN_TOKEN`。
5. 点击 **发布最新版本**。页面中的 **＋ 新建发布流水线** 是同一个发布动作的快捷入口。
6. 在“流水线列表”查看构建、迁移、部署和健康检查结果；需要完整日志时点击 GitHub 详情。
7. 流水线成功后从 tailnet 内访问 `http://100.103.132.88:8080/` 验证新版本。

“发布最新版本”会复用现有的资源配置、数据库持久卷和 `/opt/media-platform/shared/.env`，不会重新创建服务器，也不会清空业务数据。如果 GitHub 最新版本与线上版本相同，通常无需重复发布。

## 管理员令牌

管理员令牌是控制台执行写操作的二次授权，只用于发布和回滚，不是 GitHub Token，也不是服务器 SSH 私钥。令牌由生产服务器环境变量 `CONTROL_CENTER_ADMIN_TOKEN` 提供，不应提交到仓库、写入 README、截图或发送到聊天中。

在服务器上查看当前令牌：

```bash
grep '^CONTROL_CENTER_ADMIN_TOKEN=.' /opt/css-deploy-center/shared/.env \
  | tail -n 1 \
  | cut -d= -f2-
```

复制结果到控制台的“管理员令牌”输入框即可。令牌只授权本次浏览器中的管理操作；发布请求仍由服务端校验并调用 GitHub Actions。

## 按钮说明

- **发布最新版本**：部署 Media `main` 分支最新提交，复用现有资源，日常使用此按钮。
- **＋ 新建发布流水线**：与“发布最新版本”相同，用于从流水线列表区域快速发起发布。
- **回滚**：将服务切换回上一个可用发布版本，数据库持久卷不回滚。
- **高级资源设置 / 资源下发**：仅在首次部署或确实需要调整资源、端口、暴露模式时使用。

## Media 资源下发

控制台提供轻量、标准、增强三档配置。默认将 Media 发布到阿里云服务器的共享公网 IP `8080` 端口；选择“统一 Nginx 网关”后仅监听 `127.0.0.1`，用于域名反向代理。资源值由固定档位产生，服务端会再次校验，不接受任意 Compose 内容或 Shell 命令。

Media 仓库需配置部署 Secrets：`DEPLOY_HOST`、`DEPLOY_PORT`、`DEPLOY_USER`、`DEPLOY_SSH_KEY`、`DEPLOY_HOST_KEY`、`TS_OAUTH_CLIENT_ID`、`TS_OAUTH_SECRET`。服务器 `/opt/media-platform/shared/.env` 保存数据库与模型密钥，首次部署前从 Media 仓库 `.env.example` 创建并修改。

当前 Media 已完成首次资源下发，除非要扩缩容或更换端口，否则不要重复使用此功能。

## 多服务器与资源监控

控制台以“项目”为一级视图：一个项目可以绑定多个部署目标，一台服务器也可以承载多个项目。部署目标通过 `SERVER_INVENTORY_JSON` 配置，支持普通云服务器、裸金属和 AutoDL；每个目标包含稳定 ID、名称、厂商、区域、地址、监控地址和允许部署的项目。

每台 Linux 服务器运行只读代理 `ops/resource-agent.py`，采集 CPU、内存、磁盘；检测到 NVIDIA 驱动时额外采集 GPU 使用率和显存。同机部署时代理只监听 Docker 内部网关；跨服务器时应通过 VPN、云内网或 HTTPS Nginx 反向代理供控制中心访问，不要将无 TLS 的代理端口直接暴露到公网。

当前与控制中心同机的阿里云服务器由 `ops/install-resource-agent.sh` 自动生成独立令牌并注册 systemd 服务。代理同时读取 Docker 的实时统计和 Compose 项目标记，因此控制台可以展示每个项目的容器数量、CPU、内存使用量与内存上限。页面右上角的“＋ 接入服务器”用于登记后续云服务器或 AutoDL；资产数据持久化在 `/opt/css-deploy-center/shared/data/servers.json`，发布控制中心版本时不会丢失。

```bash
sudo install -m 750 ops/resource-agent.py /usr/local/bin/forgeops-resource-agent
sudo env FORGEOPS_MONITOR_TOKEN='生成的独立随机令牌' \
  FORGEOPS_MONITOR_PORT=9108 \
  /usr/local/bin/forgeops-resource-agent
```

生产环境应将上述命令配置为 systemd 服务，并在控制中心设置：

```dotenv
MONITOR_AGENT_TOKEN=所有代理共用或经网关转换的只读令牌
ALIYUN_MONITOR_URL=https://monitor.example.com/v1/resources
SERVER_INVENTORY_JSON=[{"id":"production-main","name":"生产服务器","provider":"私有部署","kind":"cloud","region":"tailnet","address":"100.103.132.88","monitorUrl":"http://100.103.132.88:9108/v1/resources","projectIds":["css","media"]},{"id":"autodl-gpu-1","name":"AutoDL GPU 01","provider":"AutoDL","kind":"autodl","region":"西北","address":"实例地址","monitorUrl":"https://autodl-agent.example.com/v1/resources","projectIds":["media"]}]
```

下发前容量判断采用保守策略：请求资源之外至少保留 20% CPU、20% 内存和 5GB 磁盘空间。监控未接入、目标离线或余量不足时，控制台禁用资源下发；日常向已部署目标发布新版本不受首次资源下发按钮影响。

## 本地运行

```bash
pnpm install
pnpm dev
```

未配置环境变量时自动使用演示数据。复制 `.env.example` 为 `.env` 并配置 GitHub Fine-grained Token 后进入真实模式。

## GitHub Token 最小权限

- Actions: Read and write
- Contents: Read
- Metadata: Read

## 阿里云部署

服务器信息确认后，按 [Tailscale 私网发布配置手册](docs/Tailscale私网发布配置手册.md) 配置 Tailscale、SSH 和仓库 Secrets。流水线会在 GitHub Runner 构建 Docker 镜像，通过 Tailscale 上传到服务器，健康检查并保留最近五个版本。

## 常见问题

- **看不到新版本**：先确认代码已推送到 Media 的 `main` 分支，然后刷新控制台。
- **发布按钮返回 401**：管理员令牌为空或不正确，重新从服务器复制 `CONTROL_CENTER_ADMIN_TOKEN`。
- **流水线未启动**：检查控制中心的 GitHub Token 是否仍有效，并确认它对目标仓库拥有 `Actions: Read and write`、`Contents: Read`、`Metadata: Read` 权限。
- **流水线失败**：在流水线列表打开 GitHub 详情，优先检查仓库 Secrets、服务器 SSH 连通性、磁盘空间和 `/opt/media-platform/shared/.env`。
- **发布成功但页面异常**：检查 `media-platform-app-1`、`media-platform-db-1`、`media-platform-nginx-1` 三个容器，并确认 `8080` 端口仍在阿里云安全组中开放。

## 安全

生产环境必须配置 `CONTROL_CENTER_ADMIN_TOKEN`，并在 Nginx 或企业 SSO 层启用身份认证。SSH 私钥只存放在 GitHub Secrets，严禁提交到仓库。
