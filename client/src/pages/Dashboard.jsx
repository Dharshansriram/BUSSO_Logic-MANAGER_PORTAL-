import React, { useMemo } from "react";

const statusLabels = { todo: "To do", in_progress: "In progress", done: "Done", blocked: "Blocked" };

const formatAge = (value) => {
  if (!value) return "Just now";
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
};

export default function Dashboard({
  data,
  employee,
  onNavigate,
  onUpdateTask,
  onResolveAlert,
  onSelectTask,
  onSimulateRecommendation
}) {
  const dashboard = data || { projects: [], tasks: [], alerts: [], recommendations: [], activity: [] };

  const metrics = useMemo(() => {
    const active = dashboard.projects.filter(p => p.status !== "completed").length;
    const pending = dashboard.tasks.filter(t => t.status !== "done").length;
    const atRisk = dashboard.alerts.length;
    const avgProgress = dashboard.projects.length
      ? Math.round(dashboard.projects.reduce((sum, p) => sum + (p.progress || 0), 0) / dashboard.projects.length)
      : 72;
    return { active, pending, atRisk, avgProgress };
  }, [dashboard]);

  return (
    <div>
      <header className="topbar">
        <div>
          <p className="eyebrow">BUSSOLOGIC PLATFORM OVERVIEW</p>
          <h1>Welcome back, {employee?.name ? employee.name.split(" ")[0] : "Operator"}</h1>
          <p className="subtitle">Real-time operational health, early delay detection, and automated decisions.</p>
        </div>
        <div className="top-actions">
          <button className="secondary-button" onClick={() => onNavigate("DecisionSimulator")}>
            ⇄ Run Scenario
          </button>
          <button className="primary-button" onClick={() => onNavigate("WorkflowBuilder")}>
            ＋ New Workflow
          </button>
        </div>
      </header>

      {/* Metric Cards */}
      <section className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Active Workflows <span>⋮</span></div>
          <div className="metric-value">{metrics.active}</div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Pending Deliverables <span>⋮</span></div>
          <div className="metric-value">{metrics.pending}</div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Overall Progress <span>⋮</span></div>
          <div className="metric-value">
            {metrics.avgProgress}%
            <span className="mini-ring" style={{ background: `conic-gradient(#4f46e5 ${metrics.avgProgress * 3.6}deg, #e2e8f0 0)` }} />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Predicted At-Risk <span>!</span></div>
          <div className="metric-value" style={{ color: metrics.atRisk > 0 ? "#dc2626" : "#10b981" }}>
            {metrics.atRisk}
          </div>
        </div>
      </section>

      {/* Projects and Alerts */}
      <section className="content-grid">
        <div className="panel projects-panel">
          <div className="panel-header">
            <div>
              <h2>Projects at a Glance</h2>
              <p>Delivery progress across key operational streams</p>
            </div>
            <button className="text-button" onClick={() => onNavigate("Projects")}>
              View all ({dashboard.projects.length}) →
            </button>
          </div>
          <div className="project-list">
            {dashboard.projects.map(project => (
              <div className="project-row" key={project.id}>
                <div className={`project-icon ${project.status}`}>
                  {project.name.slice(0, 1)}
                </div>
                <div className="project-info">
                  <div className="project-title">
                    <b>{project.name}</b>
                    <span className={`pill ${project.status}`}>
                      {project.status === "at_risk" ? "At risk" : "On track"}
                    </span>
                  </div>
                  <p>{project.ownerName} · Due {new Date(project.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
                  <div className="progress-track">
                    <span style={{ width: `${project.progress}%` }} />
                  </div>
                </div>
                <strong className="progress-value">{project.progress}%</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="panel alerts-panel">
          <div className="panel-header">
            <div>
              <h2>Early Warning Radar</h2>
              <p>Predictive operational anomalies</p>
            </div>
            <span className="count-badge">{dashboard.alerts.length} active</span>
          </div>
          {dashboard.alerts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 10px", color: "#64748b", fontSize: 13 }}>
              ✓ All delivery streams clear. No active alerts.
            </div>
          ) : (
            dashboard.alerts.map(alert => (
              <div className={`alert-card ${alert.severity}`} key={alert.id}>
                <div className="alert-symbol">{alert.severity === "critical" ? "!" : "⌁"}</div>
                <div>
                  <b>{alert.title}</b>
                  <p>{alert.detail}</p>
                  <small>{alert.projectName} · {formatAge(alert.createdAt)}</small>
                </div>
                <button
                  className="dismiss"
                  onClick={() => onResolveAlert(alert.id)}
                  title="Acknowledge and dismiss"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Focus Tasks and AI Recommendations */}
      <section className="lower-grid">
        <div className="panel tasks-panel">
          <div className="panel-header">
            <div>
              <h2>Operational Focus Tasks</h2>
              <p>Prioritized items requiring checkpoint updates</p>
            </div>
            <button className="text-button" onClick={() => onNavigate("Tasks")}>
              Open Task Board →
            </button>
          </div>
          <div className="task-table">
            <div className="task-head">
              <span>Task</span>
              <span>Owner</span>
              <span>Priority</span>
              <span>Status</span>
            </div>
            {dashboard.tasks.map(task => (
              <div className="task-row" key={task.id}>
                <div className="task-name" onClick={() => onSelectTask(task)}>
                  <span
                    className={`task-check ${task.status}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateTask(task.id, task.status === "done" ? "todo" : "done");
                    }}
                  >
                    {task.status === "done" ? "✓" : ""}
                  </span>
                  <div>
                    <b>{task.title}</b>
                    <small>{task.stage} · #{task.id}</small>
                  </div>
                </div>
                <span>{task.assignee}</span>
                <span className={`priority ${task.priority}`}>{task.priority}</span>
                <select
                  value={task.status}
                  onChange={(e) => onUpdateTask(task.id, e.target.value)}
                >
                  {Object.entries(statusLabels).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="panel ai-panel">
          <div className="ai-heading">
            <div className="brand-mark" style={{ width: 28, height: 28, fontSize: 11 }}>✦</div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#4f46e5", letterSpacing: 1.2 }}>
                BUSSOLOGIC INTELLIGENCE ENGINE
              </div>
              <h2 style={{ fontSize: 15, margin: "2px 0 0" }}>Actionable Decision Support</h2>
            </div>
          </div>

          <p style={{ fontSize: 12, color: "#64748b", margin: "8px 0 14px", lineHeight: 1.4 }}>
            Evidence synthesized from historical capacity, dependency blockages, and logistic regression signals.
          </p>

          {dashboard.recommendations.slice(0, 2).map((item, idx) => (
            <div className="recommendation" key={item.id || idx}>
              <div className="recommendation-top">
                <span className={`rec-type ${item.type || "risk"}`}>{item.type || "optimization"}</span>
                <span>{item.source || "rules"} · {item.confidence}% confidence</span>
              </div>
              <b>{item.title}</b>
              <p>{item.detail}</p>
              {item.expectedBenefit && (
                <div style={{ fontSize: 10, color: "#4338ca", margin: "4px 0 8px", fontWeight: 500 }}>
                  ✦ {item.expectedBenefit}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button
                  className="secondary-button"
                  style={{ fontSize: 11, padding: "5px 10px" }}
                  onClick={() => onSimulateRecommendation ? onSimulateRecommendation(item) : onNavigate("DecisionSimulator")}
                >
                  ⇄ Test in Simulator
                </button>
                <button
                  className="primary-button"
                  style={{ fontSize: 11, padding: "5px 10px" }}
                  onClick={() => onNavigate("Recommendations")}
                >
                  View Evidence
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Activity Log Stream */}
      <section className="panel activity-panel">
        <div className="panel-header">
          <div>
            <h2>Real-Time Workspace Activity</h2>
            <p>Traceable events emitted across the operations control plane</p>
          </div>
          <button className="text-button" onClick={() => onNavigate("AuditMonitor")}>
            Full Audit Log →
          </button>
        </div>
        <div className="activity-list">
          {dashboard.activity.map((item) => (
            <div className="activity-item" key={item.id}>
              <div className="activity-avatar">
                {item.actor === "AI assistant" ? "✦" : item.actor.split(" ").map(p => p[0]).join("")}
              </div>
              <p>
                <b>{item.actor}</b> {item.action} <strong>{item.entity}</strong>
                <small>{formatAge(item.createdAt)}</small>
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
