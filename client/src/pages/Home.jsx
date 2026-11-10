
import { useEffect, useMemo, useState } from "react";
import OperationsView from "./OperationsView.jsx";

const statusLabels = { todo: "To do", in_progress: "In progress", done: "Done", blocked: "Blocked" };

const formatAge = value => {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
};

export default function Home() {
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [view, setView] = useState("Overview");
  const [workflowPrompt, setWorkflowPrompt] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [touchStart, setTouchStart] = useState(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [workflowResult, setWorkflowResult] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [employee, setEmployee] = useState(null);
  const [loginEmail, setLoginEmail] = useState("maya@acme.test");
  const [loginPassword, setLoginPassword] = useState("Welcome123!");
  const [authError, setAuthError] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const refresh = async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    else setIsFetching(true);

    try {
      const response = await fetch("/api/dashboard");
      if (!response.ok) throw new Error("The dashboard service returned an error.");

      const payload = await response.json();
      setData(payload);
      setLoadError("");
      localStorage.setItem("intelliflow-dashboard-cache", JSON.stringify(payload));
    } catch (error) {
      const cached = localStorage.getItem("intelliflow-dashboard-cache");

      if (cached) {
        setData(JSON.parse(cached));
        setLoadError("Live MongoDB data is unavailable. Showing the last saved workspace snapshot.");
      } else {
        setLoadError(error.message || "Unable to load dashboard data.");
      }
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  };

  useEffect(() => {
    let timer;

    const checkSession = async () => {
      try {
        const response = await fetch("/api/auth/me");
        if (!response.ok) throw new Error("Please sign in to continue.");

        const payload = await response.json();
        setEmployee(payload.employee);
        setAuthLoading(false);

        const cached = localStorage.getItem("intelliflow-dashboard-cache");
        if (cached) setData(JSON.parse(cached));

        refresh();
        timer = setInterval(() => refresh(true), 10000);
      } catch {
        setAuthLoading(false);
      }
    };

    checkSession();

    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);

    window.addEventListener("online", online);
    window.addEventListener("offline", offline);

    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  const login = async event => {
    event.preventDefault();
    setAuthError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to sign in");

      setEmployee(payload.employee);
      setIsLoading(true);
      refresh();
    } catch (error) {
      setAuthError(error.message);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setEmployee(null);
    setData(null);
    setView("Overview");
  };

  const updateTask = async (taskId, status) => {
    const response = await fetch(`/api/tasks/${taskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });

    if (!response.ok) {
      setLoadError((await response.json()).error || "Task update failed");
    } else {
      refresh(true);
    }
  };

  const resolveAlert = async alertId => {
    const response = await fetch(`/api/alerts/${alertId}/resolve`, {
      method: "POST"
    });

    if (!response.ok) setLoadError("Alert could not be resolved");
    else refresh(true);
  };

  const generateWorkflow = async () => {
    const response = await fetch("/api/workflows/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflowPrompt })
    });

    const result = await response.json();

    if (!response.ok) setLoadError(result.error || "Workflow generation failed");
    else setWorkflowResult(result);
  };

  const metrics = useMemo(() => {
    if (!data) return { active: 0, done: 0, pending: 0, score: 0 };

    return {
      active: data.projects.filter(p => p.status !== "completed").length,
      done: data.projects.filter(p => p.status === "completed").length,
      pending: data.tasks.filter(t => t.status !== "done").length,
      score: Math.round(
        data.projects.reduce((sum, p) => sum + p.progress, 0) / data.projects.length
      )
    };
  }, [data]);

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="brand-mark">IF</div>
        <span>Checking your workspace session…</span>
      </div>
    );
  }

  if (!employee) {
    return (
      <LoginPage
        email={loginEmail}
        password={loginPassword}
        error={authError}
        onEmail={setLoginEmail}
        onPassword={setLoginPassword}
        onSubmit={login}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="brand-mark">IF</div>
        <span>Loading your operations workspace…</span>
      </div>
    );
  }

  const dashboard = data || {
    projects: [],
    tasks: [],
    alerts: [],
    recommendations: [],
    activity: []
  };

  // Keep the existing sidebar and all existing non-Overview pages unchanged.
  if (view !== "Overview") {
    return (
      <div className="app-shell">
        <Sidebar
          view={view}
          setView={setView}
          employee={employee}
          logout={logout}
          setLoadError={setLoadError}
        />
        <main className="main-content">
          <OperationsView
            view={view}
            onNavigate={setView}
            currentUser={employee}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        setView={setView}
        employee={employee}
        logout={logout}
        setLoadError={setLoadError}
      />

      <main className="main-content">
        {!isOnline && (
          <div className="offline-banner">
            Offline mode · showing the last saved workspace snapshot
          </div>
        )}

        {loadError && (
          <div className="data-warning">
            {loadError}
            <button onClick={() => refresh()}>Retry</button>
          </div>
        )}

        <header className="topbar">
          <div>
            <p className="eyebrow">THURSDAY, SEPTEMBER 17, 2026</p>
            <h1>
              {view === "Overview"
                ? `Good morning, ${employee.name.split(" ")[0]}`
                : view}
            </h1>
            <p className="subtitle">
              Here’s what’s happening across your operations today.
            </p>
          </div>

          <div className="top-actions">
            <span className="live-status">
              <i /> Live sync {isFetching ? "· updating" : "· synced"}
            </span>
            <button
              className="icon-button"
              onClick={() => setShowSearch(true)}
              aria-label="Search workspace"
            >
              ⌕
            </button>
            <button className="icon-button notification">
              ♧<em>3</em>
            </button>
            <button
              className="primary-button"
              onClick={() => setShowComposer(true)}
            >
              ＋ New workflow
            </button>
          </div>
        </header>

        {/* KPI cards: clicking a card opens its details without leaving Overview. */}
        <section className="metric-grid">
          <Metric
            label="Active projects"
            value={metrics.active}
            delta="↑ 12.5%"
            tone="green"
            detail="vs. last month"
            onClick={() => setSelectedMetric("active")}
          />

          <Metric
            label="Pending tasks"
            value={metrics.pending}
            delta="↓ 8.2%"
            tone="green"
            detail="vs. last week"
            onClick={() => setSelectedMetric("pending")}
          />

          <Metric
            label="Productivity score"
            value={`${metrics.score}%`}
            delta="↑ 4.8%"
            tone="green"
            detail="vs. last month"
            ring={metrics.score}
            onClick={() => setSelectedMetric("score")}
          />

          <Metric
            label="At-risk items"
            value={dashboard.alerts.length}
            delta="Needs attention"
            tone="red"
            detail="predicted by AI"
            onClick={() => setSelectedMetric("risk")}
          />
        </section>

        <section className="content-grid">
          <div className="panel projects-panel">
            <div className="panel-header">
              <div>
                <h2>Projects at a glance</h2>
                <p>Live progress across active workflows</p>
              </div>
              <button className="text-button">View all →</button>
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

                    <p>
                      {project.ownerName} · due{" "}
                      {new Date(project.dueAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric"
                      })}
                    </p>

                    <div className="progress-track">
                      <span style={{ width: `${project.progress}%` }} />
                    </div>
                  </div>

                  <strong className="progress-value">
                    {project.progress}%
                  </strong>
                </div>
              ))}
            </div>
          </div>

          <div className="panel alerts-panel">
            <div className="panel-header">
              <div>
                <h2>Priority alerts</h2>
                <p>AI-powered early warnings</p>
              </div>
              <span className="count-badge">{dashboard.alerts.length}</span>
            </div>

            {dashboard.alerts.map(alert => (
              <div
                className={`alert-card ${alert.severity}`}
                key={alert.id}
              >
                <div className="alert-symbol">
                  {alert.severity === "critical" ? "!" : "⌁"}
                </div>

                <div>
                  <b>{alert.title}</b>
                  <p>{alert.detail}</p>
                  <small>
                    {alert.projectName} · {formatAge(alert.createdAt)}
                  </small>
                </div>

                <button
                  className="dismiss"
                  onClick={() => resolveAlert(alert.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="lower-grid">
          <div className="panel tasks-panel">
            <div className="panel-header">
              <div>
                <h2>My focus today</h2>
                <p>Tasks that need your attention</p>
              </div>
              <button className="text-button">Open task board →</button>
            </div>

            <div className="task-table">
              <div className="task-head">
                <span>Task</span>
                <span>Owner</span>
                <span>Priority</span>
                <span>Status</span>
              </div>

              {dashboard.tasks.map(task => (
                <div
                  className="task-row"
                  key={task.id}
                  onTouchStart={event =>
                    setTouchStart(event.changedTouches[0].clientX)
                  }
                  onTouchEnd={event => {
                    const delta = event.changedTouches[0].clientX - touchStart;
                    if (Math.abs(delta) > 70) {
                      updateTask(task.id, delta > 0 ? "done" : "in_progress");
                    }
                  }}
                >
                  <div
                    className="task-name"
                    onClick={() => setSelectedTask(task)}
                  >
                    <span
                      className={`task-check ${task.status}`}
                      onClick={event => {
                        event.stopPropagation();
                        updateTask(
                          task.id,
                          task.status === "done" ? "todo" : "done"
                        );
                      }}
                    >
                      {task.status === "done" ? "✓" : ""}
                    </span>

                    <div>
                      <b>{task.title}</b>
                      <small>{task.stage} · tap for details</small>
                    </div>
                  </div>

                  <span>{task.assignee}</span>
                  <span className={`priority ${task.priority}`}>
                    {task.priority}
                  </span>

                  <select
                    value={task.status}
                    onChange={event => updateTask(task.id, event.target.value)}
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="panel ai-panel">
            <div className="ai-heading">
              <div className="ai-orb"><span>✦</span></div>
              <div>
                <div className="ai-kicker">
                  <span className="ai-live-dot" /> INTELLIFLOW AI · OPERATIONS COPILOT
                </div>
                <h2>Decision support, ready to act</h2>
                <p>
                  Signals are evaluated from workload, deadlines, and delivery history.
                </p>
              </div>
            </div>

            <div className="ai-status-row">
              <span><b>Model</b> Rules + optional gpt-5-nano</span>
              <span><b>Refresh</b> {isFetching ? "Analyzing…" : "Live · 10s"}</span>
            </div>

            {dashboard.recommendations.map(item => (
              <div className="recommendation" key={item.id}>
                <div className="recommendation-top">
                  <span className={`rec-type ${item.type}`}>
                    {item.type === "capacity" ? "Capacity" : "Risk"}
                  </span>
                  <span>
                    {item.source || "rules"} · {item.confidence}% confidence
                  </span>
                </div>

                <b>{item.title}</b>
                <p>{item.detail}</p>

                <div className="confidence-track">
                  <span style={{ width: `${item.confidence}%` }} />
                </div>

                <button onClick={() => setShowComposer(true)}>
                  Review recommended action <span>→</span>
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel activity-panel">
          <div className="panel-header">
            <div>
              <h2>Recent activity</h2>
              <p>What changed across your workspace</p>
            </div>
            <button className="text-button">Activity log →</button>
          </div>

          <div className="activity-list">
            {dashboard.activity.map(item => (
              <div className="activity-item" key={item.id}>
                <div className="activity-avatar">
                  {item.actor === "AI assistant"
                    ? "✦"
                    : item.actor.split(" ").map(p => p[0]).join("")}
                </div>
                <p>
                  <b>{item.actor}</b> {item.action} <strong>{item.entity}</strong>
                  <small>{formatAge(item.createdAt)}</small>
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* NEW: KPI details modal. Uses the dashboard data already loaded above. */}
      {selectedMetric && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedMetric(null)}
        >
          <div
            className="modal kpi-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kpi-detail-title"
            onClick={event => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setSelectedMetric(null)}
              aria-label="Close details"
            >
              ×
            </button>

            <div className="ai-modal-head">
              <div>
                <div className="ai-kicker">OPERATIONS INSIGHTS</div>
                <h2 id="kpi-detail-title">
                  {selectedMetric === "active" && "Active projects"}
                  {selectedMetric === "pending" && "Pending tasks"}
                  {selectedMetric === "score" && "Productivity score"}
                  {selectedMetric === "risk" && "At-risk items"}
                </h2>
              </div>
            </div>

            {selectedMetric === "active" && (
              <div className="kpi-detail-list">
                {dashboard.projects
                  .filter(project => project.status !== "completed")
                  .map(project => (
                    <div className="kpi-detail-row" key={project.id}>
                      <div>
                        <b>{project.name}</b>
                        <p>{project.ownerName}</p>
                      </div>
                      <span>{project.progress}% complete</span>
                    </div>
                  ))}

                {dashboard.projects.every(
                  project => project.status === "completed"
                ) && <p>No active projects.</p>}
              </div>
            )}

            {selectedMetric === "pending" && (
              <div className="kpi-detail-list">
                {dashboard.tasks
                  .filter(task => task.status !== "done")
                  .map(task => (
                    <button
                      type="button"
                      className="kpi-detail-row kpi-detail-action"
                      key={task.id}
                      onClick={() => {
                        setSelectedMetric(null);
                        setSelectedTask(task);
                      }}
                    >
                      <div>
                        <b>{task.title}</b>
                        <p>{task.assignee} · {task.stage}</p>
                      </div>
                      <span>
                        {statusLabels[task.status] || task.status}
                      </span>
                    </button>
                  ))}

                {dashboard.tasks.every(
                  task => task.status === "done"
                ) && <p>No pending tasks.</p>}
              </div>
            )}

            {selectedMetric === "score" && (
              <div className="kpi-score-detail">
                <div className="kpi-score-number">{metrics.score}%</div>
                <p>
                  Average project progress based on the project progress
                  values currently available in the dashboard.
                </p>
                <p>
                  This is a progress-based indicator, not an independently
                  calculated employee productivity measurement.
                </p>
              </div>
            )}

            {selectedMetric === "risk" && (
              <div className="kpi-detail-list">
                {dashboard.alerts.map(alert => (
                  <div className="kpi-detail-row" key={alert.id}>
                    <div>
                      <b>{alert.title}</b>
                      <p>{alert.detail}</p>
                      <small>{alert.projectName}</small>
                    </div>
                    <span className={`pill ${alert.severity}`}>
                      {alert.severity}
                    </span>
                  </div>
                ))}

                {dashboard.alerts.length === 0 && (
                  <p>No active alerts.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showSearch && (
        <div
          className="modal-backdrop"
          onClick={() => setShowSearch(false)}
        >
          <div
            className="search-modal"
            onClick={event => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setShowSearch(false)}
            >
              ×
            </button>

            <div className="search-modal-kicker">WORKSPACE SEARCH</div>

            <input
              autoFocus
              className="workspace-search-input"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search employees, tasks, or projects…"
            />

            {searchQuery.trim() ? (
              <div className="search-results">
                {[
                  ...dashboard.tasks
                    .filter(item =>
                      `${item.title} ${item.assignee}`
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase())
                    )
                    .map(item => ({
                      type: "Task",
                      title: item.title,
                      detail: item.assignee,
                      action: () => {
                        setShowSearch(false);
                        setSelectedTask(item);
                      }
                    })),

                  ...dashboard.projects
                    .filter(item =>
                      `${item.name} ${item.ownerName}`
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase())
                    )
                    .map(item => ({
                      type: "Project",
                      title: item.name,
                      detail: item.ownerName,
                      action: () => setShowSearch(false)
                    }))
                ].map((result, index) => (
                  <button
                    className="search-result"
                    key={`${result.type}-${index}`}
                    onClick={result.action}
                  >
                    <span>{result.type}</span>
                    <b>{result.title}</b>
                    <small>{result.detail}</small>
                  </button>
                ))}

                {dashboard.tasks.every(
                  item =>
                    !`${item.title} ${item.assignee}`
                      .toLowerCase()
                      .includes(searchQuery.toLowerCase())
                ) &&
                  dashboard.projects.every(
                    item =>
                      !`${item.name} ${item.ownerName}`
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase())
                  ) && <p className="empty-search">No matching workspace records.</p>}
              </div>
            ) : (
              <p className="search-hint">
                Start typing to find an employee task or project.
              </p>
            )}
          </div>
        </div>
      )}

      {showComposer && (
        <div
          className="modal-backdrop"
          onClick={() => setShowComposer(false)}
        >
          <div className="modal" onClick={event => event.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setShowComposer(false)}
            >
              ×
            </button>

            <div className="ai-modal-head">
              <div className="ai-orb"><span>✦</span></div>
              <div>
                <div className="ai-kicker">
                  <span className="ai-live-dot" /> AI WORKFLOW STUDIO
                </div>
                <h2>Describe your workflow</h2>
              </div>
            </div>

            <p>
              Tell IntelliFlow what you need to coordinate. AI will map it into stages for review.
            </p>

            <textarea
              value={workflowPrompt}
              onChange={event => setWorkflowPrompt(event.target.value)}
              placeholder="Create a workflow for employee onboarding…"
            />

            <button
              className="primary-button full"
              disabled={!workflowPrompt}
              onClick={generateWorkflow}
            >
              Generate workflow
            </button>

            {workflowResult && (
              <div className="workflow-result">
                <b>{workflowResult.name}</b>
                {workflowResult.stages.map(stage => (
                  <span key={stage}>✓ {stage}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedTask && (
        <div
          className="drawer-backdrop"
          onClick={() => setSelectedTask(null)}
        >
          <aside
            className="task-drawer"
            onClick={event => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setSelectedTask(null)}
            >
              ×
            </button>

            <div className="drawer-kicker">
              TASK DETAILS · #{selectedTask.id}
            </div>
            <h2>{selectedTask.title}</h2>
            <p className="drawer-stage">
              {selectedTask.stage} · assigned to {selectedTask.assignee}
            </p>

            <div className={`drawer-status ${selectedTask.status}`}>
              {statusLabels[selectedTask.status]}
            </div>

            <div className="drawer-grid">
              <div>
                <small>Priority</small>
                <b className={`priority ${selectedTask.priority}`}>
                  {selectedTask.priority}
                </b>
              </div>
              <div>
                <small>Due</small>
                <b>
                  {new Date(selectedTask.dueAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit"
                  })}
                </b>
              </div>
            </div>

            <p className="drawer-note">
              Swipe right on a task to mark it done. Swipe left to move it into progress.
            </p>

            <div className="drawer-actions">
              {Object.entries(statusLabels).map(([value, label]) => (
                <button
                  key={value}
                  className={selectedTask.status === value ? "active" : ""}
                  onClick={() => {
                    updateTask(selectedTask.id, value);
                    setSelectedTask({ ...selectedTask, status: value });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Sidebar({ view, setView, employee, logout, setLoadError }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">IF</div>
        <div>
          <b>IntelliFlow</b>
          <small>Operations OS</small>
        </div>
      </div>

      <div className="workspace">
        <span className="workspace-dot" />
        Acme workspace
        <span className="chevron">⌄</span>
      </div>

      <nav>
        {["Overview", "My tasks", "Workflows", "Team capacity", "Analytics"].map(item => (
          <button
            key={item}
            className={view === item ? "nav-item active" : "nav-item"}
            onClick={() => setView(item)}
          >
            <span className="nav-icon">
              {item === "Overview"
                ? "⌂"
                : item === "My tasks"
                  ? "✓"
                  : item === "Workflows"
                    ? "◇"
                    : item === "Team capacity"
                      ? "◎"
                      : "▥"}
            </span>
            {item}
          </button>
        ))}
      </nav>

      <div className="sidebar-section">
        <span>Workspace</span>
        <button
          className="nav-item"
          onClick={() => setLoadError("Settings are managed by workspace administrators.")}
        >
          <span className="nav-icon">⚙</span>Settings
        </button>
        <button
          className="nav-item"
          onClick={() => setLoadError("Help center: contact your workspace administrator for access support.")}
        >
          <span className="nav-icon">?</span>Help center
        </button>
      </div>

      <button className="sidebar-footer sidebar-profile" onClick={logout}>
        <div className="avatar">
          {employee.name.split(" ").map(part => part[0]).join("")}
        </div>
        <div>
          <b>{employee.name}</b>
          <small>{employee.roleTitle || "Employee"} · Sign out</small>
        </div>
        <span className="more">•••</span>
      </button>
    </aside>
  );
}

function LoginPage({ email, password, error, onEmail, onPassword, onSubmit }) {
  const [mode, setMode] = useState("login");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const requestReset = async event => {
    event.preventDefault();

    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const result = await response.json();
    setMessage(
      result.resetToken
        ? `Reset token for local testing: ${result.resetToken}`
        : result.message
    );

    if (result.resetToken) {
      setToken(result.resetToken);
      setMode("reset");
    }
  };

  const submitReset = async event => {
    event.preventDefault();

    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: newPassword })
    });

    const result = await response.json();
    setMessage(
      result.success
        ? "Password updated. You can sign in now."
        : result.error
    );

    if (result.success) setMode("login");
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand login-brand">
          <div className="brand-mark">IF</div>
          <div>
            <b>IntelliFlow</b>
            <small>Operations OS</small>
          </div>
        </div>

        <p className="eyebrow">EMPLOYEE WORKSPACE</p>
        <h1>
          {mode === "login"
            ? "Welcome back"
            : mode === "reset-request"
              ? "Reset your password"
              : "Choose a new password"}
        </h1>

        <p className="login-subtitle">
          {mode === "login"
            ? "Sign in to manage your team schedules, tasks, and delivery operations."
            : "Password recovery is available for existing invited employees. Public signup is disabled."}
        </p>

        {(error || message) && (
          <div className="auth-error">{error || message}</div>
        )}

        {mode === "login" && (
          <>
            <form onSubmit={onSubmit} className="login-form">
              <label className="form-label">
                Work email
                <input
                  type="email"
                  value={email}
                  onChange={event => onEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </label>

              <label className="form-label">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={event => onPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>

              <button className="primary-button full">
                Sign in to workspace
              </button>
            </form>

            <button
              className="auth-link"
              onClick={() => {
                setMessage("");
                setMode("reset-request");
              }}
            >
              Forgot password?
            </button>
          </>
        )}

        {mode === "reset-request" && (
          <form onSubmit={requestReset} className="login-form">
            <label className="form-label">
              Existing work email
              <input
                type="email"
                value={email}
                onChange={event => onEmail(event.target.value)}
                required
              />
            </label>

            <button className="primary-button full">
              Send reset instructions
            </button>
            <button
              type="button"
              className="auth-link"
              onClick={() => setMode("login")}
            >
              Back to sign in
            </button>
          </form>
        )}

        {mode === "reset" && (
          <form onSubmit={submitReset} className="login-form">
            <label className="form-label">
              Reset token
              <input
                value={token}
                onChange={event => setToken(event.target.value)}
                required
              />
            </label>

            <label className="form-label">
              New password
              <input
                type="password"
                minLength="8"
                value={newPassword}
                onChange={event => setNewPassword(event.target.value)}
                required
              />
            </label>

            <button className="primary-button full">
              Update password
            </button>
          </form>
        )}

        <div className="demo-credentials">
          <b>Manager-controlled access</b>
          <span>Ask your manager for an invitation.</span>
          <span>Demo: maya@acme.test / Welcome123!</span>
        </div>
      </div>
    </div>
  );
}

/* Updated KPI component: button semantics enable keyboard interaction. */
function Metric({ label, value, delta, tone, detail, ring, onClick }) {
  return (
    <button
      type="button"
      className="metric-card metric-card-interactive"
      onClick={onClick}
      aria-label={`${label}: ${value}. Open details`}
    >
      <span className="metric-label">
        {label}
        <span aria-hidden="true">↗</span>
      </span>

      <span className="metric-value">
        {value}
        {ring !== undefined && (
          <span
            className="mini-ring"
            style={{
              background: `conic-gradient(#23a36d ${ring * 3.6}deg, #e8eee9 0)`
            }}
          />
        )}
      </span>

      <span className={`metric-delta ${tone}`}>
        {delta} <small>{detail}</small>
      </span>
    </button>
  );
}
