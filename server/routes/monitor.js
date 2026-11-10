// Manager-only live monitoring + resume parsing. Reads the shared MongoDB, so progress written by the separate
// Employee Portal process appears here without any in-process coupling (clients poll with a revision token).
import { Router } from "express";
import { z } from "zod";
import { invokeLLM } from "../_core/llm.js";
import { ENV } from "../_core/env.js";
import { requireEmployee, requireManager } from "../core/auth.js";
import { recordAudit, getDb } from "../core/database.js";
import { asyncHandler, parseBody } from "../core/http.js";
import { find } from "../core/store.js";
import { ownsTask } from "../intelligence/allocation.js";
import { extractText, parseResumeRules, refineWithLLM, suggestProjects } from "../intelligence/resume.js";

export const monitorRouter = Router();
monitorRouter.use("/manager", requireEmployee, requireManager);

const PRESENCE_MS = Number(process.env.PRESENCE_WINDOW_MS) || 5 * 60_000;
const HOUR = 3_600_000;
const round1 = n => Math.round(n * 10) / 10;
const pctOf = t => (t.status === "done" ? 100 : Number(t.progress) || 0);

async function presence(now) {
  const db = await getDb();
  if (!db) return new Map();
  const rows = await db.collection("sessions")
    .find({ expiresAt: { $gt: new Date(now) } }, { projection: { _id: 0, employeeId: 1, lastSeenAt: 1, createdAt: 1 } }).toArray();
  const seen = new Map();
  for (const s of rows) {
    const t = +new Date(s.lastSeenAt || s.createdAt);
    if (Number.isFinite(t)) seen.set(s.employeeId, Math.max(seen.get(s.employeeId) ?? 0, t));
  }
  return seen;
}

monitorRouter.get(
  "/manager/live",
  asyncHandler(async (req, res) => {
    const now = Date.now();
    const [tasks, projects, employees, updates, schedules, seen] = await Promise.all([
      find("tasks"), find("projects"), find("employees"), find("task_updates"), find("schedules"), presence(now),
    ]);
    const online = id => now - (seen.get(id) ?? 0) <= PRESENCE_MS;
    const latest = [...tasks, ...projects].reduce((m, d) => (d.updatedAt > m ? d.updatedAt : m), "");
    const rev = [latest, tasks.length, updates.length, schedules.length, employees.filter(e => online(e.id)).length].join("|");
    if (req.query.rev === rev) return res.json({ unchanged: true, rev });

    const pname = new Map(projects.map(p => [p.id, p.name]));
    const staff = employees.filter(e => e.role !== "admin");
    const people = staff.map(e => {
      const mine = tasks.filter(t => ownsTask(e, t));
      const open = mine.filter(t => t.status !== "done");
      return {
        id: e.id, name: e.name, roleTitle: e.roleTitle, status: e.status ?? "active",
        online: online(e.id), lastSeenAt: seen.has(e.id) ? new Date(seen.get(e.id)).toISOString() : null,
        taskCount: mine.length, completionPct: mine.length ? Math.round(mine.reduce((s, t) => s + pctOf(t), 0) / mine.length) : null,
        blocked: open.filter(t => t.status === "blocked").length,
        overdue: open.filter(t => t.dueAt && +new Date(t.dueAt) < now).length,
        tasks: open.map(t => ({
          id: t.id, title: t.title, projectId: t.projectId, project: pname.get(t.projectId) ?? "",
          status: t.status, progress: pctOf(t), blocker: t.blocker ?? null, dueAt: t.dueAt ?? null,
          overdue: Boolean(t.dueAt && +new Date(t.dueAt) < now), lastNote: t.lastNote ?? null, updatedAt: t.updatedAt ?? null,
        })),
      };
    });

    const projectRows = projects.map(p => {
      const pt = tasks.filter(t => t.projectId === p.id);
      const blocks = schedules.filter(s => s.projectId === p.id).map(s => {
        const start = +new Date(`${s.date}T${s.startTime}`), end = +new Date(`${s.date}T${s.endTime}`);
        const total = Math.max(0, (end - start) / HOUR);
        return { id: s.id, employeeId: s.employeeId, date: s.date, startTime: s.startTime, endTime: s.endTime, type: s.type,
          total, elapsed: Math.min(total, Math.max(0, (now - start) / HOUR)) };
      });
      const total = blocks.reduce((s, b) => s + b.total, 0), elapsed = blocks.reduce((s, b) => s + b.elapsed, 0);
      const progress = pt.length ? Math.round(pt.reduce((s, t) => s + pctOf(t), 0) / pt.length) : p.progress ?? 0;
      const schedulePct = total ? Math.round((elapsed / total) * 100) : null;
      return {
        id: p.id, name: p.name, status: p.status, dueAt: p.dueAt, progress,
        open: pt.filter(t => t.status !== "done").length, blocked: pt.filter(t => t.status === "blocked").length,
        overdue: pt.filter(t => t.status !== "done" && t.dueAt && +new Date(t.dueAt) < now).length,
        schedule: { blocks: blocks.length, scheduledHours: round1(total), elapsedHours: round1(elapsed), schedulePct,
          // behind = tasks completed notably less than the share of scheduled time already elapsed
          behind: schedulePct != null && progress + 10 < schedulePct },
        loggedHours: round1(updates.filter(u => u.projectId === p.id).reduce((s, u) => s + (u.hoursLogged || 0), 0)),
      };
    });

    res.json({
      rev, generatedAt: new Date(now).toISOString(), onlineCount: people.filter(p => p.online).length,
      people, projects: projectRows,
      updates: updates.slice(-30).reverse().map(u => ({ id: u.id, taskId: u.taskId, taskTitle: u.taskTitle, employeeName: u.employeeName,
        status: u.status, prevStatus: u.prevStatus, progress: u.progress, hoursLogged: u.hoursLogged, blocker: u.blocker, note: u.note, at: u.at })),
    });
  })
);

const resumeSchema = z.object({
  filename: z.string().max(200).optional(), data: z.string().max(8_000_000).optional(), text: z.string().max(200_000).optional(),
});

// Parses only. Nothing is stored or sent: the manager reviews the draft and then invites via POST /employees.
monitorRouter.post(
  "/manager/resume/parse",
  asyncHandler(async (req, res) => {
    const body = parseBody(resumeSchema, req.body);
    const text = await extractText(body);
    let draft = parseResumeRules(text);
    draft = await refineWithLLM(draft, text, { invoke: invokeLLM, enabled: Boolean(ENV.forgeApiKey) });
    const [tasks, projects, existing] = await Promise.all([find("tasks"), find("projects"), find("employees")]);
    await recordAudit(req.employee, "parsed_resume", "employee", null, `Parsed a resume (${draft.method}); no data stored`);
    res.json({
      draft: { ...draft, phone: undefined }, // phone is not needed for the invite; avoid passing PII around
      duplicateEmail: Boolean(draft.email && existing.some(e => e.email?.toLowerCase() === draft.email)),
      suggestedProjects: suggestProjects(draft.skills, tasks, projects),
      note: "AI-extracted draft. Review and edit every field; an invitation is sent only when you confirm.",
    });
  })
);
