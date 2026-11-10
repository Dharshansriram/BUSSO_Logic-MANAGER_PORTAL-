import { Router } from "express";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { ENV } from "../_core/env.js";
import { getDb } from "../core/database.js";
import { getEmployeeBySession, getSessionToken } from "../core/auth.js";

export const googleOAuthRouter = Router();
const STATE_COOKIE = "bussologic_google_oauth_state";
const TOKEN_DOC_ID = "primary";

function encryptionKey() {
  const key = Buffer.from(ENV.googleTokenEncryptionKey, "hex");
  if (key.length !== 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  return key;
}
function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), data: data.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}
function decrypt(record) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(record.iv, "base64"));
  decipher.setAuthTag(Buffer.from(record.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(record.data, "base64")), decipher.final()]).toString("utf8");
}
function configReady() {
  return ENV.googleClientId && ENV.googleClientSecret && ENV.googleRedirectUri && ENV.googleTokenEncryptionKey;
}
async function managerOnly(req, res) {
  const employee = await getEmployeeBySession(getSessionToken(req));
  if (!employee || !["manager", "admin"].includes(employee.role)) {
    res.status(employee ? 403 : 401).send("Manager/admin login required.");
    return false;
  }
  return true;
}

googleOAuthRouter.get("/start", async (req, res) => {
  try {
    if (!(await managerOnly(req, res))) return;
    if (!configReady()) return res.status(503).send("Google OAuth is not configured on this server.");
    const state = randomBytes(32).toString("hex");
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/auth/google", maxAge: 10 * 60 * 1000
    });
    const params = new URLSearchParams({
      client_id: ENV.googleClientId,
      redirect_uri: ENV.googleRedirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: "openid email https://www.googleapis.com/auth/gmail.send",
      state
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  } catch (error) {
    console.error("[google-oauth] start failed:", error?.name ?? "error");
    res.status(500).send("Could not start Google authorization.");
  }
});

googleOAuthRouter.get("/callback", async (req, res) => {
  try {
    if (!(await managerOnly(req, res))) return;
    const expected = req.cookies?.[STATE_COOKIE];
    // Cookie parsing is intentionally avoided; parse the raw header safely.
    const raw = req.headers.cookie ?? "";
    const cookieValue = raw.split(";").map(v => v.trim()).find(v => v.startsWith(`${STATE_COOKIE}=`))?.slice(STATE_COOKIE.length + 1);
    res.clearCookie(STATE_COOKIE, { httpOnly: true, secure: true, sameSite: "lax", path: "/auth/google" });
    if (!req.query.code || !req.query.state || !cookieValue || req.query.state !== decodeURIComponent(cookieValue)) {
      return res.status(400).send("Google authorization state validation failed. Please try again.");
    }
    if (req.query.error) return res.status(400).send("Google authorization was cancelled or denied.");
    if (!configReady()) return res.status(503).send("Google OAuth is not configured.");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(req.query.code),
        client_id: ENV.googleClientId,
        client_secret: ENV.googleClientSecret,
        redirect_uri: ENV.googleRedirectUri,
        grant_type: "authorization_code"
      })
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token) {
      console.warn("[google-oauth] code exchange rejected:", tokens.error ?? tokenResponse.status);
      return res.status(502).send("Google authorization could not be completed. Check OAuth configuration.");
    }
    const infoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${tokens.access_token}` }
    });
    const info = await infoResponse.json();
    if (!infoResponse.ok || String(info.email ?? "").toLowerCase() !== ENV.googleSenderEmail) {
      return res.status(403).send("Please authorize the configured Gmail sender account.");
    }
    const database = await getDb();
    if (!database) return res.status(503).send("MongoDB is unavailable; Gmail credentials were not saved.");
    const collection = database.collection("gmail_oauth_tokens");
    const existing = await collection.findOne({ _id: TOKEN_DOC_ID });
    const refreshToken = tokens.refresh_token ?? (existing?.encryptedRefreshToken ? decrypt(existing.encryptedRefreshToken) : null);
    if (!refreshToken) return res.status(400).send("Google did not return a refresh token. Revoke this app's access in your Google Account and retry.");
    await collection.updateOne(
      { _id: TOKEN_DOC_ID },
      { $set: { encryptedRefreshToken: encrypt(refreshToken), email: ENV.googleSenderEmail, updatedAt: new Date() } },
      { upsert: true }
    );
    res.redirect("/settings?gmail=connected");
  } catch (error) {
    console.error("[google-oauth] callback failed:", error?.name ?? "error");
    res.status(500).send("Google authorization failed. Check server configuration and logs.");
  }
});

export async function getGmailAccessToken() {
  const database = await getDb();
  if (!database) throw new Error("MongoDB unavailable for Gmail OAuth credentials");
  const record = await database.collection("gmail_oauth_tokens").findOne({ _id: TOKEN_DOC_ID });
  if (!record?.encryptedRefreshToken) throw new Error("Gmail sender account has not been connected");
  const refreshToken = decrypt(record.encryptedRefreshToken);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  const tokens = await response.json();
  if (!response.ok || !tokens.access_token) {
    console.warn("[google-oauth] refresh rejected:", tokens.error ?? response.status);
    throw new Error("Could not refresh Gmail access token");
  }
  return tokens.access_token;
}
