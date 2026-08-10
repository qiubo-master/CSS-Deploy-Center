# ForgeOps · CSS CI/CD 发布控制中心

面向 `qiubo-master/CSS` 智能客服项目的可视化发布工作台。它通过 GitHub Actions API 触发部署和回滚，并展示流水线、版本、服务健康、服务器及模型运行状态。

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
