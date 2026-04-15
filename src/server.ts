import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Cache } from "./core/cache.js";
import { Scanner } from "./core/scanner.js";
import { SkillManager } from "./core/skill.js";
import { SkillWatcher } from "./core/watcher.js";
import type { ServerConfig } from "./types/index.js";
import { SkillError } from "./types/index.js";
import {
  handleListSkills,
  listSkillsDefinition,
} from "./tools/list-skills.js";
import { handleGetSkill, getSkillDefinition } from "./tools/get-skill.js";
import {
  handleReadSkillFile,
  readSkillFileDefinition,
} from "./tools/read-skill-file.js";

const CACHE_TTL_SECONDS = 300;

export async function startServer(config: ServerConfig): Promise<void> {
  const cache = new Cache(CACHE_TTL_SECONDS);
  const scanner = new Scanner(config);
  const skillManager = new SkillManager(scanner, cache);
  const watcher = new SkillWatcher(scanner, cache);
  watcher.start();

  const shutdown = (signal: NodeJS.Signals) => {
    void watcher.stop().finally(() => process.exit(signal === "SIGINT" ? 130 : 0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  const server = new Server(
    { name: "claude-skills-mcp", version: "0.2.0" },
    { capabilities: { tools: {} } },
  );

  const toolDefinitions = [
    listSkillsDefinition,
    getSkillDefinition,
    readSkillFileDefinition,
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await dispatch(name, args, skillManager);
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: "text", text: JSON.stringify(formatError(err), null, 2) },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function dispatch(
  name: string,
  args: unknown,
  skillManager: SkillManager,
): Promise<unknown> {
  switch (name) {
    case "list_skills":
      return handleListSkills(skillManager, args);
    case "get_skill":
      return handleGetSkill(skillManager, args);
    case "read_skill_file":
      return handleReadSkillFile(skillManager, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

interface ErrorPayload {
  error: { code: string; message: string; details?: unknown };
}

function formatError(err: unknown): ErrorPayload {
  if (err instanceof SkillError) {
    return {
      error: { code: err.code, message: err.message, details: err.details },
    };
  }
  if (err instanceof Error) {
    return { error: { code: "INTERNAL_ERROR", message: err.message } };
  }
  return { error: { code: "INTERNAL_ERROR", message: String(err) } };
}
