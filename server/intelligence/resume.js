// Resume parsing for manager-initiated invitations. Rule-based by default (deterministic, explainable);
// refined by the LLM when one is configured. The result is only a DRAFT: a manager reviews and sends the invite.
import { httpError } from "../core/http.js";

const MAX_BYTES = 5 * 1024 * 1024;
const SKILLS = {
  engineering: ["javascript", "typescript", "react", "node", "python", "java", "go", "sql", "mongodb", "aws", "docker", "kubernetes", "devops", "api", "testing"],
  design: ["figma", "ux", "ui", "design", "prototyping", "branding"],
  data: ["machine learning", "analytics", "tableau", "power bi", "statistics", "etl", "data"],
  operations: ["project management", "agile", "scrum", "operations", "logistics", "procurement", "supply chain"],
  marketing: ["seo", "content", "marketing", "social media", "copywriting"],
  finance: ["accounting", "finance", "budgeting", "audit", "excel"],
  hr: ["recruiting", "payroll", "onboarding", "hr"],
};
const TITLE = /\b(engineer|developer|designer|analyst|manager|specialist|coordinator|consultant|architect|lead|scientist|administrator|executive|officer)\b/i;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function extractText({ filename = "", data = "", text = "" }) {
  if (text) return String(text).slice(0, 200_000);
  const buf = Buffer.from(String(data), "base64");
  if (!buf.length) throw httpError(400, "Upload a resume file or paste its text");
  if (buf.length > MAX_BYTES) throw httpError(413, "Resume must be under 5 MB");
  const ext = filename.toLowerCase().split(".").pop();
  if (["txt", "md", "text"].includes(ext)) return buf.toString("utf8");
  const load = async (name, pkg = name) => {
    try { return await import(name); }
    catch { throw httpError(501, `Reading .${ext} files needs the optional '${name}' package (npm i ${pkg}). Paste the text instead.`); }
  };
  if (ext === "pdf") return (await (await load("pdf-parse/lib/pdf-parse.js", "pdf-parse")).default(buf)).text;
  if (ext === "docx") return (await (await load("mammoth")).default.extractRawText({ buffer: buf })).value;
  throw httpError(415, "Supported resume types: PDF, DOCX, TXT");
}

export function parseResumeRules(raw) {
  const text = String(raw).replace(/\r/g, "");
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const lower = text.toLowerCase();
  const evidence = {};
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? "";
  if (email) evidence.email = "Email address found in the resume text";
  const phone = text.match(/(?:\+\d{1,3}[\s-]?)?(?:\(?\d{3,5}\)?[\s-]?)\d{3}[\s-]?\d{3,4}/)?.[0] ?? "";
  const nameLine = lines.slice(0, 5).find(l => /^[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,3}$/.test(l) && !TITLE.test(l));
  if (nameLine) evidence.name = "First short alphabetic line of the document";
  const titleLine = lines.slice(0, 8).find(l => l !== nameLine && l.length < 70 && TITLE.test(l));
  if (titleLine) evidence.roleTitle = `Title-like line near the top: "${titleLine}"`;

  const found = new Map();
  for (const [dept, list] of Object.entries(SKILLS))
    for (const skill of list) {
      const n = lower.match(new RegExp(`(?<![a-z])${esc(skill)}(?![a-z])`, "g"))?.length ?? 0;
      if (n) found.set(skill, { skill, mentions: n, dept });
    }
  const years = Math.max(0, ...[...lower.matchAll(/(\d{1,2})\+?\s*(?:years|yrs)/g)].map(m => +m[1]));
  const skills = [...found.values()].sort((a, b) => b.mentions - a.mentions).slice(0, 12).map(s => ({
    skill: s.skill,
    level: Math.min(5, 1 + Math.floor(s.mentions / 2) + (years >= 5 ? 1 : 0)),
    why: `Mentioned ${s.mentions}× in the resume${years ? `; ${years}+ years of experience stated` : ""}`,
  }));
  const tally = {};
  for (const s of found.values()) tally[s.dept] = (tally[s.dept] ?? 0) + s.mentions;
  const dept = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  if (dept) evidence.department = `Most skills matched the ${dept} vocabulary`;
  return {
    method: "rules", name: nameLine ?? "", email, phone, roleTitle: titleLine ?? "",
    department: dept ? dept[0].toUpperCase() + dept.slice(1) : "", yearsExperience: years || null, skills, evidence,
  };
}

/** Optional LLM refinement; any failure silently keeps the rule-based draft. */
export async function refineWithLLM(draft, text, { invoke, enabled }) {
  if (!enabled) return draft;
  try {
    const r = await invoke({
      messages: [
        { role: "system", content: "Extract resume data. Reply with JSON only: {name,email,roleTitle,department,skills:[{skill,level(1-5),why}]}. Use only facts present in the text." },
        { role: "user", content: text.slice(0, 12_000) },
      ],
      response_format: { type: "json_object" },
    });
    const j = JSON.parse(r.choices[0].message.content);
    return {
      ...draft, method: "llm+rules",
      name: j.name || draft.name, roleTitle: j.roleTitle || draft.roleTitle, department: j.department || draft.department,
      email: draft.email || String(j.email ?? "").toLowerCase(), // regex-verified email wins
      skills: Array.isArray(j.skills) && j.skills.length
        ? j.skills.slice(0, 15).map(s => ({ skill: String(s.skill).toLowerCase(), level: Math.min(5, Math.max(1, +s.level || 3)), why: String(s.why ?? "AI-extracted from resume") }))
        : draft.skills,
    };
  } catch { return draft; }
}

/** Explainable fit: overlap between resume skills and the required skills of projects that still have open work. */
export function suggestProjects(skills, tasks, projects) {
  const have = new Set(skills.map(s => s.skill.toLowerCase()));
  return projects.map(p => {
    const open = tasks.filter(t => t.projectId === p.id && t.status !== "done");
    const need = [...new Set(open.flatMap(t => (t.requiredSkills ?? []).map(r => String(r.skill ?? r).toLowerCase())))];
    const match = need.filter(n => have.has(n));
    return { projectId: p.id, name: p.name, openTasks: open.length, matchedSkills: match,
      reason: match.length ? `Resume covers ${match.length}/${need.length} required skills: ${match.join(", ")}` : "" };
  }).filter(s => s.matchedSkills.length).sort((a, b) => b.matchedSkills.length - a.matchedSkills.length).slice(0, 3);
}
