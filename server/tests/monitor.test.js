import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";

process.env.MONGODB_URI = "mongodb://127.0.0.1:1/bussologic_monitor_test"; // in-memory fallback

let server, base;
const jars = {};
const call = async (who, method, path, body) => {
  const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(jars[who] ? { Cookie: jars[who] } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})), res };
};
const login = async (who, email) => {
  const r = await call(who, "POST", "/api/auth/login", { email, password: "Welcome123!" });
  jars[who] = r.res.headers.get("set-cookie").split(";")[0];
};

beforeAll(async () => {
  const { createApp } = await import("../app.js");
  const { backfillAssigneeIds } = await import("../routes/portal.js");
  await backfillAssigneeIds();
  server = createServer(createApp());
  await new Promise(r => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  await login("mgr", "maya@acme.test");
  await login("emp", "noah@acme.test");
});
afterAll(() => server.close());

describe("live monitor reflects employee updates", () => {
  it("is manager-only", async () => {
    expect((await call("emp", "GET", "/api/manager/live")).status).toBe(403);
    expect((await call("emp", "POST", "/api/manager/resume/parse", { text: "x".repeat(40) })).status).toBe(403);
  });
  it("shows an employee's progress/blocker and answers 'unchanged' to a current revision", async () => {
    const mine = (await call("emp", "GET", "/api/me/tasks")).data.tasks.find(t => t.status !== "done");
    const upd = await call("emp", "POST", `/api/me/tasks/${mine.id}/update`, { status: "blocked", progress: 40, blocker: "Waiting on API keys", note: "half way" });
    expect(upd.status).toBe(200);
    const live = (await call("mgr", "GET", "/api/manager/live")).data;
    const t = live.people.flatMap(p => p.tasks).find(x => x.id === mine.id);
    expect(t).toMatchObject({ status: "blocked", progress: 40, blocker: "Waiting on API keys", lastNote: "half way" });
    expect((await call("mgr", "GET", `/api/manager/live?rev=${encodeURIComponent(live.rev)}`)).data.unchanged).toBe(true);
  });
  it("parses a pasted resume without storing it", async () => {
    const r = await call("mgr", "POST", "/api/manager/resume/parse", { text: "Asha Rao\nData Analyst\nasha@example.com\n4 years. Skills: SQL, Python, Tableau" });
    expect(r.status).toBe(200);
    expect(r.data.draft.email).toBe("asha@example.com");
    expect(r.data.draft.skills.length).toBeGreaterThan(0);
  });
  it("only managers may create projects", async () => {
    expect((await call("emp", "POST", "/api/projects", { name: "Nope" })).status).toBe(403);
  });
});
