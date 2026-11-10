import React, { useState, useEffect } from "react";
import { api } from "../lib/api";

export default function AuditMonitor() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterAction, setFilterAction] = useState("all");

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await api.getAuditLogs();
      setLogs(res.logs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = logs.filter(log => {
    const matchesQuery = `${log.actorName} ${log.action} ${log.entityType} ${log.detail}`
      .toLowerCase()
      .includes(query.toLowerCase());
    const matchesAction = filterAction === "all" || log.action === filterAction;
    return matchesQuery && matchesAction;
  });

  return (
    <div>
      <div className="operations-heading">
        <div>
          <p className="eyebrow">MODULE I · ENTERPRISE COMPLIANCE & GOVERNANCE</p>
          <h1>Governance & Audit Monitor</h1>
          <p className="subtitle">
            Immutable traceability for every task update, schedule block, simulation run, and automated decision.
          </p>
        </div>
        <div className="operations-actions">
          <button className="secondary-button" onClick={loadLogs}>
            ⟳ Refresh Audit Trail
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: "flex", gap: 14, marginBottom: 20 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter audit logs by actor, action, or entity…"
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            fontSize: 13
          }}
        />
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            fontSize: 13
          }}
        >
          <option value="all">All Actions</option>
          <option value="updated">Updated</option>
          <option value="created">Created</option>
          <option value="simulated">Simulated</option>
          <option value="executed">Executed</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      <section className="ops-panel">
        <div className="ops-panel-header">
          <div>
            <h2>Audit History</h2>
            <p>Showing {filteredLogs.length} recorded events</p>
          </div>
          <span className="count-badge">{filteredLogs.length} total</span>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
            Loading audit records…
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
            No matching audit events found.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "180px 140px 1fr 180px",
                  alignItems: "center",
                  padding: "12px 16px",
                  borderBottom: "1px solid #f1f5f9",
                  fontSize: 13
                }}
              >
                <div>
                  <b style={{ color: "#0f172a" }}>{log.actorName}</b>
                  <small style={{ display: "block", color: "#94a3b8", fontSize: 11 }}>
                    Role: {log.actorRole}
                  </small>
                </div>

                <div>
                  <span
                    className="load-pill"
                    style={{
                      background: log.action === "simulated" ? "#ede9fe" : "#f1f5f9",
                      color: log.action === "simulated" ? "#6d28d9" : "#334155"
                    }}
                  >
                    {log.action}
                  </span>
                </div>

                <div>
                  <span style={{ color: "#334155" }}>{log.detail}</span>
                  <small style={{ display: "block", color: "#64748b", fontSize: 11 }}>
                    Entity: <code>{log.entityType}</code> {log.entityId ? `(#${log.entityId})` : ""}
                  </small>
                </div>

                <div style={{ textAlign: "right", color: "#64748b", fontSize: 12 }}>
                  {new Date(log.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
