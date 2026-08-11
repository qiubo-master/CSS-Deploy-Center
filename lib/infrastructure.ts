import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type ServerKind = "cloud" | "autodl" | "bare-metal";

export type ServerTarget = {
  id: string;
  name: string;
  provider: string;
  kind: ServerKind;
  region: string;
  address: string;
  monitorUrl?: string;
  monitorToken?: string;
  projectIds: string[];
};

export type ContainerSnapshot = {
  name: string;
  composeProject: string;
  cpuUsedPercent: number;
  memoryUsedMb: number;
  memoryLimitMb: number;
};

export type ResourceSnapshot = {
  cpuTotal: number;
  cpuUsedPercent: number;
  memoryTotalMb: number;
  memoryUsedMb: number;
  diskTotalGb: number;
  diskUsedGb: number;
  containers?: ContainerSnapshot[];
  gpu?: { name: string; memoryTotalMb: number; memoryUsedMb: number; utilizationPercent: number }[];
  collectedAt: string;
};

export type CapacityRequest = { cpu: number; memoryMb: number; diskGb: number };

const inventoryFile = join(process.env.CONTROL_CENTER_DATA_DIR ?? "/app/data", "servers.json");
const defaultTargets: ServerTarget[] = [{
  id: "aliyun-main",
  name: "阿里云生产服务器",
  provider: "阿里云",
  kind: "cloud",
  region: process.env.ALIYUN_REGION ?? "cn-hangzhou",
  address: process.env.DEPLOY_HOST ?? "47.120.76.166",
  monitorUrl: process.env.ALIYUN_MONITOR_URL ?? "http://host.docker.internal:9108/v1/resources",
  monitorToken: process.env.MONITOR_AGENT_TOKEN,
  projectIds: ["css", "media"],
}];

function validTargets(value: unknown): value is ServerTarget[] {
  return Array.isArray(value) && value.every((item) => item && typeof item.id === "string" && typeof item.name === "string" && Array.isArray(item.projectIds));
}

export async function serverTargets(): Promise<ServerTarget[]> {
  try {
    const stored = JSON.parse(await readFile(inventoryFile, "utf8"));
    if (validTargets(stored)) return stored;
  } catch { /* initialize from environment/defaults */ }
  if (process.env.SERVER_INVENTORY_JSON) {
    try {
      const configured = JSON.parse(process.env.SERVER_INVENTORY_JSON);
      if (validTargets(configured)) return configured;
    } catch { /* use defaults */ }
  }
  return defaultTargets;
}

export async function saveServerTargets(targets: ServerTarget[]) {
  await mkdir(dirname(inventoryFile), { recursive: true });
  await writeFile(inventoryFile, `${JSON.stringify(targets, null, 2)}\n`, { mode: 0o600 });
}

export function publicTarget(target: ServerTarget) {
  const { monitorToken: _secret, ...safe } = target;
  void _secret;
  return safe;
}

export function assessCapacity(snapshot: ResourceSnapshot | null, request: CapacityRequest) {
  if (!snapshot) return { eligible: false, level: "unknown", reason: "监控代理未接入，无法安全下发" };
  const freeCpu = snapshot.cpuTotal * (1 - snapshot.cpuUsedPercent / 100);
  const freeMemoryMb = snapshot.memoryTotalMb - snapshot.memoryUsedMb;
  const freeDiskGb = snapshot.diskTotalGb - snapshot.diskUsedGb;
  const eligible = freeCpu >= request.cpu * 1.2 && freeMemoryMb >= request.memoryMb * 1.2 && freeDiskGb >= request.diskGb + 5;
  return { eligible, level: eligible ? "ready" : "insufficient", reason: eligible ? "满足资源需求并保留 20% CPU/内存与 5GB 磁盘余量" : "可用资源不足或低于安全预留" };
}

export async function monitorTarget(target: ServerTarget) {
  if (!target.monitorUrl) return { status: "unconfigured", snapshot: null as ResourceSnapshot | null, error: "未配置监控代理" };
  try {
    const token = target.monitorToken ?? process.env.MONITOR_AGENT_TOKEN;
    const response = await fetch(target.monitorUrl, { headers: token ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { status: "online", snapshot: await response.json() as ResourceSnapshot, error: undefined };
  } catch (cause) {
    return { status: "offline", snapshot: null as ResourceSnapshot | null, error: cause instanceof Error ? cause.message : "连接失败" };
  }
}

export function projectUsage(snapshot: ResourceSnapshot | null) {
  const aliases: Record<string, string> = { "media-platform": "media", "css-deploy-center": "deploy-center", "ai-wms": "ai-wms", "ai-ops": "ai-ops", css: "css" };
  const grouped = new Map<string, { projectId: string; containerCount: number; cpuUsedPercent: number; memoryUsedMb: number; memoryLimitMb: number; containers: string[] }>();
  for (const container of snapshot?.containers ?? []) {
    const projectId = aliases[container.composeProject] ?? container.composeProject ?? "other";
    const current = grouped.get(projectId) ?? { projectId, containerCount: 0, cpuUsedPercent: 0, memoryUsedMb: 0, memoryLimitMb: 0, containers: [] };
    current.containerCount += 1;
    current.cpuUsedPercent += container.cpuUsedPercent;
    current.memoryUsedMb += container.memoryUsedMb;
    current.memoryLimitMb += container.memoryLimitMb;
    current.containers.push(container.name);
    grouped.set(projectId, current);
  }
  return [...grouped.values()].map((item) => ({ ...item, cpuUsedPercent: Math.round(item.cpuUsedPercent * 10) / 10, memoryUsedMb: Math.round(item.memoryUsedMb), memoryLimitMb: Math.round(item.memoryLimitMb) }));
}
