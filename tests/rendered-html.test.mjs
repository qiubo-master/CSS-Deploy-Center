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
  assert.match(html, /生产发布控制台/);
  assert.match(html, /部署新版本/);
  assert.match(html, /回滚上一版本/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("control-center API returns a usable demo dashboard", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("http://localhost/api/control-center"), env, ctx);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, "demo");
  assert.equal(body.project.repository, "qiubo-master/CSS");
  assert.ok(body.pipeline.stages.length >= 6);
  assert.ok(body.releases.length >= 3);
});

test("demo deployment and rollback actions are accepted", async () => {
  const app = await worker();
  for (const action of ["deploy", "rollback"]) {
    const response = await app.fetch(new Request("http://localhost/api/control-center", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, branch: "main" }),
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
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  assert.ok(root);
});
