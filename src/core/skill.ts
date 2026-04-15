import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  SkillContent,
  SkillEntry,
  SkillInfo,
} from "../types/index.js";
import { SkillError } from "../types/index.js";
import { Cache } from "./cache.js";
import { Scanner, isFile, locationToString } from "./scanner.js";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const DESCRIPTION_MAX_CHARS = 1536;

export interface ParsedSkill {
  frontmatter: Record<string, unknown>;
  body: string;
}

export class SkillManager {
  constructor(
    private readonly scanner: Scanner,
    private readonly cache: Cache,
  ) {}

  listSkills(): SkillInfo[] {
    const cached = this.cache.get<SkillInfo[]>("list");
    if (cached) return cached;

    const entries = this.scanner.scanAll();
    const result: SkillInfo[] = [];

    for (const entry of entries) {
      const info = this.summarize(entry);
      if (info) result.push(info);
    }

    this.cache.set("list", result);
    return result;
  }

  getSkill(name: string): SkillContent {
    const entry = this.findEntry(name);
    const parsed = this.parseSkillMd(entry.skillMdPath);
    const description = extractDescription(parsed.frontmatter);

    return {
      name: resolveName(entry, parsed.frontmatter),
      description,
      frontmatter: parsed.frontmatter,
      content: parsed.body,
      files: listFilesRecursive(entry.dir).filter((f) => f !== "SKILL.md"),
    };
  }

  readSkillFile(name: string, path: string): { path: string; content: string } {
    const entry = this.findEntry(name);
    const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized === "" || normalized.includes("..")) {
      throw new SkillError("FILE_NOT_FOUND", `Invalid path: ${path}`);
    }

    const absolute = join(entry.dir, normalized);
    const normalizedAbs = absolute.replace(/\\/g, "/");
    const normalizedDir = entry.dir.replace(/\\/g, "/");
    if (
      normalizedAbs !== normalizedDir &&
      !normalizedAbs.startsWith(normalizedDir + "/")
    ) {
      throw new SkillError(
        "FILE_NOT_FOUND",
        `Path escapes skill directory: ${path}`,
      );
    }

    if (!isFile(absolute)) {
      throw new SkillError("FILE_NOT_FOUND", `File not found: ${path}`);
    }

    try {
      return { path: normalized, content: readFileSync(absolute, "utf8") };
    } catch (err) {
      throw new SkillError("FILE_NOT_FOUND", `Cannot read file: ${path}`, err);
    }
  }

  parseSkillMd(skillMdPath: string): ParsedSkill {
    const raw = readFileSync(skillMdPath, "utf8");
    const m = raw.match(FRONTMATTER_RE);
    if (!m) return { frontmatter: {}, body: raw };

    let frontmatter: Record<string, unknown> = {};
    try {
      const parsed = parseYaml(m[1]);
      if (parsed && typeof parsed === "object") {
        frontmatter = parsed as Record<string, unknown>;
      }
    } catch {
      // malformed frontmatter -> empty
    }

    return { frontmatter, body: raw.slice(m[0].length) };
  }

  private findEntry(name: string): SkillEntry {
    const entries = this.scanner.scanAll();
    for (const entry of entries) {
      const parsed = this.parseSkillMd(entry.skillMdPath);
      if (resolveName(entry, parsed.frontmatter) === name) return entry;
    }
    throw new SkillError("SKILL_NOT_FOUND", `Skill not found: ${name}`);
  }

  private summarize(entry: SkillEntry): SkillInfo | null {
    let parsed: ParsedSkill;
    try {
      parsed = this.parseSkillMd(entry.skillMdPath);
    } catch {
      return null;
    }

    return {
      name: resolveName(entry, parsed.frontmatter),
      description: extractDescription(parsed.frontmatter),
      location: locationToString(entry.location),
    };
  }
}

function resolveName(
  entry: SkillEntry,
  frontmatter: Record<string, unknown>,
): string {
  const fmName = frontmatter.name;
  if (typeof fmName === "string" && fmName.trim()) return fmName.trim();
  return entry.name;
}

function extractDescription(frontmatter: Record<string, unknown>): string {
  const desc = typeof frontmatter.description === "string"
    ? frontmatter.description.trim()
    : "";
  const when = typeof frontmatter.when_to_use === "string"
    ? frontmatter.when_to_use.trim()
    : "";

  let combined = desc;
  if (when) combined = combined ? `${desc}\n${when}` : when;
  if (combined.length > DESCRIPTION_MAX_CHARS) {
    combined = combined.slice(0, DESCRIPTION_MAX_CHARS);
  }
  return combined;
}

function listFilesRecursive(root: string): string[] {
  const results: string[] = [];
  const stack: { dir: string; prefix: string }[] = [{ dir: root, prefix: "" }];

  while (stack.length > 0) {
    const { dir, prefix } = stack.pop() as { dir: string; prefix: string };
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      const rel = prefix ? `${prefix}/${entry}` : entry;
      if (stat.isDirectory()) {
        stack.push({ dir: full, prefix: rel });
      } else if (stat.isFile()) {
        results.push(rel);
      }
    }
  }

  results.sort();
  return results;
}
