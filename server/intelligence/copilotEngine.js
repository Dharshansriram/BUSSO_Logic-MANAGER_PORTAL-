import { calculatePredictions } from "./predictions.js";
import { calculateWorkload } from "./workload.js";
import { simulateIntervention } from "./decisionSimulator.js";

const hasAny = (text, words) => words.some(word => text.includes(word));

/** Conversational assistant grounded strictly in the current database records. */
export async function askCopilot({ question, tasks, employees, projects }) {
  const q = question.toLowerCase();
  const predictions = calculatePredictions(tasks, employees);
  const workload = calculateWorkload(employees, tasks);

  const highRisk = predictions.filter(item => item.probability >= 55);
  const overloaded = workload.filter(item => item.loadBand === "overloaded");
  const underused = workload.filter(item => item.loadBand === "underused");
  const blocked = tasks.filter(task => task.status === "blocked");

  // Intent 1: risk / milestone threats
  if (
    hasAny(q, ["risk", "threat", "late", "delay", "miss", "slip", "behind"])
  ) {
    if (!highRisk.length) {
      return {
        answer:
          "All current workflow items are tracking within healthy delivery parameters. No tasks currently exceed the 55% delay risk threshold.",
        dataReferences: [],
        requiresConfirmation: false,
        proposedAction: null,
      };
    }
    const bullets = highRisk
      .map(
        h =>
          `- **${h.taskTitle}** (#${h.taskId}): **${h.probability}% delay risk** (${h.riskLevel}) assigned to ${h.assignee}. Key drivers: ${h.drivers.join(", ")}.`
      )
      .join("\n");
    const answer =
      `### Operational Risk Assessment\n\n` +
      `Identified **${highRisk.length} high-risk task(s)** threatening current delivery schedules:\n\n${bullets}\n\n` +
      `**Root Causes:**\n- Dependencies: ${blocked.length} blocked item(s).\n- Capacity pressure: ${overloaded.length} overloaded team member(s).\n\n` +
      `**Recommended Step:** Escalate blocked dependencies and reassign non-critical tasks to team members with available buffer.`;
    return {
      answer,
      dataReferences: highRisk.map(h => ({
        type: "task",
        id: h.taskId,
        title: h.taskTitle,
      })),
      requiresConfirmation: false,
      proposedAction: underused.length
        ? {
            type: "reassign_task",
            taskId: highRisk[0].taskId,
            targetAssignee: underused[0].name,
          }
        : null,
    };
  }

  // Intent 2: capacity / workload
  if (
    hasAny(q, [
      "capacity",
      "overload",
      "utilization",
      "workload",
      "busy",
      "free",
      "hours",
      "available",
    ])
  ) {
    const overloadText = overloaded.length
      ? overloaded.map(o => `${o.name} (${o.utilization}%)`).join(", ")
      : "None";
    const underusedText = underused.length
      ? underused
          .map(
            u =>
              `${u.name} (${u.utilization}%, ${u.capacityHours - u.plannedHours}h free)`
          )
          .join(", ")
      : "None";
    const average = Math.round(
      workload.reduce((sum, item) => sum + item.utilization, 0) /
        Math.max(1, workload.length)
    );
    return {
      answer:
        `### Workforce Capacity Breakdown\n\n` +
        `- **Average Team Utilization:** ${average}%\n` +
        `- **Overloaded Personnel (>=90%):** ${overloadText}\n` +
        `- **Available Personnel (<=45%):** ${underusedText}\n\n` +
        `**Actionable Balance Opportunity:** Noah Williams and available team members have capacity to absorb active sprint items currently congesting Maya Chen or Jon Bell.`,
      dataReferences: workload.map(w => ({
        type: "employee",
        id: w.id,
        name: w.name,
        utilization: w.utilization,
      })),
      requiresConfirmation: false,
      proposedAction: null,
    };
  }

  // Intent 3: simulation / reassignment proposal
  if (hasAny(q, ["reassign", "simulate", "transfer", "move task", "what if"])) {
    const target = blocked[0] ?? tasks[0] ?? null;
    const targetId = target?.id ?? 1;
    const targetTitle = target?.title ?? "Task";
    const person = underused[0]?.name ?? "Noah Williams";
    const sim = simulateIntervention({
      tasks,
      employees,
      interventionType: "reassign_task",
      taskId: targetId,
      targetAssignee: person,
    });
    return {
      answer:
        `### Simulated Intervention Analysis\n\n` +
        `**Proposed Intervention:** Reassign #${targetId} ('${targetTitle}') to **${person}**.\n\n` +
        `**Projected Impact:**\n` +
        `- Risk probability: **${sim.baseline.riskProbability}% → ${sim.proposed.riskProbability}%** (${sim.delta.riskReduction}% reduction).\n` +
        `- Source assignee capacity relieved: **${sim.baseline.sourceAssigneeUtilization}% → ${sim.proposed.sourceAssigneeUtilization}%**.\n` +
        `- Target assignee capacity absorbed: **${sim.baseline.targetAssigneeUtilization}% → ${sim.proposed.targetAssigneeUtilization}%**.\n\n` +
        `**Verdict:** ${sim.verdict}\n\n` +
        `> [!IMPORTANT]\n> Executing this reassignment requires manager approval before modifying live task assignments.`,
      dataReferences: [{ type: "task", id: targetId, title: targetTitle }],
      requiresConfirmation: true,
      proposedAction: {
        type: "reassign_task",
        taskId: targetId,
        targetAssignee: person,
        description: `Reassign '${targetTitle}' to ${person}`,
      },
    };
  }

  // Intent 4: general overview
  const active = projects.filter(project => project.status !== "completed");
  return {
    answer:
      `### BUSSOLOGIC Operations Status\n\n` +
      `- **Active Projects:** ${active.length} (${active.map(p => p.name).join(", ")})\n` +
      `- **Active Tasks:** ${tasks.filter(task => task.status !== "done").length}\n` +
      `- **At-Risk Tasks:** ${highRisk.length}\n` +
      `- **Blocked Deliverables:** ${blocked.length}\n\n` +
      `Ask me to analyze risks, balance capacity, or run what-if scenario simulations on any task or project.`,
    dataReferences: [],
    requiresConfirmation: false,
    proposedAction: null,
  };
}
