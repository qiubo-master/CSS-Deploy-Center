# GitHub 仓库自动同步到阿里云 ACR

## 架构

`CSS-Deploy-Center` 是中央镜像工厂。`.github/workflows/sync-acr.yml` 每 15 分钟检查一次 `ops/acr-images.json` 中的仓库，将 ACR 中尚不存在的提交构建为 `linux/amd64` 镜像。

镜像同时写入两个标签：

- `<commit-sha>`：不可变发布版本，用于部署与回滚。
- `latest`：最新成功构建版本，用于人工查看和测试。

目标 Registry 为 `crpi-73ce4hnji7xum4zi.cn-heyuan.personal.cr.aliyuncs.com`，命名空间为 `qiubo-master`。ACR 命名空间应开启“自动创建仓库”，新镜像仓库默认设为私有。

## GitHub 配置

只需在 `qiubo-master/CSS-Deploy-Center` 的 `production` 环境配置：

- `ACR_USERNAME`
- `ACR_PASSWORD`

中央同步不把凭据复制到其他个人仓库。修改凭据时只更新这一处。

## 当前镜像清单

- `AI_OPS` → `qiubo-master/ai-ops`
- `AI_WMS` → `qiubo-master/ai-wms`
- `CSS-Deploy-Center` → `qiubo-master/css-deploy-center`
- `gateway` → `qiubo-master/gateway`
- `GFM` → `qiubo-master/gfm`
- `Media` → `qiubo-master/media`
- `WordGame/server` → `qiubo-master/wordgame-server`

`CSS`、`Ontology`、`QB1`、`QB2` 没有 Dockerfile，因此不会伪造空镜像。`Otel` 和 `eval` 当前只编排第三方镜像。`hello-agents` 是多个独立示例项目的集合，需要逐个确认后才能加入。

## 操作

定时任务会自动同步。需要立即同步时，在 GitHub Actions 中运行 `Sync repositories to Aliyun ACR`：

- `repository` 留空：同步全部清单。
- 填仓库名：只同步一个仓库，例如 `Media`。
- `force=true`：即使提交 SHA 标签已存在也重新构建。

新增容器化仓库时，在 `ops/acr-images.json` 增加仓库、默认分支、构建上下文、Dockerfile 和目标镜像名称。下一轮定时任务会自动创建并推送镜像。

## CI/CD 控制中心部署

控制中心的生产发布不再运行 `docker save`、镜像分片 SCP 和 `docker load`。GitHub Actions 将镜像直接推送到河源 ACR，服务器通过 `docker pull` 取得不可变 SHA 版本；SSH 只上传约几百 KB 的源码和 Compose 配置。
