import React, { useState, useEffect } from "react";
import { api } from "../lib/api";


export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    ownerName: "Maya Chen",
    progress: 0,
    status: "active",
    dueAt: new Date(Date.now() + 86400000 * 14).toISOString()
  });

  const loadProjects = async () => {
    setLoading(true);
    try {
      const res = await api.getProjects();
      setProjects(res.projects || []);
    } catch (err) {
      setNotice(`Error loading projects: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.createProject(newProject);
      setNotice(`Project '${newProject.name}' created.`);
      setShowAddModal(false);
      loadProjects();
    } catch (err) {
      setNotice(`Error: ${err.message}`);
    }
  };

  const filtered = projects.filter((p) => {
    if (filter === "all") return true;
    return p.status === filter;
  });

  const counts = {
    all: projects.length,
    active: projects.filter((p) => p.status === "active").length,
    at_risk: projects.filter((p) => p.status === "at_risk").length,
    completed: projects.filter((p) => p.status === "completed").length
  };

  const getStatusLabel = (status) => {
    if (status === "at_risk") return "At risk";
    if (status === "completed") return "Completed";
    return "Active";
  };

  const getProgress = (progress) =>
    Math.min(100, Math.max(0, Number(progress) || 0));

  return (
    <div className="projects-page">
      <div className="operations-heading projects-heading">
        <div>
          <p className="eyebrow">PORTFOLIO INTELLIGENCE</p>
          <h1>Projects &amp; Delivery Streams</h1>
          <p className="subtitle">
            Track milestones, operational commitments, and aggregate progress
            across cross-functional programs.
          </p>
        </div>

        <div className="operations-actions">
          <button
            className="primary-button projects-create-button"
            onClick={() => setShowAddModal(true)}
          >
            <span aria-hidden="true">＋</span> Create Project
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`projects-notice ${
            notice.startsWith("Error") ? "projects-notice-error" : ""
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

      <div className="projects-summary-grid">
        {[
          { key: "all", label: "Total projects", icon: "▦" },
          { key: "active", label: "Active", icon: "◉" },
          { key: "at_risk", label: "At risk", icon: "△" },
          { key: "completed", label: "Completed", icon: "✓" }
        ].map((item) => (
          <button
            type="button"
            key={item.key}
            className={`projects-summary-card ${
              filter === item.key ? "selected" : ""
            }`}
            onClick={() => setFilter(item.key)}
          >
            <span className={`projects-summary-icon ${item.key}`}>
              {item.icon}
            </span>
            <span className="projects-summary-copy">
              <span className="projects-summary-label">{item.label}</span>
              <strong>{counts[item.key]}</strong>
            </span>
            <span className="projects-summary-arrow" aria-hidden="true">
              ↗
            </span>
          </button>
        ))}
      </div>

      <section className="ops-panel projects-portfolio-panel">
        <div className="projects-section-heading">
          <div>
            <h2>Project portfolio</h2>
            <p>
              {filtered.length}{" "}
              {filtered.length === 1 ? "project" : "projects"} displayed
            </p>
          </div>

          <div className="projects-filter-group" aria-label="Filter projects">
            {["all", "active", "at_risk", "completed"].map((tab) => (
              <button
                type="button"
                key={tab}
                className={`projects-filter-button ${
                  filter === tab ? "active" : ""
                }`}
                aria-pressed={filter === tab}
                onClick={() => setFilter(tab)}
              >
                {tab === "all"
                  ? "All"
                  : tab === "at_risk"
                    ? "At risk"
                    : tab === "completed"
                      ? "Completed"
                      : "Active"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="projects-state">
            <span className="projects-loader" />
            <strong>Loading project portfolio</strong>
            <p>Gathering the latest project information…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="projects-state projects-empty-state">
            <div className="projects-empty-icon">▦</div>
            <h3>
              {projects.length === 0
                ? "Your project portfolio starts here"
                : "No projects in this category"}
            </h3>
            <p>
              {projects.length === 0
                ? "Create a project to begin tracking ownership, progress, and delivery status."
                : "Try another status filter to view more projects."}
            </p>
            {projects.length === 0 ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => setShowAddModal(true)}
              >
                ＋ Create your first project
              </button>
            ) : (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setFilter("all")}
              >
                View all projects
              </button>
            )}
          </div>
        ) : (
          <div className="projects-list">
            {filtered.map((p) => {
              const progress = getProgress(p.progress);

              return (
                <article
                  key={p.id}
                  className={`projects-project-card status-${p.status}`}
                >
                  <div className={`project-icon ${p.status}`}>
                    {(p.name || "P").slice(0, 1).toUpperCase()}
                  </div>

                  <div className="projects-project-main">
                    <div className="projects-project-title-row">
                      <h3>{p.name}</h3>
                      <span className={`pill ${p.status}`}>
                        <span className="projects-status-dot" />
                        {getStatusLabel(p.status)}
                      </span>
                    </div>

                    <p className="projects-project-description">
                      {p.description || "Operational workflow"}
                    </p>

                    <div className="projects-progress-meta">
                      <span>Delivery progress</span>
                      <strong>{progress}%</strong>
                    </div>

                    <div
                      className="progress-track projects-progress-track"
                      role="progressbar"
                      aria-label={`${p.name} progress`}
                      aria-valuenow={progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <span style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <div className="projects-project-owner">
                    <span className="projects-metadata-label">PROJECT LEAD</span>
                    <div className="projects-owner-value">
                      <span className="projects-owner-avatar">
                        {(p.ownerName || "U").slice(0, 1).toUpperCase()}
                      </span>
                      <span>{p.ownerName || "Unassigned"}</span>
                    </div>
                  </div>

                  <div className="projects-project-metric">
                    <span className="projects-metadata-label">PROGRESS</span>
                    <strong>{progress}%</strong>
                    <span className="projects-metric-caption">
                      {progress === 100
                        ? "Delivery complete"
                        : progress >= 70
                          ? "Near completion"
                          : progress >= 35
                            ? "In progress"
                            : "Getting started"}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {showAddModal && (
        <div
          className="modal-backdrop projects-modal-backdrop"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="modal projects-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="projects-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              aria-label="Close create project dialog"
              onClick={() => setShowAddModal(false)}
            >
              ×
            </button>

            <div className="projects-modal-header">
              <span className="projects-modal-icon">＋</span>
              <p className="eyebrow">PORTFOLIO MANAGEMENT</p>
              <h2 id="projects-modal-title">Create new project</h2>
              <p>
                Define the project details and assign an owner to get started.
              </p>
            </div>

            <form onSubmit={handleCreate} className="projects-create-form">
              <label className="form-label">
                Project name <span>*</span>
                <input
                  type="text"
                  placeholder="e.g. Customer Experience Upgrade"
                  value={newProject.name}
                  onChange={(e) =>
                    setNewProject({
                      ...newProject,
                      name: e.target.value
                    })
                  }
                  required
                />
              </label>

              <label className="form-label">
                Description
                <textarea
                  placeholder="What does this project aim to achieve?"
                  value={newProject.description}
                  onChange={(e) =>
                    setNewProject({
                      ...newProject,
                      description: e.target.value
                    })
                  }
                  rows={3}
                />
              </label>

              <div className="form-grid projects-form-grid">
                <label className="form-label">
                  Project owner <span>*</span>
                  <input
                    type="text"
                    value={newProject.ownerName}
                    onChange={(e) =>
                      setNewProject({
                        ...newProject,
                        ownerName: e.target.value
                      })
                    }
                    required
                  />
                </label>

                <label className="form-label">
                  Initial status
                  <select
                    value={newProject.status}
                    onChange={(e) =>
                      setNewProject({
                        ...newProject,
                        status: e.target.value
                      })
                    }
                  >
                    <option value="active">Active</option>
                    <option value="at_risk">At risk</option>
                  </select>
                </label>
              </div>

              <div className="projects-modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  Create project <span aria-hidden="true">→</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

