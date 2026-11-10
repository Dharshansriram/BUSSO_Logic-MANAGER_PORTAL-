import { describe, expect, it } from "vitest";
import { calculatePredictions } from "../intelligence/predictions.js";
import { calculateWorkload } from "../intelligence/workload.js";
import { simulateIntervention } from "../intelligence/decisionSimulator.js";
import { generateRecommendations } from "../intelligence/recommendations.js";
import { DEMO_EMPLOYEES, DEMO_TASKS } from "../core/demoData.js";
import {
  getMlMetrics,
  predictSingle,
  trainAndEvaluateModel,
} from "../ml/pipeline.js";

const employees = [
  {
    id: 1,
    name: "Ari Singh",
    capacityHours: 40,
    availability: "available",
    roleTitle: "Manager",
    department: "Security",
    email: "ari@example.com",
    skills: "security",
    managerName: "Maya",
    createdAt: new Date(),
  },
];
const tasks = [
  {
    id: 1,
    projectId: 1,
    title: "Blocked audit",
    assignee: "Ari Singh",
    stage: "Evidence",
    status: "blocked",
    priority: "critical",
    dueAt: new Date(Date.now() + 3600000),
    estimatedHours: 4,
    actualHours: 8,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe("operational intelligence", () => {
  it("calculates a high explainable delay probability for blocked urgent work", () => {
    const [prediction] = calculatePredictions(tasks, employees);
    expect(prediction.probability).toBeGreaterThan(50);
    expect(prediction.riskLevel).toMatch(/high|critical/);
    expect(prediction.drivers).toEqual(
      expect.arrayContaining(["task is blocked", "critical priority"])
    );
  });

  it("calculates utilization and efficiency for each employee", () => {
    const [person] = calculateWorkload(employees, tasks);
    expect(person.plannedHours).toBe(4);
    expect(person.utilization).toBe(10);
    expect(person.efficiency).toBeLessThan(100);
    expect(person.loadBand).toBe("underused");
  });

  it("flags the blocked critical demo task as high risk", () => {
    const t3 = calculatePredictions(DEMO_TASKS, DEMO_EMPLOYEES).find(
      p => p.taskId === 3
    );
    expect(t3.probability).toBeGreaterThanOrEqual(50);
  });

  it("never exposes password hashes in workload output", () => {
    const withHash = [{ ...DEMO_EMPLOYEES[0], passwordHash: "x:y" }];
    expect(calculateWorkload(withHash, DEMO_TASKS)[0]).not.toHaveProperty(
      "passwordHash"
    );
  });
});

describe("decision simulator", () => {
  it("compares baseline and proposed state without mutating live data", () => {
    const before = JSON.stringify(DEMO_TASKS);
    const res = simulateIntervention({
      tasks: DEMO_TASKS,
      employees: DEMO_EMPLOYEES,
      interventionType: "reassign_task",
      taskId: 3,
      targetAssignee: "Noah Williams",
    });
    expect(res).toHaveProperty("baseline");
    expect(res).toHaveProperty("verdict");
    expect(res.proposed.targetAssigneeUtilization).toBeGreaterThanOrEqual(
      res.baseline.targetAssigneeUtilization
    );
    expect(JSON.stringify(DEMO_TASKS)).toBe(before);
  });

  it("extending a deadline does not increase risk", () => {
    const res = simulateIntervention({
      tasks: DEMO_TASKS,
      employees: DEMO_EMPLOYEES,
      interventionType: "extend_deadline",
      taskId: 1,
      scheduleAdjustmentHours: 72,
    });
    expect(res.delta.riskReduction).toBeGreaterThanOrEqual(0);
  });
});

describe("recommendations", () => {
  it("returns evidence-backed deterministic recommendations", async () => {
    const res = await generateRecommendations(DEMO_TASKS, DEMO_EMPLOYEES);
    expect(res.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(res.recommendations[0]).toHaveProperty("expectedBenefit");
    expect(res.recommendations[0]).toHaveProperty("evidence");
  });
});

describe("ML pipeline", () => {
  it("trains a delay model that clears the 65% F1 / accuracy bar", () => {
    const metrics = trainAndEvaluateModel();
    expect(metrics.f1Score).toBeGreaterThanOrEqual(65);
    expect(metrics.accuracy).toBeGreaterThanOrEqual(65);
    expect(getMlMetrics().modelVersion).toBe(metrics.modelVersion);
    const pred = predictSingle({
      blocked: 1,
      priority_score: 1,
      urgency_score: 1,
      overrun_ratio: 0.5,
      overload_ratio: 0.8,
    });
    expect(pred.delayProbability).toBeGreaterThanOrEqual(50);
  });
});
