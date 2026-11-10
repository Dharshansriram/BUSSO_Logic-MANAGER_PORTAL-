import React, { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";

const initials = (name) => name.split(" ").map((p) => p[0]).join("").slice(0, 2);

export default function CapacityIntelligence({ currentUser }) {
  const [people, setPeople] = useState({ employees: [], schedules: [], invitations: [] });
  const [analytics, setAnalytics] = useState({ workload: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  const [newEmp, setNewEmp] = useState({
    name: "",
    email: "",
    department: "Customer Success",
    roleTitle: "Operations Specialist",
    skills: "coordination, analytics",
    capacityHours: 40,
    role: "employee"
  });

  const [newInvite, setNewInvite] = useState({
    email: "",
    role: "employee",
    department: "Customer Success"
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, aRes] = await Promise.all([
        api.getPeople(),
        api.getWorkload()
      ]);
      setPeople(pRes);
      setAnalytics(aRes);
    } catch (err) {
      setNotice(`Error loading workforce data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const departments = useMemo(() => {
    return [...new Set(people.employees.map((e) => e.department).filter(Boolean))].sort();
  }, [people.employees]);

  const filteredWorkload = useMemo(() => {
    return (analytics.workload || []).filter((person) => {
      const matchesSearch = `${person.name} ${person.roleTitle} ${person.department} ${person.skills}`
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesDept = department === "all" || person.department === department;
      return matchesSearch && matchesDept;
    });
  }, [analytics.workload, search, department]);

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    try {
      const r = await api.createEmployee(newEmp);
      setNotice(r.emailSent
        ? `Invitation emailed to ${newEmp.email}. Account is pending activation.`
        : `${newEmp.name} added as pending, but the invitation email was not sent (${r.emailError}). Use Resend invite in Team & Skills.`);
      setShowAddEmp(false);
      loadData();
    } catch (err) {
      setNotice(`Error: ${err.message}`);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createInvitation(newInvite);
      setNotice(`${res.delivery || "Invitation queued"} for ${newInvite.email}`);
      setShowInvite(false);
      loadData();
    } catch (err) {
      setNotice(`Error: ${err.message}`);
    }
  };

  const handleNotifyAtRisk = async () => {
    try {
      const res = await api.notifyAtRisk();
      setNotice(`Sent in-app notifications to ${res.notified} team members.`);
    } catch (err) {
      setNotice(`Error: ${err.message}`);
    }
  };

  const exportCSV = () => {
    const header = ["Name", "Email", "Department", "Role", "PlannedHours", "CapacityHours", "Utilization", "Efficiency"];
    const rows = filteredWorkload.map(p => [
      `"${p.name}"`,
      `"${p.email}"`,
      `"${p.department}"`,
      `"${p.roleTitle}"`,
      p.plannedHours,
      p.capacityHours,
      `${p.utilization}%`,
      `${p.efficiency}%`
    ]);
    const csvContent = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bussologic-capacity-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Capacity report downloaded.");
  };

  return (
    <div>
      <div className="operations-heading">
        <div>
          <p className="eyebrow">MODULE C · WORKFORCE CAPACITY INTELLIGENCE</p>
          <h1>Team Capacity & Load Balancing</h1>
          <p className="subtitle">
            Explainable allocation tracking, burnout risk prevention, and capacity redistribution hints.
          </p>
        </div>
        <div className="operations-actions">
          <button className="secondary-button" onClick={handleNotifyAtRisk}>
            🔔 Notify At-Risk
          </button>
          <button className="secondary-button" onClick={exportCSV}>
            ↓ Export CSV
          </button>
          <button className="secondary-button" onClick={() => setShowInvite(true)}>
            Invite Member
          </button>
          <button className="primary-button" onClick={() => setShowAddEmp(true)}>
            ＋ Add Employee
          </button>
        </div>
      </div>

      {notice && (
        <div className="success-banner">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}

      {/* KPI Overview */}
      <section className="ops-metrics">
        <div className="ops-metric">
          <span>Active Team Members</span>
          <b>{people.employees.length}</b>
          <small>across {departments.length} departments</small>
        </div>

        <div className="ops-metric">
          <span>Average Capacity Load</span>
          <b className={analytics.summary?.averageUtilization > 85 ? "red" : "green"}>
            {analytics.summary?.averageUtilization || 0}%
          </b>
          <small>planned hours vs availability</small>
        </div>

        <div className="ops-metric">
          <span>Overloaded (&ge; 90%)</span>
          <b className={analytics.summary?.overloaded > 0 ? "red" : "green"}>
            {analytics.summary?.overloaded || 0}
          </b>
          <small>bottleneck mitigation candidate</small>
        </div>

        <div className="ops-metric">
          <span>Workforce Efficiency</span>
          <b className="green">
            {Math.round(
              (analytics.workload || []).reduce((sum, p) => sum + (p.efficiency || 0), 0) /
                Math.max(1, (analytics.workload || []).length)
            )}%
          </b>
          <small>estimated vs logged effort</small>
        </div>
      </section>

      {/* Capacity Table & Search */}
      <section className="ops-panel">
        <div className="ops-panel-header">
          <div>
            <h2>Individual Capacity Breakdown</h2>
            <p>Monitors assigned hours against maximum weekly thresholds.</p>
          </div>
          <span className="model-badge">rules · workload-v1</span>
        </div>

        <div style={{ display: "flex", gap: 14, marginBottom: 18 }}>
          <input
            type="text"
            placeholder="Search by name, role, department or skills…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
          />
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
            Calculating team utilization…
          </div>
        ) : (
          <div className="capacity-list">
            {filteredWorkload.map((p) => (
              <div className="capacity-row" key={p.id}>
                <div className="person-cell">
                  <div className="avatar">{initials(p.name)}</div>
                  <div>
                    <b>{p.name}</b>
                    <small>{p.roleTitle} · {p.department}</small>
                  </div>
                </div>

                <div className="capacity-bar">
                  <div className="capacity-label">
                    <span>{p.plannedHours}h planned / {p.capacityHours}h</span>
                    <strong>{p.utilization}%</strong>
                  </div>
                  <div className="bar-track">
                    <span
                      className={p.loadBand}
                      style={{
                        width: `${Math.min(100, p.utilization)}%`,
                        background:
                          p.loadBand === "overloaded"
                            ? "#ef4444"
                            : p.loadBand === "underused"
                            ? "#3b82f6"
                            : "#10b981"
                      }}
                    />
                  </div>
                </div>

                <span className={`load-pill ${p.loadBand}`}>
                  {p.loadBand}
                </span>

                <span className="efficiency-value">
                  {p.efficiency}% eff.
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add Employee Modal */}
      {showAddEmp && (
        <div className="modal-backdrop" onClick={() => setShowAddEmp(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAddEmp(false)}>×</button>
            <h2>Add Team Member</h2>
            <form onSubmit={handleAddEmployee}>
              <label className="form-label">
                Full Name
                <input
                  type="text"
                  value={newEmp.name}
                  onChange={(e) => setNewEmp({ ...newEmp, name: e.target.value })}
                  required
                />
              </label>
              <label className="form-label">
                Work Email
                <input
                  type="email"
                  value={newEmp.email}
                  onChange={(e) => setNewEmp({ ...newEmp, email: e.target.value })}
                  required
                />
              </label>
              <div className="form-grid">
                <label className="form-label">
                  Department
                  <input
                    type="text"
                    value={newEmp.department}
                    onChange={(e) => setNewEmp({ ...newEmp, department: e.target.value })}
                    required
                  />
                </label>
                <label className="form-label">
                  Role Title
                  <input
                    type="text"
                    value={newEmp.roleTitle}
                    onChange={(e) => setNewEmp({ ...newEmp, roleTitle: e.target.value })}
                    required
                  />
                </label>
              </div>
              <div className="form-grid">
                <label className="form-label">
                  Weekly Capacity (Hours)
                  <input
                    type="number"
                    value={newEmp.capacityHours}
                    onChange={(e) => setNewEmp({ ...newEmp, capacityHours: Number(e.target.value) })}
                    required
                  />
                </label>
                <label className="form-label">
                  Skills
                  <input
                    type="text"
                    value={newEmp.skills}
                    onChange={(e) => setNewEmp({ ...newEmp, skills: e.target.value })}
                    required
                  />
                </label>
              </div>
              <button type="submit" className="primary-button full" style={{ marginTop: 14 }}>
                Create Employee
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="modal-backdrop" onClick={() => setShowInvite(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowInvite(false)}>×</button>
            <h2>Invite Teammate</h2>
            <form onSubmit={handleInvite}>
              <label className="form-label">
                Work Email
                <input
                  type="email"
                  value={newInvite.email}
                  onChange={(e) => setNewInvite({ ...newInvite, email: e.target.value })}
                  required
                />
              </label>
              <div className="form-grid">
                <label className="form-label">
                  Role
                  <select
                    value={newInvite.role}
                    onChange={(e) => setNewInvite({ ...newInvite, role: e.target.value })}
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <label className="form-label">
                  Department
                  <input
                    type="text"
                    value={newInvite.department}
                    onChange={(e) => setNewInvite({ ...newInvite, department: e.target.value })}
                    required
                  />
                </label>
              </div>
              <button type="submit" className="primary-button full" style={{ marginTop: 14 }}>
                Send Invitation
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
