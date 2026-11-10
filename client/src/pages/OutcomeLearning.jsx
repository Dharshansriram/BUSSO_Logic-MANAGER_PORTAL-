import React, { useState, useEffect } from "react";
import { api } from "../lib/api";

export default function OutcomeLearning() {
  const [data, setData] = useState({ outcomes: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);
  const [form, setForm] = useState({
    interventionType: "reassign_task",
    actionTaken: "accepted",
    predictedRiskDelta: 25.0,
    actualOutcomeObserved: "Completed milestone with zero delay",
    notes: ""
  });
  const [notice, setNotice] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getOutcomes();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRecord = async (e) => {
    e.preventDefault();
    try {
      await api.recordOutcome(form);
      setNotice("Outcome logged in historical learning registry.");
      setShowLogModal(false);
      loadData();
    } catch (err) {
      setNotice(`Error recording outcome: ${err.message}`);
    }
  };

  const summary = data.summary || {
    totalRecorded: 0,
    accepted: 0,
    rejected: 0,
    modified: 0,
    acceptanceRate: 0
  };

  return (
    <div>
      <div className="operations-heading">
        <div>
          <p className="eyebrow">MODULE H · CLOSED-LOOP DECISION TELEMETRY</p>
          <h1>Outcome Learning & Telemetry</h1>
          <p className="subtitle">
            Measure decision acceptance rates, compare predicted risk reduction with actual operational results, and monitor system value.
          </p>
        </div>
        <div className="operations-actions">
          <button className="primary-button" onClick={() => setShowLogModal(true)}>
            ＋ Log Actual Outcome
          </button>
        </div>
      </div>

      {notice && (
        <div className="success-banner">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <section className="ops-metrics">
        <div className="ops-metric">
          <span>Total Decisions Tracked</span>
          <b>{summary.totalRecorded}</b>
          <small>across recommendations & simulator</small>
        </div>

        <div className="ops-metric">
          <span>Intervention Acceptance Rate</span>
          <b className="green">{summary.acceptanceRate}%</b>
          <small>operator approved & implemented</small>
        </div>

        <div className="ops-metric">
          <span>Decisions Accepted</span>
          <b className="green">{summary.accepted}</b>
          <small>actions executed</small>
        </div>

        <div className="ops-metric">
          <span>Decisions Rejected/Modified</span>
          <b className="red">{summary.rejected + summary.modified}</b>
          <small>overridden by operator</small>
        </div>
      </section>

      {/* Outcomes Log Table */}
      <section className="ops-panel">
        <div className="ops-panel-header">
          <div>
            <h2>Recorded Intervention Log</h2>
            <p>Empirical evidence of system recommendations and observed delivery outcomes.</p>
          </div>
          <span className="model-badge">Active Monitoring</span>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
            Loading outcome history…
          </div>
        ) : data.outcomes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 20px", color: "#64748b" }}>
            <p>No interventions logged yet. Apply an action from the Decision Simulator or Recommendations console to begin tracking.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="outcome-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Intervention Strategy</th>
                  <th>Action Taken</th>
                  <th>Decision Maker</th>
                  <th>Predicted Risk Delta</th>
                  <th>Actual Outcome Observed</th>
                </tr>
              </thead>
              <tbody>
                {data.outcomes.map((o) => (
                  <tr key={o.id}>
                    <td style={{ color: "#64748b", fontSize: 12 }}>
                      {new Date(o.recordedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td>
                      <b>{o.interventionType}</b>
                    </td>
                    <td>
                      <span
                        className="load-pill"
                        style={{
                          background: o.actionTaken === "accepted" ? "#dcfce7" : "#fee2e2",
                          color: o.actionTaken === "accepted" ? "#166534" : "#991b1b"
                        }}
                      >
                        {o.actionTaken}
                      </span>
                    </td>
                    <td>{o.decisionMaker}</td>
                    <td>
                      <b style={{ color: "#16a34a" }}>↓ {o.predictedRiskDelta}%</b>
                    </td>
                    <td>{o.actualOutcomeObserved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Manual Entry Modal */}
      {showLogModal && (
        <div className="modal-backdrop" onClick={() => setShowLogModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowLogModal(false)}>×</button>
            <h2>Log Actual Operational Outcome</h2>
            <p>Record the observed business result of an intervention for audit and learning telemetry.</p>

            <form onSubmit={handleRecord}>
              <label className="form-label">
                Intervention Strategy
                <select
                  value={form.interventionType}
                  onChange={(e) => setForm({ ...form, interventionType: e.target.value })}
                >
                  <option value="reassign_task">Task Reassignment</option>
                  <option value="extend_deadline">Deadline Extension</option>
                  <option value="reduce_scope">Scope Reduction</option>
                </select>
              </label>

              <label className="form-label">
                Action Taken
                <select
                  value={form.actionTaken}
                  onChange={(e) => setForm({ ...form, actionTaken: e.target.value })}
                >
                  <option value="accepted">Accepted</option>
                  <option value="modified">Modified</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>

              <label className="form-label">
                Actual Outcome Observed
                <input
                  type="text"
                  value={form.actualOutcomeObserved}
                  onChange={(e) => setForm({ ...form, actualOutcomeObserved: e.target.value })}
                  required
                />
              </label>

              <label className="form-label">
                Notes
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  style={{ minHeight: 60 }}
                />
              </label>

              <button type="submit" className="primary-button full" style={{ marginTop: 14 }}>
                Save Outcome Record
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
