import React, { useState, useEffect } from "react";
import { api } from "../lib/api";

const pad = (v) => String(v).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function CalendarPlanner({ currentUser }) {
  const [people, setPeople] = useState({ employees: [], schedules: [] });
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    employeeId: "1",
    date: dateKey(new Date()),
    startTime: "09:00",
    endTime: "17:00",
    type: "work",
    note: ""
  });
  const [projects, setProjects] = useState([]);
  useEffect(() => { api.getProjects().then(r => setProjects(r.projects)).catch(() => {}); }, []);
  const [notice, setNotice] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getPeople();
      setPeople(res);
      if (res.employees.length > 0) {
        setNewSchedule(prev => ({ ...prev, employeeId: String(res.employees[0].id) }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateSchedule = async (e) => {
    e.preventDefault();
    try {
      await api.createSchedule({ ...newSchedule, projectId: newSchedule.projectId || undefined });
      setNotice("Schedule block registered.");
      setShowAddModal(false);
      loadData();
    } catch (err) {
      setNotice(`Error: ${err.message}`);
    }
  };

  return (
    <div>
      <div className="operations-heading">
        <div>
          <p className="eyebrow">WORKFORCE SCHEDULING</p>
          <h1>Team Schedule Planner</h1>
          <p className="subtitle">
            Shift coverage, meeting blocks, focus intervals, and approved leaves.
          </p>
        </div>
        <div className="operations-actions">
          <button className="primary-button" onClick={() => setShowAddModal(true)}>
            ＋ Add Schedule Block
          </button>
        </div>
      </div>

      {notice && (
        <div className="success-banner">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}

      <section className="ops-panel">
        <div className="ops-panel-header">
          <div>
            <h2>Scheduled Coverage by Team Member</h2>
            <p>Active schedule entries for this operating window.</p>
          </div>
          <span className="date-chip">Today · {dateKey(new Date())}</span>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
            Loading schedules…
          </div>
        ) : (
          <div className="schedule-grid">
            {people.employees.map((emp) => {
              const empSchedules = people.schedules.filter(
                (s) => Number(s.employeeId) === Number(emp.id)
              );
              return (
                <div className="schedule-person" key={emp.id}>
                  <div>
                    <b style={{ color: "#0f172a", fontSize: 13 }}>{emp.name}</b>
                    <small style={{ display: "block", color: "#64748b", fontSize: 11 }}>
                      {emp.roleTitle} · {emp.department}
                    </small>
                  </div>
                  <div className="schedule-blocks">
                    {empSchedules.length > 0 ? (
                      empSchedules.map((s) => (
                        <div key={s.id} className={`schedule-block ${s.type}`}>
                          <b>
                            {s.type.toUpperCase()}: {s.startTime} - {s.endTime}
                          </b>
                          <span>{s.note || s.date}</span>
                        </div>
                      ))
                    ) : (
                      <span className="empty-note">No active schedule blocks for today</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Add Schedule Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            <h2>Add Schedule Block</h2>
            <form onSubmit={handleCreateSchedule}>
              <label className="form-label">
                Team Member
                <select
                  value={newSchedule.employeeId}
                  onChange={(e) => setNewSchedule({ ...newSchedule, employeeId: e.target.value })}
                >
                  {people.employees.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>

              <label className="form-label">
                Project (optional: shares this block with the project team)
                <select value={newSchedule.projectId ?? ""} onChange={(e) => setNewSchedule({ ...newSchedule, projectId: e.target.value })}>
                  <option value="">No project (personal block)</option>
                  {projects.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                </select>
              </label>

              <div className="form-grid">
                <label className="form-label">
                  Date
                  <input
                    type="date"
                    value={newSchedule.date}
                    onChange={(e) => setNewSchedule({ ...newSchedule, date: e.target.value })}
                    required
                  />
                </label>
                <label className="form-label">
                  Block Type
                  <select
                    value={newSchedule.type}
                    onChange={(e) => setNewSchedule({ ...newSchedule, type: e.target.value })}
                  >
                    <option value="work">Work Shift</option>
                    <option value="meeting">Meeting</option>
                    <option value="focus">Focus Deep Work</option>
                    <option value="leave">Planned Leave</option>
                  </select>
                </label>
              </div>

              <div className="form-grid">
                <label className="form-label">
                  Start Time
                  <input
                    type="time"
                    value={newSchedule.startTime}
                    onChange={(e) => setNewSchedule({ ...newSchedule, startTime: e.target.value })}
                    required
                  />
                </label>
                <label className="form-label">
                  End Time
                  <input
                    type="time"
                    value={newSchedule.endTime}
                    onChange={(e) => setNewSchedule({ ...newSchedule, endTime: e.target.value })}
                    required
                  />
                </label>
              </div>

              <label className="form-label">
                Description / Note
                <input
                  type="text"
                  placeholder="e.g. Customer onboarding coverage"
                  value={newSchedule.note}
                  onChange={(e) => setNewSchedule({ ...newSchedule, note: e.target.value })}
                />
              </label>

              <button type="submit" className="primary-button full" style={{ marginTop: 14 }}>
                Create Schedule Block
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
