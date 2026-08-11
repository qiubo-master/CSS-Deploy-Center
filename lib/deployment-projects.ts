export type ProjectId = "css" | "media" | "ai-wms" | "ai-ops";

export type DeploymentProject = {
  id: ProjectId;
  name: string;
  repository: string;
  workflow: string;
  branch: string;
  description: string;
  healthUrl?: string;
  endpoint: string;
  resourceManaged: boolean;
  targetIds: string[];
};

export const deploymentProjects: DeploymentProject[] = [
  {
    id: "css",
    name: "智能客服",
    repository: process.env.CSS_GITHUB_REPOSITORY ?? "qiubo-master/CSS",
    workflow: process.env.CSS_GITHUB_WORKFLOW_FILE ?? "deploy.yml",
    branch: "main",
    description: "现有智能客服生产服务",
    healthUrl: process.env.CSS_HEALTH_URL,
    endpoint: process.env.CSS_PUBLIC_URL ?? "等待配置访问地址",
    resourceManaged: false,
    targetIds: ["aliyun-main"],
  },
  {
    id: "media",
    name: "序章自媒体中台",
    repository: process.env.MEDIA_GITHUB_REPOSITORY ?? "qiubo-master/Media",
    workflow: process.env.MEDIA_GITHUB_WORKFLOW_FILE ?? "deploy.yml",
    branch: "main",
    description: "内容生产、账号矩阵与 AI 决策中台",
    healthUrl: process.env.MEDIA_HEALTH_URL,
    endpoint: process.env.MEDIA_PUBLIC_URL ?? "http://共享公网IP:8080",
    resourceManaged: true,
    targetIds: ["aliyun-main"],
  },
  {
    id: "ai-wms",
    name: "AI供应链智能备货",
    repository: process.env.AI_WMS_GITHUB_REPOSITORY ?? "qiubo-master/AI_WMS",
    workflow: process.env.AI_WMS_GITHUB_WORKFLOW_FILE ?? "deploy.yml",
    branch: "main",
    description: "轮胎需求预测、库存监控与AI解释演示系统",
    healthUrl: process.env.AI_WMS_HEALTH_URL ?? "http://47.120.61.139:3000/api/health",
    endpoint: process.env.AI_WMS_PUBLIC_URL ?? "http://47.120.61.139:3000",
    resourceManaged: false,
    targetIds: ["aliyun2"],
  },
  {
    id: "ai-ops",
    name: "AI运营",
    repository: process.env.AI_OPS_GITHUB_REPOSITORY ?? "qiubo-master/AI_OPS",
    workflow: process.env.AI_OPS_GITHUB_WORKFLOW_FILE ?? "deploy.yml",
    branch: "main",
    description: "AI数字化培训、AI图像检测、AI维修诊断与AI保养报价",
    healthUrl: process.env.AI_OPS_HEALTH_URL,
    endpoint: process.env.AI_OPS_PUBLIC_URL ?? "等待首次发布",
    resourceManaged: false,
    targetIds: ["aliyun2"],
  },
];

export function getProject(id: unknown) {
  return deploymentProjects.find((project) => project.id === id) ?? deploymentProjects[1];
}
