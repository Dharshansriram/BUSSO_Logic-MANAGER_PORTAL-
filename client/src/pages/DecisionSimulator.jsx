import React, { useState, useEffect } from "react";
import { api } from "../lib/api";

export default function DecisionSimulator({ initialTaskId, onInterventionApplied }) {
  const [tasks, setTasks] = useState([]);
  const [people, setPeople] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(initialTaskId || 3);
  const [interventionType, setInterventionType] = useState("reassign_task");
  const [targetAssignee, setTargetAssignee] = useState("Noah Williams");
  const [adjustmentHours, setAdjustmentHours] = useState(48);
  const [notes, setNotes] = useState("");
  const [simulationResult, setSimulationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function init() {
      try {
        const [dashRes, peopleRes] = await Promise.all([
          api.getDashboard(),
          api.getPeople()
        ]);
        setTasks(dashRes.tasks || []);
        setPeople(peopleRes.employees || []);
        if (initialTaskId) {
          setSelectedTaskId(initialTaskId);
        } else if (dashRes.tasks && dashRes.tasks.length > 0) {
          setSelectedTaskId(dashRes.tasks[0].id);
        }
      } catch (err) {
        console.error("Simulator init error:", err);
      }
    }
    init();
  }, [initialTaskId]);

  const handleSimulate = async () => {
    setLoading(true);
    setNotice("");
    try {
      const res = await api.compareIntervention({
        interventionType,
        taskId: Number(selectedTaskId),
        targetAssignee,
        scheduleAdjustmentHours: Number(adjustmentHours),
        notes
      });
      setSimulationResult(res);
    } catch (err) {
      setNotice(`Simulation error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tasks.length > 0 && selectedTaskId) {
      handleSimulate();
    }
  }, [selectedTaskId, interventionType, targetAssignee]);

  const handleApply = async () => {
    if (!simulationResult) return;
    // Simulations never touch live data on their own: applying requires explicit confirmation.
    if (!window.confirm("Apply this intervention to LIVE data? This changes the real task and is recorded in the audit log.")) return;
    setApplying(true);
    try {
      await api.applySimulation({
        confirm: true,
        interventionType,
        taskId: Number(selectedTaskId),
        targetAssignee,
        scheduleAdjustmentHours: Number(adjustmentHours)
      });

      setNotice("Intervention applied successfully! Task updated, audited and recorded in Outcome Learning.");
      if (onInterventionApplied) onInterventionApplied();
    } catch (err) {
      setNotice(`Error applying intervention: ${err.message}`);
    } finally {
      setApplying(false);
    }
  };

  const currentTask = tasks.find(t => t.id === Number(selectedTaskId));

  return (
    <div className="simulator-container">
      <div className="operations-heading">
        <div>
          <p className="eyebrow">MODULE D · COUNTERFACTUAL WHAT-IF REASONING</p>
          <h1>Decision Simulator</h1>
          <p className="subtitle">
            Compare hypothetical interventions against live operations without modifying database state.
          </p>
        </div>
      </div>

      {notice && (
        <div className="success-banner">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}

      {/* Simulator Interactive Form */}
      <section className="simulator-controls">
        <h2 style={{ fontSize: 16, margin: "0 0 16px 0" }}>Configure Counterfactual Intervention</h2>
        <div className="form-grid">
          <label className="form-label">
            Target Deliverable
            <select
              value={selectedTaskId}
              onChange={(e) => setSelectedTaskId(Number(e.target.value))}
            >
              {tasks.map(t => (
                <option key={t.id} value={t.id}>
                  #{t.id} - {t.title} ({t.assignee}, {t.status})
                </option>
              ))}
            </select>
          </label>

          <label className="form-label">
            Intervention Strategy
            <select
              value={interventionType}
              onChange={(e) => setInterventionType(e.target.value)}
            >
              <option value="reassign_task">Reassign to Peer Team Member</option>
              <option value="extend_deadline">Extend Deadline Buffer</option>
              <option value="reduce_scope">Reduce Scope / Descope Non-Critical (40%)</option>
            </select>
          </label>
        </div>

        {interventionType === "reassign_task" && (
          <div className="form-grid" style={{ marginTop: 10 }}>
            <label className="form-label">
              Target Assignee
              <select
                value={targetAssignee}
                onChange={(e) => setTargetAssignee(e.target.value)}
              >
                {people
                  .filter(p => p.name !== currentTask?.assignee)
                  .map(p => (
                    <option key={p.id} value={p.name}>
                      {p.name} ({p.roleTitle} · {p.department})
                    </option>
                  ))}
              </select>
            </label>

            <div style={{ alignSelf: "center", paddingTop: 18, fontSize: 12, color: "#64748b" }}>
              Current owner: <b>{currentTask?.assignee || "Unknown"}</b>
            </div>
          </div>
        )}

        {interventionType === "extend_deadline" && (
          <div className="form-grid" style={{ marginTop: 10 }}>
            <label className="form-label">
              Buffer Extension Hours
              <input
                type="number"
                value={adjustmentHours}
                onChange={(e) => setAdjustmentHours(Number(e.target.value))}
                min={12}
                max={168}
              />
            </label>
          </div>
        )}

        <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
          <button
            className="primary-button"
            onClick={handleSimulate}
            disabled={loading}
          >
            {loading ? "Simulating…" : "⇄ Recalculate Simulation"}
          </button>
        </div>
      </section>

      {/* Side-by-Side Comparison */}
      {simulationResult && (
        <>
          <div className="sim-grid-compare">
            {/* Column A: Baseline */}
            <div className="sim-col baseline">
              <span className="sim-badge base">Baseline (Current Production)</span>
              <h2 style={{ fontSize: 18, margin: "0 0 16px 0", color: "#1e293b" }}>
                Status Quo
              </h2>

              <div className="sim-metric-row">
                <span className="sim-metric-label">Task Slip Risk Probability</span>
                <span className="sim-metric-val" style={{ color: simulationResult.baseline.riskProbability >= 55 ? "#ef4444" : "#10b981" }}>
                  {simulationResult.baseline.riskProbability}%
                </span>
              </div>

              <div className="sim-metric-row">
                <span className="sim-metric-label">Current Owner Utilization</span>
                <span className="sim-metric-val">
                  {simulationResult.baseline.sourceAssigneeUtilization}%
                </span>
              </div>

              <div className="sim-metric-row">
                <span className="sim-metric-label">Target Peer Utilization</span>
                <span className="sim-metric-val">
                  {simulationResult.baseline.targetAssigneeUtilization}%
                </span>
              </div>

              <div className="sim-metric-row">
                <span className="sim-metric-label">Total High-Risk Deliverables</span>
                <span className="sim-metric-val">
                  {simulationResult.baseline.highRiskTasksCount}
                </span>
              </div>

              <div className="sim-metric-row">
                <span className="sim-metric-label">Team Average Capacity</span>
                <span className="sim-metric-val">
                  {simulationResult.baseline.teamAverageUtilization}%
                </span>
              </div>

              <div style={{ marginTop: 14 }}>
                <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Active Drivers:</span>
                <div style={{ marginTop: 6 }}>
                  {simulationResult.baseline.drivers.map((d, i) => (
                    <span key={i} className="driver-tag">{d}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Column B: Proposed Intervention */}
            <div className="sim-col proposed">
              <span className="sim-badge prop">Proposed Counterfactual</span>
              <h2 style={{ fontSize: 18, margin: "0 0 16px 0", color: "#4338ca" }}>
                Projected Outcome
              </h2>

              <div className="sim-metric-row">
                <span className="sim-metric-label">Task Slip Risk Probability</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="sim-metric-val" style={{ color: "#10b981" }}>
                    {simulationResult.proposed.riskProbability}%
                  </span>
                  {simulationResult.delta.riskReduction > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#10b981" }}>
                      (↓ {simulationResult.delta.riskReduction}%)
                    </span>
                  )}
                </div>
              </div>

              <div className="sim-metric-row">
                <span className="sim-metric-label">Current Owner Utilization</span>
                <span className="sim-metric-val" style={{ color: "#10b981" }}>
                  {simulationResult.proposed.sourceAssigneeUtilization}%
                </span>
              </div>

              <div className="sim-metric-row">
                <span className="sim-metric-label">Target Peer Utilization</span>
                <span className="sim-metric-val" style={{ color: simulationResult.proposed.targetAssigneeUtilization > 85 ? "#f59e0b" : "#4338ca" }}>
                  {simulationResult.proposed.targetAssigneeUtilization}%
                </span>
              </div>

              <div className="sim-metric-row">
                <span className="sim-metric-label">Total High-Risk Deliverables</span>
                <span className="sim-metric-val" style={{ color: "#10b981" }}>
                  {simulationResult.proposed.highRiskTasksCount}
                </span>
              </div>

              <div className="sim-metric-row">
                <span className="sim-metric-label">Team Average Capacity</span>
                <span className="sim-metric-val">
                  {simulationResult.proposed.teamAverageUtilization}%
                </span>
              </div>

              <div style={{ marginTop: 14 }}>
                <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Projected Drivers:</span>
                <div style={{ marginTop: 6 }}>
                  {simulationResult.proposed.drivers.length > 0 ? (
                    simulationResult.proposed.drivers.map((d, i) => (
                      <span key={i} className="driver-tag neutral">{d}</span>
                    ))
                  ) : (
                    <span className="driver-tag neutral">All risk drivers mitigated</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Verdict and Trade-off Box */}
          <div className="sim-verdict-card">
            <h3>Decision Intelligence Verdict</h3>
            <p>{simulationResult.verdict}</p>

            <div style={{ marginTop: 14 }}>
              <b style={{ fontSize: 12, color: "#4c1d95" }}>Trade-off Analysis:</b>
              <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: 12, color: "#5b21b6" }}>
                {simulationResult.tradeOffs.map((to, i) => (
                  <li key={i}>{to}</li>
                ))}
              </ul>
            </div>

            <div style={{ marginTop: 20, display: "flex", gap: 14, alignItems: "center" }}>
              <button
                className="primary-button"
                onClick={handleApply}
                disabled={applying}
              >
                {applying ? "Executing Action…" : "✓ Approve & Apply Intervention"}
              </button>
              <span style={{ fontSize: 12, color: "#6b21a8" }}>
                Model Confidence: <b>{simulationResult.confidenceScore}%</b>
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
