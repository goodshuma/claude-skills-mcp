import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const serverPath = resolve(rootDir, "dist/index.js");

const child = spawn(process.execPath, [serverPath], {
  env: { ...process.env },
  stdio: ["pipe", "pipe", "pipe"],
  cwd: rootDir,
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
function parseResult(id) {
  const r = byId.get(id);
  if (!r?.result?.content?.[0]?.text) return null;
  return JSON.parse(r.result.content[0].text);
}
function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
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
    id: 2,
    method: "tools/list",
    params: {},
  });
  send({
    jsonrpc: "2.0",
    id: 10,
    method: "tools/call",
    params: { name: "list_skills", arguments: {} },
  });

  await wait(800);

  const ok = [], fail = [];
  const expect = (c, m) => (c ? ok : fail).push(m);

  const tools = byId.get(2)?.result?.tools ?? [];
  expect(
    tools.length === 3 &&
      tools.map((t) => t.name).sort().join(",") ===
        "get_skill,list_skills,read_skill_file",
    `tools/list returns exactly 3 tools (got: ${tools.map((t) => t.name).join(", ")})`,
  );

  const skills = parseResult(10);
  expect(Array.isArray(skills), "list_skills returns array");
  expect(
    skills?.length >= 1,
    `list_skills finds at least 1 skill (found ${skills?.length})`,
  );
  console.log("\nDiscovered skills:");
  for (const s of skills ?? []) {
    console.log(`  - ${s.name} (${s.location}) — ${s.description.slice(0, 60)}...`);
  }

  if (!skills?.length) {
    child.kill();
    process.exit(1);
  }

  const first = skills[0].name;
  send({
    jsonrpc: "2.0",
    id: 11,
    method: "tools/call",
    params: { name: "get_skill", arguments: { name: first } },
  });

  await wait(400);

  const got = parseResult(11);
  expect(got?.name === first, `get_skill returns name=${first}`);
  expect(
    typeof got?.content === "string" && got.content.length > 0,
    "get_skill returns non-empty content",
  );
  expect(
    Array.isArray(got?.files),
    `get_skill returns files array (got ${got?.files?.length} entries)`,
  );
  expect(
    typeof got?.frontmatter === "object",
    "get_skill returns frontmatter object",
  );

  if (got?.files?.length > 0) {
    const firstFile = got.files[0];
    send({
      jsonrpc: "2.0",
      id: 12,
      method: "tools/call",
      params: {
        name: "read_skill_file",
        arguments: { skill_name: first, path: firstFile },
      },
    });
    await wait(300);
    const fileGot = parseResult(12);
    expect(
      fileGot?.path === firstFile && typeof fileGot?.content === "string",
      `read_skill_file reads ${firstFile}`,
    );
  }

  // path traversal rejection
  send({
    jsonrpc: "2.0",
    id: 13,
    method: "tools/call",
    params: {
      name: "read_skill_file",
      arguments: { skill_name: first, path: "../../../etc/passwd" },
    },
  });
  await wait(300);
  const traversal = byId.get(13);
  expect(
    traversal?.result?.isError === true,
    "read_skill_file rejects path traversal",
  );

  // nonexistent skill
  send({
    jsonrpc: "2.0",
    id: 14,
    method: "tools/call",
    params: { name: "get_skill", arguments: { name: "does-not-exist-xyz" } },
  });
  await wait(300);
  const notFound = byId.get(14);
  const notFoundErr = parseResult(14);
  expect(
    notFound?.result?.isError === true &&
      notFoundErr?.error?.code === "SKILL_NOT_FOUND",
    "get_skill returns SKILL_NOT_FOUND for unknown skill",
  );

  console.log("\n=== RESULTS ===");
  for (const m of ok) console.log("  PASS", m);
  for (const m of fail) console.log("  FAIL", m);
  console.log(`\n${ok.length} passed, ${fail.length} failed`);

  child.kill();
  process.exit(fail.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  child.kill();
  process.exit(2);
});
