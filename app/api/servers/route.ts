import { NextRequest, NextResponse } from "next/server";
import { publicTarget, saveServerTargets, serverTargets, type ServerKind } from "../../../lib/infrastructure";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const expected = process.env.CONTROL_CENTER_ADMIN_TOKEN;
  const supplied = request.headers.get("x-admin-token") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return !expected || supplied === expected;
}

function normalize(input: Record<string, unknown>) {
  const id = String(input.id ?? "").trim().toLowerCase();
  const kind = String(input.kind ?? "cloud") as ServerKind;
  const monitorUrl = String(input.monitorUrl ?? "").trim();
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id)) throw new Error("服务器 ID 只能包含小写字母、数字和连字符");
  if (!String(input.name ?? "").trim() || !String(input.address ?? "").trim()) throw new Error("名称和服务器地址不能为空");
  if (!(["cloud", "autodl", "bare-metal"] as string[]).includes(kind)) throw new Error("服务器类型无效");
  if (monitorUrl && !/^https?:\/\//.test(monitorUrl)) throw new Error("监控地址必须使用 HTTP 或 HTTPS");
  return { id, name: String(input.name).trim(), provider: String(input.provider ?? "其他").trim(), kind, region: String(input.region ?? "未设置").trim(), address: String(input.address).trim(), monitorUrl: monitorUrl || undefined, monitorToken: String(input.monitorToken ?? "").trim() || undefined, projectIds: Array.isArray(input.projectIds) ? input.projectIds.map(String) : [] };
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ message: "管理员令牌无效" }, { status: 401 });
  try {
    const input = await request.json();
    const target = normalize(input);
    const targets = await serverTargets();
    if (targets.some((item) => item.id === target.id)) return NextResponse.json({ message: "服务器 ID 已存在" }, { status: 409 });
    await saveServerTargets([...targets, target]);
    return NextResponse.json({ message: `${target.name} 已加入服务器资产`, server: publicTarget(target) }, { status: 201 });
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "保存失败" }, { status: 400 });
  }
}
