import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";

process.env.MONGODB_URI = "mongodb://127.0.0.1:1/bussologic_invites_test"; // force in-memory store
process.env.FRONTEND_BASE_URL = "https://app.bussologic.test";
process.env.INVITE_TTL_HOURS = "48";

let server, base, setMailTransport, resetAllLimits, DEMO_EMPLOYEES, sha256;
const sent = [];

const call = async (method, path, body, cookie) => {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})), res };
};
const login = async (email, password = "Welcome123!") => {
  const r = await call("POST", "/api/auth/login", { email, password });
  return { ...r, cookie: (r.res.headers.get("set-cookie") || "").split(";")[0] };
};
const tokenFromMail = mail => /#token=([a-f0-9]{64})/.exec(mail.text)[1];
const newEmp = (over = {}) => ({
  name: "Priya Rao", email: "Priya.Rao@Gmail.com", department: "Support",
  roleTitle: "Agent", skills: "support", ...over,
});

let manager, employee, inviteToken;
beforeAll(async () => {
  ({ setMailTransport } = await import("../_core/mailer.js"));
  ({ resetAllLimits } = await import("../core/rateLimit.js"));
  ({ DEMO_EMPLOYEES } = await import("../core/demoData.js"));
  ({ sha256 } = await import("../core/passwords.js"));
  setMailTransport({ sendMail: async m => { sent.push(m); } });
  const { createApp } = await import("../app.js");
  server = createServer(createApp());
  await new Promise(r => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  manager = await login("maya@acme.test");
  employee = await login("noah@acme.test");
});
afterAll(() => server.close());
beforeEach(() => { resetAllLimits(); sent.length = 0; });

describe("invitation flow", () => {
  it("requires authentication and a manager role", async () => {
    expect((await call("POST", "/api/employees", newEmp())).status).toBe(401);
    expect((await call("POST", "/api/employees", newEmp(), employee.cookie)).status).toBe(403);
    expect((await call("POST", "/api/employees/2/resend-invite", {}, employee.cookie)).status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  it("creates a pending account, emails the exact address, stores only a token hash", async () => {
    const r = await call("POST", "/api/employees", newEmp(), manager.cookie);
    expect(r.status).toBe(201);
    expect(r.data).toMatchObject({ status: "pending", emailSent: true, email: "priya.rao@gmail.com" });
    expect(r.data.inviteTokenHash).toBeUndefined();
    expect(sent).toHaveLength(1);
    const mail = sent[0];
    expect(mail.to).toBe("priya.rao@gmail.com");
    expect(mail.text).toContain("BUSSOLOGIC");
    expect(mail.text).toContain("https://app.bussologic.test/activate#token=");
    expect(mail.text).toMatch(/valid for 48 hours/);
    const token = tokenFromMail(mail);
    const stored = DEMO_EMPLOYEES.find(e => e.email === "priya.rao@gmail.com");
    expect(stored.inviteTokenHash).toBe(sha256(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored.passwordHash).toBeUndefined();
  });

  it("rejects duplicate emails (case-insensitive) without sending mail", async () => {
    const r = await call("POST", "/api/employees", newEmp({ email: "PRIYA.RAO@gmail.com" }), manager.cookie);
    expect(r.status).toBe(409);
    expect((await call("POST", "/api/employees", newEmp({ email: "noah@acme.test" }), manager.cookie)).status).toBe(409);
    expect(sent).toHaveLength(0);
  });

  it("pending accounts cannot sign in, even via forgot-password", async () => {
    expect((await login("priya.rao@gmail.com", "Welcome123!")).status).toBe(401);
    const f = await call("POST", "/api/auth/forgot-password", { email: "priya.rao@gmail.com" });
    expect(f.status).toBe(200);
    expect(f.data.resetToken).toBeDefined(); // existing non-production demo behaviour (see notes)
    const reset = await call("POST", "/api/auth/reset-password", { token: f.data.resetToken, password: "Another1234!" });
    expect(reset.status).toBe(400);
  });

  it("only managers may resend; resend invalidates the previous token", async () => {
    const id = DEMO_EMPLOYEES.find(e => e.email === "priya.rao@gmail.com").id;
    const oldHash = DEMO_EMPLOYEES.find(e => e.id === id).inviteTokenHash;
    const r = await call("POST", `/api/employees/${id}/resend-invite`, {}, manager.cookie);
    expect(r.status).toBe(200);
    expect(sent).toHaveLength(1);
    const fresh = tokenFromMail(sent[0]);
    expect(sha256(fresh)).not.toBe(oldHash);
    inviteToken = fresh;
    expect((await call("POST", "/api/auth/activation/check", { token: fresh })).status).toBe(200);
  });

  it("rejects bad passwords, mismatches, and unknown/malformed tokens with a generic error", async () => {
    const t = inviteToken;
    expect((await call("POST", "/api/auth/activate", { token: t, password: "short1", confirmPassword: "short1" })).status).toBe(400);
    expect((await call("POST", "/api/auth/activate", { token: t, password: "LongEnough123", confirmPassword: "Different123" })).status).toBe(400);
    const bad = await call("POST", "/api/auth/activate", { token: "a".repeat(64), password: "LongEnough123", confirmPassword: "LongEnough123" });
    expect(bad.status).toBe(400);
    expect(bad.data.error).toMatch(/invalid, expired, or already used/);
    expect((await call("POST", "/api/auth/activation/check", { token: "nope" })).status).toBe(400);
  });

  it("activates once: hashes the password, burns the token, allows login to Employee Portal only", async () => {
    const t = inviteToken;
    const ok = await call("POST", "/api/auth/activate", { token: t, password: "MySecret12345", confirmPassword: "MySecret12345" });
    expect(ok.status).toBe(200);
    const stored = DEMO_EMPLOYEES.find(e => e.email === "priya.rao@gmail.com");
    expect(stored.status).toBe("active");
    expect(stored.passwordHash).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
    expect(JSON.stringify(stored)).not.toContain("MySecret12345");
    expect(stored.inviteTokenHash).toBeNull();
    // reuse fails, also in parallel-safe sense
    const again = await call("POST", "/api/auth/activate", { token: t, password: "Other12345678", confirmPassword: "Other12345678" });
    expect(again.status).toBe(400);
    expect((await call("POST", "/api/auth/activation/check", { token: t })).status).toBe(400);
    // login
    expect((await login("priya.rao@gmail.com", "Welcome123!")).status).toBe(401);
    const me = await login("priya.rao@gmail.com", "MySecret12345");
    expect(me.status).toBe(200);
    expect(me.data.employee.role).toBe("employee");
    expect((await call("GET", "/api/me/dashboard", null, me.cookie)).status).toBe(200);
    expect((await call("GET", "/api/people", null, me.cookie)).status).toBe(403);
    expect((await call("GET", "/api/manager/overview", null, me.cookie)).status).toBe(403);
    expect((await call("POST", "/api/employees", newEmp({ email: "x@y.com" }), me.cookie)).status).toBe(403);
    // resend is refused for activated accounts
    expect((await call("POST", `/api/employees/${stored.id}/resend-invite`, {}, manager.cookie)).status).toBe(409);
  });

  it("rejects expired tokens", async () => {
    await call("POST", "/api/employees", newEmp({ name: "Late Joiner", email: "late@gmail.com" }), manager.cookie);
    const token = tokenFromMail(sent[0]);
    DEMO_EMPLOYEES.find(e => e.email === "late@gmail.com").inviteExpiresAt = new Date(Date.now() - 1000).toISOString();
    expect((await call("POST", "/api/auth/activation/check", { token })).status).toBe(400);
    expect((await call("POST", "/api/auth/activate", { token, password: "MySecret12345", confirmPassword: "MySecret12345" })).status).toBe(400);
    expect(DEMO_EMPLOYEES.find(e => e.email === "late@gmail.com").status).toBe("pending");
    // resend revives it
    const id = DEMO_EMPLOYEES.find(e => e.email === "late@gmail.com").id;
    expect((await call("POST", `/api/employees/${id}/resend-invite`, {}, manager.cookie)).status).toBe(200);
  });

  it("managers cannot invite managers; email failure keeps a resendable pending account", async () => {
    expect((await call("POST", "/api/employees", newEmp({ email: "m@gmail.com", role: "manager" }), manager.cookie)).status).toBe(403);
    expect((await call("POST", "/api/employees", newEmp({ email: "z@gmail.com", role: "admin" }), manager.cookie)).status).toBe(400);
    setMailTransport({ sendMail: async () => { throw Object.assign(new Error("secret smtp detail"), { code: "EAUTH" }); } });
    const r = await call("POST", "/api/employees", newEmp({ name: "No Mail", email: "nomail@gmail.com" }), manager.cookie);
    expect(r.status).toBe(201);
    expect(r.data.emailSent).toBe(false);
    expect(JSON.stringify(r.data)).not.toContain("secret smtp detail");
    expect(r.data.status).toBe("pending");
    setMailTransport({ sendMail: async m => { sent.push(m); } });
  });

  it("rate-limits activation guesses and repeated failed logins", async () => {
    let last;
    for (let i = 0; i < 22; i++) last = await call("POST", "/api/auth/activate", { token: "b".repeat(64), password: "LongEnough123", confirmPassword: "LongEnough123" });
    expect(last.status).toBe(429);
    resetAllLimits();
    for (let i = 0; i < 10; i++) await login("noah@acme.test", "wrong-password");
    expect((await login("noah@acme.test", "Welcome123!")).status).toBe(429);
  });
});

