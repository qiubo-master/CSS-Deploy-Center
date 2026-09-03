import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";

export type ServerKind = "cloud" | "autodl" | "bare-metal";

export type ServerTarget = {
  id: string;
  name: string;
  provider: string;
  kind: ServerKind;
  region: string;
  address: string;
  sshPort?: number;
  sshUser?: string;
  authType?: "key" | "password";
  hostKey?: string;
  deploymentBasePath?: string;
  credentialConfigured?: boolean;
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
const credentialsFile = join(process.env.CONTROL_CENTER_DATA_DIR ?? "/app/data", "server-credentials.json");
const defaultTargets: ServerTarget[] = [{
  id: "aliyun-main",
  name: "新生产服务器",
  provider: "阿里云",
  kind: "cloud",
  region: process.env.ALIYUN_REGION ?? "Tailscale 私网",
  address: process.env.PRIMARY_SERVER_ADDRESS ?? "100.103.132.88",
  monitorUrl: process.env.ALIYUN_MONITOR_URL ?? "http://host.docker.internal:9108/v1/resources",
  monitorToken: process.env.MONITOR_AGENT_TOKEN,
  projectIds: ["css", "media", "otel", "deploy-center"],
}];

function withBuiltInBindings(targets: ServerTarget[]) {
  const retired = (target: ServerTarget) => target.name.replace(/[\s_-]/g, "").toLowerCase() === "autodlgpu01";
  const storedMain = targets.find((target) => target.id === "aliyun-main");
  const main = {
    ...storedMain,
    ...defaultTargets[0],
    projectIds: [...new Set([...(storedMain?.projectIds ?? defaultTargets[0].projectIds), "otel", "deploy-center"])]
      .filter((id) => id !== "ai-wms" && id !== "ai-ops"),
  };
  return [main, ...targets.filter((target) => target.id !== "aliyun-main" && !retired(target)).map((target) => ({
    ...target,
    projectIds: target.projectIds.filter((id) => id !== "ai-wms" && id !== "ai-ops"),
  }))];
}

function validTargets(value: unknown): value is ServerTarget[] {
  return Array.isArray(value) && value.every((item) => item && typeof item.id === "string" && typeof item.name === "string" && Array.isArray(item.projectIds));
}

export async function serverTargets(): Promise<ServerTarget[]> {
  try {
    const stored = JSON.parse(await readFile(inventoryFile, "utf8"));
    if (validTargets(stored)) return withBuiltInBindings(stored);
  } catch { /* initialize from environment/defaults */ }
  if (process.env.SERVER_INVENTORY_JSON) {
    try {
      const configured = JSON.parse(process.env.SERVER_INVENTORY_JSON);
      if (validTargets(configured)) return withBuiltInBindings(configured);
    } catch { /* use defaults */ }
  }
  return withBuiltInBindings(defaultTargets);
}

export async function saveServerTargets(targets: ServerTarget[]) {
  await mkdir(dirname(inventoryFile), { recursive: true });
  await writeFile(inventoryFile, `${JSON.stringify(targets, null, 2)}\n`, { mode: 0o600 });
}

type ServerCredential = { password?: string; privateKey?: string };
type EncryptedCredential = { iv: string; tag: string; data: string };

function encryptionKey() {
  const configured = process.env.SERVER_CREDENTIAL_KEY;
  if (!configured) throw new Error("控制中心未配置 SERVER_CREDENTIAL_KEY，暂不能保存服务器密码或私钥");
  return createHash("sha256").update(configured).digest();
}

async function credentialStore() {
  try { return JSON.parse(await readFile(credentialsFile, "utf8")) as Record<string, EncryptedCredential>; }
  catch { return {} as Record<string, EncryptedCredential>; }
}

export async function saveServerCredential(id: string, credential: ServerCredential) {
  if (!credential.password && !credential.privateKey) return false;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credential), "utf8"), cipher.final()]);
  const store = await credentialStore();
  store[id] = { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") };
  await mkdir(dirname(credentialsFile), { recursive: true });
  await writeFile(credentialsFile, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  return true;
}

export async function readServerCredential(id: string) {
  const item = (await credentialStore())[id];
  if (!item) return null;
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(item.iv, "base64"));
  decipher.setAuthTag(Buffer.from(item.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(item.data, "base64")), decipher.final()]).toString("utf8")) as ServerCredential;
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
