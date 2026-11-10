import React, { useEffect, useState } from "react";
import Dashboard from "../pages/Dashboard.jsx";
import PredictiveRadar from "../pages/PredictiveRadar.jsx";
import CapacityIntelligence from "../pages/CapacityIntelligence.jsx";
import DecisionSimulator from "../pages/DecisionSimulator.jsx";
import Recommendations from "../pages/Recommendations.jsx";
import WorkflowBuilder from "../pages/WorkflowBuilder.jsx";
import Copilot from "../pages/Copilot.jsx";
import OutcomeLearning from "../pages/OutcomeLearning.jsx";
import AuditMonitor from "../pages/AuditMonitor.jsx";
import CalendarPlanner from "../pages/CalendarPlanner.jsx";
import Projects from "../pages/Projects.jsx";
import Tasks from "../pages/Tasks.jsx";
import Settings from "../pages/Settings.jsx";
import LiveMonitor from "./LiveMonitor.jsx";
import ResumeInvite from "./ResumeInvite.jsx";
import { AlertsPanel, AssignmentQueue, DailyProgress, FeedbackPanel, OperationsStrip, ProjectWorkflow, TeamManager } from "./ManagerViews.jsx";

export const MANAGER_NAV = [
  { id: "Overview", label: "Operations Overview", icon: "⌂" },
  { id: "Live", label: "Live Monitor", icon: "◉" },
  { id: "Projects", label: "Projects & Workflow", icon: "📁" },
  { id: "Workforce", label: "Workforce & AI Allocation", icon: "👥" },
  { id: "Decision", label: "Decision Intelligence", icon: "◎" },
  { id: "Governance", label: "Execution & Governance", icon: "🛡" },
];

const LEGACY = { Tasks: "Projects", WorkflowBuilder: "Projects", PredictiveRadar: "Decision", CapacityIntelligence: "Decision",
  DecisionSimulator: "Decision", Recommendations: "Decision", Copilot: "Decision", OutcomeLearning: "Decision",
  AuditMonitor: "Governance", Settings: "Governance", Calendar: "Workforce" };

function Tabs({ tabs, render, controlled }) {
  const local = useState(tabs[0]);
  const [tab, setTab] = controlled ?? local;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {tabs.map(t => <button key={t} className={`secondary-button ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {render(tab)}
    </div>
  );
}

export default function ManagerSections({ view, setView, ctx }) {
  const decisionTab = useState("Predictive Radar");
  useEffect(() => { if (ctx.simulatorNonce) decisionTab[1]("Scenario Simulator"); }, [ctx.simulatorNonce]);
  const { dashboardData, employee, onUpdateTask, onResolveAlert, onSelectTask, simulate, simulatorTaskId, refresh } = ctx;
  
if (view === "Overview")
  return (
    <Dashboard
      data={dashboardData}
      employee={employee}
      onNavigate={id => setView(LEGACY[id] ?? id)}
      onUpdateTask={onUpdateTask}
      onResolveAlert={onResolveAlert}
      onSelectTask={onSelectTask}
      onSimulateRecommendation={rec => simulate(rec.targetTaskId || 1)}
    />
  );

  if (view === "Live") return <LiveMonitor />;
  if (view === "Projects")
    return (
      <Tabs tabs={["Workflow & Skills", "Projects", "Task Board", "Workflow Templates"]} render={t => (
        t === "Workflow & Skills" ? <ProjectWorkflow onNavigate={setView} />
          : t === "Projects" ? <Projects /> : t === "Task Board" ? <Tasks onSelectTask={onSelectTask} /> : <WorkflowBuilder />
      )} />
    );
  if (view === "Workforce")
    return (
      <Tabs tabs={["AI Assignment Queue", "Resume & Invite", "Team & Skills", "Schedules", "Feedback"]} render={t => (
        t === "AI Assignment Queue" ? <AssignmentQueue /> : t === "Resume & Invite" ? <ResumeInvite onInvited={refresh} /> : t === "Team & Skills" ? <TeamManager ctx={ctx} />
          : t === "Schedules" ? <CalendarPlanner currentUser={employee} /> : <FeedbackPanel />
      )} />
    );
  if (view === "Decision")
    return (
      <Tabs controlled={decisionTab} tabs={["Predictive Radar", "Capacity", "Recommendations", "Scenario Simulator", "Copilot", "Outcome Learning"]} render={t => (
        t === "Predictive Radar" ? <PredictiveRadar onSimulateTask={simulate} />
          : t === "Capacity" ? <CapacityIntelligence currentUser={employee} />
          : t === "Recommendations" ? <Recommendations onNavigateToSimulator={simulate} />
          : t === "Scenario Simulator" ? <DecisionSimulator initialTaskId={simulatorTaskId} onInterventionApplied={refresh} />
          : t === "Copilot" ? <Copilot onNavigateToSimulator={simulate} /> : <OutcomeLearning />
      )} />
    );
  return (
    <Tabs tabs={["Daily Progress", "Alerts", "Activity & Audit", "Settings"]} render={t => (
      t === "Daily Progress" ? <DailyProgress /> : t === "Alerts" ? <AlertsPanel />
        : t === "Activity & Audit" ? <AuditMonitor /> : <Settings currentUser={employee} />
    )} />
  );
}
