import React, { useState, useEffect } from "react";
import { api } from "../lib/api";

const statusColumns = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" }
];


export default function Tasks({ onSelectTask }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [notice, setNotice] = useState("");
  const [newTask, setNewTask] = useState({
    title: "",
    projectId: 1,
    assignee: "Maya Chen",
    stage: "Execution",
    priority: "medium",
    estimatedHours: 4.0,
    status: "todo"
  });

  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await api.getTasks();
      setTasks(res.tasks || []);
    } catch (err) {
      setNotice(`Error loading tasks: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleUpdateStatus = async (taskId, newStatus) => {
    try {
      await api.updateTaskStatus(taskId, newStatus);

      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: newStatus } : t
        )
      );

      setNotice(`Task status updated to ${newStatus.replace("_", " ")}.`);
    } catch (err) {
      setNotice(`Error updating task: ${err.message}`);
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    setNotice("");

    try {
      await api.createTask(newTask);
      setNotice(`Task '${newTask.title}' created.`);
      setShowAddModal(false);

      setNewTask({
        title: "",
        projectId: 1,
        assignee: "Maya Chen",
        stage: "Execution",
        priority: "medium",
        estimatedHours: 4.0,
        status: "todo"
      });

      await loadTasks();
    } catch (err) {
      setNotice(`Error: ${err.message}`);
    }
  };

  const totalHours = tasks.reduce(
    (sum, task) => sum + (Number(task.estimatedHours) || 0),
    0
  );

  const completedTasks = tasks.filter((task) => task.status === "done").length;
  const blockedTasks = tasks.filter((task) => task.status === "blocked").length;
  const completionRate = tasks.length
    ? Math.round((completedTasks / tasks.length) * 100)
    : 0;

  const getPriorityLabel = (priority) => {
    const labels = {
      critical: "Critical",
      high: "High",
      medium: "Medium",
      low: "Low"
    };

    return labels[priority] || priority || "Medium";
  };

  const getStatusLabel = (status) => {
    const labels = {
      todo: "To do",
      in_progress: "In progress",
      done: "Completed",
      blocked: "Blocked"
    };

    return labels[status] || status?.replace("_", " ") || "Unknown";
  };

  return (
    <div className="tasks-page">
      <div className="operations-heading tasks-heading">
        <div>
          <p className="eyebrow">OPERATIONAL TASK CONTROL PLANE</p>
          <h1>Deliverables &amp; Task Board</h1>
          <p className="subtitle">
            Coordinate deliverables, manage task ownership, and monitor
            execution across every workflow stage.
          </p>
        </div>

        <div className="operations-actions">
          <button
            type="button"
            className="primary-button tasks-create-button"
            onClick={() => setShowAddModal(true)}
          >
            <span aria-hidden="true">＋</span> Create Task
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`tasks-notice ${
            notice.startsWith("Error") ? "tasks-notice-error" : ""
          }`}
          role="status"
        >
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

      <div className="tasks-overview">
        <div className="tasks-overview-card">
          <div className="tasks-overview-icon tasks-icon-total">▦</div>
          <div>
            <span>Total tasks</span>
            <strong>{tasks.length}</strong>
          </div>
        </div>

        <div className="tasks-overview-card">
          <div className="tasks-overview-icon tasks-icon-complete">✓</div>
          <div>
            <span>Completed</span>
            <strong>{completedTasks}</strong>
          </div>
        </div>

        <div className="tasks-overview-card">
          <div className="tasks-overview-icon tasks-icon-blocked">!</div>
          <div>
            <span>Blocked</span>
            <strong>{blockedTasks}</strong>
          </div>
        </div>

        <div className="tasks-overview-card">
          <div className="tasks-overview-icon tasks-icon-hours">◷</div>
          <div>
            <span>Estimated effort</span>
            <strong>{totalHours.toLocaleString()}h</strong>
          </div>
        </div>
      </div>

      <section className="tasks-board-section">
        <div className="tasks-board-heading">
          <div>
            <h2>Execution board</h2>
            <p>
              {completionRate}% of all tasks completed
            </p>
          </div>

          <div
            className="tasks-overall-progress"
            role="progressbar"
            aria-label="Overall task completion"
            aria-valuenow={completionRate}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${completionRate}%` }} />
          </div>
        </div>

        {loading ? (
          <div className="tasks-state">
            <span className="tasks-loader" />
            <strong>Loading task board</strong>
            <p>Retrieving tasks and current statuses…</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="tasks-state tasks-empty-state">
            <div className="tasks-empty-icon">✓</div>
            <h3>Your task board is ready</h3>
            <p>
              Create your first deliverable to begin tracking ownership,
              priorities, and workflow progress.
            </p>
            <button
              type="button"
              className="primary-button"
              onClick={() => setShowAddModal(true)}
            >
              ＋ Create your first task
            </button>
          </div>
        ) : (
          <div className="tasks-kanban">
            {statusColumns.map((col) => {
              const colTasks = tasks.filter(
                (task) => task.status === col.id
              );

              return (
                <section
                  key={col.id}
                  className={`tasks-column tasks-column-${col.id}`}
                >
                  <div className="tasks-column-header">
                    <div className="tasks-column-title">
                      <span className={`tasks-column-dot ${col.id}`} />
                      <h3>{col.label}</h3>
                    </div>

                    <span className="tasks-column-count">
                      {colTasks.length}
                    </span>
                  </div>

                  <div className="tasks-column-body">
                    {colTasks.map((t) => (
                      <article
                        key={t.id}
                        className="tasks-card"
                        role={onSelectTask ? "button" : undefined}
                        tabIndex={onSelectTask ? 0 : undefined}
                        onClick={() => onSelectTask?.(t)}
                        onKeyDown={(e) => {
                          if (
                            onSelectTask &&
                            (e.key === "Enter" || e.key === " ")
                          ) {
                            e.preventDefault();
                            onSelectTask(t);
                          }
                        }}
                      >
                        <div className="tasks-card-topline">
                          <span className="tasks-card-id">
                            TASK #{t.id}
                          </span>

                          <span
                            className={`tasks-priority-badge ${
                              t.priority || "medium"
                            }`}
                          >
                            <span className="tasks-priority-dot" />
                            {getPriorityLabel(t.priority)}
                          </span>
                        </div>

                        <h4 className="tasks-card-title">
                          {t.title || "Untitled task"}
                        </h4>

                        <div className="tasks-card-stage">
                          <span aria-hidden="true">◈</span>
                          {t.stage || "General"}
                        </div>

                        <div className="tasks-card-divider" />

                        <div className="tasks-card-meta">
                          <div className="tasks-assignee">
                            <span className="tasks-assignee-avatar">
                              {(t.assignee || "U")
                                .slice(0, 1)
                                .toUpperCase()}
                            </span>

                            <span title={t.assignee || "Unassigned"}>
                              {t.assignee || "Unassigned"}
                            </span>
                          </div>

                          <span className="tasks-hours">
                            <span aria-hidden="true">◷</span>
                            {Number(t.estimatedHours) || 4}h
                          </span>
                        </div>

                        <div className="tasks-card-actions">
                          {col.id !== "todo" && (
                            <button
                              type="button"
                              className="tasks-action-button tasks-action-neutral"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateStatus(t.id, "todo");
                              }}
                            >
                              ← To do
                            </button>
                          )}

                          {col.id !== "in_progress" && (
                            <button
                              type="button"
                              className="tasks-action-button tasks-action-progress"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateStatus(t.id, "in_progress");
                              }}
                            >
                              → In progress
                            </button>
                          )}

                          {col.id !== "done" && (
                            <button
                              type="button"
                              className="tasks-action-button tasks-action-done"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateStatus(t.id, "done");
                              }}
                            >
                              ✓ Done
                            </button>
                          )}

                          {col.id !== "blocked" && (
                            <button
                              type="button"
                              className="tasks-action-button tasks-action-block"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateStatus(t.id, "blocked");
                              }}
                            >
                              ! Block
                            </button>
                          )}
                        </div>
                      </article>
                    ))}

                    {colTasks.length === 0 && (
                      <div className="tasks-column-empty">
                        <span aria-hidden="true">＋</span>
                        <p>No tasks in this stage</p>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>

      {showAddModal && (
        <div
          className="modal-backdrop tasks-modal-backdrop"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="modal tasks-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tasks-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              aria-label="Close create task dialog"
              onClick={() => setShowAddModal(false)}
            >
              ×
            </button>

            <div className="tasks-modal-header">
              <span className="tasks-modal-icon">＋</span>
              <p className="eyebrow">DELIVERY MANAGEMENT</p>
              <h2 id="tasks-modal-title">Create new deliverable</h2>
              <p>
                Define the task, assign responsibility, and set its priority.
              </p>
            </div>

            <form
              className="tasks-create-form"
              onSubmit={handleCreateTask}
            >
              <label className="form-label">
                Task title <span>*</span>
                <input
                  type="text"
                  placeholder="e.g. Complete dashboard review"
                  value={newTask.title}
                  onChange={(e) =>
                    setNewTask({
                      ...newTask,
                      title: e.target.value
                    })
                  }
                  required
                />
              </label>

              <div className="form-grid tasks-form-grid">
                <label className="form-label">
                  Assignee <span>*</span>
                  <input
                    type="text"
                    value={newTask.assignee}
                    onChange={(e) =>
                      setNewTask({
                        ...newTask,
                        assignee: e.target.value
                      })
                    }
                    required
                  />
                </label>

                <label className="form-label">
                  Workflow stage <span>*</span>
                  <input
                    type="text"
                    value={newTask.stage}
                    onChange={(e) =>
                      setNewTask({
                        ...newTask,
                        stage: e.target.value
                      })
                    }
                    required
                  />
                </label>
              </div>

              <div className="form-grid tasks-form-grid">
                <label className="form-label">
                  Priority
                  <select
                    value={newTask.priority}
                    onChange={(e) =>
                      setNewTask({
                        ...newTask,
                        priority: e.target.value
                      })
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </label>

                <label className="form-label">
                  Estimated hours
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={newTask.estimatedHours}
                    onChange={(e) =>
                      setNewTask({
                        ...newTask,
                        estimatedHours: Number(e.target.value)
                      })
                    }
                    required
                  />
                </label>
              </div>

              <div className="tasks-modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                >
                  Create task <span aria-hidden="true">→</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

