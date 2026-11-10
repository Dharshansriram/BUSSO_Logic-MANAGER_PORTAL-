import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

const POLL_MS = 8000;
const LABEL = { todo: "To do", in_progress: "In progress", done: "Done", blocked: "Blocked" };
const COLOR = { todo: "#8a94a6", in_progress: "#2457ff", done: "#1a9d5b", blocked: "#d6336c" };
const fmt = d => (d ? new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const ago = d => { const s = Math.max(0, Math.round((Date.now() - +new Date(d)) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`; };

const Bar = ({ value, color = "#2457ff", warn }) => (
  <div style={{ background: "rgba(128,128,128,.2)", borderRadius: 6, height: 8, minWidth: 90, overflow: "hidden" }} title={`${value}%`}>
    <div style={{ width: `${Math.min(100, value ?? 0)}%`, height: "100%", background: warn ? "#d6336c" : color, transition: "width .4s" }} />
  </div>
);
const Pill = ({ status }) => <span style={{ color: COLOR[status], fontWeight: 600 }}>{LABEL[status] ?? status}</span>;

/** Polls the shared-database snapshot; the server answers {unchanged:true} when nothing moved (cheap). */
export function useLive() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [syncedAt, setSyncedAt] = useState(null);
  const rev = useRef("");
  const tick = useCallback(async () => {
    try {
      const r = await api.managerLive(rev.current);
      if (!r.unchanged) { rev.current = r.rev; setData(r); }
      setSyncedAt(Date.now()); setError("");
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => {
    tick();
    const id = setInterval(() => { if (!document.hidden) tick(); }, POLL_MS);
    const vis = () => !document.hidden && tick();
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, [tick]);
  return { data, error, syncedAt };
}

export default function LiveMonitor() {
  const { data, error, syncedAt } = useLive();
  const [project, setProject] = useState("all");
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force(n => n + 1), 1000); return () => clearInterval(t); }, []);
  if (!data) return <div className="panel">{error ? <div className="auth-error">{error}</div> : "Loading live data…"}</div>;
  const people = data.people.map(p => ({ ...p, tasks: p.tasks.filter(t => project === "all" || String(t.projectId) === project) }))
    .filter(p => project === "all" || p.tasks.length);
  const blockers = data.people.flatMap(p => p.tasks.filter(t => t.status === "blocked").map(t => ({ ...t, who: p.name })));
  return (
    <div className="live-monitor-page">
     <div className="live-monitor-toolbar">
        <span className="live-status"><i /> {error ? "Reconnecting…" : "Live"}</span>
        <small>{syncedAt ? `Checked ${ago(syncedAt)} · refreshes every ${POLL_MS / 1000}s` : ""} · {data.onlineCount} employee(s) online</small>
        {error && <span className="auth-error">Live updates interrupted: {error}. Showing last data ({ago(data.generatedAt)}).</span>}
        <select value={project} onChange={e => setProject(e.target.value)} style={{ marginLeft: "auto" }}>
          <option value="all">All projects</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {blockers.length > 0 && (
        <div className="panel" style={{ borderLeft: "4px solid #d6336c" }}>
          <h3 style={{ marginTop: 0 }}>Blockers needing attention ({blockers.length})</h3>
          {blockers.map(b => <div key={b.id}><b>{b.who}</b> · {b.title} <small>({b.project})</small> — {b.blocker}</div>)}
        </div>
      )}

      <section className="metric-grid">
        {data.projects.filter(p => project === "all" || String(p.id) === project).map(p => (
          <div className="metric-card live-monitor-project-card" key={p.id}>
            <div className="metric-label">{p.name} · due {fmt(p.dueAt).split(",")[0]}</div>
            <div className="metric-value" style={{ fontSize: "1.4rem" }}>{p.progress}%</div>
            <Bar value={p.progress} />
            <small>{p.open} open · {p.blocked} blocked · {p.overdue} overdue · {p.loggedHours}h logged</small><br />
            <small style={{ color: p.schedule.behind ? "#d6336c" : undefined }}>
              {p.schedule.schedulePct == null ? "No project schedule yet" : `Schedule ${p.schedule.schedulePct}% elapsed (${p.schedule.elapsedHours}/${p.schedule.scheduledHours}h)${p.schedule.behind ? " · behind schedule" : ""}`}
            </small>
          </div>
        ))}
      </section>

      <div className="panel live-monitor-table-panel">
        <h3 style={{ marginTop: 0 }}>Employee progress</h3>
        <table className="live-monitor-table">
          <thead><tr>{["Employee", "Task", "Status", "Progress", "Deadline", "Last update"].map(h => <th key={h} style={{ textAlign: "left", padding: 6 }}>{h}</th>)}</tr></thead>
          <tbody>
            {people.map(p => (p.tasks.length ? p.tasks : [null]).map((t, i) => (
              <tr key={`${p.id}-${t?.id ?? "none"}`} style={{ borderTop: "1px solid rgba(128,128,128,.2)" }}>
                <td style={{ padding: 6 }}>{i === 0 && <><span title={p.online ? "Online" : "Offline"} style={{ color: p.online ? "#1a9d5b" : "#8a94a6" }}>●</span> <b>{p.name}</b><br /><small>{p.status === "pending" ? "Invited · not activated" : `${p.completionPct ?? 0}% overall`}</small></>}</td>
                {t ? <>
                  <td style={{ padding: 6 }}>{t.title}<br /><small>{t.project}</small>{t.blocker && <><br /><small style={{ color: "#d6336c" }}>⚠ {t.blocker}</small></>}</td>
                  <td style={{ padding: 6 }}><Pill status={t.status} /></td>
                  <td style={{ padding: 6 }}><Bar value={t.progress} color={COLOR[t.status]} /><small>{t.progress}%</small></td>
                  <td style={{ padding: 6, color: t.overdue ? "#d6336c" : undefined }}>{fmt(t.dueAt)}{t.overdue && " · overdue"}</td>
                  <td style={{ padding: 6 }}>{t.updatedAt ? ago(t.updatedAt) : "—"}{t.lastNote && <><br /><small>“{t.lastNote}”</small></>}</td>
                </> : <td colSpan={5} style={{ padding: 6 }}><small>No open tasks</small></td>}
              </tr>
            )))}
          </tbody>
        </table>
      </div>

      <div className="panel live-monitor-blockers">
        <h3 style={{ marginTop: 0 }}>Recent updates from employees</h3>
        {!data.updates.length && <p>No progress updates yet.</p>}
        {data.updates.filter(u => project === "all" || data.people.some(p => p.tasks.some(t => t.id === u.taskId && String(t.projectId) === project))).slice(0, 12).map((u, i) => (
          <div key={u.id ?? i}><small>{ago(u.at)}</small> · <b>{u.employeeName}</b> → {u.taskTitle}: <Pill status={u.status} /> {u.progress}%{u.hoursLogged ? ` · +${u.hoursLogged}h` : ""}{u.blocker ? ` · blocker: ${u.blocker}` : ""}{u.note ? ` · “${u.note}”` : ""}</div>
        ))}
      </div>
    </div>
  );
}
