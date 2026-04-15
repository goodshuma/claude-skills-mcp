import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type {
  ServerConfig,
  SkillEntry,
  SkillLocation,
} from "../types/index.js";
import { SkillError } from "../types/index.js";

export interface ScanRoot {
  path: string;
  location: SkillLocation;
}

export class Scanner {
  private readonly roots: ScanRoot[];

  constructor(config: ServerConfig) {
    const personalRoot = join(homedir(), ".claude", "skills");
    const roots: ScanRoot[] = [{ path: personalRoot, location: "personal" }];

    for (const p of config.additional_paths) {
      const absolute = resolve(expandHome(p));
      if (!existsSync(absolute)) {
        throw new SkillError(
          "SCAN_PATH_INACCESSIBLE",
          `additional_paths entry does not exist: ${absolute}`,
        );
      }
      if (!isDir(absolute)) {
        throw new SkillError(
          "SCAN_PATH_INACCESSIBLE",
          `additional_paths entry is not a directory: ${absolute}`,
        );
      }
      roots.push({ path: absolute, location: { additional: absolute } });
    }

    this.roots = roots;
  }

  getRoots(): ScanRoot[] {
    return this.roots;
  }

  scanAll(): SkillEntry[] {
    const entries: SkillEntry[] = [];
    const seen = new Set<string>();

    for (const root of this.roots) {
      if (!isDir(root.path)) continue;
      for (const entry of this.scanRoot(root)) {
        if (seen.has(entry.name)) continue;
        seen.add(entry.name);
        entries.push(entry);
      }
    }

    return entries;
  }

  private scanRoot(root: ScanRoot): SkillEntry[] {
    const results: SkillEntry[] = [];
    let children: string[];
    try {
      children = readdirSync(root.path);
    } catch {
      return results;
    }

    for (const child of children) {
      const skillDir = join(root.path, child);
      if (!isDir(skillDir)) continue;
      const skillMd = join(skillDir, "SKILL.md");
      if (!isFile(skillMd)) continue;

      results.push({
        name: child,
        dir: skillDir,
        skillMdPath: skillMd,
        location: root.location,
      });
    }

    return results;
  }
}

export function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return p.replace(/^~/, homedir());
  }
  return p;
}

export function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export function locationToString(loc: SkillLocation): string {
  if (loc === "personal") return "personal";
  return `additional:${loc.additional}`;
}
