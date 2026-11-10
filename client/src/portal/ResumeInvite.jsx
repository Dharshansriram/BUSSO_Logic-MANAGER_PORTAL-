
import React, { useState } from "react";
import { api } from "../lib/api";

const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });

/** Upload/paste a resume -> review extracted profile -> confirm invitation. */
export default function ResumeInvite({ onInvited }) {
  const [text, setText] = useState("");
  const [res, setRes] = useState(null);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [fileName, setFileName] = useState("");

  const parse = async (payload) => {
    setErr("");
    setMsg("");
    setBusy(true);

    try {
      const r = await api.parseResume(payload);
      setRes(r);
      setF({
        name: r.draft.name,
        email: r.draft.email,
        department: r.draft.department,
        roleTitle: r.draft.roleTitle,
        skills: r.draft.skills.map((s) => s.skill).join(", "),
        capacityHours: 40,
        role: "employee",
      });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setErr("");
    setMsg("");
    setBusy(true);

    try {
      const data = await toBase64(file);
      await parse({ filename: file.name, data });
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  const send = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);

    try {
      const r = await api.createEmployee({
        ...f,
        capacityHours: Number(f.capacityHours) || 40,
      });

      setMsg(
        r.emailSent
          ? `Invitation emailed to ${r.email}. The account stays pending until they activate it.`
          : `${f.name} was added as pending but the email was not sent (${r.emailError}). Use "Resend invite" in Team & Skills.`
      );

      setRes(null);
      setF(null);
      setText("");
      setFileName("");
      onInvited?.();
    } catch (ex) {
      setErr(
        /already exists/i.test(ex.message)
          ? `An account for ${f.email} already exists.`
          : ex.message
      );
    } finally {
      setBusy(false);
    }
  };

  const updateField = (key, value) => {
    setF((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="resume-workspace">
      <section className="resume-hero">
        <div className="resume-hero-copy">
          <div className="resume-eyebrow">
            <span className="resume-eyebrow-dot" />
            PEOPLE OPERATIONS
          </div>

          <h2>Resume &amp; Invite</h2>

          <p>
            Turn resumes into employee profiles, review extracted information,
            and invite new team members through a manager-approved workflow.
          </p>

          <div className="resume-hero-tags">
            <span><b>01</b> Upload resume</span>
            <span><b>02</b> Review profile</span>
            <span><b>03</b> Send invitation</span>
          </div>
        </div>

        <div className="resume-hero-art" aria-hidden="true">
          <div className="resume-art-back">PDF</div>
          <div className="resume-art-front">
            <div className="resume-art-icon">↗</div>
            <div className="resume-art-line resume-art-line-long" />
            <div className="resume-art-line" />
            <div className="resume-art-line resume-art-line-short" />
            <div className="resume-art-check">✓</div>
          </div>
          <div className="resume-art-spark">✦</div>
        </div>
      </section>

      <div className="resume-step-indicator">
        <div className={`resume-step ${!res ? "resume-step-active" : "resume-step-done"}`}>
          <span>{res ? "✓" : "1"}</span>
          <div>
            <b>Resume input</b>
            <small>Upload or paste content</small>
          </div>
        </div>

        <div className={`resume-step-line ${res ? "resume-step-line-done" : ""}`} />

        <div className={`resume-step ${res ? "resume-step-active" : ""}`}>
          <span>2</span>
          <div>
            <b>Review profile</b>
            <small>Verify extracted details</small>
          </div>
        </div>

        <div className="resume-step-line" />

        <div className="resume-step">
          <span>3</span>
          <div>
            <b>Invite employee</b>
            <small>Confirm and send securely</small>
          </div>
        </div>
      </div>

      {msg && (
        <div className="resume-notice resume-notice-success" role="status">
          <span className="resume-notice-icon">✓</span>
          <div>
            <b>Invitation workflow update</b>
            <p>{msg}</p>
          </div>
          <button
            type="button"
            className="resume-notice-dismiss"
            onClick={() => setMsg("")}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      {err && (
        <div className="resume-notice resume-notice-error" role="alert">
          <span className="resume-notice-icon">!</span>
          <div>
            <b>Something needs your attention</b>
            <p>{err}</p>
          </div>
          <button
            type="button"
            className="resume-notice-dismiss"
            onClick={() => setErr("")}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <div className="resume-main-grid">
        <section className="resume-panel resume-input-panel">
          <div className="resume-panel-heading">
            <div className="resume-panel-icon resume-panel-icon-purple">
              ↥
            </div>
            <div>
              <h3>Import a resume</h3>
              <p>Start with a document or paste the resume text.</p>
            </div>
          </div>

          <label className="resume-upload-zone">
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={onFile}
              disabled={busy}
            />

            <span className="resume-upload-icon">↑</span>
            <b>{fileName || "Choose a resume to upload"}</b>
            <span className="resume-upload-description">
              {fileName
                ? "Choose another file to replace it"
                : "Click to browse your files"}
            </span>
            <span className="resume-file-formats">
              PDF <i /> DOCX <i /> TXT <i /> MD
            </span>
          </label>

          <div className="resume-or-divider">
            <span />
            <small>OR PASTE RESUME TEXT</small>
            <span />
          </div>

          <label className="resume-input-label" htmlFor="resume-text">
            Resume content
          </label>

          <textarea
            id="resume-text"
            className="resume-textarea"
            rows={7}
            placeholder="Paste the candidate's resume here. Include their contact information, experience, education and skills..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
          />

          <div className="resume-input-footer">
            <span className={text.trim().length < 30 ? "" : "resume-text-ready"}>
              {text.trim().length} characters
              {text.trim().length < 30 ? " · 30 minimum" : " · Ready to parse"}
            </span>

            <button
              type="button"
              className="resume-parse-button"
              disabled={busy || text.trim().length < 30}
              onClick={() => parse({ text })}
            >
              {busy ? (
                <>
                  <span className="resume-spinner" />
                  Processing...
                </>
              ) : (
                <>✦ Parse resume</>
              )}
            </button>
          </div>

          <div className="resume-privacy-note">
            <span>ⓘ</span>
            <p>
              Extracted information is a draft. Review and confirm it before
              creating an employee account or sending an invitation.
            </p>
          </div>
        </section>

        <aside className="resume-side-column">
          <section className="resume-panel resume-how-panel">
            <div className="resume-panel-heading">
              <div className="resume-panel-icon resume-panel-icon-blue">
                ◈
              </div>
              <div>
                <h3>How it works</h3>
                <p>A manager-controlled onboarding flow.</p>
              </div>
            </div>

            <div className="resume-how-list">
              <div className="resume-how-item">
                <span className="resume-how-number">01</span>
                <div>
                  <b>Extract profile details</b>
                  <p>Parse available contact information and skills.</p>
                </div>
              </div>

              <div className="resume-how-item">
                <span className="resume-how-number">02</span>
                <div>
                  <b>Review the draft</b>
                  <p>Correct missing or inaccurate information yourself.</p>
                </div>
              </div>

              <div className="resume-how-item">
                <span className="resume-how-number">03</span>
                <div>
                  <b>Confirm the invitation</b>
                  <p>The account remains pending until activation.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="resume-security-card">
            <div className="resume-security-icon">♧</div>
            <h4>Human review stays in control</h4>
            <p>
              AI-assisted extraction supports the process. The manager reviews
              the employee profile before confirming the invitation.
            </p>
            <div className="resume-security-footer">
              <span>✓</span> Manager confirmation required
            </div>
          </section>
        </aside>
      </div>

      {res && f && (
        <section className="resume-review-section">
          <div className="resume-review-header">
            <div>
              <div className="resume-eyebrow">PROFILE VERIFICATION</div>
              <h3>Review employee draft</h3>
              <p>
                Check each field before creating the pending employee account.
              </p>
            </div>

            <span className="resume-draft-badge">
              {res.draft.method === "rules"
                ? "Rule-based extraction"
                : "AI-assisted extraction"}
            </span>
          </div>

          {res.note && (
            <div className="resume-review-note">
              <span>ⓘ</span>
              <p>{res.note}</p>
            </div>
          )}

          {res.duplicateEmail && (
            <div className="resume-notice resume-notice-error" role="alert">
              <span className="resume-notice-icon">!</span>
              <div>
                <b>Duplicate email detected</b>
                <p>An account with this email already exists.</p>
              </div>
            </div>
          )}

          <form className="resume-panel resume-review-form" onSubmit={send}>
            <div className="resume-form-section-title">
              <span>01</span>
              <div>
                <h4>Employee information</h4>
                <p>Review the contact and job details.</p>
              </div>
            </div>

            <div className="resume-fields-grid">
              {[
                ["name", "Full name", "Enter the employee's full name"],
                ["email", "Work email", "name@company.com"],
                ["department", "Department", "Enter department"],
                ["roleTitle", "Job title", "Enter job title"],
              ].map(([key, label, placeholder]) => (
                <label className="resume-field" key={key}>
                  <span>{label} <i>*</i></span>
                  <input
                    required
                    type={key === "email" ? "email" : "text"}
                    placeholder={placeholder}
                    value={f[key] ?? ""}
                    onChange={(e) => updateField(key, e.target.value)}
                  />
                  <small>
                    {res.draft.evidence[key]
                      ? `Extracted from: ${res.draft.evidence[key]}`
                      : "Not found in resume — enter manually"}
                  </small>
                </label>
              ))}
            </div>

            <div className="resume-form-divider" />

            <div className="resume-form-section-title">
              <span>02</span>
              <div>
                <h4>Skills &amp; capacity</h4>
                <p>Verify the skills and weekly availability.</p>
              </div>
            </div>

            <label className="resume-field">
              <span>Skills <i>*</i></span>
              <input
                required
                value={f.skills}
                placeholder="e.g. React, Python, Project Management"
                onChange={(e) => updateField("skills", e.target.value)}
              />
              <small>Separate skills with commas. You can edit this list.</small>
            </label>

            {res.draft.skills.length > 0 && (
              <details className="resume-details">
                <summary>
                  <span>✦</span>
                  Why these skills were identified
                  <span className="resume-details-count">
                    {res.draft.skills.length}
                  </span>
                </summary>

                <div className="resume-skill-explanations">
                  {res.draft.skills.map((skill) => (
                    <div className="resume-skill-explanation" key={skill.skill}>
                      <div className="resume-skill-explanation-top">
                        <b>{skill.skill}</b>
                        <span>Level {skill.level}</span>
                      </div>
                      <p>{skill.why}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <label className="resume-field resume-capacity-field">
              <span>Weekly capacity <i>*</i></span>
              <div className="resume-capacity-input">
                <input
                  type="number"
                  min="1"
                  max="80"
                  required
                  value={f.capacityHours}
                  onChange={(e) => updateField("capacityHours", e.target.value)}
                />
                <span>hours / week</span>
              </div>
              <small>Default capacity is 40 hours per week.</small>
            </label>

            {res.suggestedProjects.length > 0 && (
              <>
                <div className="resume-form-divider" />

                <div className="resume-form-section-title">
                  <span>03</span>
                  <div>
                    <h4>Suggested project fit</h4>
                    <p>Recommendations for manager consideration only.</p>
                  </div>
                </div>

                <div className="resume-suggested-projects">
                  {res.suggestedProjects.map((project) => (
                    <div
                      className="resume-suggested-project"
                      key={project.projectId}
                    >
                      <div className="resume-project-icon">▤</div>
                      <div>
                        <b>{project.name}</b>
                        <p>{project.reason}</p>
                      </div>
                      <span>Suggested</span>
                    </div>
                  ))}
                </div>

                <p className="resume-suggestion-footnote">
                  Project suggestions do not assign work. Use the AI Assignment
                  Queue after the employee activates their account.
                </p>
              </>
            )}

            <div className="resume-confirm-footer">
              <div className="resume-confirm-copy">
                <span className="resume-confirm-check">✓</span>
                <div>
                  <b>Ready for manager approval?</b>
                  <small>Review the details above before continuing.</small>
                </div>
              </div>

              <div className="resume-confirm-actions">
                <button
                  type="button"
                  className="resume-discard-button"
                  disabled={busy}
                  onClick={() => {
                    setRes(null);
                    setF(null);
                    setErr("");
                  }}
                >
                  Discard draft
                </button>

                <button
                  type="submit"
                  className="resume-confirm-button"
                  disabled={busy || res.duplicateEmail}
                >
                  {busy ? (
                    <>
                      <span className="resume-spinner" />
                      Sending...
                    </>
                  ) : (
                    <>✓ Approve &amp; send invitation</>
                  )}
                </button>
              </div>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
