# ForgeOps · 多项目 CI/CD 发布控制中心

面向 `qiubo-master/CSS` 与 `qiubo-master/Media` 的可视化发布工作台。它通过 GitHub Actions API 触发部署和回滚，并为 Media 下发 CPU、内存、数据库内存、公网端口和暴露模式。

## 当前线上入口

- CI/CD 控制台：`http://47.120.76.166/`
- Media 自媒体中台：`http://47.120.76.166:8080/`

当前两个系统共享同一个阿里云公网 IP，通过不同端口提供服务。Media 已完成首次资源下发，日常更新不需要再次调整 CPU、内存、端口或数据库卷。

## 日常发布 Media

1. 将 Media 新版本推送到 `qiubo-master/Media` 的 `main` 分支。
2. 打开 CI/CD 控制台并选择 **Media 自媒体中台**。
3. 刷新页面，确认“GitHub 最新版本”与“线上运行版本”不同，页面出现“有新版本”。
4. 在“管理员令牌”输入框粘贴服务器中配置的 `CONTROL_CENTER_ADMIN_TOKEN`。
5. 点击 **发布最新版本**。页面中的 **＋ 新建发布流水线** 是同一个发布动作的快捷入口。
6. 在“流水线列表”查看构建、迁移、部署和健康检查结果；需要完整日志时点击 GitHub 详情。
7. 流水线成功后访问 `http://47.120.76.166:8080/` 验证新版本。

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

Media 仓库需配置与控制台相同的部署 Secrets：`DEPLOY_HOST`、`DEPLOY_PORT`、`DEPLOY_USER`、`DEPLOY_SSH_KEY`、`DEPLOY_HOST_KEY`。服务器 `/opt/media-platform/shared/.env` 保存数据库与模型密钥，首次部署前从 Media 仓库 `.env.example` 创建并修改。

当前 Media 已完成首次资源下发，除非要扩缩容或更换端口，否则不要重复使用此功能。

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

## 常见问题

- **看不到新版本**：先确认代码已推送到 Media 的 `main` 分支，然后刷新控制台。
- **发布按钮返回 401**：管理员令牌为空或不正确，重新从服务器复制 `CONTROL_CENTER_ADMIN_TOKEN`。
- **流水线未启动**：检查控制中心的 GitHub Token 是否仍有效，并确认它对目标仓库拥有 `Actions: Read and write`、`Contents: Read`、`Metadata: Read` 权限。
- **流水线失败**：在流水线列表打开 GitHub 详情，优先检查仓库 Secrets、服务器 SSH 连通性、磁盘空间和 `/opt/media-platform/shared/.env`。
- **发布成功但页面异常**：检查 `media-platform-app-1`、`media-platform-db-1`、`media-platform-nginx-1` 三个容器，并确认 `8080` 端口仍在阿里云安全组中开放。

## 安全

生产环境必须配置 `CONTROL_CENTER_ADMIN_TOKEN`，并在 Nginx 或企业 SSO 层启用身份认证。SSH 私钥只存放在 GitHub Secrets，严禁提交到仓库。
