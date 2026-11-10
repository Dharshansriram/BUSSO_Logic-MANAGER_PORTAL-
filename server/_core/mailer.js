import { randomUUID } from "node:crypto";
import { ENV } from "./env.js";
import { getGmailAccessToken } from "../routes/googleOAuth.js";

// Provider-agnostic mailer. Gmail API OAuth is preferred when configured;
// SMTP remains available as a fallback for deployments using another provider.
let transport;
export const mailConfigured = () =>
  Boolean(ENV.googleClientId || transport || (ENV.smtpHost && ENV.smtpUser && ENV.smtpPass && ENV.mailFrom));
export const setMailTransport = value => { transport = value; };

async function getTransport() {
  if (transport) return transport;
  if (!ENV.smtpHost || !ENV.smtpUser || !ENV.smtpPass || !ENV.mailFrom) return null;
  const { default: nodemailer } = await import("nodemailer");
  transport = nodemailer.createTransport({
    host: ENV.smtpHost, port: ENV.smtpPort, secure: ENV.smtpSecure,
    auth: { user: ENV.smtpUser, pass: ENV.smtpPass },
  });
  return transport;
}
const b64url = value => Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
function mimeMessage({ to, subject, text, html }) {
  const boundary = `bussologic_${randomUUID().replace(/-/g, "")}`;
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
  const headers = [
    `From: BUSSOLOGIC <${ENV.googleSenderEmail}>`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const parts = [
    `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(text ?? "", "utf8").toString("base64")}`,
    `--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(html ?? "", "utf8").toString("base64")}`,
    `--${boundary}--`,
  ];
  return b64url(`${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`);
}
async function sendWithGmailApi(message) {
  const accessToken = await getGmailAccessToken();
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ raw: mimeMessage(message) }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.warn("[mail] Gmail API rejected message:", error?.error?.status ?? response.status);
    throw new Error("Gmail API delivery failed");
  }
}
/** Returns { sent: boolean, reason?: string }. Never throws or logs credentials/message bodies. */
export async function sendMail({ to, subject, text, html }) {
  try {
    if (ENV.googleClientId) {
      await sendWithGmailApi({ to, subject, text, html });
      return { sent: true };
    }
    const mailer = await getTransport();
    if (!mailer) return { sent: false, reason: "Email provider is not configured" };
    await mailer.sendMail({ from: ENV.mailFrom, to, subject, text, html });
    return { sent: true };
  } catch (error) {
    console.warn("[mail] delivery failed:", error?.code ?? error?.name ?? "error");
    return { sent: false, reason: "Email provider rejected or could not send the message" };
  }
}
