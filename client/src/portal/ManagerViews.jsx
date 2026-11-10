import React, { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

const wrap = { display: "grid", gap: 16 };
const row = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" };
const cell = { padding: "6px 10px", textAlign: "left", borderBottom: "1px solid rgba(128,128,128,.2)" };
const chip = { padding: "2px 8px", borderRadius: 10, border: "1px solid rgba(128,128,128,.4)", fontSize: 12 };
const fmt = d => (d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—");
const Err = ({ msg }) => (msg ? <div className="auth-error">{msg}</div> : null);
const Ok = ({ msg }) => (msg ? <div className="success-banner">{msg}</div> : null);

/** Parse "react:3, sql:4" -> [{skill, minLevel}] */
const parseSkillText = text =>
  text.split(",").map(s => s.trim()).filter(Boolean).map(part => {
    const [skill, level] = part.split(":");
    return { skill: skill.trim(), minLevel: Math.min(5, Math.max(1, parseInt(level, 10) || 3)) };
  });

// ----------------------------- Operations Overview -----------------------------
export function OperationsStrip() {
  const [m, setM] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api.managerOverview().then(setM).catch(e => setErr(e.message)); }, []);
  if (err) return <Err msg={err} />;
  if (!m) return null;
  const delta = m.completedLast7Days - m.completedPrev7Days;
  const cards = [
    ["Active projects", m.activeProjects], ["At-risk projects", m.atRiskProjects],
    ["Open tasks", m.openTasks], ["Overdue", m.overdueTasks], ["Blocked", m.blockedTasks],
    ["Unassigned", m.unassignedTasks], ["AI proposals awaiting approval", m.pendingProposals],
    ["Avg team utilization", `${m.avgUtilization}%`], ["Overloaded people", m.overloadedEmployees],
    ["Completed (7 days)", `${m.completedLast7Days} (${delta >= 0 ? "+" : ""}${delta} vs prior 7)`],
  ];
  return (
    <section className="metric-grid" style={{ marginBottom: 18 }}>
      {cards.map(([label, value]) => (
        <div className="metric-card" key={label}>
          <div className="metric-label">{label}</div>
          <div className="metric-value" style={{ fontSize: "1.6rem" }}>{value}</div>
        </div>
      ))}
    </section>
  );
}

// ------------------------- Projects: workflow + required skills -------------------------
const blankStage = () => ({ name: "", estimatedHours: 8, skills: "" });


export function ProjectWorkflow({ onNavigate }) {
  const [form, setForm] = useState({ name: "", description: "", dueAt: "", milestones: "", stages: [blankStage()] });
  const [data, setData] = useState({ projects: [], tasks: [] });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [created, setCreated] = useState(null);

  const load = useCallback(() => api.getDashboard().then(setData).catch(e => setErr(e.message)), []);

  useEffect(() => {
    load();
  }, [load]);

  const setStage = (i, patch) => setForm(f => ({
    ...f,
    stages: f.stages.map((s, j) => (j === i ? { ...s, ...patch } : s))
  }));

  const submit = async e => {
    e.preventDefault();
    setErr("");
    setMsg("");

    try {
      const res = await api.createManagedProject({
        name: form.name,
        description: form.description,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined,
        milestones: form.milestones.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
          const [name, due] = l.split("|").map(x => x.trim());
          return { name, dueAt: due ? new Date(due).toISOString() : undefined };
        }),
        stages: form.stages.filter(s => s.name.trim()).map(s => ({
          name: s.name,
          estimatedHours: Number(s.estimatedHours) || 8,
          requiredSkills: parseSkillText(s.skills),
        })),
      });

      setCreated(res.project);
      setMsg(`Created '${res.project.name}' with ${res.tasks.length} stages.`);
      setForm({ name: "", description: "", dueAt: "", milestones: "", stages: [blankStage()] });
      load();
    } catch (ex) {
      setErr(ex.message);
    }
  };

  const propose = async () => {
    try {
      const r = await api.generateProposals({ projectId: created.id });
      setMsg(`AI prepared ${r.proposals.length} proposal(s)${r.skipped.length ? `, ${r.skipped.length} skipped (no skills defined)` : ""}. Review them in Workforce & AI Allocation.`);
      onNavigate?.("Workforce");
    } catch (ex) {
      setErr(ex.message);
    }
  };

  return (
    <div className="project-workflow-page" style={{ display: "grid", gap: 24, minWidth: 0 }}>
      <form className="panel project-workflow-form" onSubmit={submit}>
        <div className="project-workflow-heading">
          <div>
            <span className="project-workflow-eyebrow">PROJECT SETUP</span>
            <h3>Create project workflow</h3>
            <p>Define the project, milestones, workflow stages, and skills required to deliver it.</p>
          </div>
          <div className="project-workflow-heading-icon" aria-hidden="true">✦</div>
        </div>

        <div className="project-workflow-section">
          <h4>Project details</h4>
          <div className="project-workflow-row">
            <label className="project-workflow-field project-workflow-field-grow">
              <span>Project name <i>*</i></span>
              <input
                required
                placeholder="e.g. Customer portal redesign"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </label>

            <label className="project-workflow-field project-workflow-date">
              <span>Project due date</span>
              <input
                type="date"
                value={form.dueAt}
                onChange={e => setForm({ ...form, dueAt: e.target.value })}
                title="Project due date"
              />
            </label>
          </div>

          <label className="project-workflow-field">
            <span>Description</span>
            <input
              placeholder="What does this project aim to accomplish?"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </label>

          <label className="project-workflow-field">
            <span>Milestones</span>
            <textarea
              rows={3}
              placeholder={"Enter one milestone per line: name | YYYY-MM-DD"}
              value={form.milestones}
              onChange={e => setForm({ ...form, milestones: e.target.value })}
            />
            <small>Optional. Add a milestone name and, if needed, its due date separated by |.</small>
          </label>
        </div>

        <div className="project-workflow-section">
          <div className="project-workflow-section-heading">
            <div>
              <h4>Workflow stages</h4>
              <p>Stages run in sequence. Define the estimated effort and skills needed for each stage.</p>
            </div>
            <span className="project-workflow-count">
              {form.stages.length} {form.stages.length === 1 ? "stage" : "stages"}
            </span>
          </div>

          <div className="project-workflow-stage-list">
            {form.stages.map((s, i) => (
              <div className="project-workflow-stage" key={i}>
                <div className="project-workflow-stage-number">{String(i + 1).padStart(2, "0")}</div>

                <div className="project-workflow-stage-fields">
                  <label className="project-workflow-field project-workflow-stage-name">
                    <span>Stage name</span>
                    <input
                      placeholder={`e.g. ${i === 0 ? "Planning" : `Stage ${i + 1}`}`}
                      value={s.name}
                      onChange={e => setStage(i, { name: e.target.value })}
                    />
                  </label>

                  <label className="project-workflow-field project-workflow-hours">
                    <span>Estimated hours</span>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={s.estimatedHours}
                      onChange={e => setStage(i, { estimatedHours: e.target.value })}
                      title="Estimated hours"
                    />
                  </label>

                  <label className="project-workflow-field project-workflow-skills">
                    <span>Required skills</span>
                    <input
                      placeholder="react:4, sql:3"
                      value={s.skills}
                      onChange={e => setStage(i, { skills: e.target.value })}
                    />
                  </label>
                </div>

                {form.stages.length > 1 && (
                  <button
                    type="button"
                    className="secondary-button project-workflow-remove"
                    onClick={() => setForm(f => ({
                      ...f,
                      stages: f.stages.filter((_, j) => j !== i)
                    }))}
                    aria-label={`Remove stage ${i + 1}`}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            className="secondary-button project-workflow-add"
            onClick={() => setForm(f => ({ ...f, stages: [...f.stages, blankStage()] }))}
          >
            <span aria-hidden="true">＋</span> Add workflow stage
          </button>
        </div>

        <div className="project-workflow-actions">
          <div className="project-workflow-action-hint">
            <span aria-hidden="true">ⓘ</span>
            Review your stages and required skills before creating the project.
          </div>

          <div className="project-workflow-action-buttons">
            <button type="submit" className="primary-button">
              Create project <span aria-hidden="true">→</span>
            </button>

            {created && (
              <button type="button" className="secondary-button" onClick={propose}>
                ✦ Ask AI to propose assignees
              </button>
            )}
          </div>
        </div>

        <Ok msg={msg} />
        <Err msg={err} />
      </form>

      <div className="panel project-workflow-list">
        <div className="project-workflow-heading">
          <div>
            <span className="project-workflow-eyebrow">PROJECT OVERVIEW</span>
            <h3>Projects, stages and required skills</h3>
            <p>Review project progress, milestones, task assignments, and skill requirements.</p>
          </div>
          <div className="project-workflow-heading-icon" aria-hidden="true">▤</div>
        </div>

        {data.projects.length === 0 ? (
          <div className="project-workflow-empty">
            <div className="project-workflow-empty-icon" aria-hidden="true">▧</div>
            <h4>No projects to display yet</h4>
            <p>Create a project workflow above to see its stages, required skills, and task progress here.</p>
          </div>
        ) : (
          <div className="project-workflow-projects">
            {data.projects.map(p => {
              const projectTasks = data.tasks.filter(t => t.projectId === p.id);
              const progress = Math.max(0, Math.min(100, Number(p.progress) || 0));

              return (
                <details className="project-workflow-item" key={p.id}>
                  <summary>
                    <div className="project-workflow-project-summary">
                      <div className="project-workflow-project-icon" aria-hidden="true">
                        {p.name?.slice(0, 1)?.toUpperCase() || "P"}
                      </div>

                      <div className="project-workflow-project-info">
                        <b>{p.name}</b>
                        <span>{projectTasks.length} {projectTasks.length === 1 ? "task" : "tasks"} · Due {fmt(p.dueAt)}</span>
                      </div>

                      <div className="project-workflow-project-status">
                        <span className={`project-workflow-status status-${String(p.status || "unknown").toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`}>
                          {p.status || "Unknown"}
                        </span>
                        <strong>{progress}%</strong>
                      </div>

                      <div className="project-workflow-progress" aria-label={`Project progress ${progress}%`}>
                        <span style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  </summary>

                  <div className="project-workflow-project-details">
                    {(p.milestones ?? []).length > 0 && (
                      <div className="project-workflow-milestones">
                        <h4>Milestones</h4>
                        <div className="project-workflow-milestone-list">
                          {p.milestones.map((m, i) => (
                            <div className="project-workflow-milestone" key={`${m.name}-${i}`}>
                              <span className="project-workflow-milestone-dot" />
                              <span>{m.name}</span>
                              <small>{fmt(m.dueAt)}</small>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="project-workflow-table-wrap">
                      <table className="project-workflow-table">
                        <thead>
                          <tr>
                            {["Stage / task", "Required skills", "Assignee", "Status", "Progress", "Due"].map(h => (
                              <th key={h}>{h}</th>
                            ))}
                          </tr>
                        </thead>

                        <tbody>
                          {projectTasks.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="project-workflow-no-tasks">
                                No tasks are currently listed for this project.
                              </td>
                            </tr>
                          ) : (
                            projectTasks.map(t => (
                              <tr key={t.id}>
                                <td>
                                  <b>{t.title}</b>
                                  {t.dependsOn?.length ? (
                                    <small className="project-workflow-dependency">
                                      After #{t.dependsOn.join(", #")}
                                    </small>
                                  ) : null}
                                </td>

                                <td>
                                  <div className="project-workflow-skill-list">
                                    {(t.requiredSkills ?? []).length > 0
                                      ? t.requiredSkills.map(r => (
                                        <span className="project-workflow-skill-chip" key={r.skill}>
                                          {r.skill} <b>≥{r.minLevel}</b>
                                        </span>
                                      ))
                                      : <span className="project-workflow-muted">No skills specified</span>}
                                  </div>
                                </td>

                                <td>{t.assignee || "Unassigned"}</td>

                                <td>
                                  <span className={`project-workflow-status status-${String(t.status || "unknown").toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`}>
                                    {t.status || "Unknown"}
                                  </span>
                                </td>

                                <td>
                                  <div className="project-workflow-task-progress">
                                    <div><span style={{ width: `${Math.max(0, Math.min(100, Number(t.progress) || 0))}%` }} /></div>
                                    <small>{t.progress ?? 0}%</small>
                                  </div>
                                </td>

                                <td>{fmt(t.dueAt)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


// ------------------------------ AI assignment queue ------------------------------

export function AssignmentQueue() {
  const [items, setItems] = useState([]);
  const [people, setPeople] = useState([]);
  const [pick, setPick] = useState({});
  const [note, setNote] = useState({});
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, ppl] = await Promise.all([
        api.getProposals(),
        api.getPeople(),
      ]);
      setItems(p.proposals);
      setPeople(ppl.employees);
    } catch (ex) {
      setErr(ex.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn) => {
    setErr("");
    setMsg("");

    try {
      await fn();
      await load();
    } catch (ex) {
      setErr(ex.message);
    }
  };

  const generate = () =>
    act(async () => {
      setBusy(true);

      try {
        const r = await api.generateProposals({});
        setMsg(
          `${r.proposals.length} new proposal(s)${
            r.skipped.length
              ? `; ${r.skipped.length} task(s) skipped (no required skills)`
              : ""
          }.`
        );
      } finally {
        setBusy(false);
      }
    });

  const pending = items.filter((i) => i.status === "proposed");
  const decided = items.filter((i) => i.status !== "proposed").slice(0, 10);
  const eligiblePeople = people.filter((e) => e.role !== "admin");
  const activeCandidateCount = pending.reduce(
    (total, proposal) =>
      total + proposal.candidates.filter((candidate) => candidate.eligible).length,
    0
  );

  return (
    <div className="allocation-page">
      <section className="allocation-hero">
        <div className="allocation-hero-content">
          <div className="allocation-eyebrow">
            <span className="allocation-eyebrow-dot" />
            WORKFORCE INTELLIGENCE
          </div>

          <h2>Workforce &amp; AI Allocation</h2>

          <p>
            Match the right people to the right tasks. Review AI recommendations,
            balance workloads, and approve assignments with confidence.
          </p>

          <div className="allocation-hero-meta">
            <span>
              <span className="allocation-meta-dot allocation-meta-green" />
              Human approval required
            </span>
            <span>
              <span className="allocation-meta-dot allocation-meta-blue" />
              Skill-based recommendations
            </span>
          </div>
        </div>

        <div className="allocation-hero-action">
          <div className="allocation-ai-icon">✦</div>
          <button
            className="allocation-generate-button"
            disabled={busy}
            onClick={generate}
          >
            {busy ? (
              <>
                <span className="allocation-spinner" />
                Generating proposals...
              </>
            ) : (
              <>
                <span>✦</span>
                Generate proposals
              </>
            )}
          </button>
          <span className="allocation-action-caption">
            For currently unassigned tasks
          </span>
        </div>
      </section>

      <div className="allocation-feedback">
        <Ok msg={msg} />
        <Err msg={err} />
      </div>

      <section className="allocation-metrics">
        <div className="allocation-metric-card">
          <div className="allocation-metric-top">
            <span className="allocation-metric-icon allocation-icon-purple">
              <icon-placeholder />
              ✦
            </span>
            <span className="allocation-metric-label">Awaiting review</span>
          </div>
          <div className="allocation-metric-value">{pending.length}</div>
          <div className="allocation-metric-foot">
            AI proposals pending approval
          </div>
        </div>

        <div className="allocation-metric-card">
          <div className="allocation-metric-top">
            <span className="allocation-metric-icon allocation-icon-blue">
              ◎
            </span>
            <span className="allocation-metric-label">Team available</span>
          </div>
          <div className="allocation-metric-value">{eligiblePeople.length}</div>
          <div className="allocation-metric-foot">
            Non-admin team members
          </div>
        </div>

        <div className="allocation-metric-card">
          <div className="allocation-metric-top">
            <span className="allocation-metric-icon allocation-icon-green">
              ✓
            </span>
            <span className="allocation-metric-label">Eligible matches</span>
          </div>
          <div className="allocation-metric-value">{activeCandidateCount}</div>
          <div className="allocation-metric-foot">
            Across pending proposals
          </div>
        </div>

        <div className="allocation-metric-card">
          <div className="allocation-metric-top">
            <span className="allocation-metric-icon allocation-icon-amber">
              ◷
            </span>
            <span className="allocation-metric-label">Recent decisions</span>
          </div>
          <div className="allocation-metric-value">{decided.length}</div>
          <div className="allocation-metric-foot">
            Latest recorded outcomes
          </div>
        </div>
      </section>

      <section className="allocation-section">
        <div className="allocation-section-heading">
          <div>
            <div className="allocation-section-kicker">REVIEW WORKSPACE</div>
            <h3>Assignment proposals</h3>
            <p>Evaluate skill compatibility and workload before assigning.</p>
          </div>

          <span className="allocation-count-badge">
            {pending.length} pending
          </span>
        </div>

        {pending.length === 0 ? (
          <div className="allocation-empty-state">
            <div className="allocation-empty-icon">✦</div>
            <h4>You're all caught up</h4>
            <p>
              There are no proposals waiting for review. Generate proposals
              after creating tasks with required skills.
            </p>
            <button
              className="allocation-empty-button"
              disabled={busy}
              onClick={generate}
            >
              {busy ? "Generating..." : "Generate new proposals"}
            </button>
          </div>
        ) : (
          <div className="allocation-proposal-list">
            {pending.map((p) => {
              const chosen = pick[p.id] ?? p.recommendedEmployeeId ?? "";
              const recommended = p.candidates.find(
                (candidate) =>
                  candidate.employeeId === p.recommendedEmployeeId
              );

              return (
                <article className="allocation-proposal-card" key={p.id}>
                  <div className="allocation-proposal-header">
                    <div className="allocation-task-symbol">▤</div>

                    <div className="allocation-task-heading">
                      <div className="allocation-task-overline">
                        TASK #{p.taskId}
                      </div>
                      <h4>{p.taskTitle}</h4>
                      <div className="allocation-skill-list">
                        {p.requiredSkills.map((r) => (
                          <span className="allocation-skill-chip" key={r.skill}>
                            {r.skill}
                            <span>LVL {r.minLevel}+</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="allocation-confidence">
                      <div className="allocation-confidence-label">
                        AI confidence
                      </div>
                      <div className="allocation-confidence-value">
                        {p.confidence}
                        <span>/100</span>
                      </div>
                      <div className="allocation-confidence-track">
                        <div
                          className="allocation-confidence-fill"
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(100, Number(p.confidence) || 0)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {p.reasoning.length > 0 && (
                    <div className="allocation-reasoning">
                      <div className="allocation-reasoning-title">
                        <span>✦</span> AI recommendation rationale
                      </div>
                      <ul>
                        {p.reasoning.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="allocation-candidate-heading">
                    <div>
                      <h5>Candidate comparison</h5>
                      <p>Compare suitability before confirming an assignment.</p>
                    </div>
                    <span>{p.candidates.length} candidates</span>
                  </div>

                  <div className="allocation-table-wrap">
                    <table className="allocation-candidate-table">
                      <thead>
                        <tr>
                          <th>Team member</th>
                          <th>Match score</th>
                          <th>Skill fit</th>
                          <th>Workload after</th>
                          <th>Eligibility</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.candidates.map((c) => (
                          <tr key={c.employeeId}>
                            <td>
                              <div className="allocation-candidate-name">
                                <span className="allocation-avatar">
                                  {(c.name || "?").trim().charAt(0).toUpperCase()}
                                </span>
                                <span>{c.name}</span>
                                {c.employeeId === p.recommendedEmployeeId && (
                                  <span className="allocation-ai-pick">
                                    AI pick
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <strong className="allocation-score">
                                {c.score}
                              </strong>
                            </td>
                            <td>
                              <div className="allocation-percent-cell">
                                <span>{c.skillFit}%</span>
                                <div className="allocation-mini-track">
                                  <div
                                    style={{
                                      width: `${Math.max(
                                        0,
                                        Math.min(100, Number(c.skillFit) || 0)
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="allocation-workload-value">
                                {c.utilizationAfter}%
                              </span>
                            </td>
                            <td>
                              <span
                                className={
                                  c.eligible
                                    ? "allocation-status allocation-status-eligible"
                                    : "allocation-status allocation-status-ineligible"
                                }
                              >
                                <span />
                                {c.eligible ? "Eligible" : "Not eligible"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="allocation-decision">
                    <div className="allocation-decision-heading">
                      <div>
                        <h5>Confirm assignment</h5>
                        <p>
                          {recommended
                            ? `AI recommends ${recommended.name}. You can choose another team member.`
                            : "Choose a team member to assign this task."}
                        </p>
                      </div>
                      <span className="allocation-human-review">
                        Human review
                      </span>
                    </div>

                    <div className="allocation-decision-controls">
                      <label className="allocation-field">
                        <span>Assign to</span>
                        <select
                          value={chosen}
                          onChange={(e) =>
                            setPick({
                              ...pick,
                              [p.id]: e.target.value === ""
                                ? ""
                                : Number(e.target.value),
                            })
                          }
                        >
                          <option value="" disabled>
                            Choose assignee...
                          </option>
                          {eligiblePeople.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name}
                              {e.id === p.recommendedEmployeeId
                                ? " (AI pick)"
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="allocation-field allocation-note-field">
                        <span>Decision note <small>Optional</small></span>
                        <input
                          placeholder="Add context for this decision..."
                          value={note[p.id] ?? ""}
                          onChange={(e) =>
                            setNote({ ...note, [p.id]: e.target.value })
                          }
                        />
                      </label>

                      <div className="allocation-decision-actions">
                        <button
                          className="allocation-approve-button"
                          disabled={!chosen}
                          onClick={() =>
                            act(() =>
                              api.approveProposal(p.id, {
                                employeeId: Number(chosen),
                                note: note[p.id],
                              })
                            )
                          }
                        >
                          <span>✓</span> Approve &amp; assign
                        </button>

                        <button
                          className="allocation-reject-button"
                          onClick={() =>
                            act(() =>
                              api.rejectProposal(p.id, {
                                note: note[p.id],
                              })
                            )
                          }
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {decided.length > 0 && (
        <section className="allocation-section allocation-history-section">
          <div className="allocation-section-heading">
            <div>
              <div className="allocation-section-kicker">ACTIVITY LOG</div>
              <h3>Recent decisions</h3>
              <p>Previously reviewed AI assignment proposals.</p>
            </div>
            <span className="allocation-count-badge">
              Latest {decided.length}
            </span>
          </div>

          <div className="allocation-history-list">
            {decided.map((d) => (
              <div className="allocation-history-row" key={d.id}>
                <div className="allocation-history-icon">
                  {d.status === "approved" || d.status === "assigned"
                    ? "✓"
                    : "↗"}
                </div>

                <div className="allocation-history-main">
                  <div className="allocation-history-task">
                    {d.taskTitle}
                  </div>
                  <div className="allocation-history-meta">
                    Task #{d.taskId}
                    <span>·</span>
                    Decided by {d.decidedBy || "Unknown"}
                    {d.override && (
                      <>
                        <span>·</span>
                        <span className="allocation-override-label">
                          Manual override
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <span
                  className={`allocation-history-status allocation-history-${String(
                    d.status
                  )
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "-")}`}
                >
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}


// ------------------------------- Daily progress -------------------------------
const localDay = iso => { const [y, m, d] = iso.split("-").map(Number); const from = new Date(y, m - 1, d); return [from.toISOString(), new Date(y, m - 1, d + 1).toISOString()]; };
const todayStr = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; };

export function DailyProgress() {
  const [day, setDay] = useState(todayStr()); const [d, setD] = useState(null); const [err, setErr] = useState("");
  const load = useCallback(() => { const [f, t] = localDay(day); api.dailyProgress(f, t).then(setD).catch(e => setErr(e.message)); }, [day]);
  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id); }, [load]);
  if (err) return <Err msg={err} />;
  if (!d) return <div className="panel">Loading…</div>;
  const maxDone = Math.max(1, ...d.trend.map(x => x.completed));
  return (
    <div style={wrap}>
      <div className="panel" style={row}>
        <h3 style={{ margin: 0 }}>Daily progress</h3>
        <input type="date" value={day} max={todayStr()} onChange={e => setDay(e.target.value)} />
        <span>{d.totals.tasksCompleted} tasks completed · {d.totals.hoursLogged}h logged · {d.totals.blockersRaised} blockers raised</span>
      </div>
      <div className="panel"><h3>By employee</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Employee", "Completed", "Hours", "Updates", "Open", "Blocked", "Working on"].map(h => <th key={h} style={cell}>{h}</th>)}</tr></thead>
          <tbody>{d.people.map(p => (
            <tr key={p.employeeId}><td style={cell}>{p.name}</td><td style={cell}>{p.tasksCompleted}</td><td style={cell}>{p.hoursLogged}</td><td style={cell}>{p.updates}</td><td style={cell}>{p.openTasks}</td><td style={cell}>{p.blockedNow}</td>
              <td style={cell}>{p.activeTasks.map(t => `${t.title} (${t.progress}%)`).join("; ") || "—"}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <div className="panel"><h3>By project</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Project", "Progress", "Completed today", "Hours", "Open", "Blocked", "Overdue"].map(h => <th key={h} style={cell}>{h}</th>)}</tr></thead>
          <tbody>{d.projects.map(p => (
            <tr key={p.projectId}><td style={cell}>{p.name}</td><td style={cell}>{p.progress}%</td><td style={cell}>{p.tasksCompleted}</td><td style={cell}>{p.hoursLogged}</td><td style={cell}>{p.openTasks}</td><td style={cell}>{p.blocked}</td><td style={cell}>{p.overdue}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <div className="panel"><h3>Last 7 days — tasks completed</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 90 }}>
          {d.trend.map(x => (
            <div key={x.day} style={{ textAlign: "center", flex: 1 }} title={`${x.completed} done, ${x.hoursLogged}h`}>
              <div style={{ height: 8 + (x.completed / maxDone) * 60, background: "currentColor", opacity: 0.55, borderRadius: 3 }} />
              <small>{x.completed}</small><br /><small>{fmt(x.day)}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="panel"><h3>Activity timeline</h3>
        {!d.timeline.length && <p>No employee updates for this day.</p>}
        {d.timeline.map(u => (
          <div key={u.id}>{new Date(u.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · <b>{u.employeeName}</b> → {u.taskTitle}: {u.status} ({u.progress}%){u.hoursLogged ? `, ${u.hoursLogged}h` : ""}{u.blocker ? ` · blocker: ${u.blocker}` : ""}{u.note ? ` · note: ${u.note}` : ""}</div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------- Alerts / team / feedback ----------------------------

export function AlertsPanel() {
  const [alerts, setAlerts] = useState([]);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    return api
      .getDashboard()
      .then((d) => setAlerts(d.alerts ?? []))
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resolveAlert = async (id) => {
    setErr("");

    try {
      await api.resolveAlert(id);
      await load();
    } catch (ex) {
      setErr(ex.message);
    }
  };

  return (
    <div className="panel team-alerts-panel">
      <div className="team-panel-heading">
        <div className="team-heading-icon">!</div>
        <div>
          <h3>Operational alerts</h3>
          <p>Review and resolve outstanding operational issues.</p>
        </div>
      </div>

      <div className="team-alerts-content">
        <Err msg={err} />

        {!alerts.length && (
          <div className="team-empty-state">
            <div>✓</div>
            <h4>All clear</h4>
            <p>No open alerts at the moment.</p>
          </div>
        )}

        {alerts.map((a) => (
          <div className="team-alert-item" key={a.id}>
            <span
              className={`team-alert-severity team-alert-${String(
                a.severity || "info"
              ).toLowerCase()}`}
            >
              {a.severity}
            </span>

            <div className="team-alert-details">
              <strong>{a.title}</strong>
              <p>{a.detail}</p>
              {a.projectName && <small>{a.projectName}</small>}
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() => resolveAlert(a.id)}
            >
              Resolve
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const blankEmp = {
  name: "",
  email: "",
  department: "",
  roleTitle: "",
  skills: "",
  capacityHours: 40,
  role: "employee",
};

export function TeamManager({ ctx } = {}) {
  const [people, setPeople] = useState([]);
  const [f, setF] = useState(blankEmp);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const isAdmin = ctx?.employee?.role === "admin";

  const inviteState = (p) =>
    p.status !== "pending"
      ? "Active"
      : new Date(p.inviteExpiresAt) < new Date()
        ? "Invite expired"
        : "Invite pending";

  const load = useCallback(() => {
    return api
      .getPeople()
      .then((d) => setPeople(d.employees))
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resend = async (p) => {
    setErr("");
    setMsg("");
    setResending(p.id);

    try {
      const r = await api.resendInvite(p.id);

      if (r.emailSent) {
        setMsg(`Invitation re-sent to ${p.email}.`);
      } else {
        setErr(
          `Invitation refreshed but email was not sent: ${r.emailError}`
        );
      }

      await load();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setResending(null);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);

    try {
      const r = await api.createEmployee({
        ...f,
        capacityHours: Number(f.capacityHours) || 40,
      });

      if (r.emailSent) {
        setMsg(
          `Invitation emailed to ${r.email}. The account is pending until they activate it.`
        );
      } else {
        setErr(
          `${f.name} was added as pending, but the email was not sent (${r.emailError}). Use "Resend invite" once email is configured.`
        );
      }

      setF({ ...blankEmp });
      await load();
    } catch (ex) {
      setErr(
        /already exists/i.test(ex.message)
          ? `An account for ${f.email} already exists.`
          : ex.message
      );
    } finally {
      setBusy(false);
    }
  };

  const getSkills = (p) =>
    p.skillLevels?.length
      ? p.skillLevels.map((s) => ({
          skill: s.skill,
          level: s.level,
        }))
      : String(p.skills ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((skill) => ({ skill, level: null }));

  const filteredPeople = people.filter((p) => {
    const query = search.trim().toLowerCase();
    const skills = getSkills(p);

    const matchesSearch =
      !query ||
      [
        p.name,
        p.email,
        p.department,
        p.roleTitle,
        p.role,
        p.availability,
      ].some((v) => String(v ?? "").toLowerCase().includes(query)) ||
      skills.some((s) => s.skill.toLowerCase().includes(query));

    const state = inviteState(p);

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && state === "Active") ||
      (statusFilter === "pending" && state === "Invite pending") ||
      (statusFilter === "expired" && state === "Invite expired");

    return matchesSearch && matchesStatus;
  });

  const activeCount = people.filter(
    (p) => inviteState(p) === "Active"
  ).length;

  const pendingCount = people.filter(
    (p) => inviteState(p) === "Invite pending"
  ).length;

  const expiredCount = people.filter(
    (p) => inviteState(p) === "Invite expired"
  ).length;

  return (
    <div className="team-workspace">
      <section className="team-hero">
        <div className="team-hero-copy">
          <div className="team-eyebrow">
            <span />
            PEOPLE &amp; CAPABILITY MANAGEMENT
          </div>

          <h2>Team &amp; Skills</h2>

          <p>
            Manage your people, understand team capabilities, and keep
            employee invitations and availability organized in one workspace.
          </p>

          <div className="team-hero-tags">
            <span>✓ Employee directory</span>
            <span>✓ Skill visibility</span>
            <span>✓ Invitation tracking</span>
          </div>
        </div>

        <div className="team-hero-visual">
          <div className="team-avatar-stack">
            {people.slice(0, 4).map((p, index) => (
              <span
                key={p.id}
                className={`team-stack-avatar team-stack-${index}`}
              >
                {(p.name || "?").trim().charAt(0).toUpperCase()}
              </span>
            ))}

            {people.length === 0 && (
              <>
                <span className="team-stack-avatar team-stack-0">T</span>
                <span className="team-stack-avatar team-stack-1">S</span>
                <span className="team-stack-avatar team-stack-2">D</span>
              </>
            )}
          </div>

          <div className="team-hero-visual-caption">
            <strong>{people.length}</strong>
            <span>team members</span>
          </div>

          <div className="team-hero-visual-spark">✦</div>
        </div>
      </section>

      {(msg || err) && (
        <div
          className={`team-feedback-message ${
            err ? "team-feedback-error" : "team-feedback-success"
          }`}
          role={err ? "alert" : "status"}
        >
          <span>{err ? "!" : "✓"}</span>
          <p>{err || msg}</p>
          <button
            type="button"
            onClick={() => {
              setErr("");
              setMsg("");
            }}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <section className="team-summary-grid">
        <div className="team-summary-card">
          <div className="team-summary-top">
            <span className="team-summary-icon team-summary-purple">♙</span>
            <span>Total members</span>
          </div>
          <strong>{people.length}</strong>
          <small>People in the directory</small>
        </div>

        <div className="team-summary-card">
          <div className="team-summary-top">
            <span className="team-summary-icon team-summary-green">✓</span>
            <span>Active accounts</span>
          </div>
          <strong>{activeCount}</strong>
          <small>Activated team members</small>
        </div>

        <div className="team-summary-card">
          <div className="team-summary-top">
            <span className="team-summary-icon team-summary-blue">✉</span>
            <span>Pending invitations</span>
          </div>
          <strong>{pendingCount}</strong>
          <small>Awaiting account activation</small>
        </div>

        <div className="team-summary-card">
          <div className="team-summary-top">
            <span className="team-summary-icon team-summary-amber">◷</span>
            <span>Expired invitations</span>
          </div>
          <strong>{expiredCount}</strong>
          <small>May need a new invitation</small>
        </div>
      </section>

      <section className="team-panel">
        <div className="team-panel-heading">
          <div className="team-heading-icon">＋</div>
          <div>
            <h3>Invite a team member</h3>
            <p>
              Create an employee profile and send an invitation to activate
              their account.
            </p>
          </div>
        </div>

        <form className="team-invite-form" onSubmit={submit}>
          <div className="team-form-grid">
            {[
              ["name", "Full name", "Enter full name", "text"],
              ["email", "Work email", "name@company.com", "email"],
              ["department", "Department", "e.g. Engineering", "text"],
              ["roleTitle", "Job title", "e.g. Software Engineer", "text"],
            ].map(([key, label, placeholder, type]) => (
              <label className="team-field" key={key}>
                <span>
                  {label} <i>*</i>
                </span>
                <input
                  required
                  type={type}
                  placeholder={placeholder}
                  value={f[key]}
                  onChange={(e) =>
                    setF({ ...f, [key]: e.target.value })
                  }
                />
              </label>
            ))}

            <label className="team-field team-field-wide">
              <span>
                Skills <i>*</i>
              </span>
              <input
                required
                placeholder="React, Python, Project Management..."
                value={f.skills}
                onChange={(e) =>
                  setF({ ...f, skills: e.target.value })
                }
              />
              <small>Enter skills separated by commas.</small>
            </label>

            <label className="team-field">
              <span>Weekly capacity</span>
              <div className="team-capacity-control">
                <input
                  type="number"
                  min="1"
                  max="80"
                  value={f.capacityHours}
                  onChange={(e) =>
                    setF({ ...f, capacityHours: e.target.value })
                  }
                />
                <span>hours / week</span>
              </div>
            </label>

            <label className="team-field">
              <span>Account role</span>
              <select
                value={f.role}
                onChange={(e) => setF({ ...f, role: e.target.value })}
              >
                <option value="employee">Employee</option>
                {isAdmin && <option value="manager">Manager</option>}
              </select>
            </label>
          </div>

          <div className="team-invite-footer">
            <div className="team-invite-note">
              <span>ⓘ</span>
              The employee account remains pending until activation.
            </div>

            <button
              type="submit"
              className="team-submit-button"
              disabled={busy}
            >
              {busy ? "Sending invitation..." : "✉ Add & send invitation"}
            </button>
          </div>
        </form>
      </section>

      <section className="team-directory-section">
        <div className="team-directory-heading">
          <div>
            <div className="team-section-eyebrow">WORKFORCE DIRECTORY</div>
            <h3>Team skills &amp; availability</h3>
            <p>
              Review employee details, skills, capacity, and account status.
            </p>
          </div>

          <span className="team-directory-count">
            {filteredPeople.length} of {people.length} members
          </span>
        </div>

        <div className="team-directory-toolbar">
          <label className="team-search-box">
            <span>⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people, departments, skills..."
              aria-label="Search team members"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </label>

          <label className="team-filter-control">
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All accounts</option>
              <option value="active">Active</option>
              <option value="pending">Invite pending</option>
              <option value="expired">Invite expired</option>
            </select>
          </label>
        </div>

        {filteredPeople.length === 0 ? (
          <div className="team-empty-state">
            <div>⌕</div>
            <h4>
              {people.length
                ? "No matching team members"
                : "No team members yet"}
            </h4>
            <p>
              {people.length
                ? "Try another search term or change the account status filter."
                : "Create an invitation above to start building your team directory."}
            </p>
            {people.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="team-directory-table-wrap">
            <table className="team-directory-table">
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Skills &amp; levels</th>
                  <th>Availability</th>
                  <th>Capacity</th>
                  <th>Account status</th>
                </tr>
              </thead>

              <tbody>
                {filteredPeople.map((p) => {
                  const skills = getSkills(p);
                  const state = inviteState(p);

                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="team-person-cell">
                          <span className="team-person-avatar">
                            {(p.name || "?").trim().charAt(0).toUpperCase()}
                          </span>
                          <div className="team-person-details">
                            <strong>{p.name}</strong>
                            <span>{p.email || "No email provided"}</span>
                            <small>
                              {p.roleTitle || p.role}
                              {p.department ? ` · ${p.department}` : ""}
                            </small>
                          </div>
                        </div>
                      </td>

                      <td>
                        {skills.length ? (
                          <div className="team-skill-badges">
                            {skills.slice(0, 4).map((skill, index) => (
                              <span
                                key={`${skill.skill}-${index}`}
                                className="team-skill-badge"
                              >
                                {skill.skill}
                                {skill.level != null && (
                                  <b>L{skill.level}</b>
                                )}
                              </span>
                            ))}
                            {skills.length > 4 && (
                              <span className="team-skill-overflow">
                                +{skills.length - 4}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="team-muted-value">
                            No skills listed
                          </span>
                        )}
                      </td>

                      <td>
                        <span className="team-availability-value">
                          <span />
                          {p.availability || "Not specified"}
                        </span>
                      </td>

                      <td>
                        <span className="team-capacity-value">
                          {p.capacityHours ?? "—"}
                          {p.capacityHours != null ? "h" : ""}
                        </span>
                        <small className="team-capacity-caption">
                          per week
                        </small>
                      </td>

                      <td>
                        <div className="team-account-cell">
                          <span
                            className={`team-account-status ${
                              state === "Active"
                                ? "team-account-active"
                                : state === "Invite expired"
                                  ? "team-account-expired"
                                  : "team-account-pending"
                            }`}
                          >
                            <span />
                            {state}
                          </span>

                          {p.status === "pending" && (
                            <button
                              type="button"
                              className="team-resend-button"
                              disabled={resending === p.id}
                              onClick={() => resend(p)}
                            >
                              {resending === p.id
                                ? "Sending..."
                                : "↻ Resend invite"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="team-directory-footer">
          <span>
            Showing {filteredPeople.length} team member
            {filteredPeople.length === 1 ? "" : "s"}
          </span>
          <span>Account status reflects the existing invitation state.</span>
        </div>
      </section>
    </div>
  );
}

export function FeedbackPanel() {
  const [people, setPeople] = useState([]);
  const [f, setF] = useState({
    employeeId: "",
    rating: 4,
    text: "",
  });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .getPeople()
      .then((d) =>
        setPeople(d.employees.filter((e) => e.role === "employee"))
      )
      .catch((e) => setErr(e.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");

    try {
      await api.giveFeedback({
        employeeId: Number(f.employeeId),
        rating: Number(f.rating),
        text: f.text,
      });

      setMsg("Feedback sent.");
      setF((previous) => ({
        ...previous,
        text: "",
      }));
    } catch (ex) {
      setErr(ex.message);
    }
  };

  return (
    <form className="panel" onSubmit={submit} style={wrap}>
      <div className="team-panel-heading">
        <div className="team-heading-icon">✦</div>
        <div>
          <h3>Give feedback</h3>
          <p>Share constructive feedback with a team member.</p>
        </div>
      </div>

      <div className="team-feedback-form">
        <label className="team-field">
          <span>Employee</span>
          <select
            required
            value={f.employeeId}
            onChange={(e) =>
              setF({ ...f, employeeId: e.target.value })
            }
          >
            <option value="">Select employee…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="team-field">
          <span>Rating</span>
          <select
            value={f.rating}
            onChange={(e) =>
              setF({ ...f, rating: e.target.value })
            }
          >
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} / 5
              </option>
            ))}
          </select>
        </label>

        <label className="team-field team-feedback-text-field">
          <span>Feedback message</span>
          <textarea
            required
            rows={4}
            placeholder="Write feedback visible to the employee..."
            value={f.text}
            onChange={(e) => setF({ ...f, text: e.target.value })}
          />
        </label>

        <button type="submit" className="team-submit-button">
          Send feedback
        </button>

        <Ok msg={msg} />
        <Err msg={err} />
      </div>
    </form>
  );
}
