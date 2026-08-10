export type ServerKind = "cloud" | "autodl" | "bare-metal";

export type ServerTarget = {
  id: string;
  name: string;
  provider: string;
  kind: ServerKind;
  region: string;
  address: string;
  monitorUrl?: string;
  projectIds: string[];
};

export type ResourceSnapshot = {
  cpuTotal: number;
  cpuUsedPercent: number;
  memoryTotalMb: number;
  memoryUsedMb: number;
  diskTotalGb: number;
  diskUsedGb: number;
  gpu?: { name: string; memoryTotalMb: number; memoryUsedMb: number; utilizationPercent: number }[];
  collectedAt: string;
};

export type CapacityRequest = { cpu: number; memoryMb: number; diskGb: number };

const defaultTargets: ServerTarget[] = [
  {
    id: "aliyun-main",
    name: "阿里云生产服务器",
    provider: "阿里云",
    kind: "cloud",
    region: process.env.ALIYUN_REGION ?? "华东",
    address: process.env.DEPLOY_HOST ?? "47.120.76.166",
    monitorUrl: process.env.ALIYUN_MONITOR_URL,
    projectIds: ["css", "media"],
  },
];

export function serverTargets(): ServerTarget[] {
  if (!process.env.SERVER_INVENTORY_JSON) return defaultTargets;
  try {
    const parsed = JSON.parse(process.env.SERVER_INVENTORY_JSON);
    return Array.isArray(parsed) ? parsed : defaultTargets;
  } catch {
    return defaultTargets;
  }
}

export function assessCapacity(snapshot: ResourceSnapshot | null, request: CapacityRequest) {
  if (!snapshot) return { eligible: false, level: "unknown", reason: "监控代理未接入，无法安全下发" };
  const freeCpu = snapshot.cpuTotal * (1 - snapshot.cpuUsedPercent / 100);
  const freeMemoryMb = snapshot.memoryTotalMb - snapshot.memoryUsedMb;
  const freeDiskGb = snapshot.diskTotalGb - snapshot.diskUsedGb;
  const eligible = freeCpu >= request.cpu * 1.2 && freeMemoryMb >= request.memoryMb * 1.2 && freeDiskGb >= request.diskGb + 5;
  return {
    eligible,
    level: eligible ? "ready" : "insufficient",
    reason: eligible ? "满足资源需求并保留 20% CPU/内存与 5GB 磁盘余量" : "可用资源不足或低于安全预留",
  };
}

export async function monitorTarget(target: ServerTarget) {
  if (!target.monitorUrl) return { status: "unconfigured", snapshot: null as ResourceSnapshot | null, error: "未配置监控代理" };
  try {
    const response = await fetch(target.monitorUrl, {
      headers: process.env.MONITOR_AGENT_TOKEN ? { authorization: `Bearer ${process.env.MONITOR_AGENT_TOKEN}` } : {},
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { status: "online", snapshot: await response.json() as ResourceSnapshot, error: undefined };
  } catch (cause) {
    return { status: "offline", snapshot: null as ResourceSnapshot | null, error: cause instanceof Error ? cause.message : "连接失败" };
  }
}
