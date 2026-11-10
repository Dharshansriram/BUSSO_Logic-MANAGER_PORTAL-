import React, { useState, useEffect } from "react";
import "./bussologic.css";
import { api } from "./lib/api";

import Sidebar from "./components/Sidebar.jsx";
import Login from "./pages/Login.jsx";
import Activate from "./pages/Activate.jsx";
import ManagerSections, { MANAGER_NAV } from "./portal/ManagerSections.jsx";

const isMgr = e => ["manager", "admin"].includes(e?.role);
const statusLabels = { todo: "To do", in_progress: "In progress", done: "Done", blocked: "Blocked" };

export default function App() {
  const [employee, setEmployee] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState("Overview");
  const [dashboardData, setDashboardData] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [simulatorInitialTaskId, setSimulatorInitialTaskId] = useState(null);
  const [simulatorNonce, setSimulatorNonce] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  const refreshDashboard = async (quiet = false) => {
    if (!quiet) setIsSyncing(true);
    try {
      const data = await api.getDashboard();
      setDashboardData(data);
    } catch (err) {
      console.warn("Dashboard refresh warning:", err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Auth check on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await api.getMe();
        setEmployee(res.employee);
        if (isMgr(res.employee)) refreshDashboard(true);
      } catch (err) {
        setEmployee(null);
      } finally {
        setAuthLoading(false);
      }
    }
    checkAuth();
  }, []);

  // Real-time SSE event listener
  useEffect(() => {
    if (!employee || !isMgr(employee)) return;
    let eventSource;
    try {
      eventSource = new EventSource("/api/events");
      eventSource.addEventListener("task.updated", () => refreshDashboard(true));
      eventSource.addEventListener("alert.resolved", () => refreshDashboard(true));
      eventSource.addEventListener("employee.created", () => refreshDashboard(true));
      eventSource.addEventListener("outcome.recorded", () => refreshDashboard(true));
      eventSource.addEventListener("workflow.executed", () => refreshDashboard(true));
    } catch (e) {
      console.warn("SSE connection error:", e);
    }

    const interval = setInterval(() => {
      refreshDashboard(true);
    }, 15000);

    return () => {
      if (eventSource) eventSource.close();
      clearInterval(interval);
    };
  }, [employee]);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (e) {
      // ignore
    }
    setEmployee(null);
    setDashboardData(null);
    setView("Overview");
  };

  const handleUpdateTaskStatus = async (taskId, status) => {
    try {
      await api.updateTaskStatus(taskId, status);
      refreshDashboard(true);
      if (selectedTask && selectedTask.id === taskId) {
        setSelectedTask(prev => ({ ...prev, status }));
      }
    } catch (err) {
      setNotice(`Task status update failed: ${err.message}`);
    }
  };

  const handleResolveAlert = async (alertId) => {
    try {
      await api.resolveAlert(alertId);
      refreshDashboard(true);
    } catch (err) {
      setNotice(`Alert resolve failed: ${err.message}`);
    }
  };

  const handleNavigateToSimulator = (taskId) => {
    setSimulatorInitialTaskId(taskId);
    setSimulatorNonce(n => n + 1);
    setView("Decision");
  };

  if (window.location.pathname === "/activate") return <Activate />;

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="brand-mark">BL</div>
        <span>Initializing BUSSOLOGIC Workspace…</span>
      </div>
    );
  }

  if (!employee) {
    return (
      <Login
        onLoginSuccess={(emp) => {
          setEmployee(emp);
          if (isMgr(emp)) refreshDashboard();
        }}
      />
    );
  }

  if (!isMgr(employee))
    return (
      <div className="loading-screen">
        <span>This is the Manager Portal. Please use the Employee Portal.</span>
        <button className="secondary-button" onClick={handleLogout}>Sign out</button>
      </div>
    );

  return (
    <div className="app-shell">
      {/* Persistent BUSSOLOGIC Sidebar */}
      <Sidebar
        view={view}
        setView={setView}
        employee={employee}
        logout={handleLogout}
        items={MANAGER_NAV}
        portalLabel="Manager Portal"
      />

      {/* Main Content Area */}
      <main className="main-content">
        {notice && (
          <div className="success-banner" style={{ marginBottom: 18 }}>
            {notice}
            <button onClick={() => setNotice("")}>×</button>
          </div>
        )}

        {/* Global Action Header Bar */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginBottom: 16 }}>
          <span className="live-status">
            <i /> {isSyncing ? "Syncing intelligence…" : "Live Sync Active"}
          </span>
          <button
            className="icon-button"
            onClick={() => setShowSearch(true)}
            aria-label="Search workspace"
            title="Search workspace records (tasks, projects)"
          >
            ⌕
          </button>
        </div>

        <ManagerSections
          view={view}
          setView={setView}
          ctx={{
            dashboardData, employee, onUpdateTask: handleUpdateTaskStatus, onResolveAlert: handleResolveAlert,
            onSelectTask: setSelectedTask, simulate: handleNavigateToSimulator,
            simulatorTaskId: simulatorInitialTaskId, simulatorNonce, refresh: () => refreshDashboard(true),
          }}
        />
      </main>

      {/* Workspace Quick Search Modal */}
      {showSearch && (
        <div className="modal-backdrop" onClick={() => setShowSearch(false)}>
          <div className="search-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSearch(false)}>×</button>
            <div className="search-modal-kicker">BUSSOLOGIC WORKSPACE SEARCH</div>
            <input
              autoFocus
              className="workspace-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks, projects, employees…"
            />
            {searchQuery.trim() ? (
              <div className="search-results">
                {(dashboardData?.tasks || [])
                  .filter(t => `${t.title} ${t.assignee}`.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(t => (
                    <button
                      className="search-result"
                      key={`t-${t.id}`}
                      onClick={() => {
                        setShowSearch(false);
                        setSelectedTask(t);
                      }}
                    >
                      <span>Deliverable</span>
                      <b>{t.title}</b>
                      <small>#{t.id} · {t.assignee} · {t.status}</small>
                    </button>
                  ))}

                {(dashboardData?.projects || [])
                  .filter(p => `${p.name} ${p.ownerName}`.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(p => (
                    <button
                      className="search-result"
                      key={`p-${p.id}`}
                      onClick={() => {
                        setShowSearch(false);
                        setView("Projects");
                      }}
                    >
                      <span>Project</span>
                      <b>{p.name}</b>
                      <small>{p.ownerName} · {p.progress}% progress</small>
                    </button>
                  ))}
              </div>
            ) : (
              <p className="search-hint">Type to search across deliverables, workflows, and assignees.</p>
            )}
          </div>
        </div>
      )}

      {/* Task Inspection Drawer */}
      {selectedTask && (
        <div className="drawer-backdrop" onClick={() => setSelectedTask(null)}>
          <aside className="task-drawer" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedTask(null)}>×</button>
            <div className="drawer-kicker">DELIVERABLE DETAILS · #{selectedTask.id}</div>
            <h2>{selectedTask.title}</h2>
            <p className="drawer-stage">{selectedTask.stage} · Assigned to {selectedTask.assignee}</p>

            <div className={`drawer-status ${selectedTask.status}`}>
              {statusLabels[selectedTask.status]}
            </div>

            <div className="drawer-grid">
              <div>
                <small>Priority</small>
                <b className={`priority ${selectedTask.priority}`}>{selectedTask.priority}</b>
              </div>
              <div>
                <small>Due Date</small>
                <b>{new Date(selectedTask.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</b>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <button
                className="secondary-button full"
                onClick={() => {
                  handleNavigateToSimulator(selectedTask.id);
                  setSelectedTask(null);
                }}
              >
                ⇄ Test Interventions in Decision Simulator
              </button>
            </div>

            <div className="drawer-actions" style={{ marginTop: 18 }}>
              {Object.entries(statusLabels).map(([val, label]) => (
                <button
                  key={val}
                  className={selectedTask.status === val ? "active" : ""}
                  onClick={() => handleUpdateTaskStatus(selectedTask.id, val)}
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
