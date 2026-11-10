import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";

process.env.MONGODB_URI = "mongodb://127.0.0.1:1/bussologic_portal_test"; // force in-memory fallback

let server, base;
const jars = {};
const call = async (who, method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(jars[who] ? { Cookie: jars[who] } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})), res };
};
const login = async (who, email) => {
  const r = await call(who, "POST", "/api/auth/login", { email, password: "Welcome123!" });
  expect(r.status).toBe(200);
  expect(r.data.token).toBeUndefined(); // session token must stay in the httpOnly cookie
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

describe("role enforcement on the backend", () => {
  it("blocks employees from manager data and tools", async () => {
    for (const p of ["/api/dashboard", "/api/people", "/api/manager/overview", "/api/manager/proposals", "/api/outcomes", "/api/workflows"])
      expect((await call("emp", "GET", p)).status).toBe(403);
    expect((await call("emp", "POST", "/api/manager/projects", { name: "x", stages: [{ name: "a" }] })).status).toBe(403);
    expect((await call("emp", "POST", "/api/manager/simulations/apply", { confirm: true })).status).toBe(403);
  });
  it("scopes /tasks to the employee's own assignments", async () => {
    const { data } = await call("emp", "GET", "/api/tasks");
    expect(data.tasks.every(t => t.assignee === "Noah Williams")).toBe(true);
  });
});

describe("workflow -> AI proposal -> approval -> employee update -> manager view", () => {
  let project, proposal, task;
  it("manager creates a workflow with required skills", async () => {
    const r = await call("mgr", "POST", "/api/manager/projects", {
      name: "Portal flow test",
      stages: [{ name: "Intake", estimatedHours: 4, requiredSkills: [{ skill: "onboarding", minLevel: 2 }] },
               { name: "Review", estimatedHours: 4, requiredSkills: [{ skill: "onboarding", minLevel: 2 }] }],
    });
    expect(r.status).toBe(200);
    project = r.data.project;
    expect(r.data.tasks[1].dependsOn).toEqual([r.data.tasks[0].id]);
  });
  it("AI proposes with reasoning but assigns nothing until approval", async () => {
    const r = await call("mgr", "POST", "/api/manager/proposals/generate", { projectId: project.id });
    proposal = r.data.proposals.find(p => p.recommendedEmployeeId);
    expect(proposal.reasoning.length).toBeGreaterThan(1);
    const tasks = (await call("mgr", "GET", "/api/tasks")).data.tasks;
    task = tasks.find(t => t.id === proposal.taskId);
    expect(task.assignee).toBe("Unassigned");
  });
  it("approval assigns; employee sees it only then", async () => {
    const approve = await call("mgr", "POST", `/api/manager/proposals/${proposal.id}/approve`, { employeeId: 2 });
    expect(approve.status).toBe(200);
    expect((await call("mgr", "POST", `/api/manager/proposals/${proposal.id}/approve`, {})).status).toBe(409);
    const mine = (await call("emp", "GET", "/api/me/tasks")).data.tasks;
    expect(mine.some(t => t.id === task.id)).toBe(true);
  });
  it("employee updates need a note when done, and managers see the update", async () => {
    expect((await call("emp", "POST", `/api/me/tasks/${task.id}/update`, { status: "done" })).status).toBe(400);
    const ok = await call("emp", "POST", `/api/me/tasks/${task.id}/update`, { status: "in_progress", progress: 40, hoursLogged: 2 });
    expect(ok.status).toBe(200);
    const day = (await call("mgr", "GET", "/api/manager/daily-progress")).data;
    expect(day.people.find(p => p.employeeId === 2).hoursLogged).toBeGreaterThanOrEqual(2);
  });
  it("employees cannot update tasks they do not own", async () => {
    const other = (await call("mgr", "GET", "/api/tasks")).data.tasks.find(t => t.assignee !== "Noah Williams");
    expect((await call("emp", "POST", `/api/me/tasks/${other.id}/update`, { status: "in_progress" })).status).toBe(403);
  });
  it("simulation apply refuses to change live data without confirm", async () => {
    const r = await call("mgr", "POST", "/api/manager/simulations/apply", { interventionType: "extend_deadline", taskId: task.id });
    expect(r.status).toBe(400);
  });
});
