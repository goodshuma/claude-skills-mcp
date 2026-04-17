export interface ServerConfig {
  additional_paths: string[];
}

export type SkillLocation =
  | "personal"
  | { plugin: string }
  | { additional: string };

export interface SkillEntry {
  name: string;
  dir: string;
  skillMdPath: string;
  location: SkillLocation;
}

export interface SkillInfo {
  name: string;
  description: string;
  location: string;
}

export interface SkillContent {
  name: string;
  description: string;
  frontmatter: Record<string, unknown>;
  content: string;
  files: string[];
}

export interface SkillFileContent {
  path: string;
  content: string;
}

export class SkillError extends Error {
  constructor(
    public code: SkillErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "SkillError";
  }
}

export type SkillErrorCode =
  | "SKILL_NOT_FOUND"
  | "FILE_NOT_FOUND"
  | "SCAN_PATH_INACCESSIBLE"
  | "CONFIG_ERROR";
