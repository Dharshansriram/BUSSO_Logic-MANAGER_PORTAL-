import { ENV } from "../_core/env.js";
import { calculatePredictions } from "./predictions.js";
import { calculateWorkload } from "./workload.js";

export async function generateRecommendations(tasks, employees) {
  const predictions = calculatePredictions(tasks, employees);
  const workload = calculateWorkload(employees, tasks);

  const overloaded = workload.filter(item => item.loadBand === "overloaded");
  const underused = workload.filter(item => item.loadBand === "underused");
  const highRisk = predictions.filter(item => item.probability >= 55);
  const recs = [];

  // 1. Capacity rebalancing
  if (overloaded.length && underused.length) {
    const src = overloaded[0];
    const tgt = underused[0];
    const srcTasks = tasks.filter(
      task => task.assignee === src.name && task.status !== "done"
    );
    recs.push({
      id: 1,
      title: `Rebalance operational capacity from ${src.name} to ${tgt.name}`,
      detail: `${tgt.name} has capacity (${tgt.plannedHours}h / ${tgt.capacityHours}h) to absorb '${srcTasks[0]?.title ?? "active workload"}' and relieve ${src.name} (${src.utilization}% utilization).`,
      type: "capacity",
      confidence: 94,
      source: "rules",
      targetTaskId: srcTasks[0]?.id ?? 1,
      targetAssignee: tgt.name,
      expectedBenefit: `Lowers ${src.name}'s utilization to ~75%, eliminates bottlenecks, and protects project milestone.`,
      evidence: `${src.name} is at ${src.utilization}% utilization across ${src.assignedTasks} tasks; ${tgt.name} is at ${tgt.utilization}% utilization.`,
      alternatives:
        "Postpone task deadline by 3 days, or descope secondary acceptance criteria.",
      uncertainty: "Requires brief handoff context between team members.",
    });
  }

  // 2. Blocked / high-risk escalation
  const blockedTask = tasks.find(task => task.status === "blocked");
  if (blockedTask) {
    const match = predictions.find(item => item.taskId === blockedTask.id);
    const probability = match ? match.probability : 78;
    recs.push({
      id: 2,
      title: `Unblock critical path: '${blockedTask.title}'`,
      detail: `Task #${blockedTask.id} has been blocked with critical priority, driving a ${probability}% delay risk on the active sprint.`,
      type: "risk",
      confidence: probability,
      source: "rules",
      targetTaskId: blockedTask.id,
      targetAssignee: blockedTask.assignee,
      expectedBenefit:
        "Resolves dependency stall and saves up to 48 hours of cascading milestone delay.",
      evidence: `Task #${blockedTask.id} is marked blocked with priority ${blockedTask.priority} and ${blockedTask.actualHours ?? 0}h logged against ${blockedTask.estimatedHours ?? 0}h estimated.`,
      alternatives:
        "Reassign to program lead for fast-track managerial signoff.",
      uncertainty: "Depends on third-party response time.",
    });
  } else if (highRisk.length) {
    const hr = highRisk[0];
    recs.push({
      id: 2,
      title: `Mitigate delivery slip for '${hr.taskTitle}'`,
      detail: `Task #${hr.taskId} is trending at ${hr.probability}% delay likelihood due to: ${hr.drivers.join(", ")}.`,
      type: "risk",
      confidence: hr.probability,
      source: "rules",
      targetTaskId: hr.taskId,
      targetAssignee: hr.assignee,
      expectedBenefit: "Restores buffer margin before planned deadline.",
      evidence: `Drivers: ${hr.drivers.length ? hr.drivers.join(", ") : "tight deadline and load"}.`,
      alternatives: "Pair assignee with a peer specialist for rapid review.",
      uncertainty: "Minor ramp-up overhead.",
    });
  }

  // 3. Schedule alignment
  if (recs.length < 3 && tasks.length) {
    const sample = tasks.find(
      task =>
        task.status !== "done" && ["high", "critical"].includes(task.priority)
    );
    if (sample) {
      recs.push({
        id: 3,
        title: `Review sprint allocation for ${sample.assignee ?? "team"}`,
        detail: `Maintain daily check-in cadence on high-priority deliverable '${sample.title}'.`,
        type: "optimization",
        confidence: 85,
        source: "rules",
        targetTaskId: sample.id,
        targetAssignee: sample.assignee,
        expectedBenefit: "Prevents late-stage surprise slips.",
        evidence: `Priority is ${sample.priority}, scheduled for stage '${sample.stage}'.`,
        alternatives: "Convert to asynchronous checkpoint updates.",
        uncertainty: "Low.",
      });
    }
  }

  if (!ENV.enableLlm || !ENV.llmApiKey) {
    return {
      source: "rules",
      recommendations: recs,
      note: "Deterministic operational intelligence active. Set ENABLE_LLM=true & LLM_API_KEY for dynamic LLM reasoning.",
    };
  }

  // Optional LLM enrichment (OpenAI-compatible API)
  try {
    const prompt =
      `You are BUSSOLOGIC Operations Copilot. Analyze this operational workload and return recommendations.\n` +
      `Tasks: ${JSON.stringify(tasks.slice(0, 8))}\nWorkload: ${JSON.stringify(workload)}\nPredictions: ${JSON.stringify(predictions.slice(0, 5))}\n` +
      `Return valid JSON with key 'recommendations' containing a list of objects: ` +
      `[{'id': int, 'title': str, 'detail': str, 'type': 'capacity'|'risk'|'optimization', 'confidence': int, 'expectedBenefit': str, 'evidence': str, 'alternatives': str, 'uncertainty': str}]`;
    const response = await fetch(
      `${ENV.llmApiUrl.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ENV.llmApiKey}`,
        },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          model: ENV.llmModel,
          messages: [
            {
              role: "system",
              content:
                "You are BUSSOLOGIC, an enterprise operations intelligence system. Return JSON only.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
      }
    );
    if (response.ok) {
      const data = await response.json();
      const parsed = JSON.parse(data.choices[0].message.content);
      const enriched = (parsed.recommendations ?? recs).map(item => ({
        ...item,
        source: ENV.llmModel,
      }));
      return {
        source: ENV.llmModel,
        recommendations: enriched,
        note: `Enriched with ${ENV.llmModel} reasoning.`,
      };
    }
  } catch (error) {
    console.warn(
      `[recommendations] LLM call failed (${error.message}); using deterministic recommendations.`
    );
  }

  return {
    source: "rules",
    recommendations: recs,
    note: "Deterministic operational intelligence fallback used.",
  };
}
