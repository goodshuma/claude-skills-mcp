import type { SkillManager } from "../core/skill.js";
import type { SkillContent } from "../types/index.js";

export const getSkillDefinition = {
  name: "get_skill",
  description:
    "指定スキルのSKILL.md本文と、スキルディレクトリ内のサポートファイル一覧を取得する。スキルを使用する前に必ず呼ぶこと。",
  inputSchema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "スキル名（list_skillsで取得したname）",
      },
    },
    required: ["name"],
  },
};

export function handleGetSkill(
  skillManager: SkillManager,
  input: unknown,
): SkillContent {
  const args = (input ?? {}) as { name?: string };
  if (!args.name) throw new Error("`name` is required");
  return skillManager.getSkill(args.name);
}
