import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const bundlePath = resolve(rootDir, "dist/bundle/claude-skills-mcp.cjs");

const child = spawn(process.execPath, [bundlePath], {
  env: { ...process.env },
  stdio: ["pipe", "pipe", "pipe"],
});

const byId = new Map();
let buffer = "";
child.stdout.on("data", (data) => {
  buffer += data.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.id !== undefined) byId.set(parsed.id, parsed);
    } catch {}
  }
});
child.stderr.on("data", (d) => process.stderr.write(`[server stderr] ${d}`));

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + "\n");
}

setTimeout(() => {
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke", version: "0.0.0" },
    },
  });
  send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  send({
    jsonrpc: "2.0",
    id: 10,
    method: "tools/call",
    params: { name: "list_skills", arguments: {} },
  });
}, 100);

setTimeout(() => {
  const skills = JSON.parse(byId.get(10)?.result?.content?.[0]?.text ?? "[]");
  console.log(`Bundle invocation discovered ${skills.length} skills`);
  for (const s of skills) console.log(`  - ${s.name}`);
  child.kill();
  process.exit(skills.length > 0 ? 0 : 1);
}, 1500);
