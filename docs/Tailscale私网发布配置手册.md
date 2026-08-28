# Tailscale 私网发布配置手册

本文用于将 `CSS-Deploy-Center`（CI/CD 中台）和 `Media` 的 GitHub Actions 发布目标切换到新服务器 `100.103.132.88`。该地址是 Tailscale 私网地址，只有加入同一 tailnet 且访问策略允许的设备才能访问。

调整后的发布链路如下：

```text
GitHub Actions
  ├─ 测试并构建 Docker 镜像
  ├─ 以临时 tag:ci 节点加入 Tailscale
  ├─ 通过 Tailscale 地址上传代码包和镜像包
  └─ SSH 到 100.103.132.88，docker load 后离线启动
```

新服务器在发布过程中不需要连接 GitHub 或 Docker Hub。它只需要能够加入 Tailscale，并已安装 Docker、Docker Compose v2、SSH 和 curl。

## 一、配置新服务器

### 1. 安装并登录 Tailscale

如果服务器已经能显示 `100.103.132.88`，说明它大概率已经加入 tailnet，先执行检查：

```bash
sudo tailscale status
sudo tailscale ip -4
sudo tailscale netcheck
```

`tailscale ip -4` 必须返回 `100.103.132.88`。如果尚未安装或登录，按 Tailscale 管理后台提供的 Linux 安装命令安装，然后执行：

```bash
sudo tailscale up
```

打开命令返回的登录链接，使用与 GitHub Actions OAuth Client 相同的 tailnet 完成授权。

建议在 Tailscale 管理后台将服务器命名为 `deploy-prod`，并为其分配 `tag:deploy-server`。如果暂时不加服务器标签，后面的访问策略也可以直接使用 `100.103.132.88`。

### 2. 配置部署用户的 SSH 公钥

以下命令在新服务器执行。把占位内容替换为 GitHub `DEPLOY_SSH_KEY` 对应私钥的公钥：

```bash
sudo install -d -m 700 -o master -g master /home/master/.ssh
sudo touch /home/master/.ssh/authorized_keys
sudo chown master:master /home/master/.ssh/authorized_keys
sudo chmod 600 /home/master/.ssh/authorized_keys
```

将一整行 `ssh-ed25519 ...` 公钥追加到 `/home/master/.ssh/authorized_keys`。不要把私钥复制到服务器或提交到仓库。

验证部署用户具备 Docker 权限：

```bash
sudo usermod -aG docker master
id master
sudo -u master docker version
sudo -u master docker compose version
```

执行 `usermod` 后需要让 `master` 重新登录一次。如果暂时不能重新登录，用 `sudo docker ...` 检查不代表 GitHub 发布用户已经具备权限。

### 3. 准备应用目录

```bash
sudo install -d -m 755 -o master -g master /opt/css-deploy-center
sudo install -d -m 755 -o master -g master /opt/media-platform
sudo install -d -m 700 -o master -g master /opt/css-deploy-center/shared
sudo install -d -m 700 -o master -g master /opt/media-platform/shared
```

保留已经迁移的数据和环境文件：

```bash
sudo test -s /opt/css-deploy-center/shared/.env
sudo test -s /opt/media-platform/shared/.env
sudo docker volume inspect media_creator_os_postgres_data
```

不要删除或重新创建 Media 的 PostgreSQL 数据卷。数据库迁移与代码发布共用同一持久卷，但发布镜像不包含数据库数据。

## 二、配置 Tailscale 访问策略

打开 Tailscale 管理后台的 **Access controls**。推荐使用 Grants，并为 CI 和生产服务器定义独立标签：

```json
{
  "tagOwners": {
    "tag:ci": ["autogroup:admin"],
    "tag:deploy-server": ["autogroup:admin"]
  },
  "grants": [
    {
      "src": ["tag:ci"],
      "dst": ["tag:deploy-server"],
      "ip": ["tcp:22"]
    }
  ]
}
```

如果当前不能给服务器设置 `tag:deploy-server`，可以临时把 `dst` 改为：

```json
"dst": ["100.103.132.88"]
```

保存策略后，在后台确认新服务器确实持有 `tag:deploy-server`。不要给 `tag:ci` 配置访问整个 tailnet 的 `*:*` 权限。

这里使用服务器原生 OpenSSH 和现有 SSH 私钥，不要求开启 Tailscale SSH。若以后启用 Tailscale SSH，需要额外配置 SSH 访问规则，不能用上面的 TCP Grant 代替身份授权规则。

## 三、创建 Tailscale OAuth Client

进入 Tailscale 管理后台的 **Trust credentials**：

1. 选择 **Credential → OAuth**。
2. 名称填写 `github-actions-production-deploy`。
3. 按当前后台界面授予用于创建临时 CI 节点的权限：`Keys > Auth Keys > Write`；如果后台的 GitHub CI/CD 向导要求，同时授予 `Devices > Core > Write`。
4. 允许的标签只选择 `tag:ci`。
5. 创建后立即保存 Client ID 和 Client Secret。Secret 关闭页面后通常不能再次完整查看。

GitHub Actions 每次运行会创建一个短期、临时的 `tag:ci` 节点，任务结束后退出。不要把个人 Tailscale 登录凭据用于流水线。

## 四、配置 GitHub Environments Secrets

两个仓库都使用名为 `production` 的 GitHub Environment。分别进入：

```text
Repository → Settings → Environments → production → Environment secrets
```

在 `CSS-Deploy-Center` 和 `Media` 两个仓库分别设置：

| Secret | 值 |
|---|---|
| `TS_OAUTH_CLIENT_ID` | 上一步生成的 OAuth Client ID |
| `TS_OAUTH_SECRET` | 上一步生成的 OAuth Client Secret |
| `DEPLOY_HOST` | `100.103.132.88` |
| `DEPLOY_PORT` | `22` |
| `DEPLOY_USER` | `master` |
| `DEPLOY_SSH_KEY` | 部署专用 SSH 私钥全文 |

SSH Host Key 的 Secret 名称在两个仓库不同：

| 仓库 | Secret 名称 |
|---|---|
| `CSS-Deploy-Center` | `DEPLOY_HOST_KEY_CURRENT` |
| `Media` | `DEPLOY_HOST_KEY` |

从一台已经加入同一 tailnet、且可信的电脑采集新服务器 Host Key：

```bash
ssh-keyscan -H -p 22 100.103.132.88
```

先通过服务器控制台核对 `/etc/ssh/ssh_host_ed25519_key.pub` 的指纹，再把 `ssh-keyscan` 的完整输出保存为对应 Secret。不要用 `StrictHostKeyChecking=no` 绕过验证。

这些凭据用途不同：

- `TS_OAUTH_*`：让 GitHub Runner 临时加入 Tailscale。
- `DEPLOY_SSH_KEY`：让 Runner 以 `master` 身份登录服务器。
- `DEPLOY_HOST_KEY*`：确认连接的是正确服务器，防止中间人攻击。
- 中台生产 `.env` 中的 GitHub Token：让中台查询提交、触发 GitHub Actions；它不能替代上述任何凭据。

## 五、首次发布与验证

### 1. 发布 CI/CD 中台

把本次代码合并到 `CSS-Deploy-Center` 的 `master` 后，打开仓库 **Actions → Deploy Control Center → Run workflow**，选择 `deploy`。

成功日志应依次出现：

```text
Build deployment image
Connect to deployment tailnet
Package and upload release
Activate release
```

服务器检查：

```bash
cd /opt/css-deploy-center/current
docker compose --env-file /opt/css-deploy-center/shared/.env \
  --env-file deploy.resources.env ps
curl -I http://127.0.0.1:3000/
```

如果服务器 Nginx 已把公网/私网 80 端口转发到 `127.0.0.1:3000`，在加入同一 tailnet 的电脑访问：

```text
http://100.103.132.88/
```

### 2. 发布 Media

打开 Media 仓库 **Actions → Deploy Media Platform → Run workflow**，选择 `deploy`。资源默认可使用：

```text
host_port: 8080
bind_address: 0.0.0.0
```

服务器检查：

```bash
cd /opt/media-platform/current
sudo docker compose \
  --env-file /opt/media-platform/shared/.env \
  --env-file deploy.resources.env ps
curl -I http://127.0.0.1:8080/
```

同一 tailnet 中访问 `http://100.103.132.88:8080/`。

### 3. 验证中台发布 Media

1. 登录 CI/CD 中台。
2. 确认生产 `.env` 中的 GitHub Token 对 Media 仓库至少具备 Actions 读写和 Contents 读取权限。
3. 输入 `CONTROL_CENTER_ADMIN_TOKEN`。
4. 点击 Media 的“发布最新版本”。
5. 在 GitHub Actions 中确认触发的是 Media `master` 分支的 `Deploy Media Platform`。
6. 流水线成功后核对页面版本、服务器容器和 `8080` 健康检查。

## 六、故障排查

### `ping` 阶段超时

```bash
sudo tailscale status
sudo tailscale ip -4
```

确认服务器在线、IP 未变化、GitHub OAuth Client 允许 `tag:ci`，并且 Grant 允许 `tag:ci` 到服务器 TCP 22。

### `Host key verification failed`

重新从可信电脑执行 `ssh-keyscan`，核对服务器指纹，然后更新正确仓库中的 Host Key Secret。注意 CSS 和 Media 使用的 Secret 名不同。

### `Permission denied (publickey)`

确认 `DEPLOY_SSH_KEY` 没有丢失首尾行或换行，并确认对应公钥存在于 `/home/master/.ssh/authorized_keys`。

### `permission denied` 访问 Docker

确认 `master` 在 `docker` 组并重新登录：

```bash
id master
sudo -u master docker ps
```

### Docker Hub 或 GitHub 连接超时

本次改造后，生产服务器发布不再执行 `docker build` 或 `docker pull`。如果日志仍显示服务器在拉取 `node:*`、`postgres:*` 或 `nginx:*`，说明运行的不是最新 Master 工作流/部署脚本，或手工执行了未带 `--no-build --pull never` 的 Compose 命令。

### 服务返回 200，但浏览器打不开

`curl 127.0.0.1` 只证明应用容器正常。继续检查监听地址、Nginx 和 Tailscale 客户端：

```bash
sudo ss -lntp | grep -E ':80|:3000|:8080'
sudo nginx -t
sudo systemctl status nginx --no-pager
sudo tailscale status
```

`100.103.132.88` 是私网地址，未加入该 tailnet 的浏览器无法访问。若需要普通公网用户访问，应另行配置公网 IP、域名、HTTPS 和安全组，而不是放宽 Tailscale Grant。

## 七、上线前检查表

- 新服务器 `tailscale ip -4` 返回 `100.103.132.88`。
- GitHub OAuth Client 只允许 `tag:ci`，Secret 已分别写入两个仓库的 `production` Environment。
- Grant 只允许 CI 到部署服务器 TCP 22。
- 两个仓库的 `DEPLOY_HOST` 都已改为 `100.103.132.88`。
- 两个仓库配置了各自正确名称的 SSH Host Key Secret。
- `/opt/css-deploy-center/shared/.env` 与 `/opt/media-platform/shared/.env` 存在且非空。
- Media 数据卷和数据表已经核验，不能仅以 PostgreSQL healthy 判断迁移完成。
- 中台、Media、从中台触发 Media 发布三条路径均实测成功。
- 完成最终数据同步并停止旧服务器写入后，才关闭旧服务器。
