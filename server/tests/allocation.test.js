import { describe, expect, it } from "vitest";
import { isUnassigned, ownsTask, parseSkills, proposeAssignments } from "../intelligence/allocation.js";

const employees = [
  { id: 1, name: "Ana", role: "manager", skills: "sql, react", capacityHours: 40, availability: "available" },
  { id: 2, name: "Ben", role: "employee", skillLevels: [{ skill: "React", level: 5 }, { skill: "SQL", level: 4 }], capacityHours: 40, availability: "available" },
  { id: 3, name: "Cy", role: "employee", skills: "design", capacityHours: 40, availability: "available" },
  { id: 4, name: "Di", role: "employee", skills: "react, sql", capacityHours: 40, availability: "unavailable" },
];
const mk = (id, title, hours, skills) => ({ id, projectId: 1, title, assignee: "Unassigned", status: "todo", estimatedHours: hours, requiredSkills: skills, dueAt: "2026-11-02T00:00:00Z" });
const tasks = [
  mk(10, "Build UI", 20, [{ skill: "react", minLevel: 4 }]),
  mk(11, "Build API", 30, [{ skill: "sql", minLevel: 3 }]),
  mk(12, "No skills", 5, undefined),
  mk(13, "Welding", 5, [{ skill: "welding", minLevel: 3 }]),
  { id: 20, projectId: 2, title: "Existing", assignee: "Ben", assigneeId: 2, status: "in_progress", estimatedHours: 10, actualHours: 2 },
];

describe("AI allocation", () => {
  const { proposals, skipped } = proposeAssignments({ tasks, candidatesTasks: tasks.filter(isUnassigned), employees, schedules: [] });
  const by = id => proposals.find(p => p.taskId === id);
  it("picks the best skill match and explains why", () => {
    expect(by(10).recommendedEmployeeId).toBe(2);
    expect(by(10).reasoning.length).toBeGreaterThanOrEqual(3);
  });
  it("never picks unavailable people and spreads load across a batch", () => {
    expect(by(11).recommendedEmployeeId).not.toBe(4);
    expect(by(11).recommendedEmployeeId).toBe(1);
  });
  it("returns no recommendation when nobody has the skill, and skips tasks without skills", () => {
    expect(by(13).recommendedEmployeeId).toBeNull();
    expect(skipped.map(s => s.taskId)).toEqual([12]);
  });
  it("ownership is by id when present, by name otherwise", () => {
    expect(ownsTask(employees[1], tasks[4])).toBe(true);
    expect(ownsTask(employees[0], tasks[4])).toBe(false);
    expect(parseSkills(employees[0])[0].level).toBe(3);
  });
});
