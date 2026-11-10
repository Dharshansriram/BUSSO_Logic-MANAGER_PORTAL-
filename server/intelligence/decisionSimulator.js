import { calculatePredictions, parseIso } from "./predictions.js";
import { calculateWorkload } from "./workload.js";

const round1 = value => Math.round(value * 10) / 10;

/**
 * Counterfactual "what-if" engine. Runs the intelligence models on a cloned copy of
 * the data with the intervention applied; live data is never mutated.
 */
export function simulateIntervention({
  tasks,
  employees,
  interventionType,
  taskId = null,
  targetAssignee = null,
  priorityChange = null,
  scheduleAdjustmentHours = 0,
}) {
  const basePredictions = calculatePredictions(tasks, employees);
  const baseWorkload = calculateWorkload(employees, tasks);

  let selectedTask = tasks.find(task => task.id === taskId);
  if (!selectedTask && tasks.length) {
    selectedTask = tasks[0];
    taskId = selectedTask.id;
  }

  const basePrediction = basePredictions.find(item => item.taskId === taskId);
  const baseProbability = basePrediction ? basePrediction.probability : 50;
  const baseDrivers = basePrediction ? basePrediction.drivers : [];

  const originalAssignee = selectedTask?.assignee ?? "Maya Chen";
  if (!targetAssignee) {
    const candidates = employees
      .map(employee => employee.name)
      .filter(name => name !== originalAssignee);
    targetAssignee = candidates[0] ?? "Noah Williams";
  }

  const baseSource = baseWorkload.find(item => item.name === originalAssignee);
  const baseTarget = baseWorkload.find(item => item.name === targetAssignee);

  // Apply the intervention to cloned data.
  const simTasks = structuredClone(tasks);
  const simEmployees = structuredClone(employees);
  const simTask = simTasks.find(task => task.id === taskId);
  const assumptionsApplied = [];

  if (simTask) {
    if (interventionType === "reassign_task") {
      simTask.assignee = targetAssignee;
      assumptionsApplied.push(
        `Reassigned task #${taskId} ('${simTask.title}') from ${originalAssignee} to ${targetAssignee}`
      );
    } else if (interventionType === "extend_deadline") {
      const hours = scheduleAdjustmentHours > 0 ? scheduleAdjustmentHours : 48;
      const due = parseIso(simTask.dueAt) ?? new Date();
      simTask.dueAt = new Date(due.getTime() + hours * 3_600_000).toISOString();
      assumptionsApplied.push(`Extended deadline by ${hours.toFixed(0)} hours`);
    } else if (interventionType === "reduce_scope") {
      const estimated = Number(simTask.estimatedHours) || 4;
      simTask.estimatedHours = Math.max(1, estimated * 0.6);
      assumptionsApplied.push(
        `Reduced task scope by 40% (estimated hours from ${estimated.toFixed(1)}h to ${simTask.estimatedHours.toFixed(1)}h)`
      );
    }
    if (priorityChange) {
      simTask.priority = priorityChange;
      assumptionsApplied.push(`Changed priority to ${priorityChange}`);
    }
  }

  const simPredictions = calculatePredictions(simTasks, simEmployees);
  const simWorkload = calculateWorkload(simEmployees, simTasks);
  const simPrediction = simPredictions.find(item => item.taskId === taskId);
  const simProbability = simPrediction
    ? simPrediction.probability
    : Math.max(5, baseProbability - 25);
  const simSource = simWorkload.find(item => item.name === originalAssignee);
  const simTarget = simWorkload.find(item => item.name === targetAssignee);

  const baseHighRisk = basePredictions.filter(
    item => item.probability >= 55
  ).length;
  const simHighRisk = simPredictions.filter(
    item => item.probability >= 55
  ).length;
  const average = list =>
    round1(
      list.reduce((sum, item) => sum + item.utilization, 0) /
        Math.max(1, list.length)
    );

  const riskReduction = baseProbability - simProbability;
  const isFavorable = riskReduction > 0;

  const tradeOffs = [];
  if (baseSource && simSource) {
    const delta = simSource.utilization - baseSource.utilization;
    if (delta < 0)
      tradeOffs.push(
        `${originalAssignee} utilization relieved by ${Math.abs(delta)}% (from ${baseSource.utilization}% to ${simSource.utilization}%)`
      );
  }
  if (baseTarget && simTarget) {
    const delta = simTarget.utilization - baseTarget.utilization;
    if (delta > 0)
      tradeOffs.push(
        `${targetAssignee} utilization increases by ${delta}% (from ${baseTarget.utilization}% to ${simTarget.utilization}%)`
      );
  }

  const verdict =
    isFavorable && riskReduction >= 15
      ? `RECOMMENDED: Intervention produces a ${riskReduction}% reduction in task slip risk and stabilizes team capacity.`
      : isFavorable
        ? `MODERATE BENEFIT: Risk decreases by ${riskReduction}%. Evaluate secondary team impacts.`
        : "NOT RECOMMENDED: Intervention does not yield significant risk mitigation or creates secondary bottleneck.";

  return {
    interventionType,
    taskId,
    taskTitle: selectedTask?.title ?? "Task",
    targetAssignee,
    assumptionsApplied,
    baseline: {
      riskProbability: baseProbability,
      riskLevel: basePrediction?.riskLevel ?? "medium",
      drivers: baseDrivers,
      sourceAssigneeUtilization: baseSource?.utilization ?? 0,
      targetAssigneeUtilization: baseTarget?.utilization ?? 0,
      highRiskTasksCount: baseHighRisk,
      teamAverageUtilization: average(baseWorkload),
    },
    proposed: {
      riskProbability: simProbability,
      riskLevel: simPrediction?.riskLevel ?? "low",
      drivers: simPrediction ? simPrediction.drivers : [],
      sourceAssigneeUtilization: simSource?.utilization ?? 0,
      targetAssigneeUtilization: simTarget?.utilization ?? 0,
      highRiskTasksCount: simHighRisk,
      teamAverageUtilization: average(simWorkload),
    },
    delta: {
      riskReduction,
      highRiskTasksDelta: simHighRisk - baseHighRisk,
      isFavorable,
    },
    tradeOffs,
    verdict,
    confidenceScore: Math.abs(riskReduction) > 10 ? 91 : 76,
  };
}
