import React, { useState, useEffect } from "react";
import { api } from "../lib/api";


export default function WorkflowBuilder() {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [currentWorkflow, setCurrentWorkflow] = useState({
    name: "Customer Onboarding Streamlined",
    trigger: "contract_signed",
    stages: [
      "Intake & approval",
      "Document verification",
      "Technical kickoff",
      "Final confirmation"
    ],
    description: "Standard workflow blueprint"
  });
  const [savedWorkflows, setSavedWorkflows] = useState([]);
  const [notice, setNotice] = useState("");
  const [newStage, setNewStage] = useState("");

  const loadWorkflows = async () => {
    try {
      const res = await api.getWorkflows();
      setSavedWorkflows(res.workflows || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadWorkflows();
  }, []);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setGenerating(true);
    setNotice("");

    try {
      const res = await api.generateWorkflow(prompt);

      setCurrentWorkflow({
        name: res.name,
        trigger: "event_triggered",
        stages: res.stages,
        description: res.note
      });

      setNotice(`Blueprint '${res.name}' synthesized successfully.`);
    } catch (err) {
      setNotice(`Generation error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    setNotice("");

    try {
      await api.createWorkflow(currentWorkflow);
      setNotice(`Workflow '${currentWorkflow.name}' published and active.`);
      await loadWorkflows();
    } catch (err) {
      setNotice(`Save error: ${err.message}`);
    }
  };

  const handleExecute = async (id) => {
    setNotice("");

    try {
      const res = await api.executeWorkflow(id);
      setNotice(`Executed workflow #${id} (${res.name}) successfully.`);
    } catch (err) {
      setNotice(`Execution error: ${err.message}`);
    }
  };

  const handleAddStage = () => {
    if (!newStage.trim()) return;

    setCurrentWorkflow((prev) => ({
      ...prev,
      stages: [...prev.stages, newStage.trim()]
    }));

    setNewStage("");
  };

  const handleRemoveStage = (index) => {
    setCurrentWorkflow((prev) => ({
      ...prev,
      stages: prev.stages.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="workflow-studio">
      <div className="operations-heading workflow-studio-heading">
        <div>
          <p className="eyebrow">
            MODULE F · AUTOMATED WORKFLOW ORCHESTRATION
          </p>
          <h1>Workflow Builder &amp; Blueprint Studio</h1>
          <p className="subtitle">
            Design repeatable business processes, orchestrate multi-stage
            workflows, and prepare operational pipelines for execution.
          </p>
        </div>

        <div className="workflow-heading-badge">
          <span className="workflow-live-dot" />
          Workflow studio
        </div>
      </div>

      {notice && (
        <div
          className={`workflow-notice ${
            /error/i.test(notice) ? "workflow-notice-error" : ""
          }`}
          role="status"
        >
          <span className="workflow-notice-icon">
            {/error/i.test(notice) ? "!" : "✓"}
          </span>
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}

      <section className="ops-panel workflow-ai-panel">
        <div className="workflow-ai-heading">
          <div className="workflow-ai-icon">✦</div>

          <div className="workflow-ai-title">
            <p className="workflow-section-kicker">AI-POWERED DESIGN</p>
            <h2>Workflow Blueprint Synthesizer</h2>
            <p>
              Describe a business process and generate a workflow blueprint
              to refine before publishing.
            </p>
          </div>

          <span className="workflow-model-badge">
            <span className="workflow-live-dot" />
            AI Assistant
          </span>
        </div>

        <form onSubmit={handleGenerate} className="workflow-prompt-form">
          <label className="workflow-field-label" htmlFor="workflow-prompt">
            Describe your workflow
          </label>

          <textarea
            id="workflow-prompt"
            className="workflow-prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Example: Create a supplier onboarding workflow with compliance verification, legal approval, and a final activation step…"
            rows={4}
          />

          <div className="workflow-prompt-footer">
            <span className="workflow-prompt-hint">
              Be specific about the process, approvals, and expected outcome.
            </span>

            <button
              type="submit"
              className="primary-button workflow-generate-button"
              disabled={generating || !prompt.trim()}
            >
              {generating ? (
                <>
                  <span className="workflow-button-spinner" />
                  Generating blueprint…
                </>
              ) : (
                <>✦ Generate blueprint <span aria-hidden="true">→</span></>
              )}
            </button>
          </div>
        </form>

        <div className="workflow-prompt-examples">
          <span>Try an idea</span>
          {[
            "Employee onboarding",
            "Supplier approval",
            "Project risk escalation"
          ].map((example) => (
            <button
              type="button"
              key={example}
              onClick={() => setPrompt(example)}
            >
              {example}
            </button>
          ))}
        </div>
      </section>

      <section className="ops-panel workflow-builder-panel">
        <div className="workflow-panel-heading">
          <div>
            <p className="workflow-section-kicker">BLUEPRINT CONFIGURATION</p>
            <h2>Visual workflow designer</h2>
            <p>
              Configure the workflow details and arrange the stages in
              execution order.
            </p>
          </div>

          <button
            type="button"
            className="primary-button workflow-publish-button"
            onClick={handleSave}
            disabled={!currentWorkflow.name.trim()}
          >
            <span aria-hidden="true">✓</span> Save &amp; Publish
          </button>
        </div>

        <div className="workflow-config-grid">
          <label className="form-label workflow-form-field">
            Workflow title
            <input
              type="text"
              value={currentWorkflow.name}
              onChange={(e) =>
                setCurrentWorkflow({
                  ...currentWorkflow,
                  name: e.target.value
                })
              }
              placeholder="Enter workflow title"
            />
          </label>

          <label className="form-label workflow-form-field">
            Execution trigger
            <select
              value={currentWorkflow.trigger}
              onChange={(e) =>
                setCurrentWorkflow({
                  ...currentWorkflow,
                  trigger: e.target.value
                })
              }
            >
              <option value="contract_signed">
                Contract Signed (Webhook)
              </option>
              <option value="risk_threshold_high">
                Delivery Risk ≥ 70% (Automated Escalation)
              </option>
              <option value="schedule_sprint_start">
                Sprint Checkpoint Kickoff (Scheduled)
              </option>
              <option value="manual_dispatch">
                Manual Manager Dispatch
              </option>
              <option value="event_triggered">
                Event Triggered
              </option>
            </select>
          </label>
        </div>

        <div className="workflow-canvas-heading">
          <div>
            <h3>Execution sequence</h3>
            <p>Stages run in the order shown below.</p>
          </div>

          <span className="workflow-stage-count">
            {currentWorkflow.stages.length}{" "}
            {currentWorkflow.stages.length === 1 ? "stage" : "stages"}
          </span>
        </div>

        <div className="workflow-canvas">
          {currentWorkflow.stages.length === 0 ? (
            <div className="workflow-empty-canvas">
              <span>＋</span>
              <strong>Your workflow has no stages yet</strong>
              <p>Add a stage below to begin building the execution sequence.</p>
            </div>
          ) : (
            <div className="workflow-stage-list">
              {currentWorkflow.stages.map((stage, idx) => (
                <React.Fragment key={`${idx}-${stage}`}>
                  <article className="workflow-stage-card">
                    <div className="workflow-stage-number">
                      {String(idx + 1).padStart(2, "0")}
                    </div>

                    <div className="workflow-stage-content">
                      <span className="workflow-stage-eyebrow">
                        WORKFLOW STAGE {String(idx + 1).padStart(2, "0")}
                      </span>
                      <strong>{stage}</strong>
                      <span className="workflow-stage-subtitle">
                        Execution step
                      </span>
                    </div>

                    <span className="workflow-stage-check" aria-hidden="true">
                      ✓
                    </span>

                    <button
                      type="button"
                      className="workflow-stage-remove"
                      onClick={() => handleRemoveStage(idx)}
                      title={`Remove ${stage}`}
                      aria-label={`Remove stage ${stage}`}
                    >
                      ×
                    </button>
                  </article>

                  {idx < currentWorkflow.stages.length - 1 && (
                    <div className="workflow-stage-connector" aria-hidden="true">
                      <span />
                      <span className="workflow-connector-arrow">↓</span>
                      <span />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        <form
          className="workflow-add-stage-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleAddStage();
          }}
        >
          <label
            className="form-label workflow-form-field"
            htmlFor="workflow-new-stage"
          >
            Add another stage
            <input
              id="workflow-new-stage"
              type="text"
              placeholder="e.g. Quality assurance review"
              value={newStage}
              onChange={(e) => setNewStage(e.target.value)}
            />
          </label>

          <button
            type="submit"
            className="secondary-button workflow-add-stage-button"
            disabled={!newStage.trim()}
          >
            ＋ Add stage
          </button>
        </form>
      </section>

      <section className="ops-panel workflow-published-panel">
        <div className="workflow-panel-heading">
          <div>
            <p className="workflow-section-kicker">WORKFLOW LIBRARY</p>
            <h2>Published workflows</h2>
            <p>
              Review saved workflows and run a test execution when needed.
            </p>
          </div>

          <span className="workflow-library-count">
            {savedWorkflows.length}{" "}
            {savedWorkflows.length === 1 ? "workflow" : "workflows"}
          </span>
        </div>

        {savedWorkflows.length === 0 ? (
          <div className="workflow-library-empty">
            <div className="workflow-library-empty-icon">▤</div>
            <strong>No published workflows yet</strong>
            <p>
              Save your configured blueprint to make it available in this
              library.
            </p>
          </div>
        ) : (
          <div className="workflow-library-list">
            {savedWorkflows.map((wf) => (
              <article key={wf.id} className="workflow-library-card">
                <div className="workflow-library-symbol">↗</div>

                <div className="workflow-library-details">
                  <div className="workflow-library-title-row">
                    <h3>{wf.name}</h3>
                    <span className="workflow-published-badge">
                      <span className="workflow-live-dot" />
                      Published
                    </span>
                  </div>

                  <p className="workflow-library-trigger">
                    Trigger <code>{wf.trigger}</code>
                  </p>

                  <div className="workflow-library-stages">
                    <span className="workflow-library-stage-count">
                      {wf.stages?.length || 0} stages
                    </span>

                    {wf.stages?.length > 0 && (
                      <span className="workflow-library-stage-preview">
                        {wf.stages.join(" → ")}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  className="secondary-button workflow-test-button"
                  onClick={() => handleExecute(wf.id)}
                >
                  <span aria-hidden="true">▶</span> Test run
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

