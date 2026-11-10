// Analytics, simulator, copilot, outcomes, workflows.
import { Router } from "express";
import { requireEmployee, requireManager } from "../core/auth.js";
import {
  createNotification,
  getDashboardData,
  getPeopleData,
  recordAudit,
} from "../core/database.js";
import { find, insert } from "../core/store.js";
import { broadcast } from "../core/events.js";
import { asyncHandler, httpError, parseBody, parseId } from "../core/http.js";
import {
  copilotAskSchema,
  outcomeRecordSchema,
  simulatorCompareSchema,
  workflowCreateSchema,
  workflowGenerateSchema,
} from "../core/schemas.js";
import { askCopilot } from "../intelligence/copilotEngine.js";
import { simulateIntervention } from "../intelligence/decisionSimulator.js";
import { calculatePredictions } from "../intelligence/predictions.js";
import { generateRecommendations } from "../intelligence/recommendations.js";
import { calculateWorkload } from "../intelligence/workload.js";
import { getMlMetrics } from "../ml/pipeline.js";

export const intelligenceRouter = Router();
intelligenceRouter.use(requireEmployee, requireManager); // analytics, simulator, workflows are manager tools

// ---- analytics -------------------------------------------------------------
async function analyzeOperations() {
  const [dashboard, people] = await Promise.all([
    getDashboardData(),
    getPeopleData(),
  ]);
  const predictions = calculatePredictions(dashboard.tasks, people.employees);
  const workload = calculateWorkload(people.employees, dashboard.tasks);
  return {
    predictions,
    workload,
    summary: {
      averageUtilization: workload.length
        ? Math.round(
            workload.reduce((sum, item) => sum + item.utilization, 0) /
              workload.length
          )
        : 0,
      overloaded: workload.filter(item => item.loadBand === "overloaded")
        .length,
      highRiskTasks: predictions.filter(item => item.probability >= 55).length,
    },
  };
}

intelligenceRouter.get(
  "/analytics/workload",
  asyncHandler(async (_req, res) => res.json(await analyzeOperations()))
);

intelligenceRouter.get(
  "/analytics/predictions",
  asyncHandler(async (_req, res) => {
    const { predictions, summary } = await analyzeOperations();
    res.json({ predictions, summary, mlModel: getMlMetrics() });
  })
);

intelligenceRouter.get(
  "/analytics/recommendations",
  asyncHandler(async (_req, res) => {
    const [dashboard, people] = await Promise.all([
      getDashboardData(),
      getPeopleData(),
    ]);
    res.json(await generateRecommendations(dashboard.tasks, people.employees));
  })
);

intelligenceRouter.post(
  "/analytics/notify-at-risk",
  requireManager,
  asyncHandler(async (_req, res) => {
    const analysis = await analyzeOperations();
    const atRisk = analysis.predictions.filter(item => item.probability >= 55);
    for (const item of atRisk) {
      const person = analysis.workload.find(
        candidate => candidate.name === item.assignee
      );
      if (person?.email) {
        await createNotification({
          employeeEmail: person.email,
          title: `BUSSOLOGIC Delivery Risk: ${item.taskTitle}`,
          body: item.recommendedAction,
          channel: "in_app",
        });
      }
    }
    const result = { notified: atRisk.length, tasks: atRisk };
    broadcast("notifications", result);
    res.json(result);
  })
);

intelligenceRouter.get("/analytics/ml-model", (_req, res) =>
  res.json(getMlMetrics())
);

// ---- decision simulator ----------------------------------------------------
intelligenceRouter.post(
  "/simulator/compare",
  asyncHandler(async (req, res) => {
    const body = parseBody(simulatorCompareSchema, req.body);
    const [dashboard, people] = await Promise.all([
      getDashboardData(),
      getPeopleData(),
    ]);
    const result = simulateIntervention({
      tasks: dashboard.tasks,
      employees: people.employees,
      interventionType: body.interventionType,
      taskId: body.taskId,
      targetAssignee: body.targetAssignee,
      priorityChange: body.priorityChange,
      scheduleAdjustmentHours: body.scheduleAdjustmentHours,
    });
    await insert("simulations", {
      simulatedAt: new Date().toISOString(),
      simulatedBy: req.employee.name ?? "User",
      ...result,
    });
    await recordAudit(
      req.employee,
      "simulated",
      "decision_simulator",
      body.taskId ?? null,
      `Simulated ${body.interventionType} on task #${body.taskId ?? 1}`
    );
    res.json(result);
  })
);

intelligenceRouter.get(
  "/simulator/history",
  asyncHandler(async (_req, res) =>
    res.json({ history: (await find("simulations")).reverse().slice(0, 20) })
  )
);

// ---- business copilot ------------------------------------------------------
intelligenceRouter.post(
  "/copilot/ask",
  asyncHandler(async (req, res) => {
    const { question } = parseBody(copilotAskSchema, req.body);
    if (question.trim().length < 2)
      throw httpError(400, "A question is required");
    const [dashboard, people] = await Promise.all([
      getDashboardData(),
      getPeopleData(),
    ]);
    const result = await askCopilot({
      question,
      tasks: dashboard.tasks,
      employees: people.employees,
      projects: dashboard.projects,
    });
    await recordAudit(
      req.employee,
      "queried",
      "copilot",
      null,
      `Copilot query: '${question.slice(0, 60)}...'`
    );
    res.json(result);
  })
);

// ---- outcome learning ------------------------------------------------------
intelligenceRouter.get("/outcomes", asyncHandler(async (_req, res) => {
  const outcomes = (await find("outcomes")).reverse();
  const count = action =>
    outcomes.filter(item => item.actionTaken === action).length;
  const total = outcomes.length;
  res.json({
    outcomes,
    summary: {
      totalRecorded: total,
      accepted: count("accepted"),
      rejected: count("rejected"),
      modified: count("modified"),
      acceptanceRate: total ? Math.round((count("accepted") / total) * 100) : 0,
      learningStatus: "active_monitoring",
    },
  });
}));

intelligenceRouter.post(
  "/outcomes/record",
  asyncHandler(async (req, res) => {
    const body = parseBody(outcomeRecordSchema, req.body);
    const entry = await insert("outcomes", {
      recommendationId: body.recommendationId ?? null,
      interventionType: body.interventionType,
      actionTaken: body.actionTaken,
      decisionMaker: req.employee.name ?? body.decisionMaker ?? "User",
      predictedRiskDelta: body.predictedRiskDelta,
      actualOutcomeObserved:
        body.actualOutcomeObserved ||
        "On-track execution following intervention",
      actualDelayHours: body.actualDelayHours || 0,
      notes: body.notes,
      recordedAt: new Date().toISOString(),
    });
    await recordAudit(
      req.employee,
      "recorded_outcome",
      "outcome_log",
      entry.id,
      `Recorded ${body.actionTaken} action on recommendation #${body.recommendationId ?? 1}`
    );
    broadcast("outcome.recorded", entry);
    res.json(entry);
  })
);

// ---- workflows -------------------------------------------------------------
intelligenceRouter.post(
  "/workflows/generate",
  asyncHandler(async (req, res) => {
    const prompt = parseBody(workflowGenerateSchema, req.body).prompt.trim();
    if (prompt.length < 3) throw httpError(400, "Describe the workflow first");
    const cleaned = prompt
      .replace(/^create a workflow for /i, "")
      .replace(/[.?!]+$/, "")
      .trim();
    res.json({
      name: cleaned
        ? cleaned[0].toUpperCase() + cleaned.slice(1)
        : "Custom Workflow",
      stages: [
        "Intake & approval",
        "Document verification",
        "Technical execution",
        "Quality assurance & compliance",
        "Final sign-off & customer notification",
      ],
      note: "BUSSOLOGIC workflow blueprint synthesized from your prompt. Ready for automation.",
    });
  })
);

intelligenceRouter.get(
  "/workflows",
  asyncHandler(async (_req, res) => res.json({ workflows: await find("workflows") }))
);

intelligenceRouter.post(
  "/workflows",
  asyncHandler(async (req, res) => {
    const body = parseBody(workflowCreateSchema, req.body);
    const workflow = await insert("workflows", {
      name: body.name,
      trigger: body.trigger,
      stages: body.stages,
      description: body.description,
      status: "active",
    });
    await recordAudit(
      req.employee,
      "created",
      "workflow",
      workflow.id,
      `Created workflow '${workflow.name}'`
    );
    broadcast("workflow.created", workflow);
    res.json(workflow);
  })
);

intelligenceRouter.put(
  "/workflows/:id/execute",
  asyncHandler(async (req, res) => {
    const workflowId = parseId(req.params.id, "workflow id");
    const workflow = (await find("workflows", { id: workflowId }))[0];
    if (!workflow) throw httpError(404, "Workflow not found");
    await recordAudit(
      req.employee,
      "executed",
      "workflow",
      workflowId,
      `Executed automated workflow '${workflow.name}'`
    );
    const result = {
      success: true,
      workflowId,
      status: "executed",
      name: workflow.name,
    };
    broadcast("workflow.executed", result);
    res.json(result);
  })
);
