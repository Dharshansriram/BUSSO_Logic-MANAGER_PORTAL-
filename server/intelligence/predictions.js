const clamp = (value, min = 0, max = 99) =>
  Math.max(min, Math.min(max, Math.round(value)));
export const levelFor = probability =>
  probability >= 75
    ? "critical"
    : probability >= 55
      ? "high"
      : probability >= 30
        ? "medium"
        : "low";

export function parseIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Explainable delay-risk model: sigmoid(intercept + weighted operational features).
 * Returns open tasks sorted by delay probability (highest first).
 */
export function calculatePredictions(tasks, employees) {
  const load = new Map(
    employees.map(employee => [
      employee.name,
      { planned: 0, capacity: Number(employee.capacityHours) || 40 },
    ])
  );
  for (const task of tasks) {
    const entry = load.get(task.assignee);
    if (entry && task.status !== "done")
      entry.planned += Number(task.estimatedHours) || 4;
  }

  const now = Date.now();
  const predictions = [];

  for (const task of tasks) {
    if (task.status === "done") continue;

    const assignee = task.assignee ?? "Unassigned";
    const entry = load.get(assignee) ?? { planned: 0, capacity: 40 };
    const due = parseIso(task.dueAt);
    const hoursToDue = due ? (due.getTime() - now) / 3_600_000 : 48;

    const blocked = task.status === "blocked" ? 1 : 0;
    const priorityLabel = task.priority ?? "medium";
    const priority =
      priorityLabel === "critical" ? 1 : priorityLabel === "high" ? 0.7 : 0;
    const urgent = hoursToDue < 0 ? 1 : hoursToDue < 24 ? 0.65 : 0;
    const estimated = Number(task.estimatedHours) || 4;
    const actual = Number(task.actualHours) || 0;
    const overrun = Math.min(
      1,
      Math.max(0, (actual - estimated) / Math.max(1, estimated))
    );
    const overload = Math.min(
      1.5,
      Math.max(0, entry.planned / Math.max(1, entry.capacity) - 0.65)
    );

    const drivers = [];
    if (blocked) drivers.push("task is blocked");
    if (priority) drivers.push(`${priorityLabel} priority`);
    if (urgent)
      drivers.push(
        hoursToDue < 0 ? "deadline has passed" : "deadline is within 24 hours"
      );
    if (overrun) drivers.push("actual effort is above estimate");
    if (overload > 0) drivers.push(`${assignee} is above 85% planned capacity`);

    const logit =
      -2.15 +
      1.45 * blocked +
      1.05 * priority +
      1.35 * urgent +
      1.1 * overrun +
      1.25 * overload;
    const probability = clamp((1 / (1 + Math.exp(-logit))) * 100);

    predictions.push({
      taskId: task.id,
      taskTitle: task.title,
      assignee,
      probability,
      riskLevel: levelFor(probability),
      drivers,
      recommendedAction:
        probability >= 55
          ? `Reassign or add support for ${assignee} before the next checkpoint.`
          : "Keep the current plan and check progress at the next update.",
      modelVersion: "logistic-v1-explainable",
      source: "rules",
    });
  }

  return predictions.sort((a, b) => b.probability - a.probability);
}
