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
  projectUrl?: string;
  manualUrl?: string;
  healthUrl?: string;
  endpoint: string;
  defaultPort?: number;
  centralDeployment?: boolean;
  resourceManaged: boolean;
  targetIds: string[];
};

const projectsFile = join(process.env.CONTROL_CENTER_DATA_DIR ?? "/app/data", "projects.json");
const retiredProjectIds = new Set<string>();

export const builtInProjects: DeploymentProject[] = [
  { id: "ontology", name: "汽车后市场 Ontology", repository: process.env.ONTOLOGY_GITHUB_REPOSITORY ?? "qiubo-master/Ontology", workflow: "deploy-project.yml", branch: "master", description: "智能客服意图、对象、规则、能力与决策链路运行平台", projectUrl: process.env.ONTOLOGY_PUBLIC_URL ?? "http://100.103.132.88:8090", manualUrl: "https://github.com/qiubo-master/Ontology/blob/master/README.md", healthUrl: process.env.ONTOLOGY_HEALTH_URL ?? "http://100.103.132.88:8090/api/health", endpoint: process.env.ONTOLOGY_PUBLIC_URL ?? "http://100.103.132.88:8090", defaultPort: 8090, centralDeployment: true, resourceManaged: true, targetIds: ["aliyun-main"] },
  { id: "css", name: "智能客服", repository: process.env.CSS_GITHUB_REPOSITORY ?? "qiubo-master/CSS", workflow: "deploy-project.yml", branch: "master", description: "汽车后市场智能客服与轮胎业务服务", projectUrl: process.env.CSS_PUBLIC_URL ?? "http://100.103.132.88:8100", manualUrl: "https://github.com/qiubo-master/CSS/blob/master/README.md", healthUrl: process.env.CSS_HEALTH_URL ?? "http://100.103.132.88:8100/api/v1/health", endpoint: process.env.CSS_PUBLIC_URL ?? "http://100.103.132.88:8100", defaultPort: 8100, centralDeployment: true, resourceManaged: true, targetIds: ["aliyun-main"] },
  { id: "ai-ops", name: "AI运营", repository: "qiubo-master/AI_OPS", workflow: "deploy-project.yml", branch: "master", description: "门店运营、巡检与业务编排智能平台", projectUrl: "http://100.103.132.88:8101", manualUrl: "https://github.com/qiubo-master/AI_OPS/blob/master/README.md", healthUrl: "http://100.103.132.88:8101/api/health", endpoint: "http://100.103.132.88:8101", defaultPort: 8101, centralDeployment: true, resourceManaged: true, targetIds: ["aliyun-main"] },
  { id: "ai-wms", name: "AI供应链", repository: "qiubo-master/AI_WMS", workflow: "deploy-project.yml", branch: "master", description: "供应链智能备货与仓储决策平台", projectUrl: "http://100.103.132.88:8102", manualUrl: "https://github.com/qiubo-master/AI_WMS/blob/master/README.md", healthUrl: "http://100.103.132.88:8102/api/health", endpoint: "http://100.103.132.88:8102", defaultPort: 8102, centralDeployment: true, resourceManaged: true, targetIds: ["aliyun-main"] },
  { id: "media", name: "序章自媒体中台", repository: process.env.MEDIA_GITHUB_REPOSITORY ?? "qiubo-master/Media", workflow: process.env.MEDIA_GITHUB_WORKFLOW_FILE ?? "deploy.yml", branch: "master", description: "内容生产、账号矩阵与 AI 决策中台", projectUrl: "http://100.103.132.88:8080", manualUrl: "https://github.com/qiubo-master/Media/blob/master/README.md", healthUrl: process.env.MEDIA_HEALTH_URL, endpoint: "http://100.103.132.88:8080", resourceManaged: true, targetIds: ["aliyun-main"] },
  { id: "word-game", name: "WordGame 单词闯关", repository: process.env.WORD_GAME_GITHUB_REPOSITORY ?? "qiubo-master/WordGame", workflow: process.env.WORD_GAME_GITHUB_WORKFLOW_FILE ?? "cloudbase.yml", branch: "master", description: "支持账号、闯关和进度存档的单词学习游戏", projectUrl: process.env.WORD_GAME_PUBLIC_URL ?? "https://wordgame-1-d7gx6qvym115a8f41-1348325609.tcloudbaseapp.com/", manualUrl: "https://github.com/qiubo-master/WordGame/blob/master/deploy-cloudbase.md", healthUrl: process.env.WORD_GAME_HEALTH_URL ?? "https://wordgame-1-d7gx6qvym115a8f41-1348325609.ap-shanghai.app.tcloudbase.com/wqapi/api/health", endpoint: process.env.WORD_GAME_PUBLIC_URL ?? "https://wordgame-1-d7gx6qvym115a8f41-1348325609.tcloudbaseapp.com/", resourceManaged: false, targetIds: [] },
  { id: "gfm", name: "GFM 通用大模型基座", repository: process.env.GFM_GITHUB_REPOSITORY ?? "qiubo-master/GFM", workflow: process.env.GFM_GITHUB_WORKFLOW_FILE ?? "deploy.yml", branch: "master", description: "统一提供 Qwen 文本、Embedding、YOLO、OCR 与 Qwen-VL 多模态 API", projectUrl: process.env.GFM_PUBLIC_URL, manualUrl: "https://github.com/qiubo-master/GFM/blob/master/README.md", healthUrl: process.env.GFM_HEALTH_URL, endpoint: process.env.GFM_PUBLIC_URL ?? "尚未配置线上访问地址", resourceManaged: false, targetIds: [] },
  { id: "otel", name: "Otel 可观测平台", repository: process.env.OTEL_GITHUB_REPOSITORY ?? "qiubo-master/Otel", workflow: "deploy-otel.yml", branch: "main", description: "统一采集指标、链路与日志，提供 Grafana、Prometheus、Tempo 和 Elasticsearch 可观测能力", projectUrl: process.env.OTEL_PUBLIC_URL ?? "http://100.103.132.88:8103", manualUrl: "https://github.com/qiubo-master/Otel/blob/main/docs/OPERATIONS.md", healthUrl: process.env.OTEL_HEALTH_URL ?? "http://100.103.132.88:8103/api/health", endpoint: process.env.OTEL_PUBLIC_URL ?? "http://100.103.132.88:8103", defaultPort: 8103, centralDeployment: true, resourceManaged: true, targetIds: ["aliyun-main"] },
  { id: "deploy-center", name: "CI/CD 发布控制中心", repository: process.env.DEPLOY_CENTER_GITHUB_REPOSITORY ?? "qiubo-master/CSS-Deploy-Center", workflow: process.env.DEPLOY_CENTER_GITHUB_WORKFLOW_FILE ?? "deploy.yml", branch: "master", description: "本控制台自身，支持自举发布", manualUrl: "https://github.com/qiubo-master/CSS-Deploy-Center/blob/master/docs/%E6%93%8D%E4%BD%9C%E6%89%8B%E5%86%8C.md", endpoint: process.env.DEPLOY_CENTER_PUBLIC_URL ?? "http://100.103.132.88", resourceManaged: false, targetIds: ["aliyun-main"] },
  { id: "eval", name: "Eval 评测系统", repository: "qiubo-master/eval", workflow: "deploy-eval.yml", branch: "master", description: "大模型、Prompt 与应用效果评测系统", projectUrl: "http://100.103.132.88:8104", manualUrl: "https://github.com/qiubo-master/eval/blob/master/README.md", healthUrl: "http://100.103.132.88:8104/api/public/health", endpoint: "http://100.103.132.88:8104", defaultPort: 8104, centralDeployment: true, resourceManaged: true, targetIds: ["aliyun-main"] },
];

function validProjects(value: unknown): value is DeploymentProject[] {
  return Array.isArray(value) && value.every((item) => item && typeof item.id === "string" && typeof item.repository === "string" && Array.isArray(item.targetIds));
}

export async function deploymentProjects() {
  try {
    const custom = JSON.parse(await readFile(projectsFile, "utf8"));
    if (validProjects(custom)) return [...builtInProjects, ...custom.filter((item) => !retiredProjectIds.has(item.id) && !builtInProjects.some((builtIn) => builtIn.id === item.id))];
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
  return projects.find((project) => project.id === id) ?? projects[0];
}
