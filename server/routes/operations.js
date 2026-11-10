// Dashboard, tasks, alerts, projects, audit log, live events.
import { Router } from "express";
import { requireEmployee, requireManager } from "../core/auth.js";
import { ownsTask } from "../intelligence/allocation.js";
import {
  createProject,
  createTask,
  getAuditLogs,
  getDashboardData,
  getProjects,
  getTasks,
  recordAudit,
  resolveAlert,
  updateTaskStatus,
} from "../core/database.js";
import { broadcast, subscribe } from "../core/events.js";
import { asyncHandler, httpError, parseBody, parseId } from "../core/http.js";
import {
  projectCreateSchema,
  taskCreateSchema,
  taskStatusSchema,
} from "../core/schemas.js";

export const operationsRouter = Router();
const TASK_STATUSES = ["todo", "in_progress", "done", "blocked"];

operationsRouter.get(
  "/dashboard",
  requireEmployee,
  requireManager,
  asyncHandler(async (_req, res) => res.json(await getDashboardData()))
);

operationsRouter.get("/events", requireEmployee, (req, res) =>
  subscribe(req, res)
);

operationsRouter.get(
  "/tasks",
  requireEmployee,
  asyncHandler(async (req, res) => {
    const tasks = await getTasks();
    const manager = ["manager", "admin"].includes(req.employee.role);
    res.json({ tasks: manager ? tasks : tasks.filter(t => ownsTask(req.employee, t)) });
  })
);

operationsRouter.post(
  "/tasks",
  requireEmployee,
  requireManager,
  asyncHandler(async (req, res) => {
    const task = await createTask(parseBody(taskCreateSchema, req.body));
    await recordAudit(
      req.employee,
      "created",
      "task",
      task.id,
      `Created task '${task.title}'`
    );
    broadcast("task.created", task);
    res.json(task);
  })
);

operationsRouter.patch(
  "/tasks/:id/status",
  requireEmployee,
  asyncHandler(async (req, res) => {
    const taskId = parseId(req.params.id, "task id");
    const { status } = parseBody(taskStatusSchema, req.body);
    if (!TASK_STATUSES.includes(status))
      throw httpError(400, "Invalid task status");

    // Employees may only move their own tasks; managers/admins may move any.
    if (!["manager", "admin"].includes(req.employee.role)) {
      const task = (await getTasks()).find(item => item.id === taskId);
      if (!task) throw httpError(404, "Task not found");
      if (!ownsTask(req.employee, task)) {
        throw httpError(403, "You can only update tasks assigned to you");
      }
    }

    if (!(await updateTaskStatus(taskId, status)))
      throw httpError(404, "Task not found");
    await recordAudit(
      req.employee,
      "updated",
      "task",
      taskId,
      `Changed task status to ${status}`
    );
    const result = { success: true, taskId, status };
    broadcast("task.updated", result);
    res.json(result);
  })
);

operationsRouter.post(
  "/alerts/:id/resolve",
  requireEmployee,
  requireManager,
  asyncHandler(async (req, res) => {
    const alertId = parseId(req.params.id, "alert id");
    await resolveAlert(alertId);
    await recordAudit(
      req.employee,
      "resolved",
      "alert",
      alertId,
      `Resolved alert #${alertId}`
    );
    const result = { success: true, alertId };
    broadcast("alert.resolved", result);
    res.json(result);
  })
);

operationsRouter.get(
  "/projects",
  requireEmployee,
  asyncHandler(async (req, res) => {
    const projects = await getProjects();
    if (["manager", "admin"].includes(req.employee.role)) return res.json({ projects });
    const mine = (await getTasks()).filter(t => ownsTask(req.employee, t));
    res.json({ projects: projects.filter(p => mine.some(t => t.projectId === p.id)) });
  })
);

operationsRouter.post(
  "/projects",
  requireEmployee,
  requireManager, // was missing: any employee could create projects
  asyncHandler(async (req, res) => {
    const project = await createProject(
      parseBody(projectCreateSchema, req.body)
    );
    await recordAudit(
      req.employee,
      "created",
      "project",
      project.id,
      `Created project '${project.name}'`
    );
    broadcast("project.created", project);
    res.json(project);
  })
);

operationsRouter.get(
  "/audit-logs",
  requireEmployee,
  requireManager,
  asyncHandler(async (_req, res) => res.json({ logs: await getAuditLogs(100) }))
);
