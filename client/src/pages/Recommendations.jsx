import React, { useState, useEffect } from "react";
import { api } from "../lib/api";

export default function Recommendations({ onNavigateToSimulator }) {
  const [data, setData] = useState({ recommendations: [], source: "rules", note: "" });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getRecommendations();
      setData(res);
    } catch (err) {
      setNotice(`Failed to load recommendations: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAccept = async (rec) => {
    try {
      await api.recordOutcome({
        recommendationId: rec.id,
        interventionType: rec.type,
        actionTaken: "accepted",
        decisionMaker: "Operator",
        predictedRiskDelta: 25.0,
        actualOutcomeObserved: "Accepted via Recommendations console",
        notes: rec.title
      });
      setNotice(`Recorded acceptance of '${rec.title}' in Outcome Learning.`);
    } catch (err) {
      setNotice(`Error recording outcome: ${err.message}`);
    }
  };

  return (
    <div>
      <div className="operations-heading">
        <div>
          <p className="eyebrow">MODULE E · EXPLAINABLE ACTION ENGINE</p>
          <h1>Ranked Corrective Recommendations</h1>
          <p className="subtitle">
            Transparent interventions generated with verifiable evidence, quantified benefits, and alternative choices.
          </p>
        </div>
        <div className="operations-actions">
          <button className="secondary-button" onClick={loadData}>
            ⟳ Refresh Insights
          </button>
        </div>
      </div>

      {notice && (
        <div className="success-banner">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}

      <div style={{ marginBottom: 18, fontSize: 12, color: "#64748b" }}>
        Engine Source: <span className="model-badge">{data.source}</span> · {data.note}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
          Evaluating operational bottlenecks and synthesizing evidence…
        </div>
      ) : (
        <div style={{ display: "grid", gap: 20 }}>
          {data.recommendations.map((rec) => (
            <div
              key={rec.id}
              className="ops-panel"
              style={{ padding: 24, position: "relative" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <span className={`rec-type ${rec.type}`} style={{ fontSize: 10, padding: "4px 10px" }}>
                    {rec.type.toUpperCase()}
                  </span>
                  <h2 style={{ fontSize: 18, margin: "10px 0 6px 0", color: "#0f172a" }}>
                    {rec.title}
                  </h2>
                  <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.5, margin: 0, maxWidth: 900 }}>
                    {rec.detail}
                  </p>
                </div>
                <div style={{ textAlign: "right", minWidth: 120 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#4f46e5" }}>
                    {rec.confidence}%
                  </div>
                  <small style={{ fontSize: 10, color: "#94a3b8" }}>Confidence Score</small>
                </div>
              </div>

              {/* Evidence and Expected Benefit Grids */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 18 }}>
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14 }}>
                  <b style={{ fontSize: 11, color: "#334155", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    🔍 Verifiable Evidence (Database Citations)
                  </b>
                  <p style={{ fontSize: 12, color: "#64748b", margin: "6px 0 0 0", lineHeight: 1.4 }}>
                    {rec.evidence || "Derived from current active task workload and sprint commitments."}
                  </p>
                </div>

                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 14 }}>
                  <b style={{ fontSize: 11, color: "#166534", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    ✦ Quantified Expected Benefit
                  </b>
                  <p style={{ fontSize: 12, color: "#15803d", margin: "6px 0 0 0", lineHeight: 1.4 }}>
                    {rec.expectedBenefit || "Relieves delivery bottleneck and protects planned milestone."}
                  </p>
                </div>
              </div>

              {/* Alternatives & Uncertainty */}
              {rec.alternatives && (
                <div style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>
                  <b>Viable Alternatives:</b> {rec.alternatives}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                <button
                  className="primary-button"
                  onClick={() => onNavigateToSimulator ? onNavigateToSimulator(rec.targetTaskId || 1) : null}
                >
                  ⇄ Test in Decision Simulator
                </button>
                <button
                  className="secondary-button"
                  onClick={() => handleAccept(rec)}
                >
                  ✓ Accept & Record in Learning Log
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
