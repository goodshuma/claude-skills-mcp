#!/usr/bin/env node
import { loadConfig } from "./core/config.js";
import { startServer } from "./server.js";
import { SkillError } from "./types/index.js";

async function main(): Promise<void> {
  const configPath =
    process.env.SKILLS_CONFIG ??
    process.argv.find((a) => a.startsWith("--config="))?.slice("--config=".length);

  try {
    const config = loadConfig(configPath);
    await startServer(config);
  } catch (err) {
    if (err instanceof SkillError) {
      console.error(`[${err.code}] ${err.message}`);
    } else {
      console.error(err);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
