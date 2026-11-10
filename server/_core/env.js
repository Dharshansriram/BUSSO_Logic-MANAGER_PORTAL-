import "dotenv/config";

const toBool = value =>
  ["true", "1", "yes"].includes(
    String(value ?? "")
      .trim()
      .toLowerCase()
  );
const toList = (value, fallback) =>
  value
    ? String(value)
        .split(",")
        .map(item => item.trim())
        .filter(Boolean)
    : fallback;

/**
 * Single source of truth for runtime configuration.
 * Every value comes from process.env (loaded from .env by dotenv).
 */
export const ENV = {
  isProduction: process.env.NODE_ENV === "production",

  // Server
  port: Number.parseInt(process.env.PORT ?? "8000", 10),
  host: process.env.HOST ?? "0.0.0.0",
  corsOrigins: toList(process.env.CORS_ORIGINS, [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
  ]),

  // Database (falls back to in-memory demo data when MongoDB is unreachable)
  mongoUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/bussologic",
  mongoDb: process.env.MONGODB_DB ?? "bussologic", // used when the URI has no /dbname (typical for Atlas)

  // Auth
  cookieSecret: process.env.JWT_SECRET ?? "",
  sessionCookie: "intelliflow_manager_session",
  sessionTtlMs: 12 * 60 * 60 * 1000,

  // Employee invitations. Credentials come from the environment only.
  // "manager" (managers only may sign in) | "employee" | "any": which of the two separate apps this server instance backs.
  portalMode: process.env.PORTAL_MODE ?? "any",
  // Activation links point at the Employee Portal (falls back to FRONTEND_BASE_URL).
  employeePortalUrl: (process.env.EMPLOYEE_PORTAL_URL ?? process.env.FRONTEND_BASE_URL ?? "http://localhost:5173").replace(/\/+$/, ""),
  frontendBaseUrl: (process.env.FRONTEND_BASE_URL ?? "http://localhost:5173").replace(/\/+$/, ""),
  inviteTtlHours: Number.parseFloat(process.env.INVITE_TTL_HOURS ?? "48") || 48,
  companyName: process.env.COMPANY_NAME ?? "BUSSOLOGIC",
  smtpHost: process.env.SMTP_HOST ?? "", // e.g. smtp.gmail.com / smtp.sendgrid.net / smtp-relay.brevo.com
  smtpPort: Number.parseInt(process.env.SMTP_PORT ?? "587", 10),
  smtpSecure: toBool(process.env.SMTP_SECURE), // true for port 465
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  mailFrom: process.env.MAIL_FROM ?? process.env.SMTP_USER ?? "",

  // Gmail API OAuth (Manager Portal only).
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
  googleTokenEncryptionKey: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? "",
  googleSenderEmail: (process.env.GOOGLE_SENDER_EMAIL ?? "dharshansriram.r@gmail.com").trim().toLowerCase(),


  // Optional LLM enrichment (OpenAI-compatible chat/completions API)
  enableLlm: toBool(process.env.ENABLE_LLM),
  llmApiKey: process.env.LLM_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "gpt-4o-mini",
  llmApiUrl: process.env.LLM_API_URL ?? "https://api.openai.com/v1",

  // Optional Manus "Forge" platform helpers (storage, maps, image, voice, notifications)
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
