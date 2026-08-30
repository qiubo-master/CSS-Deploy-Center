import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type ProjectId = string;

export type DeploymentProject = {
  id: ProjectId;
  name: string;
  repository: string;
  workflow: string;
  branch: string;
  description: string;
  manualUrl?: string;
  healthUrl?: string;
  endpoint: string;
  resourceManaged: boolean;
  targetIds: string[];
};

const projectsFile = join(process.env.CONTROL_CENTER_DATA_DIR ?? "/app/data", "projects.json");

export const builtInProjects: DeploymentProject[] = [
  { id: "css", name: "智能客服", repository: process.env.CSS_GITHUB_REPOSITORY ?? "qiubo-master/CSS", workflow: process.env.CSS_GITHUB_WORKFLOW_FILE ?? "deploy.yml", branch: "master", description: "现有智能客服生产服务", manualUrl: "https://github.com/qiubo-master/CSS/blob/master/README.md", healthUrl: process.env.CSS_HEALTH_URL, endpoint: process.env.CSS_PUBLIC_URL ?? "等待配置访问地址", resourceManaged: false, targetIds: ["aliyun-main"] },
  { id: "media", name: "序章自媒体中台", repository: process.env.MEDIA_GITHUB_REPOSITORY ?? "qiubo-master/Media", workflow: process.env.MEDIA_GITHUB_WORKFLOW_FILE ?? "deploy.yml", branch: "master", description: "内容生产、账号矩阵与 AI 决策中台", manualUrl: "https://github.com/qiubo-master/Media/blob/master/README.md", healthUrl: process.env.MEDIA_HEALTH_URL, endpoint: process.env.MEDIA_PUBLIC_URL ?? "http://共享公网IP:8080", resourceManaged: true, targetIds: ["aliyun-main"] },
  { id: "ai-wms", name: "AI供应链智能备货", repository: process.env.AI_WMS_GITHUB_REPOSITORY ?? "qiubo-master/AI_WMS", workflow: process.env.AI_WMS_GITHUB_WORKFLOW_FILE ?? "deploy.yml", branch: "master", description: "轮胎需求预测、库存监控与AI解释演示系统", healthUrl: process.env.AI_WMS_HEALTH_URL ?? "http://47.120.61.139/api/health", endpoint: process.env.AI_WMS_PUBLIC_URL ?? "http://47.120.61.139", resourceManaged: false, targetIds: ["aliyun2"] },
  { id: "ai-ops", name: "AI运营", repository: process.env.AI_OPS_GITHUB_REPOSITORY ?? "qiubo-master/AI_OPS", workflow: process.env.AI_OPS_GITHUB_WORKFLOW_FILE ?? "deploy.yml", branch: "master", description: "AI数字化培训、AI图像检测、AI维修诊断与AI保养报价", healthUrl: process.env.AI_OPS_HEALTH_URL, endpoint: process.env.AI_OPS_PUBLIC_URL ?? "等待首次发布", resourceManaged: false, targetIds: ["aliyun2"] },
  { id: "gfm", name: "GFM 通用大模型基座", repository: process.env.GFM_GITHUB_REPOSITORY ?? "qiubo-master/GFM", workflow: process.env.GFM_GITHUB_WORKFLOW_FILE ?? "deploy.yml", branch: "master", description: "统一提供 Qwen 文本、Embedding、YOLO、OCR 与 Qwen-VL 多模态 API", manualUrl: "https://github.com/qiubo-master/GFM/blob/master/README.md", healthUrl: process.env.GFM_HEALTH_URL ?? "https://uu800904-ada3-4b719cf9.westb.seetacloud.com:8443/foundation/v1/health", endpoint: process.env.GFM_PUBLIC_URL ?? "https://uu800904-ada3-4b719cf9.westb.seetacloud.com:8443/", resourceManaged: false, targetIds: ["autodl2"] },
  { id: "otel", name: "Otel 可观测平台", repository: process.env.OTEL_GITHUB_REPOSITORY ?? "qiubo-master/Otel", workflow: process.env.OTEL_GITHUB_WORKFLOW_FILE ?? "deploy.yml", branch: "main", description: "统一采集指标、链路与日志，提供 Grafana、Prometheus、Tempo 和 Elasticsearch 可观测能力", manualUrl: "https://github.com/qiubo-master/Otel/blob/main/docs/OPERATIONS.md", healthUrl: process.env.OTEL_HEALTH_URL ?? "http://100.103.132.88:13133", endpoint: process.env.OTEL_PUBLIC_URL ?? "http://100.103.132.88:3000", resourceManaged: true, targetIds: ["aliyun-main"] },
  { id: "deploy-center", name: "CI/CD 发布控制中心", repository: process.env.DEPLOY_CENTER_GITHUB_REPOSITORY ?? "qiubo-master/CSS-Deploy-Center", workflow: process.env.DEPLOY_CENTER_GITHUB_WORKFLOW_FILE ?? "deploy.yml", branch: "master", description: "本控制台自身，支持自举发布", manualUrl: "https://github.com/qiubo-master/CSS-Deploy-Center/blob/master/docs/%E6%93%8D%E4%BD%9C%E6%89%8B%E5%86%8C.md", endpoint: process.env.DEPLOY_CENTER_PUBLIC_URL ?? "http://100.103.132.88", resourceManaged: false, targetIds: ["aliyun-main"] },
];

function validProjects(value: unknown): value is DeploymentProject[] {
  return Array.isArray(value) && value.every((item) => item && typeof item.id === "string" && typeof item.repository === "string" && Array.isArray(item.targetIds));
}

export async function deploymentProjects() {
  try {
    const custom = JSON.parse(await readFile(projectsFile, "utf8"));
    if (validProjects(custom)) return [...builtInProjects, ...custom.filter((item) => !builtInProjects.some((builtIn) => builtIn.id === item.id))];
  } catch { /* no custom projects yet */ }
  return builtInProjects;
}

export async function saveCustomProject(project: DeploymentProject) {
  let custom: DeploymentProject[] = [];
  try {
    const stored = JSON.parse(await readFile(projectsFile, "utf8"));
    if (validProjects(stored)) custom = stored;
  } catch { /* initialize */ }
  const next = [...custom.filter((item) => item.id !== project.id), project];
  await mkdir(dirname(projectsFile), { recursive: true });
  await writeFile(projectsFile, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
}

export async function getProject(id: unknown) {
  const projects = await deploymentProjects();
  return projects.find((project) => project.id === id) ?? projects.find((project) => project.id === "media") ?? projects[0];
}
