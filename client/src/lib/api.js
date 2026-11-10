// BUSSOLOGIC Centralized API Client

const BASE = "/api";

async function request(endpoint, options = {}) {
  const url = `${BASE}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    // Session expired or unauthenticated
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.error || "Please sign in to continue");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.error || `Request failed with status ${response.status}`);
  }

  return data;
}

export const api = {
  // Auth
  login: (email, password) => request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  getMe: () => request("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),
  forgotPassword: (email) => request("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token, password) => request("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),

  // Invitation activation (public)
  checkActivation: (token) => request("/auth/activation/check", { method: "POST", body: JSON.stringify({ token }) }),
  activateAccount: (token, password, confirmPassword) => request("/auth/activate", { method: "POST", body: JSON.stringify({ token, password, confirmPassword }) }),
  resendInvite: (id) => request(`/employees/${id}/resend-invite`, { method: "POST" }),

  // Dashboard & Projects
  getDashboard: () => request("/dashboard"),
  getProjects: () => request("/projects"),
  createProject: (data) => request("/projects", { method: "POST", body: JSON.stringify(data) }),

  // Tasks & Alerts
  getTasks: () => request("/tasks"),
  createTask: (data) => request("/tasks", { method: "POST", body: JSON.stringify(data) }),
  updateTaskStatus: (taskId, status) => request(`/tasks/${taskId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  resolveAlert: (alertId) => request(`/alerts/${alertId}/resolve`, { method: "POST" }),

  // People & Workforce
  getPeople: () => request("/people"),
  createEmployee: (data) => request("/employees", { method: "POST", body: JSON.stringify(data) }),
  updateEmployeeRole: (id, role) => request(`/employees/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  createSchedule: (data) => request("/schedules", { method: "POST", body: JSON.stringify(data) }),
  createInvitation: (data) => request("/invitations", { method: "POST", body: JSON.stringify(data) }),

  // Analytics & ML
  getWorkload: () => request("/analytics/workload"),
  getPredictions: () => request("/analytics/predictions"),
  getRecommendations: () => request("/analytics/recommendations"),
  notifyAtRisk: () => request("/analytics/notify-at-risk", { method: "POST" }),
  getMlModel: () => request("/analytics/ml-model"),

  // Decision Simulator
  compareIntervention: (data) => request("/simulator/compare", { method: "POST", body: JSON.stringify(data) }),
  getSimulationHistory: () => request("/simulator/history"),

  // Business Copilot
  askCopilot: (question, context = {}) => request("/copilot/ask", { method: "POST", body: JSON.stringify({ question, context }) }),

  // Outcome Learning
  getOutcomes: () => request("/outcomes"),
  recordOutcome: (data) => request("/outcomes/record", { method: "POST", body: JSON.stringify(data) }),

  // Workflows
  generateWorkflow: (prompt) => request("/workflows/generate", { method: "POST", body: JSON.stringify({ prompt }) }),
  getWorkflows: () => request("/workflows"),
  createWorkflow: (data) => request("/workflows", { method: "POST", body: JSON.stringify(data) }),
  executeWorkflow: (id) => request(`/workflows/${id}/execute`, { method: "PUT" }),

  // Audit Logs
  getAuditLogs: () => request("/audit-logs"),

  // Manager portal
  managerOverview: () => request("/manager/overview"),
  dailyProgress: (from, to) => request(`/manager/daily-progress?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  createManagedProject: (data) => request("/manager/projects", { method: "POST", body: JSON.stringify(data) }),
  generateProposals: (data = {}) => request("/manager/proposals/generate", { method: "POST", body: JSON.stringify(data) }),
  getProposals: () => request("/manager/proposals"),
  approveProposal: (id, data = {}) => request(`/manager/proposals/${id}/approve`, { method: "POST", body: JSON.stringify(data) }),
  rejectProposal: (id, data = {}) => request(`/manager/proposals/${id}/reject`, { method: "POST", body: JSON.stringify(data) }),
  applySimulation: (data) => request("/manager/simulations/apply", { method: "POST", body: JSON.stringify(data) }),
  giveFeedback: (data) => request("/manager/feedback", { method: "POST", body: JSON.stringify(data) }),

  // Employee portal
  managerLive: (rev) => request(`/manager/live${rev ? `?rev=${encodeURIComponent(rev)}` : ""}`),
  parseResume: (data) => request("/manager/resume/parse", { method: "POST", body: JSON.stringify(data) }),
  meDashboard: () => request("/me/dashboard"),
  meTasks: () => request("/me/tasks"),
  meProjects: () => request("/me/projects"),
  mePerformance: () => request("/me/performance"),
  meProfile: () => request("/me/profile"),
  updateMyProfile: (data) => request("/me/profile", { method: "PATCH", body: JSON.stringify(data) }),
  updateMyTask: (id, data) => request(`/me/tasks/${id}/update`, { method: "POST", body: JSON.stringify(data) })
};
