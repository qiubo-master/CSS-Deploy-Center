export type ProjectId = "css" | "media";

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
  },
];

export function getProject(id: unknown) {
  return deploymentProjects.find((project) => project.id === id) ?? deploymentProjects[1];
}
