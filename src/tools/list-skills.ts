import type { SkillManager } from "../core/skill.js";
import type { SkillInfo } from "../types/index.js";

export const listSkillsDefinition = {
  name: "list_skills",
  description:
    "利用可能なスキルの一覧（name + description）を取得する。ユーザーのリクエストに該当するスキルがあるかを最初に確認するために使う。",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
};

export function handleListSkills(
  skillManager: SkillManager,
  _input: unknown,
): SkillInfo[] {
  return skillManager.listSkills();
}
