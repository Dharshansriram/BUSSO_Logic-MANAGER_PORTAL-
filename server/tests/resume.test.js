import { describe, expect, it } from "vitest";
import { parseResumeRules, suggestProjects } from "../intelligence/resume.js";

const RESUME = `Priya Sharma
Senior Software Engineer
priya.sharma@example.com | +91 98765 43210
8 years of experience building web apps.
Skills: React, Node, MongoDB, TypeScript, React, Docker`;

describe("resume parser", () => {
  it("extracts identity, skills and explains them", () => {
    const d = parseResumeRules(RESUME);
    expect(d.name).toBe("Priya Sharma");
    expect(d.email).toBe("priya.sharma@example.com");
    expect(d.roleTitle).toMatch(/Engineer/);
    expect(d.skills.map(s => s.skill)).toContain("react");
    expect(d.skills[0].why).toMatch(/Mentioned/);
    expect(d.department).toBe("Engineering");
  });
  it("suggests only projects whose required skills overlap", () => {
    const d = parseResumeRules(RESUME);
    const s = suggestProjects(d.skills, [{ id: 1, status: "todo", projectId: 1, requiredSkills: [{ skill: "react" }] }], [{ id: 1, name: "Web" }, { id: 2, name: "Other" }]);
    expect(s).toHaveLength(1);
    expect(s[0].name).toBe("Web");
  });
});
