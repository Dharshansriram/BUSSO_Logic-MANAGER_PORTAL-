// Role-based portal API.
//   /api/me/*       any signed-in employee, always scoped to their own records
//   /api/manager/*  managers/admins only: workflow + skills, AI proposals, daily progress
import { Router } from "express";
import { z } from "zod";
import { requireEmployee, requireManager } from "../core/auth.js";
import { createNotification, createProject, createTask, recordAudit } from "../core/database.js";
import { broadcast } from "../core/events.js";
import { asyncHandler, httpError, parseBody, parseId } from "../core/http.js";
import { find, findOne, insert, patch } from "../core/store.js";
import { isUnassigned, ownsTask, parseSkills, proposeAssignments } from "../intelligence/allocation.js";
import { calculateWorkload } from "../intelligence/workload.js";

export const portalRouter = Router();
const STATUSES = ["todo", "in_progress", "done", "blocked"];
const DAY = 86_400_000;
const nowIso = () => new Date().toISOString();
const norm = v => String(v ?? "").trim().toLowerCase();
const skillInput = z.object({
  skill: z.string().trim().min(1).max(60),
  minLevel: z.coerce.number().int().min(1).max(5).default(3),
  hours: z.coerce.number().min(0).max(1000).optional(),
});

/** One-off, non-destructive: link tasks to employees by id where the name matches exactly one person. */
export async function backfillAssigneeIds() {
  const [tasks, employees] = await Promise.all([find("tasks"), find("employees")]);
  for (const task of tasks) {
    if (task.assigneeId != null || isUnassigned(task)) continue;
    const hits = employees.filter(e => norm(e.name) === norm(task.assignee));
    if (hits.length === 1) await patch("tasks", task.id, { assigneeId: hits[0].id });
  }
}

async function recomputeProjectProgress(projectId) {
  const tasks = await find("tasks", { projectId });
  if (!tasks.length) return;
  const pct = t => (t.status === "done" ? 100 : Number(t.progress) || 0);
  await patch("projects", projectId, {
    progress: Math.round(tasks.reduce((s, t) => s + pct(t), 0) / tasks.length),
  });
}

const dayRange = query => {
  const to = new Date(query.to);
  const from = new Date(query.from);
  if (Number.isNaN(+to) || Number.isNaN(+from) || to <= from) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    return { from: start, to: new Date(+start + DAY) };
  }
  return { from, to };
};

// =============================== EMPLOYEE (/me) ===============================
const myTasks = async employee => (await find("tasks")).filter(t => ownsTask(employee, t));

portalRouter.get(
  "/me/dashboard",
  requireEmployee,
  asyncHandler(async (req, res) => {
    const me = req.employee;
    const [mine, notifications, updates] = await Promise.all([
      myTasks(me),
      find("notifications", { employeeEmail: me.email }),
      find("task_updates", { employeeId: me.id }),
    ]);
    const open = mine.filter(t => t.status !== "done");
    const now = Date.now();
    const plannedHours = open.reduce(
      (s, t) => s + Math.max(0, (Number(t.estimatedHours) || 4) - (Number(t.actualHours) || 0)), 0);
    const capacity = Number(me.capacityHours) || 40;
    res.json({
      capacityHours: capacity,
      plannedHours: Math.round(plannedHours),
      utilization: Math.round((plannedHours / capacity) * 100),
      openTasks: open.length,
      blockedTasks: open.filter(t => t.status === "blocked").length,
      overdue: open.filter(t => t.dueAt && +new Date(t.dueAt) < now).length,
      dueSoon: open.filter(t => t.dueAt && +new Date(t.dueAt) - now < 3 * DAY && +new Date(t.dueAt) >= now).length,
      deadlines: open.filter(t => t.dueAt).sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt)).slice(0, 6),
      notifications: notifications.slice(-10).reverse(),
      recentUpdates: updates.slice(-8).reverse(),
    });
  })
);

portalRouter.get(
  "/me/tasks",
  requireEmployee,
  asyncHandler(async (req, res) => {
    const [all, projects] = await Promise.all([find("tasks"), find("projects")]);
    const byId = new Map(all.map(t => [t.id, t]));
    const tasks = all.filter(t => ownsTask(req.employee, t)).map(t => ({
      ...t,
      projectName: projects.find(p => p.id === t.projectId)?.name ?? "",
      waitingOn: (t.dependsOn ?? []).map(id => byId.get(id)).filter(d => d && d.status !== "done").map(d => d.title),
    }));
    res.json({ tasks });
  })
);

portalRouter.get(
  "/me/projects",
  requireEmployee,
  asyncHandler(async (req, res) => {
    const [mine, projects] = await Promise.all([myTasks(req.employee), find("projects")]);
    const out = projects
      .filter(p => mine.some(t => t.projectId === p.id))
      .map(p => ({
        id: p.id, name: p.name, description: p.description, status: p.status,
        progress: p.progress, dueAt: p.dueAt, ownerName: p.ownerName,
        milestones: p.milestones ?? [],
        myTasks: mine.filter(t => t.projectId === p.id)
          .map(t => ({ id: t.id, title: t.title, status: t.status, progress: t.progress ?? 0, dueAt: t.dueAt })),
      }));
    res.json({ projects: out });
  })
);

// Own schedule blocks + schedules of projects the employee works on + that project's team (no emails/skills).
portalRouter.get(
  "/me/schedule",
  requireEmployee,
  asyncHandler(async (req, res) => {
    const me = req.employee;
    const [all, projects, schedules, employees] = await Promise.all([find("tasks"), find("projects"), find("schedules"), find("employees")]);
    const mine = all.filter(t => ownsTask(me, t));
    const ids = new Set(mine.map(t => t.projectId));
    const name = new Map(employees.map(e => [e.id, e.name]));
    const pname = new Map(projects.map(p => [p.id, p.name]));
    const blocks = schedules
      .filter(s => s.employeeId === me.id || (s.projectId != null && ids.has(s.projectId)))
      .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
      .map(s => ({ id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime, type: s.type, note: s.note,
        projectId: s.projectId ?? null, project: pname.get(s.projectId) ?? null,
        employeeName: name.get(s.employeeId) ?? "", mine: s.employeeId === me.id }));
    const teams = projects.filter(p => ids.has(p.id)).map(p => ({
      projectId: p.id, name: p.name, ownerName: p.ownerName,
      members: employees.filter(e => e.role !== "admin" && all.some(t => t.projectId === p.id && ownsTask(e, t)))
        .map(e => ({ id: e.id, name: e.name, roleTitle: e.roleTitle, availability: e.availability ?? "available", you: e.id === me.id,
          openTasks: all.filter(t => t.projectId === p.id && t.status !== "done" && ownsTask(e, t)).length })),
    }));
    res.json({ blocks, teams });
  })
);

const progressSchema = z.object({
  status: z.enum(STATUSES).optional(),
  progress: z.coerce.number().min(0).max(100).optional(),
  blocker: z.string().trim().max(500).nullish(),
  completionNote: z.string().trim().max(1000).nullish(),
  note: z.string().trim().max(500).nullish(), // free-text progress update
  hoursLogged: z.coerce.number().min(0).max(24).optional(),
});

portalRouter.post(
  "/me/tasks/:id/update",
  requireEmployee,
  asyncHandler(async (req, res) => {
    const me = req.employee;
    const id = parseId(req.params.id, "task id");
    const body = parseBody(progressSchema, req.body);
    const task = await findOne("tasks", { id });
    if (!task) throw httpError(404, "Task not found");
    if (!ownsTask(me, task)) throw httpError(403, "You can only update tasks assigned to you");

    const status = body.status ?? task.status;
    const note = body.completionNote || task.completionNote || null;
    const blocker = status === "blocked" ? body.blocker || task.blocker || null : null;
    if (status === "done" && !note) throw httpError(400, "A completion note is required to finish a task");
    if (status === "blocked" && !blocker) throw httpError(400, "Describe what is blocking this task");

    if (status !== task.status && ["in_progress", "done"].includes(status) && task.dependsOn?.length) {
      const deps = (await find("tasks")).filter(t => task.dependsOn.includes(t.id) && t.status !== "done");
      if (deps.length) throw httpError(409, `Waiting on: ${deps.map(d => d.title).join(", ")}`);
    }

    const at = nowIso();
    const logged = body.hoursLogged ?? 0;
    const progress = status === "done" ? 100 : body.progress ?? task.progress ?? 0;
    const updated = await patch("tasks", id, {
      status, progress, blocker, completionNote: note,
      actualHours: (Number(task.actualHours) || 0) + logged,
      ...(body.note ? { lastNote: body.note } : {}), lastUpdatedBy: me.name,
      completedAt: status === "done" ? task.completedAt ?? at : null,
    });
    await insert("task_updates", {
      taskId: id, projectId: task.projectId, taskTitle: task.title,
      employeeId: me.id, employeeName: me.name,
      prevStatus: task.status, status, progress, hoursLogged: logged,
      blocker, note: body.completionNote || body.note || null, at,
    });
    await recomputeProjectProgress(task.projectId);

    const project = await findOne("projects", { id: task.projectId });
    if (blocker && blocker !== task.blocker) {
      await insert("alerts", {
        title: "Task blocked", detail: `${me.name}: ${blocker}`, severity: "high",
        projectName: project?.name ?? "", taskId: id, resolved: 0,
      });
      const owner = project && (await findOne("employees", { name: project.ownerName }));
      if (owner) await createNotification({ employeeEmail: owner.email, title: "Task blocked", body: `${me.name} reported a blocker on '${task.title}': ${blocker}` });
    }
    await recordAudit(me, "progress_update", "task", id,
      `${me.name} set '${task.title}' to ${status} (${progress}%)${logged ? `, logged ${logged}h` : ""}`);
    broadcast("task.updated", { taskId: id, status });
    res.json({ task: updated });
  })
);

portalRouter.get(
  "/me/performance",
  requireEmployee,
  asyncHandler(async (req, res) => {
    const me = req.employee;
    const [mine, updates, feedback] = await Promise.all([
      myTasks(me), find("task_updates", { employeeId: me.id }), find("feedback", { employeeId: me.id }),
    ]);
    const done = mine.filter(t => t.status === "done");
    const timed = done.filter(t => t.completedAt && t.dueAt);
    const withHours = done.filter(t => Number(t.actualHours) > 0);
    const weekAgo = Date.now() - 7 * DAY;
    const ratio = (a, b) => (b ? Math.round((a / b) * 100) : null);
    res.json({
      assigned: mine.length,
      completed: done.length,
      completionRate: ratio(done.length, mine.length),
      onTimeRate: ratio(timed.filter(t => t.completedAt <= t.dueAt).length, timed.length),
      estimateAccuracy: ratio(
        withHours.reduce((s, t) => s + (Number(t.estimatedHours) || 0), 0),
        withHours.reduce((s, t) => s + Number(t.actualHours), 0)),
      hoursLogged: Math.round(updates.reduce((s, u) => s + (u.hoursLogged || 0), 0) * 10) / 10,
      completedLast7Days: done.filter(t => t.completedAt && +new Date(t.completedAt) >= weekAgo).length,
      feedback: feedback.slice().reverse(),
    });
  })
);

portalRouter.get(
  "/me/profile",
  requireEmployee,
  asyncHandler(async (req, res) => {
    const me = req.employee;
    res.json({ profile: { ...me, skillLevels: parseSkills(me) } });
  })
);

const profileSchema = z.object({
  skills: z.array(z.object({ skill: z.string().trim().min(1).max(60), level: z.coerce.number().int().min(1).max(5) })).max(30),
  availability: z.enum(["available", "partial", "unavailable"]).optional(),
});

portalRouter.patch(
  "/me/profile",
  requireEmployee,
  asyncHandler(async (req, res) => {
    const body = parseBody(profileSchema, req.body);
    const skillLevels = body.skills.map(s => ({ skill: norm(s.skill), level: s.level }));
    const updated = await patch("employees", req.employee.id, {
      skillLevels, skills: skillLevels.map(s => s.skill).join(", "),
      ...(body.availability ? { availability: body.availability } : {}),
    });
    await recordAudit(req.employee, "updated_profile", "employee", req.employee.id, "Updated skills/availability");
    res.json({ profile: { ...updated, skillLevels } });
  })
);

// ============================== MANAGER (/manager) ============================
portalRouter.use("/manager", requireEmployee, requireManager);

const projectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  dueAt: z.string().optional(),
  milestones: z.array(z.object({ name: z.string().trim().min(1), dueAt: z.string().optional() })).max(20).default([]),
  stages: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    estimatedHours: z.coerce.number().min(0.5).max(500).default(8),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    requiredSkills: z.array(skillInput).max(10).default([]),
  })).min(1).max(30),
});

portalRouter.post(
  "/manager/projects",
  asyncHandler(async (req, res) => {
    const body = parseBody(projectSchema, req.body);
    const start = Date.now();
    const end = body.dueAt && +new Date(body.dueAt) > start ? +new Date(body.dueAt) : start + 14 * DAY;
    const project = await createProject({
      name: body.name, description: body.description, ownerName: req.employee.name,
      progress: 0, status: "active", dueAt: new Date(end).toISOString(),
    });
    await patch("projects", project.id, {
      milestones: body.milestones.map(m => ({ ...m, done: false })),
      requiredSkills: [...new Set(body.stages.flatMap(s => s.requiredSkills.map(r => norm(r.skill))))],
    });
    const tasks = [];
    for (const [i, stage] of body.stages.entries()) {
      const base = await createTask({
        projectId: project.id, title: stage.name, assignee: "Unassigned", stage: stage.name,
        priority: stage.priority, estimatedHours: stage.estimatedHours,
        dueAt: new Date(start + ((i + 1) / body.stages.length) * (end - start)).toISOString(),
      });
      tasks.push(await patch("tasks", base.id, {
        assigneeId: null, progress: 0, requiredSkills: stage.requiredSkills,
        dependsOn: i ? [tasks[i - 1].id] : [], // stages run in sequence
      }));
    }
    await recordAudit(req.employee, "created", "project", project.id,
      `Created project '${project.name}' with ${tasks.length} workflow stages`);
    broadcast("project.created", { id: project.id });
    res.json({ project: await findOne("projects", { id: project.id }), tasks });
  })
);

portalRouter.get(
  "/manager/overview",
  asyncHandler(async (_req, res) => {
    const [tasks, projects, employees, alerts, updates, proposals] = await Promise.all([
      find("tasks"), find("projects"), find("employees"), find("alerts", { resolved: 0 }),
      find("task_updates"), find("proposals", { status: "proposed" }),
    ]);
    const now = Date.now();
    const open = tasks.filter(t => t.status !== "done");
    const doneIn = (a, b) => new Set(updates.filter(u => u.status === "done" && u.prevStatus !== "done" &&
      +new Date(u.at) >= now - b * DAY && +new Date(u.at) < now - a * DAY).map(u => u.taskId)).size;
    const load = calculateWorkload(employees.filter(e => e.role !== "admin"), tasks);
    res.json({
      activeProjects: projects.filter(p => p.status !== "completed").length,
      atRiskProjects: projects.filter(p => p.status === "at_risk").length,
      openTasks: open.length,
      blockedTasks: open.filter(t => t.status === "blocked").length,
      overdueTasks: open.filter(t => t.dueAt && +new Date(t.dueAt) < now).length,
      unassignedTasks: open.filter(isUnassigned).length,
      pendingProposals: proposals.length,
      openAlerts: alerts.length,
      completedLast7Days: doneIn(0, 7),
      completedPrev7Days: doneIn(7, 14),
      avgUtilization: load.length ? Math.round(load.reduce((s, w) => s + (w.utilization ?? 0), 0) / load.length) : 0,
      overloadedEmployees: load.filter(w => (w.utilization ?? 0) > 100).length,
    });
  })
);

portalRouter.get(
  "/manager/daily-progress",
  asyncHandler(async (req, res) => {
    const { from, to } = dayRange(req.query);
    const f = from.toISOString(), t = to.toISOString();
    const [tasks, projects, employees, updates] = await Promise.all([
      find("tasks"), find("projects"), find("employees"), find("task_updates"),
    ]);
    const today = updates.filter(u => u.at >= f && u.at < t);
    const finished = u => u.status === "done" && u.prevStatus !== "done";
    const people = employees.filter(e => e.role !== "admin").map(e => {
      const mine = today.filter(u => u.employeeId === e.id);
      const open = tasks.filter(x => x.status !== "done" && ownsTask(e, x));
      const touched = new Set(mine.map(u => u.taskId));
      return {
        employeeId: e.id, name: e.name, roleTitle: e.roleTitle,
        updates: mine.length,
        tasksCompleted: new Set(mine.filter(finished).map(u => u.taskId)).size,
        hoursLogged: Math.round(mine.reduce((s, u) => s + (u.hoursLogged || 0), 0) * 10) / 10,
        blockersRaised: mine.filter(u => u.blocker).length,
        openTasks: open.length, blockedNow: open.filter(x => x.status === "blocked").length,
        activeTasks: open.filter(x => touched.has(x.id) || x.status === "in_progress")
          .map(x => ({ id: x.id, title: x.title, status: x.status, progress: x.progress ?? 0 })),
      };
    });
    const byProject = projects.map(p => {
      const pt = tasks.filter(x => x.projectId === p.id);
      const pu = today.filter(u => u.projectId === p.id);
      return {
        projectId: p.id, name: p.name, status: p.status, progress: p.progress ?? 0,
        tasksCompleted: new Set(pu.filter(finished).map(u => u.taskId)).size,
        hoursLogged: Math.round(pu.reduce((s, u) => s + (u.hoursLogged || 0), 0) * 10) / 10,
        updates: pu.length, openTasks: pt.filter(x => x.status !== "done").length,
        blocked: pt.filter(x => x.status === "blocked").length,
        overdue: pt.filter(x => x.status !== "done" && x.dueAt && +new Date(x.dueAt) < Date.now()).length,
      };
    });
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const end = +to - i * DAY, start = end - DAY;
      const inDay = updates.filter(u => +new Date(u.at) >= start && +new Date(u.at) < end);
      trend.push({ day: new Date(start).toISOString(), completed: new Set(inDay.filter(finished).map(u => u.taskId)).size,
        hoursLogged: Math.round(inDay.reduce((s, u) => s + (u.hoursLogged || 0), 0) * 10) / 10 });
    }
    res.json({
      from: f, to: t, people, projects: byProject, trend,
      totals: {
        tasksCompleted: people.reduce((s, p) => s + p.tasksCompleted, 0),
        hoursLogged: Math.round(people.reduce((s, p) => s + p.hoursLogged, 0) * 10) / 10,
        blockersRaised: people.reduce((s, p) => s + p.blockersRaised, 0),
      },
      timeline: today.slice(-40).reverse(),
    });
  })
);

// ---- AI assignment proposals (nothing is assigned until a manager approves) ----
const generateSchema = z.object({ projectId: z.coerce.number().int().optional(), taskId: z.coerce.number().int().optional() });

portalRouter.post(
  "/manager/proposals/generate",
  asyncHandler(async (req, res) => {
    const body = parseBody(generateSchema, req.body);
    const [tasks, employees, schedules, existing] = await Promise.all([
      find("tasks"), find("employees"), find("schedules"), find("proposals", { status: "proposed" }),
    ]);
    const queued = new Set(existing.map(p => p.taskId));
    const targets = tasks.filter(t => t.status !== "done" && isUnassigned(t) && !queued.has(t.id) &&
      (body.taskId ? t.id === body.taskId : body.projectId ? t.projectId === body.projectId : true));
    const { proposals, skipped } = proposeAssignments({ tasks, candidatesTasks: targets, employees, schedules });
    const created = [];
    for (const p of proposals) created.push(await insert("proposals", { ...p, status: "proposed", source: "ai" }));
    await recordAudit(req.employee, "ai_proposed", "assignment", null, `AI proposed ${created.length} assignment(s); ${skipped.length} skipped`);
    res.json({ proposals: created, skipped });
  })
);

portalRouter.get(
  "/manager/proposals",
  asyncHandler(async (req, res) => {
    const filter = req.query.status ? { status: String(req.query.status) } : {};
    res.json({ proposals: (await find("proposals", filter)).reverse() });
  })
);

const decisionSchema = z.object({ employeeId: z.coerce.number().int().optional(), note: z.string().trim().max(500).optional() });

async function loadOpenProposal(req) {
  const proposal = await findOne("proposals", { id: parseId(req.params.id, "proposal id") });
  if (!proposal) throw httpError(404, "Proposal not found");
  if (proposal.status !== "proposed") throw httpError(409, `Proposal already ${proposal.status}`);
  return proposal;
}

portalRouter.post(
  "/manager/proposals/:id/approve",
  asyncHandler(async (req, res) => {
    const body = parseBody(decisionSchema, req.body);
    const proposal = await loadOpenProposal(req);
    const employeeId = body.employeeId ?? proposal.recommendedEmployeeId;
    const employee = employeeId != null && (await findOne("employees", { id: employeeId }));
    if (!employee) throw httpError(400, "Choose an employee to assign");
    const task = await findOne("tasks", { id: proposal.taskId });
    if (!task) throw httpError(404, "Task no longer exists");
    if (!isUnassigned(task)) throw httpError(409, "Task has already been assigned");
    const override = employee.id !== proposal.recommendedEmployeeId;
    await patch("tasks", task.id, { assignee: employee.name, assigneeId: employee.id });
    await patch("proposals", proposal.id, {
      status: "approved", decidedBy: req.employee.name, decidedAt: nowIso(),
      assignedEmployeeId: employee.id, override, note: body.note ?? null,
    });
    await insert("outcomes", {
      recommendationId: proposal.id, interventionType: "ai_assignment",
      actionTaken: override ? "modified" : "accepted", decisionMaker: req.employee.name,
      predictedRiskDelta: 0, actualOutcomeObserved: `Assigned to ${employee.name}`,
      actualDelayHours: 0, notes: body.note ?? "", recordedAt: nowIso(),
    });
    await createNotification({ employeeEmail: employee.email, title: "New task assigned",
      body: `'${task.title}' was assigned to you${task.dueAt ? `, due ${task.dueAt.slice(0, 10)}` : ""}.` });
    await recordAudit(req.employee, "approved_assignment", "task", task.id,
      `Approved ${employee.name} for '${task.title}'${override ? " (manager override)" : ""}`);
    broadcast("task.updated", { taskId: task.id });
    res.json({ success: true, taskId: task.id, employeeId: employee.id, override });
  })
);

portalRouter.post(
  "/manager/proposals/:id/reject",
  asyncHandler(async (req, res) => {
    const body = parseBody(decisionSchema, req.body);
    const proposal = await loadOpenProposal(req);
    await patch("proposals", proposal.id, { status: "rejected", decidedBy: req.employee.name, decidedAt: nowIso(), note: body.note ?? null });
    await insert("outcomes", { recommendationId: proposal.id, interventionType: "ai_assignment", actionTaken: "rejected",
      decisionMaker: req.employee.name, predictedRiskDelta: 0, actualOutcomeObserved: "Proposal rejected",
      actualDelayHours: 0, notes: body.note ?? "", recordedAt: nowIso() });
    await recordAudit(req.employee, "rejected_assignment", "task", proposal.taskId, `Rejected AI proposal #${proposal.id}`);
    res.json({ success: true });
  })
);

// ---- Simulation -> live change, only with explicit confirmation ----
const applySchema = z.object({
  confirm: z.literal(true, { error: "Explicit confirmation (confirm: true) is required to change live data" }),
  interventionType: z.enum(["reassign_task", "extend_deadline", "reduce_scope"]),
  taskId: z.coerce.number().int(),
  targetAssignee: z.string().optional(),
  scheduleAdjustmentHours: z.coerce.number().min(0).max(720).optional(),
  priorityChange: z.enum(["low", "medium", "high"]).optional(),
});

portalRouter.post(
  "/manager/simulations/apply",
  asyncHandler(async (req, res) => {
    const body = parseBody(applySchema, req.body);
    const task = await findOne("tasks", { id: body.taskId });
    if (!task) throw httpError(404, "Task not found");
    const set = {};
    let notify = null;
    if (body.interventionType === "reassign_task") {
      const target = (await find("employees")).find(e => norm(e.name) === norm(body.targetAssignee));
      if (!target) throw httpError(400, "Target assignee not found");
      Object.assign(set, { assignee: target.name, assigneeId: target.id });
      notify = target;
    } else if (body.interventionType === "extend_deadline") {
      const hours = body.scheduleAdjustmentHours > 0 ? body.scheduleAdjustmentHours : 48;
      set.dueAt = new Date((+new Date(task.dueAt) || Date.now()) + hours * 3_600_000).toISOString();
    } else {
      set.estimatedHours = Math.max(1, (Number(task.estimatedHours) || 4) * 0.6);
    }
    if (body.priorityChange) set.priority = body.priorityChange;
    const updated = await patch("tasks", task.id, set);
    if (notify) await createNotification({ employeeEmail: notify.email, title: "Task reassigned to you", body: `'${task.title}' was reassigned to you.` });
    await insert("outcomes", { interventionType: body.interventionType, actionTaken: "accepted", decisionMaker: req.employee.name,
      predictedRiskDelta: 0, actualOutcomeObserved: "Applied from Decision Simulator after confirmation",
      actualDelayHours: 0, notes: `Task #${task.id}`, recordedAt: nowIso() });
    await recordAudit(req.employee, "applied_simulation", "task", task.id, `Applied ${body.interventionType} to '${task.title}' after confirmation`);
    broadcast("task.updated", { taskId: task.id });
    res.json({ success: true, task: updated });
  })
);

// ---- Feedback ----
const feedbackSchema = z.object({
  employeeId: z.coerce.number().int(),
  text: z.string().trim().min(1).max(1000),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

portalRouter.post(
  "/manager/feedback",
  asyncHandler(async (req, res) => {
    const body = parseBody(feedbackSchema, req.body);
    const employee = await findOne("employees", { id: body.employeeId });
    if (!employee) throw httpError(404, "Employee not found");
    const entry = await insert("feedback", { ...body, fromName: req.employee.name });
    await createNotification({ employeeEmail: employee.email, title: "New feedback from your manager", body: body.text.slice(0, 120) });
    await recordAudit(req.employee, "gave_feedback", "employee", employee.id, `Feedback for ${employee.name}`);
    res.json(entry);
  })
);
