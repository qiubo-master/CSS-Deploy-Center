# ForgeOps · 多项目 CI/CD 发布控制中心

面向 `qiubo-master/CSS` 与 `qiubo-master/Media` 的可视化发布工作台。它通过 GitHub Actions API 触发部署和回滚，并为 Media 下发 CPU、内存、数据库内存、公网端口和暴露模式。

## Media 资源下发

控制台提供轻量、标准、增强三档配置。默认将 Media 发布到阿里云服务器的共享公网 IP `8080` 端口；选择“统一 Nginx 网关”后仅监听 `127.0.0.1`，用于域名反向代理。资源值由固定档位产生，服务端会再次校验，不接受任意 Compose 内容或 Shell 命令。

Media 仓库需配置与控制台相同的部署 Secrets：`DEPLOY_HOST`、`DEPLOY_PORT`、`DEPLOY_USER`、`DEPLOY_SSH_KEY`、`DEPLOY_HOST_KEY`。服务器 `/opt/media-platform/shared/.env` 保存数据库与模型密钥，首次部署前从 Media 仓库 `.env.example` 创建并修改。

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

服务器信息确认后，配置仓库 Secrets：`DEPLOY_HOST`、`DEPLOY_PORT`、`DEPLOY_USER`、`DEPLOY_SSH_KEY`、`DEPLOY_HOST_KEY`。流水线会构建 Docker 镜像、健康检查并保留最近五个版本。

## 安全

生产环境必须配置 `CONTROL_CENTER_ADMIN_TOKEN`，并在 Nginx 或企业 SSO 层启用身份认证。SSH 私钥只存放在 GitHub Secrets，严禁提交到仓库。
