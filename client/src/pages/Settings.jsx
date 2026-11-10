import React, { useState, useEffect } from "react";

export default function Settings({ currentUser }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/health")
      .then(res => res.json())
      .then(data => setHealth(data))
      .catch(err => setHealth({ status: "offline", error: err.message }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="operations-heading">
        <div>
          <p className="eyebrow">SYSTEM GOVERNANCE</p>
          <h1>Platform Settings & Intelligence Setup</h1>
          <p className="subtitle">
            BUSSOLOGIC system runtime, engine configurations, and workspace connection telemetry.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gap: 20 }}>
        {/* Connection & Architecture Card */}
        <section className="ops-panel">
          <div className="ops-panel-header">
            <div>
              <h2>Backend Engine Status</h2>
              <p>FastAPI async operations kernel connection</p>
            </div>
            <span
              className="model-badge"
              style={{
                background: health?.status === "healthy" ? "#dcfce7" : "#fee2e2",
                color: health?.status === "healthy" ? "#166534" : "#991b1b"
              }}
            >
              {health?.status || "Checking…"}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div className="sim-metric-row">
                <span className="sim-metric-label">Platform Core</span>
                <span className="sim-metric-val">BUSSOLOGIC v1.0.0</span>
              </div>
              <div className="sim-metric-row">
                <span className="sim-metric-label">API Gateway</span>
                <span className="sim-metric-val">FastAPI (Python 3.15 async)</span>
              </div>
              <div className="sim-metric-row">
                <span className="sim-metric-label">Frontend Server</span>
                <span className="sim-metric-val">Vite React (Port 5173)</span>
              </div>
              <div className="sim-metric-row">
                <span className="sim-metric-label">Persistence Layer</span>
                <span className="sim-metric-val">MongoDB / In-Memory Fallback</span>
              </div>
            </div>

            <div>
              <div className="sim-metric-row">
                <span className="sim-metric-label">Predictive Engine</span>
                <span className="sim-metric-val">Scikit-Learn Logistic ML + Rules</span>
              </div>
              <div className="sim-metric-row">
                <span className="sim-metric-label">Decision Simulator</span>
                <span className="sim-metric-val">Active Counterfactual Engine</span>
              </div>
              <div className="sim-metric-row">
                <span className="sim-metric-label">Real-Time Sync</span>
                <span className="sim-metric-val">Server-Sent Events (SSE)</span>
              </div>
              <div className="sim-metric-row">
                <span className="sim-metric-label">Audit Engine</span>
                <span className="sim-metric-val">Active Governance Log</span>
              </div>
            </div>
          </div>
        </section>

        {/* User Session */}
        <section className="ops-panel">
          <div className="ops-panel-header">
            <div>
              <h2>Current Operator Profile</h2>
              <p>Active authenticated workspace identity</p>
            </div>
            <span className="model-badge">{currentUser?.role || "employee"}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="sim-metric-row">
              <span className="sim-metric-label">Name</span>
              <span className="sim-metric-val">{currentUser?.name || "Maya Chen"}</span>
            </div>
            <div className="sim-metric-row">
              <span className="sim-metric-label">Email</span>
              <span className="sim-metric-val">{currentUser?.email || "maya@acme.test"}</span>
            </div>
            <div className="sim-metric-row">
              <span className="sim-metric-label">Department</span>
              <span className="sim-metric-val">{currentUser?.department || "Customer Success"}</span>
            </div>
            <div className="sim-metric-row">
              <span className="sim-metric-label">Role Title</span>
              <span className="sim-metric-val">{currentUser?.roleTitle || "Implementation Lead"}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
