import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ServerConfig } from "../types/index.js";
import { SkillError } from "../types/index.js";

export function loadConfig(configPath: string | undefined): ServerConfig {
  if (!configPath) {
    return { additional_paths: [] };
  }

  const absolute = resolve(configPath);
  if (!existsSync(absolute)) {
    throw new SkillError(
      "CONFIG_ERROR",
      `Config file not found: ${absolute}`,
    );
  }

  let raw: string;
  try {
    raw = readFileSync(absolute, "utf8");
  } catch (err) {
    throw new SkillError(
      "CONFIG_ERROR",
      `Failed to read config: ${absolute}`,
      err,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new SkillError(
      "CONFIG_ERROR",
      `Config file is not valid JSON: ${absolute}`,
      err,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new SkillError("CONFIG_ERROR", "Config must be an object");
  }

  const obj = parsed as Record<string, unknown>;
  const additionalRaw = obj.additional_paths;
  const additional_paths: string[] = [];

  if (additionalRaw !== undefined) {
    if (!Array.isArray(additionalRaw)) {
      throw new SkillError(
        "CONFIG_ERROR",
        "`additional_paths` must be an array of strings",
      );
    }
    for (const [i, p] of additionalRaw.entries()) {
      if (typeof p !== "string") {
        throw new SkillError(
          "CONFIG_ERROR",
          `additional_paths[${i}] must be a string`,
        );
      }
      additional_paths.push(p);
    }
  }

  return { additional_paths };
}
