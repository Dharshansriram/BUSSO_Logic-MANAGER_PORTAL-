import React, { useState } from "react";
import { api } from "../lib/api";

const PROMPT_CHIPS = [
  "Which tasks threaten our active milestones?",
  "Who is overloaded and who has free capacity?",
  "Simulate reassigning task #3 to Noah Williams",
  "Give me an executive operational health summary"
];

export default function Copilot({ onNavigateToSimulator }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hello! I am your BUSSOLOGIC Operations Copilot. I analyze live task signals, workforce capacity, and delivery risks to support data-grounded decisions. What would you like to investigate?"
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [actionNotice, setActionNotice] = useState("");

  const handleSend = async (questionText) => {
    const q = (questionText || input).trim();
    if (!q) return;

    const userMsg = { role: "user", text: q };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await api.askCopilot(q);
      const aiMsg = {
        role: "assistant",
        text: res.answer,
        dataReferences: res.dataReferences,
        proposedAction: res.proposedAction,
        requiresConfirmation: res.requiresConfirmation
      };
      setMessages(prev => [...prev, aiMsg]);
      if (res.proposedAction && res.requiresConfirmation) {
        setPendingAction(res.proposedAction);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: "assistant", text: `I encountered an error querying live operations: ${err.message}` }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    try {
      if (pendingAction.type === "reassign_task") {
        await api.updateTaskStatus(pendingAction.taskId, "in_progress");
      }
      setActionNotice(`Action executed: ${pendingAction.description || "Reassigned deliverable"}.`);
      setPendingAction(null);
    } catch (err) {
      setActionNotice(`Action failed: ${err.message}`);
    }
  };

  return (
    <div className="copilot-shell">
      <div className="operations-heading">
        <div>
          <p className="eyebrow">MODULE G · GROUNDED OPERATIONS COPILOT</p>
          <h1>BUSSOLOGIC Business Copilot</h1>
          <p className="subtitle">
            Context-aware AI copilot strictly grounded in actual database records with human-in-the-loop safety confirmation.
          </p>
        </div>
      </div>

      {actionNotice && (
        <div className="success-banner">
          {actionNotice}
          <button onClick={() => setActionNotice("")}>×</button>
        </div>
      )}

      {/* Quick Prompt Chips */}
      <div className="copilot-chips">
        {PROMPT_CHIPS.map((chip, idx) => (
          <button
            key={idx}
            className="copilot-chip"
            onClick={() => handleSend(chip)}
          >
            ✦ {chip}
          </button>
        ))}
      </div>

      {/* Chat Messages Feed */}
      <div className="copilot-feed">
        {messages.map((m, idx) => (
          <div key={idx} className={`copilot-msg ${m.role === "user" ? "user" : "ai"}`}>
            <div className={`copilot-avatar ${m.role === "user" ? "user" : "ai"}`}>
              {m.role === "user" ? "YOU" : "BL"}
            </div>
            <div className={`copilot-bubble ${m.role === "user" ? "user" : "ai"}`}>
              <div style={{ whiteSpace: "pre-line" }}>{m.text}</div>

              {/* Data References */}
              {m.dataReferences && m.dataReferences.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Citations:</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    {m.dataReferences.map((ref, i) => (
                      <span key={i} className="driver-tag neutral">
                        {ref.type}: #{ref.id} {ref.title || ref.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="copilot-msg ai">
            <div className="copilot-avatar ai">BL</div>
            <div className="copilot-bubble ai">
              <em>Analyzing workspace signals and synthesizing grounded answer…</em>
            </div>
          </div>
        )}
      </div>

      {/* Consequential Action Safety Prompt */}
      {pendingAction && (
        <div
          style={{
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 12,
            padding: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <div>
            <b style={{ color: "#92400e", fontSize: 13 }}>⚠️ Operational Action Requires Approval</b>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#b45309" }}>
              {pendingAction.description || `Reassign task #${pendingAction.taskId} to ${pendingAction.targetAssignee}`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="secondary-button"
              onClick={() => setPendingAction(null)}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              style={{ background: "#d97706" }}
              onClick={handleConfirmAction}
            >
              Confirm & Execute Action
            </button>
          </div>
        </div>
      )}

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="copilot-input-bar"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about delivery risks, team load, or what-if interventions…"
        />
        <button
          type="submit"
          className="primary-button"
          disabled={loading || !input.trim()}
        >
          Ask Copilot
        </button>
      </form>
    </div>
  );
}
