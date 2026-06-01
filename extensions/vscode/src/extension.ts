import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { promises as fs, existsSync, readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import * as vscode from "vscode";

type CapturedProblem = {
  platform: string;
  id: string;
  name: string;
  url: string;
  rating?: number;
  tags?: string[];
  category?: string;
  tests?: TestCase[];
};

type CsesProgress = {
  solved: string[];
  attempted: string[];
};

type TestCase = {
  input: string;
  expected_output: string;
};

type CompileConfig = {
  compile?: string;
  run: string;
  extension: string;
};

type ProblemMeta = Omit<CapturedProblem, "tests"> & {
  solutionPath: string;
  capturedAt: string;
};

type Verdict = "AC" | "WA" | "TLE" | "RE" | "CE";

type RunResult = {
  index: number;
  verdict: Verdict;
  passed: boolean;
  actual: string;
  timeMs: number;
  stderr?: string;
};

const OUTPUT = vscode.window.createOutputChannel("CPOS");
let server: http.Server | undefined;
let serverConflict = false;
let status: vscode.StatusBarItem | undefined;
let lastProblem: ProblemMeta | undefined;
let actionsProvider: CposActionsProvider | undefined;

const runResults = new Map<string, RunResult[]>();
let runningFor: string | undefined;

type PendingSubmit = {
  platform: string;
  id: string;
  contest?: string;
  index?: string;
  code: string;
  language: string;
  fileName: string;
  submitUrl: string;
  expiresAt: number;
};

let pendingSubmit: PendingSubmit | undefined;

const DEFAULT_COMMANDS: Record<string, CompileConfig> = {
  c: { compile: "gcc -std=c11 -O2 -o {output} {source} -lm", run: "./{output}", extension: "c" },
  cpp: { compile: "g++ -std=c++17 -O2 -o {output} {source}", run: "./{output}", extension: "cpp" },
  python: { run: "python3 {source}", extension: "py" },
  pypy: { run: "pypy3 {source}", extension: "py" },
  java: { compile: "javac -d {dir} {source}", run: "java -cp {dir} Main", extension: "java" },
  kotlin: { compile: "kotlinc {source} -include-runtime -d {output}.jar", run: "java -jar {output}.jar", extension: "kt" },
  rust: { compile: "rustc -O -o {output} {source}", run: "./{output}", extension: "rs" },
  go: { run: "go run {source}", extension: "go" },
  csharp: { compile: "mcs -out:{output}.exe {source}", run: "mono {output}.exe", extension: "cs" },
  javascript: { run: "node {source}", extension: "js" },
  ruby: { run: "ruby {source}", extension: "rb" },
  haskell: { compile: "ghc -O2 -o {output} {source} -outputdir {dir}", run: "./{output}", extension: "hs" },
  pascal: { compile: "fpc -O2 -o{output} {source}", run: "./{output}", extension: "pas" }
};

const DEFAULT_TEMPLATES: Record<string, string> = {
  c: "#include <stdio.h>\n\nint main(void) {\n\n    return 0;\n}\n",
  cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    return 0;\n}\n",
  python: "import sys\ninput = sys.stdin.readline\n\n\ndef main():\n    pass\n\n\nif __name__ == \"__main__\":\n    main()\n",
  pypy: "import sys\ninput = sys.stdin.readline\n\n\ndef main():\n    pass\n\n\nif __name__ == \"__main__\":\n    main()\n",
  java: "import java.util.*;\nimport java.io.*;\n\nclass Main {\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n\n    }\n}\n",
  rust: "use std::io::{self, Read};\n\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_to_string(&mut input).unwrap();\n\n}\n",
  go: "package main\n\nimport (\n\t\"bufio\"\n\t\"fmt\"\n\t\"os\"\n)\n\nfunc main() {\n\treader := bufio.NewReader(os.Stdin)\n\twriter := bufio.NewWriter(os.Stdout)\n\tdefer writer.Flush()\n\t_ = reader\n\t_ = fmt.Fprintln\n}\n",
  kotlin: "import java.io.BufferedReader\nimport java.io.InputStreamReader\n\nfun main() {\n    val br = BufferedReader(InputStreamReader(System.`in`))\n\n}\n",
  csharp: "using System;\nusing System.IO;\n\nclass Main {\n    static void Main() {\n        var input = Console.In;\n\n    }\n}\n",
  javascript: "const data = require('fs').readFileSync(0, 'utf8');\nconst lines = data.split('\\n');\nlet idx = 0;\nconst next = () => lines[idx++];\n\n",
  ruby: "# read input with gets / STDIN.read\n\n",
  haskell: "import Data.List\n\nmain :: IO ()\nmain = do\n    contents <- getContents\n    let ws = words contents\n    return ()\n",
  pascal: "program solution;\nbegin\n\nend.\n"
};

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80);
  status.command = "cpos.focusPanel";
  actionsProvider = new CposActionsProvider(context.extensionUri);
  context.subscriptions.push(status, OUTPUT);

  context.subscriptions.push(
    vscode.commands.registerCommand("cpos.startCaptureServer", async () => {
      await startCaptureServer().catch((error) => warnServer(error));
      refreshActions();
    }),
    vscode.commands.registerCommand("cpos.stopCaptureServer", () => {
      stopCaptureServer();
      refreshActions();
    }),
    vscode.commands.registerCommand("cpos.runSamples", async () => {
      await runTests();
    }),
    vscode.commands.registerCommand("cpos.submitActiveFile", submitActiveFile),
    vscode.commands.registerCommand("cpos.openProblem", openProblem),
    vscode.commands.registerCommand("cpos.focusPanel", () => {
      void vscode.commands.executeCommand("cpos.actions.focus");
    }),
    vscode.window.registerWebviewViewProvider("cpos.actions", actionsProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => refreshActions()),
    vscode.workspace.onDidSaveTextDocument(() => refreshActions())
  );

  updateStatus();
  if (config().get<boolean>("autoStartCaptureServer", true)) {
    await startCaptureServer().catch((error) => warnServer(error));
  }
  refreshActions();
}

export function deactivate(): void {
  stopCaptureServer();
}

function warnServer(error: unknown): void {
  updateStatus();
  OUTPUT.appendLine(`Could not start capture server: ${String(error)}`);
  vscode.window.showWarningMessage("CPOS capture server could not start. Check that the configured port is free.");
}

function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("cpos");
}

async function startCaptureServer(): Promise<void> {
  if (server) {
    updateStatus();
    return;
  }

  const port = config().get<number>("capturePort", 27122);
  const created = http.createServer((req, res) => {
    void handleRequest(req, res);
  });

  try {
    await new Promise<void>((resolve, reject) => {
      created.once("error", reject);
      created.listen(port, "127.0.0.1", () => {
        created.removeListener("error", reject);
        resolve();
      });
    });
  } catch (error) {
    // Another CPOS window (or app) already owns the port. That's fine — it will
    // receive the captures. Reflect it quietly instead of failing loudly.
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      serverConflict = true;
      updateStatus();
      OUTPUT.appendLine(`Capture port ${port} is already in use — another CPOS window owns capture.`);
      return;
    }
    throw error;
  }

  server = created;
  serverConflict = false;
  updateStatus();
  OUTPUT.appendLine(`Capture server listening on http://127.0.0.1:${port}`);
}

function stopCaptureServer(): void {
  if (!server) return;
  server.close();
  server = undefined;
  serverConflict = false;
  updateStatus();
}

function updateStatus(): void {
  if (!status) return;
  if (server) {
    status.text = "$(radio-tower) CPOS";
    status.tooltip = "CPOS capture is on — click to open panel";
  } else if (serverConflict) {
    status.text = "$(window) CPOS";
    status.tooltip = "CPOS capture is handled by another window — click to open panel";
  } else {
    status.text = "$(circle-slash) CPOS";
    status.tooltip = "CPOS capture is off — click to open panel";
  }
  status.show();
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { status: "ok", app: "cpos-vscode" });
    return;
  }

  if (req.method === "POST" && req.url === "/capture/problem") {
    try {
      const body = await readJson<CapturedProblem>(req);
      const created = await captureProblem(body);
      sendJson(res, 200, { ok: true, name: body.name, tests: body.tests?.length ?? 0, solutionPath: created.solutionPath });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/capture/cses-progress") {
    try {
      const body = await readJson<CsesProgress>(req);
      await saveCsesProgress(body);
      sendJson(res, 200, { ok: true, solved: body.solved.length });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/pending-submit") {
    if (!pendingSubmit || pendingSubmit.expiresAt < Date.now()) {
      sendJson(res, 404, { ok: false });
      return;
    }
    sendJson(res, 200, { ok: true, ...pendingSubmit });
    return;
  }

  if (req.method === "POST" && req.url === "/pending-submit/consumed") {
    pendingSubmit = undefined;
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "not found" });
}

function setCors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res: http.ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson<T>(req: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

const TUI_CAPTURE_PORT = 27121;

async function forwardCaptureToTui(
  problem: CapturedProblem,
  solutionPath: string
): Promise<void> {
  try {
    const res = await fetch(`http://127.0.0.1:${TUI_CAPTURE_PORT}/capture/problem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...problem, solution_path: solutionPath })
    });
    if (!res.ok) {
      OUTPUT.appendLine(`TUI sync failed (${res.status}) — is the CPOS terminal app running?`);
    }
  } catch {
    OUTPUT.appendLine("TUI not running — capture saved in VS Code only.");
  }
}

async function captureProblem(problem: CapturedProblem): Promise<ProblemMeta> {
  validateProblem(problem);
  const lang = resolveDefaultLanguage();
  const compileConfig = getCompileConfig(lang);
  const active = activeEditorFilePath();
  const attachToActive = !!active && activeNameMatchesProblem(active, problem);

  let solutionPath: string;
  if (attachToActive) {
    solutionPath = active as string;
  } else {
    solutionPath = await resolveSolutionPath(problem, compileConfig.extension);
    await fs.mkdir(path.dirname(solutionPath), { recursive: true });
    if (!(await exists(solutionPath))) {
      await fs.writeFile(solutionPath, await templateFor(lang), "utf8");
    }
  }

  const tests = problem.tests ?? [];
  await saveSamples(solutionPath, tests);
  runResults.delete(solutionPath);

  lastProblem = {
    platform: problem.platform,
    id: problem.id,
    name: problem.name,
    url: problem.url,
    rating: problem.rating,
    tags: problem.tags,
    category: problem.category,
    solutionPath,
    capturedAt: new Date().toISOString()
  };
  await saveProblemMeta(lastProblem);
  await saveCsesSlugLookup(lastProblem);

  // Only open/switch when we used a separate file. If we attached to the file
  // you're already on, leave your editor exactly where it is.
  if (!attachToActive && config().get<boolean>("openOnCapture", true)) {
    const document = await vscode.workspace.openTextDocument(solutionPath);
    await vscode.window.showTextDocument(document);
  }

  refreshActions();
  const detail = attachToActive
    ? `${tests.length} sample(s) → ${path.basename(solutionPath)}`
    : `${tests.length} sample(s)`;
  vscode.window.showInformationMessage(`CPOS · ${problem.id} (${problem.name}) — ${detail}.`);
  await forwardCaptureToTui(problem, solutionPath);
  return lastProblem;
}

function activeEditorFilePath(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.uri.scheme === "file") return editor.document.uri.fsPath;
  return undefined;
}

function validateProblem(problem: CapturedProblem): void {
  for (const key of ["platform", "id", "name", "url"] as const) {
    if (!problem[key] || typeof problem[key] !== "string") {
      throw new Error(`missing ${key}`);
    }
  }
}

function getCompileConfig(lang: string): CompileConfig {
  // 1. An explicit VS Code override always wins, verbatim.
  const overrides = userSetting<Record<string, CompileConfig>>("compileCommands");
  if (overrides && overrides[lang]) return overrides[lang];

  // 2. Otherwise inherit from the CPOS TUI config so both stay in sync.
  const tui = tuiConfig().compileCommands[lang];
  if (tui && tui.run && tui.extension) {
    return absolutizeConfig({ compile: tui.compile, run: tui.run, extension: tui.extension });
  }

  // 3. Fall back to the built-in defaults.
  const value = DEFAULT_COMMANDS[lang];
  if (!value) throw new Error(`No compile command configured for ${lang}`);

  // On macOS, plain `g++`/`gcc` is Apple clang, which lacks <bits/stdc++.h>.
  // Use a real GNU toolchain (e.g. Homebrew g++-15) by absolute path when
  // available, so it works even when the GUI app's PATH misses /opt/homebrew/bin.
  if (lang === "cpp") {
    return { ...value, compile: `${cppCompiler()} -std=c++17 -O2 -o {output} {source}` };
  }
  if (lang === "c") {
    return { ...value, compile: `${cCompiler()} -std=c11 -O2 -o {output} {source} -lm` };
  }
  return value;
}

// Returns a VS Code setting only when the user explicitly set it (so we can
// fall back to the CPOS TUI config when they haven't).
function userSetting<T>(key: string): T | undefined {
  const info = config().inspect<T>(key);
  return info?.workspaceFolderValue ?? info?.workspaceValue ?? info?.globalValue;
}

function resolveDefaultLanguage(): string {
  return userSetting<string>("defaultLanguage") ?? tuiConfig().defaultLanguage ?? "cpp";
}

function absolutizeConfig(c: CompileConfig): CompileConfig {
  return {
    ...c,
    compile: c.compile ? absolutizeCommand(c.compile) : c.compile,
    run: absolutizeCommand(c.run)
  };
}

// Resolve a command's leading binary (e.g. `g++-15`, `python3`) to an absolute
// path when we can find it, so commands work even if the GUI app's PATH is thin.
function absolutizeCommand(command: string): string {
  const match = command.match(/^(\s*)(\S+)([\s\S]*)$/);
  if (!match) return command;
  const [, lead, bin, rest] = match;
  if (bin.includes("/")) return command;
  const resolved = resolveBinary([bin], bin);
  return resolved === bin ? command : `${lead}${resolved}${rest}`;
}

type TuiConfig = {
  defaultLanguage?: string;
  templateFile?: string;
  compileCommands: Record<string, Partial<CompileConfig>>;
};

let tuiConfigCache: TuiConfig | undefined;
let tuiConfigMtime = -1;

function tuiConfigPath(): string {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "cpos", "config.toml");
  }
  if (process.platform === "win32") {
    const base = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, "cpos", "config.toml");
  }
  const base = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(base, "cpos", "config.toml");
}

function tuiConfig(): TuiConfig {
  const file = tuiConfigPath();
  try {
    const mtime = statSync(file).mtimeMs;
    if (tuiConfigCache && mtime === tuiConfigMtime) return tuiConfigCache;
    tuiConfigCache = parseTuiConfig(readFileSync(file, "utf8"));
    tuiConfigMtime = mtime;
    return tuiConfigCache;
  } catch {
    tuiConfigCache = { compileCommands: {} };
    return tuiConfigCache;
  }
}

// Minimal TOML reader for just the keys we share with the TUI: top-level
// default_language / template_file and [compile_commands.<lang>] tables.
function parseTuiConfig(text: string): TuiConfig {
  const cfg: TuiConfig = { compileCommands: {} };
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) {
      section = sec[1].trim();
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const value = parseTomlString(kv[2]);
    if (value === undefined) continue;
    const key = kv[1];
    if (section === "") {
      if (key === "default_language") cfg.defaultLanguage = value;
      else if (key === "template_file") cfg.templateFile = value;
    } else if (section.startsWith("compile_commands.")) {
      const lang = section.slice("compile_commands.".length);
      const entry = cfg.compileCommands[lang] ?? (cfg.compileCommands[lang] = {});
      if (key === "compile") entry.compile = value;
      else if (key === "run") entry.run = value;
      else if (key === "extension") entry.extension = value;
    }
  }
  return cfg;
}

function parseTomlString(raw: string): string | undefined {
  const s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return s
      .slice(1, -1)
      .replace(/\\\\/g, "\\")
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t");
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
    return s.slice(1, -1);
  }
  return undefined;
}

const compilerCache = new Map<string, string>();

function resolveBinary(candidates: string[], fallback: string): string {
  const key = candidates.join("|");
  const cached = compilerCache.get(key);
  if (cached) return cached;

  const pathDirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const extraDirs = ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin", "/usr/bin"];
  for (const candidate of candidates) {
    for (const dir of [...pathDirs, ...extraDirs]) {
      const full = path.join(dir, candidate);
      if (existsSync(full)) {
        compilerCache.set(key, full);
        return full;
      }
    }
  }
  compilerCache.set(key, fallback);
  return fallback;
}

function cppCompiler(): string {
  return resolveBinary(["g++-15", "g++-14", "g++-13", "g++-12", "g++-11"], "g++");
}

function cCompiler(): string {
  return resolveBinary(["gcc-15", "gcc-14", "gcc-13", "gcc-12", "gcc-11"], "gcc");
}

function solutionPathFor(problem: CapturedProblem, extension: string): string {
  const base = solutionBaseDir();
  const dir = config().get<boolean>("subfolderPerPlatform", false)
    ? path.join(base, platformSlug(problem.platform))
    : base;
  return path.join(dir, `${solutionBaseName(problem)}.${extension}`);
}

async function resolveSolutionPath(problem: CapturedProblem, extension: string): Promise<string> {
  const primary = solutionPathFor(problem, extension);
  if (!(await exists(primary))) return primary;

  try {
    const raw = await fs.readFile(problemMetaPathFor(primary), "utf8");
    const existing = JSON.parse(raw) as ProblemMeta;
    if (existing.id === problem.id) return primary;
  } catch {
    // File exists but isn't ours — pick a disambiguated name.
  }

  if (isCsesPlatform(problem.platform)) {
    const slug = slugFromName(problem.name);
    if (slug) {
      return path.join(path.dirname(primary), `${slug}-${safeId(problem.id)}.${extension}`);
    }
  }
  return primary;
}

function isCsesPlatform(platform: string): boolean {
  return platform.toLowerCase() === "cses";
}

// CSES files use a readable PascalCase slug from the problem name
// (e.g. "Weird Algorithm" → WeirdAlgorithm.cpp). The numeric task id stays
// in metadata for submit, progress sync, and sample lookup.
function slugFromName(name: string): string {
  return name
    .split(/[\s\-–—]+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

function solutionBaseName(problem: CapturedProblem | ProblemMeta): string {
  if (isCsesPlatform(problem.platform)) {
    const slug = slugFromName(problem.name);
    if (slug) return slug;
  }
  return safeId(problem.id);
}

function activeNameMatchesProblem(activePath: string, problem: CapturedProblem): boolean {
  const base = path.parse(activePath).name.toLowerCase();
  const id = safeId(problem.id).toLowerCase();
  if (base === id) return true;
  if (isCsesPlatform(problem.platform)) {
    const slug = slugFromName(problem.name).toLowerCase();
    if (slug && (base === slug || base === `${slug}-${id}`)) return true;
  }
  return false;
}

async function saveCsesSlugLookup(meta: ProblemMeta): Promise<void> {
  if (!isCsesPlatform(meta.platform)) return;
  const slug = slugFromName(meta.name);
  if (!slug) return;
  const file = path.join(dataDir(), "cses-slugs.json");
  let lookup: Record<string, Omit<ProblemMeta, "solutionPath">> = {};
  try {
    lookup = JSON.parse(await fs.readFile(file, "utf8")) as typeof lookup;
  } catch {
    /* start fresh */
  }
  lookup[slug.toLowerCase()] = {
    platform: meta.platform,
    id: meta.id,
    name: meta.name,
    url: meta.url,
    rating: meta.rating,
    tags: meta.tags,
    category: meta.category,
    capturedAt: meta.capturedAt
  };
  await fs.writeFile(file, JSON.stringify(lookup, null, 2), "utf8");
}

async function loadCsesMetaBySlug(basename: string, source: string): Promise<ProblemMeta | undefined> {
  try {
    const lookup = JSON.parse(
      await fs.readFile(path.join(dataDir(), "cses-slugs.json"), "utf8")
    ) as Record<string, Omit<ProblemMeta, "solutionPath">>;
    const hit = lookup[basename.toLowerCase()];
    if (!hit) return undefined;
    return { ...hit, solutionPath: source };
  } catch {
    return undefined;
  }
}

// Where captured files are created: the open folder by default, otherwise a
// fixed fallback. This keeps files inside the user's own project structure
// instead of a separate "workspace".
function solutionBaseDir(): string {
  const mode = config().get<string>("saveLocation", "workspaceFolder");
  if (mode === "workspaceFolder") {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) return folders[0].uri.fsPath;
  }
  return expandHome(config().get<string>("fixedDir", "~/cpos"));
}

function platformSlug(platform: string): string {
  const lower = platform.toLowerCase();
  if (lower === "codeforces" || lower === "cf") return "codeforces";
  if (lower === "cses") return "cses";
  if (lower === "atcoder") return "atcoder";
  return lower.replace(/[^a-z0-9_-]/g, "_") || "problems";
}

function safeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, "_");
}

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

async function templateFor(lang: string): Promise<string> {
  // Prefer an explicit VS Code template, then the template configured in the
  // CPOS TUI, then the built-in starter.
  const templateFile = (userSetting<string>("templateFile") ?? tuiConfig().templateFile ?? "").trim();
  if (templateFile) {
    try {
      return await fs.readFile(expandHome(templateFile), "utf8");
    } catch (error) {
      OUTPUT.appendLine(`Could not read template file: ${String(error)}`);
    }
  }
  return DEFAULT_TEMPLATES[lang] ?? "";
}

function dataDir(): string {
  return path.join(os.homedir(), ".cpos-vscode");
}

async function saveSamples(solutionPath: string, tests: TestCase[]): Promise<void> {
  const dir = dataDir();
  await fs.mkdir(path.join(dir, "samples"), { recursive: true });
  await fs.writeFile(samplePathFor(solutionPath), JSON.stringify(tests, null, 2), "utf8");

  if (config().get<boolean>("saveSamplesNextToSolution", false)) {
    await fs.writeFile(`${solutionPath}.samples.json`, JSON.stringify(tests, null, 2), "utf8");
  }
}

function samplePathFor(solutionPath: string): string {
  return path.join(dataDir(), "samples", `${Buffer.from(solutionPath).toString("base64url")}.json`);
}

async function saveProblemMeta(meta: ProblemMeta): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(path.join(dataDir(), "last-problem.json"), JSON.stringify(meta, null, 2), "utf8");
  await fs.mkdir(path.join(dataDir(), "problems"), { recursive: true });
  await fs.writeFile(problemMetaPathFor(meta.solutionPath), JSON.stringify(meta, null, 2), "utf8");
}

async function loadProblemMeta(): Promise<ProblemMeta | undefined> {
  if (lastProblem) return lastProblem;
  try {
    const raw = await fs.readFile(path.join(dataDir(), "last-problem.json"), "utf8");
    lastProblem = JSON.parse(raw) as ProblemMeta;
    return lastProblem;
  } catch {
    return undefined;
  }
}

async function loadProblemMetaForFile(source: string): Promise<ProblemMeta | undefined> {
  try {
    const raw = await fs.readFile(problemMetaPathFor(source), "utf8");
    return JSON.parse(raw) as ProblemMeta;
  } catch {
    const fallback = await loadProblemMeta();
    if (fallback?.solutionPath === source) return fallback;
    const inferred = inferProblemMetaFromPath(source);
    if (inferred) return inferred;
    return loadCsesMetaBySlug(path.parse(source).name, source);
  }
}

function problemMetaPathFor(solutionPath: string): string {
  return path.join(dataDir(), "problems", `${Buffer.from(solutionPath).toString("base64url")}.json`);
}

// Best-effort guess for files that were not created by a capture. We only use
// this when there is no saved metadata for the file path.
function inferProblemMetaFromPath(source: string): ProblemMeta | undefined {
  const id = path.parse(source).name;
  const parent = path.basename(path.dirname(source)).toLowerCase();

  let platform: string | undefined;
  if (parent === "codeforces" || parent === "cf") platform = "codeforces";
  else if (parent === "cses") platform = "cses";
  else if (/^\d+[A-Za-z]\d*$/.test(id)) platform = "codeforces";

  if (!platform) return undefined;

  if (platform === "cses" && !/^\d+$/.test(id)) {
    return undefined;
  }

  const url = platform === "codeforces" ? codeforcesProblemUrl(id) : `https://cses.fi/problemset/task/${id}`;
  if (!url) return undefined;

  return {
    platform,
    id,
    name: id,
    url,
    solutionPath: source,
    capturedAt: new Date(0).toISOString()
  };
}

function codeforcesProblemUrl(id: string): string | undefined {
  const match = id.match(/^(\d+)([A-Za-z0-9]+)$/);
  if (!match) return undefined;
  return `https://codeforces.com/problemset/problem/${match[1]}/${match[2]}`;
}

function tuiDataDir(): string {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "cpos");
  }
  if (process.platform === "win32") {
    const base = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, "cpos");
  }
  const base = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
  return path.join(base, "cpos");
}

async function saveCsesProgress(progress: CsesProgress): Promise<void> {
  const json = JSON.stringify(progress, null, 2);
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(path.join(dataDir(), "cses-progress.json"), json, "utf8");
  // Mirror to TUI data dir so both apps share progress.
  const tuiDir = tuiDataDir();
  await fs.mkdir(tuiDir, { recursive: true });
  await fs.writeFile(path.join(tuiDir, "cses_progress.json"), json, "utf8");
}

async function runTests(indices?: number[]): Promise<void> {
  const source = await activeSolutionPath();
  if (!source) {
    vscode.window.showWarningMessage("Open a solution file or capture a problem first.");
    return;
  }

  const tests = await loadSamples(source);
  if (tests.length === 0) {
    vscode.window.showWarningMessage("No samples for this file. Open the problem in your browser to capture, or add a test in the CPOS panel.");
    return;
  }

  const lang = languageForFile(source);
  let compileConfig: CompileConfig;
  try {
    compileConfig = getCompileConfig(lang);
  } catch (error) {
    vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    return;
  }

  const buildDir = path.join(dataDir(), "build");
  await fs.mkdir(buildDir, { recursive: true });
  const outputName = path.parse(source).name;
  const timeoutMs = config().get<number>("runTimeoutMs", 5000);

  const targets = indices && indices.length > 0 ? indices : tests.map((_, i) => i);
  const existing = runResults.get(source) ?? [];

  runningFor = source;
  refreshActions();

  try {
    if (compileConfig.compile) {
      const compileCommand = expandCommand(compileConfig.compile, source, outputName, buildDir);
      OUTPUT.appendLine(`$ ${compileCommand}`);
      const compileResult = await runShell(compileCommand, "", buildDir, Math.max(timeoutMs, 20000));
      if (compileResult.code !== 0) {
        const ceResults: RunResult[] = tests.map((_, index) => ({
          index,
          verdict: "CE",
          passed: false,
          actual: (compileResult.stderr || compileResult.stdout).trim(),
          timeMs: 0
        }));
        runResults.set(source, ceResults);
        runningFor = undefined;
        refreshActions();
        vscode.window.showErrorMessage("CPOS: compilation failed. See the CPOS panel.");
        return;
      }
    }

    const merged: RunResult[] = tests.map((_, index) => {
      const prior = existing.find((r) => r.index === index);
      return prior ?? { index, verdict: "WA", passed: false, actual: "", timeMs: 0 };
    });

    for (const index of targets) {
      const test = tests[index];
      if (!test) continue;
      const runCommand = expandCommand(compileConfig.run, source, outputName, buildDir);
      const result = await runShell(runCommand, test.input, buildDir, timeoutMs);
      merged[index] = evaluate(index, test, result);
    }

    runResults.set(source, merged);
    runningFor = undefined;
    refreshActions();

    const ran = targets.length;
    const passed = targets.filter((i) => merged[i]?.passed).length;
    const message = `CPOS: ${passed}/${ran} passed`;
    if (passed === ran) vscode.window.showInformationMessage(message);
    else vscode.window.showWarningMessage(message);
  } catch (error) {
    runningFor = undefined;
    refreshActions();
    vscode.window.showErrorMessage(`CPOS run failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function evaluate(index: number, test: TestCase, result: { code: number; stdout: string; stderr: string; timedOut: boolean; timeMs: number }): RunResult {
  const actual = result.stdout.replace(/\s+$/g, "");
  const expected = test.expected_output.replace(/\s+$/g, "");
  if (result.timedOut) {
    return { index, verdict: "TLE", passed: false, actual, timeMs: result.timeMs, stderr: result.stderr.trim() || undefined };
  }
  if (result.code !== 0) {
    return { index, verdict: "RE", passed: false, actual, timeMs: result.timeMs, stderr: result.stderr.trim() || undefined };
  }
  const passed = normalize(actual) === normalize(expected);
  return { index, verdict: passed ? "AC" : "WA", passed, actual, timeMs: result.timeMs, stderr: result.stderr.trim() || undefined };
}

function normalize(value: string): string {
  return value
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .replace(/\n+$/g, "");
}

async function submitActiveFile(): Promise<void> {
  const source = await activeSolutionPath();
  if (!source) {
    vscode.window.showWarningMessage("Open a captured solution file first.");
    return;
  }

  const meta = await loadProblemMetaForFile(source);
  if (!meta) {
    vscode.window.showWarningMessage("This file is not linked to a captured problem yet.");
    return;
  }

  const editor = vscode.window.activeTextEditor;
  const code =
    editor?.document.uri.fsPath === source ? editor.document.getText() : await fs.readFile(source, "utf8");
  if (!code.trim()) {
    vscode.window.showWarningMessage("The active solution file is empty.");
    return;
  }

  const submitUrl = submitUrlFor(meta);
  if (!submitUrl) {
    vscode.window.showWarningMessage(`Submit is not supported for ${meta.platform}.`);
    return;
  }

  const lang = languageForFile(source);
  const cf = parseCodeforcesId(meta.id);
  const taskId = isCsesPlatform(meta.platform) ? csesTaskId(meta) : undefined;

  // Queue for the browser companion to fill the submit form (problem, language,
  // code). Clipboard is kept as a fallback if autofill misses.
  pendingSubmit = {
    platform: meta.platform,
    id: taskId ?? meta.id,
    contest: cf.contest,
    index: cf.index,
    code,
    language: lang,
    fileName: path.basename(source),
    submitUrl,
    expiresAt: Date.now() + 120_000
  };

  await vscode.env.clipboard.writeText(code);
  await vscode.env.openExternal(vscode.Uri.parse(submitUrl));
  vscode.window.showInformationMessage(`Submitting ${meta.id} in your browser…`);
}

function parseCodeforcesId(id: string): { contest?: string; index?: string } {
  const match = id.match(/^(\d+)([A-Za-z]\d*)$/);
  if (!match) return {};
  return { contest: match[1], index: match[2].toUpperCase() };
}

async function activeSolutionPath(): Promise<string | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.uri.scheme === "file") {
    return editor.document.uri.fsPath;
  }
  return (await loadProblemMeta())?.solutionPath;
}

function csesTaskId(meta: ProblemMeta): string | undefined {
  const fromUrl = meta.url.match(/\/task\/(\d+)/)?.[1];
  if (fromUrl) return fromUrl;
  if (/^\d+$/.test(meta.id)) return meta.id;
  return undefined;
}

function submitUrlFor(meta: ProblemMeta): string | undefined {
  const platform = meta.platform.toLowerCase();
  if (platform === "codeforces" || platform === "cf") {
    const cf = parseCodeforcesId(meta.id);
    if (!cf.contest) return undefined;
    const index = cf.index ? `?submittedProblemIndex=${encodeURIComponent(cf.index)}` : "";
    return `https://codeforces.com/contest/${cf.contest}/submit${index}`;
  }
  if (platform === "cses") {
    const taskId = csesTaskId(meta);
    if (!taskId) return undefined;
    return `https://cses.fi/problemset/submit/${taskId}/`;
  }
  return undefined;
}

async function loadSamples(source: string): Promise<TestCase[]> {
  try {
    return JSON.parse(await fs.readFile(samplePathFor(source), "utf8")) as TestCase[];
  } catch {
    try {
      return JSON.parse(await fs.readFile(`${source}.samples.json`, "utf8")) as TestCase[];
    } catch {
      return [];
    }
  }
}

function languageForFile(source: string): string {
  const ext = path.extname(source).slice(1);
  const match = Object.entries(DEFAULT_COMMANDS).find(([, value]) => value.extension === ext);
  return match?.[0] ?? resolveDefaultLanguage();
}

function expandCommand(command: string, source: string, outputName: string, buildDir: string): string {
  return command
    .replaceAll("{source}", shellQuote(source))
    .replaceAll("{output}", shellQuote(outputName))
    .replaceAll("{dir}", shellQuote(buildDir))
    .replaceAll("{classname}", shellQuote(path.parse(source).name));
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function runShell(
  command: string,
  input: string,
  cwd: string,
  timeoutMs: number
): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean; timeMs: number }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const child = spawn("sh", ["-c", command], { cwd });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code: code ?? 1, stdout, stderr, timedOut, timeMs: Date.now() - start });
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
}

async function openProblem(): Promise<void> {
  const source = await activeSolutionPath();
  const meta = source ? await loadProblemMetaForFile(source) : await loadProblemMeta();
  if (!meta) {
    vscode.window.showWarningMessage("Capture a problem first.");
    return;
  }
  await vscode.env.openExternal(vscode.Uri.parse(meta.url));
}

type PanelState = {
  source?: string;
  fileName: string;
  meta?: ProblemMeta;
  tests: TestCase[];
  results: RunResult[];
  serverRunning: boolean;
  serverConflict: boolean;
  running: boolean;
};

async function currentState(): Promise<PanelState> {
  const source = await activeSolutionPath();
  const meta = source ? await loadProblemMetaForFile(source) : await loadProblemMeta();
  const tests = source ? await loadSamples(source) : [];
  const results = source ? runResults.get(source) ?? [] : [];
  return {
    source,
    fileName: source ? path.basename(source) : "No active file",
    meta,
    tests,
    results,
    serverRunning: server !== undefined,
    serverConflict,
    running: runningFor === source && source !== undefined
  };
}

function refreshActions(): void {
  actionsProvider?.refresh();
}

class CposActionsProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    view.webview.html = this.html();
    view.webview.onDidReceiveMessage((message) => void this.onMessage(message));
    view.onDidChangeVisibility(() => {
      if (view.visible) void this.postState();
    });
  }

  refresh(): void {
    void this.postState();
  }

  private async onMessage(message: { type?: string; index?: number; tests?: TestCase[] }): Promise<void> {
    switch (message.type) {
      case "ready":
        await this.postState();
        break;
      case "run":
        if (message.tests) await this.persistTests(message.tests);
        await runTests();
        break;
      case "runSingle":
        if (message.tests) await this.persistTests(message.tests);
        if (typeof message.index === "number") await runTests([message.index]);
        break;
      case "submit":
        await submitActiveFile();
        break;
      case "openProblem":
        await openProblem();
        break;
      case "retryServer":
        await startCaptureServer().catch((error) => warnServer(error));
        await this.postState();
        break;
      case "openSource":
        await this.openSource();
        break;
      case "persistTests":
        await this.persistTests(message.tests ?? []);
        break;
      default:
        break;
    }
  }

  private async openSource(): Promise<void> {
    const source = await activeSolutionPath();
    if (!source) return;
    const document = await vscode.workspace.openTextDocument(source);
    await vscode.window.showTextDocument(document);
  }

  private async persistTests(tests: TestCase[]): Promise<void> {
    const source = await activeSolutionPath();
    if (!source) return;
    await saveSamples(source, tests);
    const existing = runResults.get(source);
    if (existing) {
      runResults.set(
        source,
        existing.filter((r) => r.index < tests.length)
      );
    }
  }

  private async postState(): Promise<void> {
    if (!this.view) return;
    const state = await currentState();
    void this.view.webview.postMessage({ type: "state", state });
  }

  private html(): string {
    const nonce = String(Date.now());
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --mono: var(--vscode-editor-font-family, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
    --radius: 6px;
    --pad: 12px;
    --fontsize: 12px;
  }

  /* ── Theme: CPOS (signature purple) ───────────────────────── */
  body[data-theme="cpos"] {
    --bg: #0c0c13;
    --panel: #14141f;
    --input-bg: #0a0a11;
    --fg: #e7e7f2;
    --dim: #8d8da6;
    --border: #2c2c40;
    --border-soft: #20202e;
    --accent: #b794ff;
    --accent-dim: #7c5cbf;
    --highlight: #221c3a;
    --ok: #7ee787;
    --bad: #ff7a93;
    --warn: #f0c060;
    --cf: #79b8ff;
  }

  /* ── Theme: Midnight (calm slate-blue) ────────────────────── */
  body[data-theme="midnight"] {
    --bg: #0d1117;
    --panel: #161b22;
    --input-bg: #0a0e14;
    --fg: #e6edf3;
    --dim: #8b98a8;
    --border: #2a313c;
    --border-soft: #1d242e;
    --accent: #6cb6ff;
    --accent-dim: #3b6ea5;
    --highlight: #16263d;
    --ok: #6fd58a;
    --bad: #ff7a93;
    --warn: #e3b341;
    --cf: #79b8ff;
  }

  /* ── Theme: Amber (warm terminal) ─────────────────────────── */
  body[data-theme="amber"] {
    --bg: #14110a;
    --panel: #1d1810;
    --input-bg: #100d07;
    --fg: #f0e6d2;
    --dim: #a89878;
    --border: #3a3220;
    --border-soft: #2a2418;
    --accent: #f0b860;
    --accent-dim: #aa7c30;
    --highlight: #2e2510;
    --ok: #b8c46a;
    --bad: #e88a6a;
    --warn: #f0c060;
    --cf: #d8b87a;
  }

  /* ── Theme: Paper (high-contrast grayscale) ───────────────── */
  body[data-theme="paper"] {
    --bg: #101010;
    --panel: #191919;
    --input-bg: #0b0b0b;
    --fg: #f0f0f0;
    --dim: #9a9a9a;
    --border: #3a3a3a;
    --border-soft: #2a2a2a;
    --accent: #e0e0e0;
    --accent-dim: #8a8a8a;
    --highlight: #262626;
    --ok: #c8d4c8;
    --bad: #d6b0b0;
    --warn: #d4c89c;
    --cf: #c4c4c4;
  }

  /* ── Theme: Native (matches your VS Code color theme) ─────── */
  body[data-theme="native"] {
    --bg: var(--vscode-sideBar-background);
    --panel: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
    --input-bg: var(--vscode-input-background, var(--vscode-editor-background));
    --fg: var(--vscode-sideBar-foreground, var(--vscode-foreground));
    --dim: var(--vscode-descriptionForeground, #888);
    --border: var(--vscode-panel-border, var(--vscode-editorWidget-border, #3a3a3a));
    --border-soft: var(--vscode-panel-border, #2a2a2a);
    --accent: var(--vscode-textLink-foreground, #4daafc);
    --accent-dim: var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground, #3b6ea5));
    --highlight: var(--vscode-list-hoverBackground, rgba(255,255,255,0.06));
    --ok: var(--vscode-testing-iconPassed, var(--vscode-charts-green, #4caf50));
    --bad: var(--vscode-testing-iconFailed, var(--vscode-errorForeground, #f14c4c));
    --warn: var(--vscode-charts-yellow, #e3b341);
    --cf: var(--vscode-charts-blue, #4daafc);
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: var(--pad) 10px;
    color: var(--fg);
    background: var(--bg);
    font-family: var(--mono);
    font-size: var(--fontsize);
    line-height: 1.5;
  }
  .link { color: var(--accent); cursor: pointer; }
  .link:hover { text-decoration: underline; }
  .muted { color: var(--dim); }

  .box {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--panel);
  }

  .head { padding: 11px 12px; margin-bottom: 10px; }
  .head .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .brandrow { display: flex; align-items: center; gap: 7px; }
  .logo {
    width: 16px; height: 16px; border-radius: 4px; flex-shrink: 0;
    background: linear-gradient(135deg, var(--accent), var(--accent-dim));
    display: inline-block;
  }
  .title { font-weight: 700; font-size: 13px; color: var(--fg); letter-spacing: 0.08em; }
  .status { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; color: var(--dim); }
  .dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
  .dot.on { background: var(--ok); }
  .dot.off { background: var(--warn); }
  .rule { height: 1px; background: var(--border-soft); margin: 9px 0; }

  /* theme switcher */
  .iconbtn {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--dim);
    border-radius: 5px;
    padding: 3px 7px;
    font-size: 11px;
    cursor: pointer;
    line-height: 1;
  }
  .iconbtn:hover { color: var(--accent); border-color: var(--accent-dim); }
  .themebar {
    display: none;
    gap: 7px;
    flex-wrap: wrap;
    padding: 9px 12px;
    margin-bottom: 10px;
  }
  .themebar.open { display: flex; }
  .swatch {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 8px;
    background: transparent;
    color: var(--dim);
    font-size: 9px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    min-width: 52px;
  }
  .swatch:hover { border-color: var(--accent-dim); color: var(--fg); }
  .swatch.active { border-color: var(--accent); color: var(--accent); }
  .swatch .chips { display: flex; gap: 3px; }
  .swatch .chip { width: 12px; height: 12px; border-radius: 3px; }

  .pline { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
  .tag {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 5px;
    border: 1px solid var(--border);
    color: var(--dim);
    letter-spacing: 0.06em;
  }
  .tag.codeforces { color: var(--cf); border-color: var(--border); }
  .tag.cses { color: var(--ok); border-color: var(--border); }
  .pid { font-weight: 700; font-size: 14px; color: var(--fg); }
  .rating { color: var(--warn); font-size: 11px; }
  .pname { color: var(--fg); opacity: 0.82; font-size: 11px; margin-top: 3px; }
  .fileline { margin-top: 7px; font-size: 10px; color: var(--dim); }

  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 10px; }
  .stat { padding: 7px 4px; text-align: center; }
  .stat .num { font-size: 15px; font-weight: 700; line-height: 1.2; }
  .stat .num.ok { color: var(--ok); }
  .stat .num.bad { color: var(--bad); }
  .stat .num.accent { color: var(--accent); }
  .stat .lbl {
    font-size: 8px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--dim);
    margin-top: 2px;
  }

  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px; }
  button {
    font-family: var(--mono);
    font-size: 11px;
    cursor: pointer;
    padding: 7px 8px;
    border-radius: 3px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--fg);
  }
  button:hover { border-color: var(--accent-dim); background: var(--highlight); }
  button:active { opacity: 0.85; }
  button.primary {
    grid-column: 1 / -1;
    border-color: var(--accent-dim);
    background: var(--accent-dim);
    color: var(--fg);
    font-weight: 700;
  }
  button.primary:hover { background: var(--accent); border-color: var(--accent); }
  button.primary:disabled {
    opacity: 0.45;
    cursor: default;
    background: var(--highlight);
    border-color: var(--border);
  }
  button.ghost {
    padding: 2px 7px;
    font-size: 10px;
    color: var(--dim);
    background: transparent;
  }
  button.ghost:hover { color: var(--accent); border-color: var(--accent-dim); }

  .section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 4px 0 8px;
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--dim);
  }

  .test { margin-bottom: 6px; overflow: hidden; }
  .test.pass { border-color: color-mix(in srgb, var(--ok) 45%, var(--border)); }
  .test.fail { border-color: color-mix(in srgb, var(--bad) 45%, var(--border)); }
  .test-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 9px;
    border-bottom: 1px solid var(--border-soft);
    background: var(--highlight);
  }
  .test-title { display: flex; align-items: center; gap: 8px; font-size: 11px; }
  .test-title .idx { color: var(--fg); font-weight: 700; }
  .verdict {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 3px;
    border: 1px solid var(--border);
    letter-spacing: 0.04em;
    color: var(--dim);
  }
  .verdict.AC { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 50%, var(--border)); }
  .verdict.WA, .verdict.CE { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 50%, var(--border)); }
  .verdict.TLE, .verdict.RE { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 50%, var(--border)); }
  .verdict.run { color: var(--accent); border-color: var(--accent-dim); }
  .test-body { padding: 8px; display: flex; flex-direction: column; gap: 7px; }
  .io-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
  label {
    font-size: 8px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--dim);
    margin-bottom: 3px;
    display: block;
  }
  textarea {
    width: 100%;
    resize: vertical;
    font-family: var(--mono);
    font-size: 11px;
    padding: 6px 7px;
    border-radius: 4px;
    border: 1px solid var(--border-soft);
    background: var(--input-bg);
    color: var(--fg);
    line-height: 1.4;
    overflow-y: auto;
  }
  textarea:focus { outline: none; border-color: var(--accent-dim); }
  .got {
    white-space: pre-wrap;
    font-family: var(--mono);
    font-size: 11px;
    padding: 6px 7px;
    border-radius: 4px;
    background: var(--input-bg);
    border: 1px solid var(--border-soft);
    max-height: 120px;
    overflow-y: auto;
  }
  .got.fail { border-color: color-mix(in srgb, var(--bad) 45%, var(--border)); color: var(--bad); }
  .test-actions { display: flex; gap: 4px; }
  .time { font-size: 10px; color: var(--ok); }
  .empty {
    padding: 18px 12px;
    text-align: center;
    color: var(--dim);
    line-height: 1.6;
    border-style: dashed;
  }
</style>
</head>
<body>
  <div id="app"></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  let state = { tests: [], results: [], source: null };
  let renderedSource = undefined;
  const saved = vscode.getState() || {};
  let theme = saved.theme || 'cpos';
  let themesOpen = false;
  document.body.setAttribute('data-theme', theme);

  function send(type, extra) { vscode.postMessage(Object.assign({ type }, extra || {})); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  let persistTimer;
  function collectTests() {
    const cards = document.querySelectorAll(".test");
    const tests = [];
    cards.forEach((card) => {
      const input = card.querySelector("textarea.in").value;
      const expected_output = card.querySelector("textarea.exp").value;
      tests.push({ input, expected_output });
    });
    return tests;
  }
  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => send("persistTests", { tests: collectTests() }), 400);
  }

  function verdictClass(v) { return ["AC","WA","TLE","RE","CE"].includes(v) ? v : "none"; }

  function textareaRows(text, min, max) {
    const lines = String(text || "").split("\\n").length;
    return Math.min(max, Math.max(min, lines));
  }

  function autoResizeTextareas(root) {
    (root || document).querySelectorAll("textarea").forEach((ta) => {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 280) + "px";
    });
  }

  function resultHtml(r) {
    if (state.running || !r) return "";
    if (r.verdict === "AC") {
      return '<div class="time">Passed in ' + r.timeMs + 'ms</div>';
    }
    const stderr = r.stderr ? "\\n[stderr] " + r.stderr : "";
    return '<label>Got' + (r.timeMs != null ? ' · ' + r.timeMs + 'ms' : '') +
      '</label><div class="got fail">' + (esc(r.actual) || "(no output)") + esc(stderr) + '</div>';
  }

  function platformClass(p) {
    const k = String(p || "").toLowerCase();
    if (k === "codeforces" || k === "cf") return "codeforces";
    if (k === "cses") return "cses";
    if (k === "atcoder") return "atcoder";
    return "";
  }

  function header() {
    const m = state.meta;
    const status = state.serverRunning
      ? '<span class="status"><span class="dot on"></span>listening</span>'
      : state.serverConflict
        ? '<span class="status"><span class="dot off"></span>active in another window</span>'
        : '<span class="status"><span class="dot off"></span>offline · <span class="link" data-act="retryServer">retry</span></span>';
    let problemBlock;
    if (m) {
      const pClass = platformClass(m.platform);
      const tag = m.platform ? '<span class="tag ' + pClass + '">' + esc(String(m.platform).toUpperCase()) + '</span>' : '';
      const rating = m.rating ? '<span class="rating">★ ' + esc(m.rating) + '</span>' : '';
      problemBlock = '<div class="pline">' + tag + '<span class="pid">' + esc(m.id) + '</span>' + rating + '</div>'
        + '<div class="pname">' + esc(m.name) + '</div>';
    } else {
      problemBlock = '<div class="pline"><span class="pid muted">no problem linked</span></div>'
        + '<div class="pname">open a Codeforces/CSES problem in your browser to capture it</div>';
    }
    const file = state.fileName
      ? '<span class="link" data-act="openSource">' + esc(state.fileName) + '</span>'
      : '<span class="muted">no file open</span>';
    const tests = state.tests.length + ' test' + (state.tests.length === 1 ? '' : 's');
    return '<div class="box head header">'
      + '<div class="row">'
      + '<span class="brandrow"><span class="logo"></span><span class="title">CPOS</span></span>'
      + '<span class="brandrow">' + status
      + '<button class="iconbtn" data-act="toggleThemes" title="Themes">◑ theme</button></span>'
      + '</div>'
      + '<div class="rule"></div>'
      + problemBlock
      + '<div class="fileline">' + file + ' · ' + tests + '</div>'
      + '</div>'
      + themebar();
  }

  const THEMES = [
    { id: 'cpos',     name: 'CPOS',     chips: ['#0c0c13', '#b794ff', '#7ee787'] },
    { id: 'midnight', name: 'Midnight', chips: ['#0d1117', '#6cb6ff', '#6fd58a'] },
    { id: 'amber',    name: 'Amber',    chips: ['#14110a', '#f0b860', '#b8c46a'] },
    { id: 'paper',    name: 'Paper',    chips: ['#101010', '#e0e0e0', '#9a9a9a'] },
    { id: 'native',   name: 'Native',   chips: ['#222', '#4daafc', '#4caf50'] }
  ];

  function themebar() {
    const cells = THEMES.map(function (t) {
      const chips = t.chips.map(function (c) {
        return '<span class="chip" style="background:' + c + '"></span>';
      }).join('');
      const cls = t.id === theme ? 'swatch active' : 'swatch';
      return '<button class="' + cls + '" data-act="setTheme" data-theme="' + t.id + '">'
        + '<span class="chips">' + chips + '</span>' + t.name + '</button>';
    }).join('');
    return '<div class="box themebar' + (themesOpen ? ' open' : '') + '">' + cells + '</div>';
  }

  function applyTheme(id) {
    theme = id;
    document.body.setAttribute('data-theme', id);
    vscode.setState(Object.assign({}, vscode.getState(), { theme: id }));
  }

  function statbar() {
    const total = state.tests.length;
    const ran = !state.running && state.results.length > 0;
    const passed = ran ? state.results.filter((r) => r.passed).length : null;
    const failed = ran ? state.results.filter((r) => !r.passed).length : null;
    const cell = (num, cls, lbl) =>
      '<div class="box stat"><div class="num ' + cls + '">' + num + '</div><div class="lbl">' + lbl + '</div></div>';
    return '<div class="stats summary">'
      + cell(total, 'accent', 'Tests')
      + cell(passed == null ? '–' : passed, 'ok', 'Passed')
      + cell(failed == null ? '–' : failed, 'bad', 'Failed')
      + '</div>';
  }

  function actions() {
    const runLabel = state.running ? "running…" : "Run All";
    return '<div class="actions">'
      + '<button class="primary" data-act="run" ' + (state.running ? "disabled" : "") + '>' + runLabel + '</button>'
      + '<button data-act="submit">Submit</button>'
      + '<button data-act="openProblem">Problem</button>'
      + '</div>';
  }

  function testCard(t, i) {
    const r = state.results.find((x) => x.index === i);
    let verdict = "—", vClass = "none", cardClass = "";
    if (state.running) { verdict = "RUN"; vClass = "run"; }
    else if (r) { verdict = r.verdict; vClass = verdictClass(r.verdict); cardClass = r.passed ? "pass" : "fail"; }
    const got = '<div class="result-slot">' + resultHtml(r) + '</div>';
    const inRows = textareaRows(t.input, 3, 14);
    const expRows = textareaRows(t.expected_output, 2, 10);
    return '<div class="box test ' + cardClass + '" data-index="' + i + '">'
      + '<div class="test-head">'
      + '<div class="test-title"><span class="idx">Test ' + (i + 1) + '</span><span class="verdict ' + vClass + '">' + verdict + '</span></div>'
      + '<div class="test-actions">'
      + '<button class="ghost" data-act="runSingle" data-index="' + i + '">run</button>'
      + '<button class="ghost" data-act="deleteTest" data-index="' + i + '">del</button>'
      + '</div>'
      + '</div>'
      + '<div class="test-body">'
      + '<div class="io-grid">'
      + '<div><label>Input</label><textarea class="in" rows="' + inRows + '" spellcheck="false">' + esc(t.input) + '</textarea></div>'
      + '<div><label>Expected</label><textarea class="exp" rows="' + expRows + '" spellcheck="false">' + esc(t.expected_output) + '</textarea></div>'
      + '</div>'
      + got
      + '</div>'
      + '</div>';
  }

  function testsSection() {
    let body;
    if (state.tests.length === 0) {
      body = '<div class="box empty">no test cases — capture from browser or + add</div>';
    } else {
      body = state.tests.map((t, i) => testCard(t, i)).join("");
    }
    return '<div class="section"><span>Test Cases</span>'
      + '<button class="ghost" data-act="addTest">+ add</button></div>' + body;
  }

  function render() {
    const app = document.getElementById("app");
    app.innerHTML = header() + statbar() + actions() + testsSection();
    renderedSource = state.source;
    bind();
    autoResizeTextareas(app);
  }

  // Update verdicts/results without wiping in-progress textarea edits (same file).
  function patch() {
    const app = document.getElementById("app");
    const cards = app.querySelectorAll(".test");
    // If the test count changed (add/delete/new capture), do a full render.
    if (cards.length !== state.tests.length) { render(); return; }

    const tmp = document.createElement("div");
    tmp.innerHTML = header() + statbar() + actions();
    const newHeader = tmp.querySelector(".header");
    const newActions = tmp.querySelector(".actions");
    const newSummary = tmp.querySelector(".summary");
    const oldHeader = app.querySelector(".header");
    const oldActions = app.querySelector(".actions");
    const oldSummary = app.querySelector(".summary");
    if (oldHeader && newHeader) oldHeader.replaceWith(newHeader);
    if (oldActions && newActions) oldActions.replaceWith(newActions);
    if (oldSummary && newSummary) oldSummary.replaceWith(newSummary);

    cards.forEach((card, i) => {
      const r = state.results.find((x) => x.index === i);
      card.className = "box test" + (state.running ? "" : r ? (r.passed ? " pass" : " fail") : "");
      const v = card.querySelector(".verdict");
      if (state.running) { v.textContent = "RUN"; v.className = "verdict run"; }
      else if (r) { v.textContent = r.verdict; v.className = "verdict " + verdictClass(r.verdict); }
      else { v.textContent = "—"; v.className = "verdict none"; }
      const slot = card.querySelector(".result-slot");
      if (slot) slot.innerHTML = resultHtml(r);
    });
    bind();
  }

  function bind() {
    document.querySelectorAll("[data-act]").forEach((el) => {
      el.onclick = () => {
        const act = el.getAttribute("data-act");
        const idx = el.getAttribute("data-index");
        if (act === "toggleThemes") {
          themesOpen = !themesOpen;
          const bar = document.querySelector(".themebar");
          if (bar) bar.classList.toggle("open", themesOpen);
          return;
        }
        if (act === "setTheme") {
          applyTheme(el.getAttribute("data-theme"));
          document.querySelectorAll(".swatch").forEach((s) => {
            s.classList.toggle("active", s.getAttribute("data-theme") === theme);
          });
          return;
        }
        if (act === "addTest") {
          syncStateFromDom();
          state.tests.push({ input: "", expected_output: "" });
          send("persistTests", { tests: state.tests.slice() });
          render();
          return;
        }
        if (act === "deleteTest") {
          syncStateFromDom();
          state.tests.splice(Number(idx), 1);
          state.results = [];
          send("persistTests", { tests: state.tests.slice() });
          render();
          return;
        }
        if (act === "runSingle") { send("runSingle", { index: Number(idx), tests: collectTests() }); return; }
        if (act === "run") { send("run", { tests: collectTests() }); return; }
        send(act);
      };
    });
    document.querySelectorAll("textarea").forEach((ta) => {
      ta.oninput = () => { schedulePersist(); autoResizeTextareas(ta.closest(".test") || document); };
    });
    autoResizeTextareas(document);
  }

  function syncStateFromDom() {
    const collected = collectTests();
    if (collected.length === state.tests.length) state.tests = collected;
  }

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg.type === "state") {
      const incoming = msg.state;
      const sameFile = incoming.source === renderedSource && renderedSource !== undefined;
      state = incoming;
      if (sameFile) patch();
      else render();
    }
  });

  send("ready");
</script>
</body>
</html>`;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
