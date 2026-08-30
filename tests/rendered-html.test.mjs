import assert from "node:assert/strict";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function worker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };

test("server-renders the CI/CD control center", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), env, ctx);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /ForgeOps/);
  assert.match(html, /CI\/CD 发布控制中心/);
  assert.match(html, /CI\/CD 发布控制中心/);
  assert.match(html, /发布最新版本/);
  assert.match(html, /流水线列表/);
  assert.match(html, /新建发布流水线/);
  assert.match(html, /回滚上一版本/);
  assert.match(html, /访问项目/);
  assert.match(html, /操作手册/);
  assert.match(html, /序章自媒体中台/);
  assert.match(html, /项目管理/);
  assert.match(html, /Otel 可观测平台/);
  assert.match(html, /href="\/resources"/);
  assert.doesNotMatch(html, /资源接入与一键部署/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("server-renders resource onboarding as a dedicated page", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("http://localhost/resources", { headers: { accept: "text/html" } }), env, ctx);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /服务器接入、编辑与项目部署/);
  assert.match(html, /保存并接入服务器/);
  assert.match(html, /后台接入操作与取值来源/);
  assert.match(html, /GitHub 仓库地址/);
  assert.match(html, /一键建立流水线并发布/);
  assert.match(html, /公网 IP \/ 主机名/);
  assert.match(html, /返回项目看板/);
});

test("server-renders the IP and credential change manual", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("http://localhost/docs/server-change-guide", { headers: { accept: "text/html" } }), env, ctx);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /服务器 IP 与认证变更手册/);
  assert.match(html, /DEPLOY_HOST_KEY/);
  assert.match(html, /GitHub 仓库属于项目/);
});

test("control-center API returns a usable demo dashboard", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("http://localhost/api/control-center"), env, ctx);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, "demo");
  assert.equal(body.project.repository, "qiubo-master/Media");
  assert.equal(body.projects.length, 7);
  assert.ok(body.projects.some((project) => project.repository === "qiubo-master/AI_WMS"));
  assert.ok(body.projects.some((project) => project.repository === "qiubo-master/AI_OPS"));
  assert.ok(body.projects.some((project) => project.repository === "qiubo-master/GFM"));
  const otel = body.projects.find((project) => project.repository === "qiubo-master/Otel");
  assert.equal(otel.branch, "main");
  assert.match(otel.manualUrl, /docs\/OPERATIONS\.md$/);
  assert.ok(Array.isArray(body.servers));
  assert.equal(body.servers[0].capacity.eligible, false);
  assert.equal(body.resourceProfiles.length, 3);
  assert.ok(Array.isArray(body.pipelines));
  assert.ok(body.version);
  assert.ok(Array.isArray(body.latestSteps));
  assert.ok(body.pipeline.stages.length >= 6);
  assert.ok(body.releases.length >= 1);
});

test("demo deployment and rollback actions are accepted", async () => {
  const app = await worker();
  for (const action of ["release", "deploy", "rollback"]) {
    const response = await app.fetch(new Request("http://localhost/api/control-center", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, projectId: "media", branch: "main", resourceProfile: "standard", hostPort: 8080 }),
    }), env, ctx);
    assert.equal(response.status, 200);
    assert.match((await response.json()).message, /演示模式/);
  }
});

test("metadata and deployment assets are present", async () => {
  const { readFile, access } = await import("node:fs/promises");
  const [layout, workflow, dockerfile, envExample] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /ForgeOps/);
  assert.match(workflow, /Deploy Control Center/);
  assert.match(dockerfile, /node:22-alpine/);
  assert.match(envExample, /GITHUB_TOKEN/);
  const manual = await readFile(new URL("../docs/操作手册.md", import.meta.url), "utf8");
  assert.match(manual, /接入云服务器/);
  assert.match(manual, /一键资源下发与首次发布/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  assert.ok(root);
});
