// Offline regression test: registers the plugin against a stub cordis context and
// decodes the shared benchmark corpus. Run with: node test/run.mjs
import { readdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { apply, name, inject } from "../lib/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(here, "..", "..", "..");
const localCorpus = join(here, "corpus");
// Vendored corpus ships with the repo; fall back to the workspace benchmark set.
const corpus = existsSync(localCorpus) ? localCorpus : join(workspace, "tools", "_bench", "corpus");
const cwd = join(here, "fixtures");

const registered = [];
const sections = [];
const ctx = {
  tools: { register: (tool) => registered.push(tool) },
  systemPrompt: { section: (section) => sections.push(section) },
};

apply(ctx, { outputDir: ".dsh-qr-test", maxInputBytes: 20 * 1024 * 1024, timeoutMs: 20000 });

const exec = { signal: new AbortController().signal, agent: { session: { header: { cwd } } } };
const tool = (toolName) => {
  const found = registered.find((t) => t.name === toolName);
  if (!found) throw new Error(`tool not registered: ${toolName}`);
  return found;
};

const report = [];
function check(label, condition, detail = "") {
  report.push({ label, pass: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

check("plugin name", name === "tool-qr-scanner", name);
check("inject services", inject.includes("tools") && inject.includes("systemPrompt"), inject.join(","));
check("four tools registered", registered.length === 4, registered.map((t) => t.name).join(","));
check("system prompt section", sections.length === 1 && sections[0].name === "tool:qr-scanner");

const files = existsSync(corpus) ? readdirSync(corpus).filter((f) => /\.(png|jpg)$/i.test(f)).sort() : [];
check("corpus available", files.length === 10, `${files.length} files`);

let decoded = 0;
let codes = 0;
for (const file of files) {
  const out = await tool("qr_scan").execute({ source: join(corpus, file) }, exec);
  if (out.ok) decoded++;
  codes += out.results.length;
  if (file === "08_multi.png") check("multi-symbol image returns 2 codes", out.results.length === 2, `${out.results.length}`);
  if (file === "05_small.png") check("tiny 78px image decodes (upscale fallback)", out.ok);
  if (file === "04_inverted.png") check("inverted code decodes", out.ok);
}
check("corpus hit rate", decoded === files.length, `${decoded}/${files.length} images, ${codes} codes`);

const globOut = await tool("qr_scan").execute({ source: join(corpus, "0*.png") }, exec);
check("glob source", globOut.results.length >= 8, `${globOut.results.length} codes`);

const missOut = await tool("qr_scan").execute({ source: join(corpus, "01_clean.png") + ".nope" }, exec);
check("missing file reports structured error", missOut.ok === false && /文件不存在/.test(missOut.error ?? ""), missOut.error);

const made = await tool("qr_make").execute({ text: "https://example.com/round-trip", size: 320, fileName: "roundtrip" }, exec);
check("qr_make writes png", made.bytes > 0 && existsSync(made.path), made.path);
const back = await tool("qr_scan").execute({ source: made.path }, exec);
check("round-trip decode", back.results[0]?.text === "https://example.com/round-trip", back.results[0]?.text);

const screen = await tool("qr_scan_screen").execute({}, exec);
check("screen capture runs without throwing", typeof screen.ok === "boolean", `ok=${screen.ok} codes=${screen.results.length}`);

if (existsSync(cwd)) rmSync(cwd, { recursive: true, force: true });

const failed = report.filter((r) => !r.pass);
console.log(`\n${report.length - failed.length}/${report.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
