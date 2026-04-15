import type { SkillManager } from "../core/skill.js";
import type { SkillFileContent } from "../types/index.js";

export const readSkillFileDefinition = {
  name: "read_skill_file",
  description:
    "スキルディレクトリ内のサポートファイル（スクリプト、参考ドキュメント等）を読む。SKILL.mdの指示に従い、必要なファイルだけ取得する。",
  inputSchema: {
    type: "object" as const,
    properties: {
      skill_name: {
        type: "string",
        description: "スキル名",
      },
      path: {
        type: "string",
        description: "スキルディレクトリからの相対パス（例: scripts/run.sh）",
      },
    },
    required: ["skill_name", "path"],
  },
};

export function handleReadSkillFile(
  skillManager: SkillManager,
  input: unknown,
): SkillFileContent {
  const args = (input ?? {}) as { skill_name?: string; path?: string };
  if (!args.skill_name) throw new Error("`skill_name` is required");
  if (!args.path) throw new Error("`path` is required");
  return skillManager.readSkillFile(args.skill_name, args.path);
}
