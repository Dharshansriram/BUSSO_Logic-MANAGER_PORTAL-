import { Router } from "express";
import { requireAdmin, requireEmployee, requireManager } from "../core/auth.js";
import {
  createInvitation,
  createNotification,
  createSchedule,
  getPeopleData,
  recordAudit,
  updateEmployeeRole,
} from "../core/database.js";
import { inviteEmployee, resendInvite } from "../core/invites.js";
import { broadcast } from "../core/events.js";
import { asyncHandler, httpError, parseBody, parseId } from "../core/http.js";
import {
  employeeCreateSchema,
  employeeRoleSchema,
  invitationCreateSchema,
  scheduleCreateSchema,
} from "../core/schemas.js";

export const peopleRouter = Router();

peopleRouter.get(
  "/people",
  requireEmployee,
  requireManager,
  asyncHandler(async (_req, res) => res.json(await getPeopleData()))
);

peopleRouter.post(
  "/employees",
  requireEmployee,
  requireManager,
  asyncHandler(async (req, res) => {
    const body = parseBody(employeeCreateSchema, req.body);
    if (
      !body.name ||
      !body.email ||
      !body.department ||
      !body.roleTitle ||
      !body.skills
    ) {
      throw httpError(
        400,
        "name, email, department, roleTitle, and skills are required"
      );
    }
    // Only admins may invite another manager/admin; managers invite regular employees.
    if (!["employee", "manager"].includes(body.role))
      throw httpError(400, "role must be employee or manager");
    if (body.role !== "employee" && req.employee.role !== "admin")
      throw httpError(403, "Only an admin can invite a manager");
    const { employee, email } = await inviteEmployee({
      ...body,
      managerName: req.employee.name,
    });
    await recordAudit(
      req.employee,
      "invited",
      "employee",
      employee.id,
      `Invited ${employee.name} (${employee.email}); email ${email.sent ? "sent" : "not sent"}`
    );
    broadcast("employee.created", employee);
    res.status(201).json({ ...employee, emailSent: email.sent, emailError: email.reason });
  })
);

peopleRouter.post(
  "/employees/:id/resend-invite",
  requireEmployee,
  requireManager,
  asyncHandler(async (req, res) => {
    const employeeId = parseId(req.params.id, "employee id");
    const { employee, email } = await resendInvite(employeeId);
    await recordAudit(
      req.employee,
      "resent_invite",
      "employee",
      employeeId,
      `Re-sent invitation to ${employee.email}; email ${email.sent ? "sent" : "not sent"}`
    );
    res.json({ ...employee, emailSent: email.sent, emailError: email.reason });
  })
);

peopleRouter.patch(
  "/employees/:id/role",
  requireEmployee,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const employeeId = parseId(req.params.id, "employee id");
    const role = parseBody(employeeRoleSchema, req.body).role.trim();
    if (!["employee", "manager", "admin"].includes(role))
      throw httpError(400, "Invalid role");
    const employee = await updateEmployeeRole(employeeId, role);
    if (!employee) throw httpError(404, "Employee not found");
    await recordAudit(
      req.employee,
      "changed_role",
      "employee",
      employeeId,
      `Changed role to ${role}`
    );
    res.json(employee);
  })
);

peopleRouter.post(
  "/schedules",
  requireEmployee,
  requireManager,
  asyncHandler(async (req, res) => {
    const schedule = await createSchedule(
      parseBody(scheduleCreateSchema, req.body)
    );
    await recordAudit(
      req.employee,
      "created",
      "schedule",
      schedule.id,
      `Created ${schedule.type} schedule block`
    );
    broadcast("schedule.created", schedule);
    res.json(schedule);
  })
);

peopleRouter.post(
  "/invitations",
  requireEmployee,
  requireManager,
  asyncHandler(async (req, res) => {
    const invitation = await createInvitation({
      ...parseBody(invitationCreateSchema, req.body),
      invitedBy: req.employee.name ?? "Maya Chen",
    });
    await createNotification({
      employeeEmail: invitation.email,
      title: "BUSSOLOGIC workspace invitation",
      body: `You were invited as ${invitation.role} in ${invitation.department}. Ask your administrator for the secure invitation link.`,
      channel: "email",
    });
    await recordAudit(
      req.employee,
      "invited",
      "employee",
      null,
      `Created invitation for ${invitation.email}`
    );
    broadcast("invitation.created", invitation);
    res.json({
      ...invitation,
      delivery:
        "Invitation queued in the email outbox. Connect SMTP or SendGrid to deliver externally.",
    });
  })
);
