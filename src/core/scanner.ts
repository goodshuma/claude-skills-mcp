import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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
  /**
   * When true, each subdirectory with SKILL.md is a skill under this root.
   * When false, the root itself is not used for enumeration; instead the
   * scanner derives skills from plugin metadata (see enumeratePlugins).
   */
  enumerateDirectly: boolean;
  /** Namespace prefix for discovered skill names, e.g. "plugin-name:". */
  namePrefix?: string;
}

export class Scanner {
  private readonly roots: ScanRoot[];
  private readonly pluginsMetadataPath: string;

  constructor(config: ServerConfig) {
    this.pluginsMetadataPath = join(
      homedir(),
      ".claude",
      "plugins",
      "installed_plugins.json",
    );

    const personalRoot = join(homedir(), ".claude", "skills");
    const roots: ScanRoot[] = [
      { path: personalRoot, location: "personal", enumerateDirectly: true },
    ];

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
      roots.push({
        path: absolute,
        location: { additional: absolute },
        enumerateDirectly: true,
      });
    }

    for (const pluginRoot of this.enumeratePluginRoots()) {
      roots.push(pluginRoot);
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
      if (!root.enumerateDirectly) continue;
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

      const name = root.namePrefix ? `${root.namePrefix}${child}` : child;
      results.push({
        name,
        dir: skillDir,
        skillMdPath: skillMd,
        location: root.location,
      });
    }

    return results;
  }

  private enumeratePluginRoots(): ScanRoot[] {
    if (!isFile(this.pluginsMetadataPath)) return [];

    let data: unknown;
    try {
      const raw = readFileSync(this.pluginsMetadataPath, "utf8");
      data = JSON.parse(raw);
    } catch {
      return [];
    }

    if (!data || typeof data !== "object") return [];
    const obj = data as Record<string, unknown>;
    const plugins = obj.plugins;
    if (!plugins || typeof plugins !== "object") return [];

    const roots: ScanRoot[] = [];
    for (const [pluginKey, installations] of Object.entries(
      plugins as Record<string, unknown>,
    )) {
      if (!Array.isArray(installations) || installations.length === 0) continue;
      const pluginName = pluginKey.split("@")[0] || pluginKey;
      const install = installations[0] as Record<string, unknown>;
      const installPath = install.installPath;
      if (typeof installPath !== "string") continue;

      const skillsDir = join(installPath, "skills");
      if (!isDir(skillsDir)) continue;

      roots.push({
        path: skillsDir,
        location: { plugin: pluginName },
        enumerateDirectly: true,
        namePrefix: `${pluginName}:`,
      });
    }
    return roots;
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
  if ("plugin" in loc) return `plugin:${loc.plugin}`;
  return `additional:${loc.additional}`;
}
