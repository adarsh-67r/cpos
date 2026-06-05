import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { promises as fs, existsSync, readFileSync, statSync } from "node:fs";
import { spawn, execSync } from "node:child_process";
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
  input_block_sizes?: number[];
  output_block_sizes?: number[];
  input_output_offset?: number;
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

type CapturedAccepted = {
  platform: string;
  id: string;
  name?: string;
  url?: string;
  language?: string;
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
let extContext: vscode.ExtensionContext | undefined;

const PANEL_THEME_KEY = "cpos.panelTheme";

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

type PublishConfig = {
  autoPublish: boolean;
  repoDir: string;
  remoteUrl?: string;
  remote: string;
  branch: string;
  githubPages: boolean;
  ollamaEnabled: boolean;
  ollamaModel: string;
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
  extContext = context;
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
    vscode.commands.registerCommand("cpos.publishActiveFile", publishActiveFile),
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

  if (req.method === "POST" && req.url === "/capture/accepted") {
    try {
      const body = await readJson<CapturedAccepted>(req);
      await saveAccepted(body);
      const meta = await findMetaForAccepted(body);
      if (meta && tuiConfig().publish.autoPublish) {
        await publishMeta(meta, body.language);
        vscode.window.showInformationMessage(`CPOS · publishing ${body.id} to GitHub…`);
      }
      refreshActions();
      sendJson(res, 200, { ok: true, id: body.id });
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
  if (overrides && overrides[lang]) return applyPlatformRun(overrides[lang]);

  // 2. Otherwise inherit from the CPOS TUI config so both stay in sync.
  const tui = tuiConfig().compileCommands[lang];
  if (tui && tui.run && tui.extension) {
    return applyPlatformRun(absolutizeConfig({ compile: tui.compile, run: tui.run, extension: tui.extension }));
  }

  // 3. Fall back to the built-in defaults.
  const value = DEFAULT_COMMANDS[lang];
  if (!value) throw new Error(`No compile command configured for ${lang}`);

  // On macOS, plain `g++`/`gcc` is Apple clang, which lacks <bits/stdc++.h>.
  // Use a real GNU toolchain (e.g. Homebrew g++-15) by absolute path when
  // available, so it works even when the GUI app's PATH misses /opt/homebrew/bin.
  if (lang === "cpp") {
    return applyPlatformRun({
      ...value,
      compile: `${cppCompiler()} -std=c++17 -O2 -o {output} {source}`
    });
  }
  if (lang === "c") {
    return applyPlatformRun({
      ...value,
      compile: `${cCompiler()} -std=c11 -O2 -o {output} {source} -lm`
    });
  }
  if (lang === "python") {
    return applyPlatformRun({ ...value, run: `${pythonRunner()} {source}` });
  }
  if (lang === "pypy") {
    return applyPlatformRun({ ...value, run: `${pypyRunner()} {source}` });
  }
  return applyPlatformRun(value);
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
  publish: PublishConfig;
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
    tuiConfigCache = { compileCommands: {}, publish: defaultPublishConfig() };
    return tuiConfigCache;
  }
}

// Minimal TOML reader for just the keys we share with the TUI: top-level
// default_language / template_file and [compile_commands.<lang>] tables.
function parseTuiConfig(text: string): TuiConfig {
  const cfg: TuiConfig = { compileCommands: {}, publish: defaultPublishConfig() };
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
    const value = parseTomlValue(kv[2]);
    if (value === undefined) continue;
    const key = kv[1];
    if (section === "") {
      if (key === "default_language" && typeof value === "string") cfg.defaultLanguage = value;
      else if (key === "template_file" && typeof value === "string") cfg.templateFile = value;
    } else if (section.startsWith("compile_commands.")) {
      const lang = section.slice("compile_commands.".length);
      const entry = cfg.compileCommands[lang] ?? (cfg.compileCommands[lang] = {});
      if (key === "compile" && typeof value === "string") entry.compile = value;
      else if (key === "run" && typeof value === "string") entry.run = value;
      else if (key === "extension" && typeof value === "string") entry.extension = value;
    } else if (section === "publish") {
      if (key === "auto_publish" && typeof value === "boolean") cfg.publish.autoPublish = value;
      else if (key === "repo_dir" && typeof value === "string") cfg.publish.repoDir = value;
      else if (key === "remote_url") cfg.publish.remoteUrl = typeof value === "string" && value ? value : undefined;
      else if (key === "remote" && typeof value === "string") cfg.publish.remote = value;
      else if (key === "branch" && typeof value === "string") cfg.publish.branch = value;
      else if (key === "github_pages" && typeof value === "boolean") cfg.publish.githubPages = value;
      else if (key === "ollama_enabled" && typeof value === "boolean") cfg.publish.ollamaEnabled = value;
      else if (key === "ollama_model" && typeof value === "string") cfg.publish.ollamaModel = value;
    }
  }
  return cfg;
}

function defaultPublishConfig(): PublishConfig {
  return {
    autoPublish: false,
    repoDir: "~/cpos-solutions",
    remote: "origin",
    branch: "main",
    githubPages: true,
    ollamaEnabled: false,
    ollamaModel: "llama3.1"
  };
}

function parseTomlValue(raw: string): string | boolean | undefined {
  const s = raw.trim();
  if (s === "true") return true;
  if (s === "false") return false;
  return parseTomlString(raw);
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
  const extraDirs = toolPathDirs();
  for (const candidate of candidates) {
    const names =
      process.platform === "win32" ? [candidate, `${candidate}.exe`] : [candidate];
    for (const name of names) {
      for (const dir of [...pathDirs, ...extraDirs]) {
        const full = path.join(dir, name);
        if (existsSync(full)) {
          compilerCache.set(key, full);
          return full;
        }
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

/** Extra dirs merged into PATH for spawned runs (GUI apps often have a thin PATH). */
function toolPathDirs(): string[] {
  if (process.platform === "win32") {
    const pf = process.env.ProgramFiles ?? "C:\\Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    return [
      "C:\\msys64\\ucrt64\\bin",
      "C:\\msys64\\mingw64\\bin",
      "C:\\msys64\\usr\\bin",
      "C:\\MinGW\\bin",
      path.join(pf, "mingw-w64", "bin"),
      path.join(pf86, "mingw-w64", "bin"),
      path.join(os.homedir(), "scoop", "shims"),
      "C:\\Windows\\System32"
    ];
  }
  return ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin", "/usr/bin", "/bin"];
}

function processEnvForRun(): NodeJS.ProcessEnv {
  const pathDirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const merged = [...new Set([...pathDirs, ...toolPathDirs()])].join(path.delimiter);
  return { ...process.env, PATH: merged };
}

function shellForRun(): { file: string; args: (command: string) => string[] } {
  if (process.platform === "win32") {
    const file = process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe";
    return { file, args: (command) => ["/d", "/s", "/c", command] };
  }
  for (const file of ["/bin/sh", "/usr/bin/sh"]) {
    if (existsSync(file)) return { file, args: (command) => ["-c", command] };
  }
  return { file: "sh", args: (command) => ["-c", command] };
}

/** Windows cannot run `./binary`; map Unix-style run templates to `.exe` names. */
function applyPlatformRun(config: CompileConfig): CompileConfig {
  if (process.platform !== "win32") return config;
  let run = config.run;
  if (run === "./{output}") run = "{output}.exe";
  else if (run.startsWith("./{output}")) run = run.replace(/^\.\/\{output\}/, "{output}.exe");
  return { ...config, run };
}

function pythonRunner(): string {
  if (process.platform === "win32") {
    return resolveBinary(["python", "python3", "py"], "python");
  }
  return resolveBinary(["python3", "python"], "python3");
}

function pypyRunner(): string {
  if (process.platform === "win32") {
    return resolveBinary(["pypy3", "pypy"], "pypy3");
  }
  return resolveBinary(["pypy3", "pypy"], "pypy3");
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

function acceptedKey(platform: string, id: string): string {
  return `${platform.toLowerCase()}:${id}`;
}

async function loadAccepted(): Promise<Record<string, CapturedAccepted>> {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir(), "accepted.json"), "utf8")) as Record<string, CapturedAccepted>;
  } catch {
    return {};
  }
}

async function saveAccepted(accepted: CapturedAccepted): Promise<void> {
  const all = await loadAccepted();
  all[acceptedKey(accepted.platform, accepted.id)] = accepted;
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(path.join(dataDir(), "accepted.json"), JSON.stringify(all, null, 2), "utf8");
}

async function loadAcceptedIndex(): Promise<Array<{ platform: string; id: string; solution_path?: string }>> {
  try {
    const raw = await fs.readFile(path.join(dataDir(), "accepted-index.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function isAccepted(meta?: ProblemMeta): Promise<boolean> {
  if (!meta) return false;
  const all = await loadAccepted();
  if (all[acceptedKey(meta.platform, meta.id)]) return true;
  const index = await loadAcceptedIndex();
  return index.some(
    (entry) =>
      entry.platform.toLowerCase() === meta.platform.toLowerCase() &&
      entry.id === meta.id
  );
}

async function findMetaForAccepted(accepted: CapturedAccepted): Promise<ProblemMeta | undefined> {
  const current = await loadProblemMeta();
  if (current && current.platform.toLowerCase() === accepted.platform.toLowerCase() && current.id === accepted.id) {
    return current;
  }
  const dir = path.join(dataDir(), "problems");
  try {
    for (const file of await fs.readdir(dir)) {
      if (!file.endsWith(".json")) continue;
      const meta = JSON.parse(await fs.readFile(path.join(dir, file), "utf8")) as ProblemMeta;
      if (meta.platform.toLowerCase() === accepted.platform.toLowerCase() && meta.id === accepted.id) {
        return meta;
      }
    }
  } catch {
    /* no stored problems yet */
  }
  return undefined;
}

async function publishActiveFile(): Promise<void> {
  const source = await activeSolutionPath();
  const meta = source ? await loadProblemMetaForFile(source) : await loadProblemMeta();
  if (!meta) {
    vscode.window.showWarningMessage("Capture a problem first.");
    return;
  }
  if (!(await isAccepted(meta))) {
    vscode.window.showWarningMessage("Only accepted solutions can be published.");
    return;
  }
  await publishMeta(meta);
}

let cposCliCache: string | undefined;

function cposCandidates(): string[] {
  const out: string[] = [];
  const configured = config().get<string>("cliPath")?.trim();
  if (configured) out.push(configured);
  out.push(path.join(os.homedir(), ".cargo", "bin", "cpos"));
  if (process.platform === "win32") {
    out.push("cpos");
  } else {
    try {
      const which = execSync("which -a cpos 2>/dev/null || true", { encoding: "utf8" });
      for (const line of which.split(/\r?\n/)) {
        const p = line.trim();
        if (p) out.push(p);
      }
    } catch {
      out.push("cpos");
    }
  }
  return [...new Set(out)];
}

async function resolveCposCli(): Promise<string | undefined> {
  if (cposCliCache) return cposCliCache;
  for (const bin of cposCandidates()) {
    try {
      const result = await runProcess(bin, ["help"], process.cwd(), 5_000);
      const help = `${result.stdout}\n${result.stderr}`;
      if (/publish-json/i.test(help)) {
        cposCliCache = bin;
        OUTPUT.appendLine(`CPOS CLI: ${bin}`);
        return bin;
      }
    } catch {
      /* try next candidate */
    }
  }
  return undefined;
}

async function publishMeta(meta: ProblemMeta, languageOverride?: string): Promise<void> {
  const publish = tuiConfig().publish;
  if (!publish.autoPublish) {
    vscode.window.showWarningMessage("Enable GitHub publishing in the CPOS app (Config tab).");
    return;
  }
  const payload = {
    platform: meta.platform,
    id: meta.id,
    name: meta.name,
    url: meta.url,
    rating: meta.rating,
    tags: meta.tags ?? [],
    category: meta.category,
    solution_path: meta.solutionPath,
    language: languageOverride || languageForFile(meta.solutionPath),
    accepted: true
  };
  const file = path.join(dataDir(), "publish-request.json");
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(file, JSON.stringify(payload, null, 2), "utf8");
  try {
    const cpos = await resolveCposCli();
    if (!cpos) {
      vscode.window.showWarningMessage(
        "CPOS app is outdated. Run: brew unlink cpos && cargo install --path . --force (or update CPOS from releases)."
      );
      return;
    }
    const result = await runProcess(cpos, ["publish-json", file], solutionBaseDir(), 30_000);
    if (result.code === 0) {
      vscode.window.showInformationMessage(`CPOS: published ${meta.id}.`);
    } else {
      OUTPUT.appendLine(result.stderr || result.stdout);
      const out = `${result.stdout}\n${result.stderr}`;
      if (/unknown command/i.test(out)) {
        vscode.window.showWarningMessage(
          "CPOS on PATH is outdated (missing publish-json). Run: cargo install --path . --force"
        );
      } else {
        vscode.window.showWarningMessage("CPOS publish failed. See the CPOS output panel.");
      }
    }
  } catch (error) {
    vscode.window.showWarningMessage(`Could not run cpos publish-json: ${error instanceof Error ? error.message : String(error)}`);
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

  const lang = languageForFile(source);
  const cf = parseCodeforcesId(meta.id);
  const taskId = isCsesPlatform(meta.platform) ? csesTaskId(meta) : undefined;

  const submitUrl = submitUrlFor(meta);
  if (!submitUrl) {
    vscode.window.showWarningMessage(`Submit is not supported for ${meta.platform}.`);
    return;
  }

  pendingSubmit = {
    platform: meta.platform,
    id: isCsesPlatform(meta.platform) ? (taskId ?? meta.id) : meta.id,
    contest: cf.contest,
    index: cf.index,
    code,
    language: lang,
    fileName: path.basename(source),
    submitUrl,
    expiresAt: Date.now() + 120_000
  };

  void vscode.env.clipboard.writeText(code);
  vscode.window.showInformationMessage(`Submitting ${meta.id} — opening submit page in Chrome…`);
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
  if (process.platform === "win32") {
    return `"${value.replace(/"/g, '""')}"`;
  }
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
    const shell = shellForRun();
    const child = spawn(shell.file, shell.args(command), {
      cwd,
      env: processEnvForRun(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
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

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: processEnvForRun(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code: code ?? 1, stdout, stderr, timedOut });
    });
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

async function searchProblem(): Promise<void> {
  const source = await activeSolutionPath();
  const meta = source ? await loadProblemMetaForFile(source) : await loadProblemMeta();
  if (!meta) {
    vscode.window.showWarningMessage("Link a problem first to search for editorials.");
    return;
  }
  const platformKey = meta.platform.toLowerCase();
  const platformLabel =
    platformKey === "codeforces" || platformKey === "cf"
      ? "Codeforces"
      : platformKey === "cses"
        ? "CSES"
        : meta.platform;
  const query = `${platformLabel} ${meta.id} ${meta.name} editorial solution`.trim();
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  await vscode.env.openExternal(vscode.Uri.parse(url));
}

async function openGithub(): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse("https://github.com/Soham109/cpos"));
}

type PanelState = {
  source?: string;
  fileName: string;
  meta?: ProblemMeta;
  accepted: boolean;
  tests: TestCase[];
  results: RunResult[];
  serverRunning: boolean;
  serverConflict: boolean;
  running: boolean;
  theme?: string;
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
    accepted: await isAccepted(meta),
    tests,
    results,
    serverRunning: server !== undefined,
    serverConflict,
    running: runningFor === source && source !== undefined,
    theme: extContext?.globalState.get<string>(PANEL_THEME_KEY)
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

  private async onMessage(message: {
    type?: string;
    index?: number;
    tests?: TestCase[];
    theme?: string;
  }): Promise<void> {
    switch (message.type) {
      case "ready":
        await this.postState();
        break;
      case "saveTheme":
        if (message.theme) await extContext?.globalState.update(PANEL_THEME_KEY, message.theme);
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
      case "searchProblem":
        await searchProblem();
        break;
      case "openGithub":
        await openGithub();
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
    const logoUri = this.view!.webview
      .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "icon128.png"))
      .toString();
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
    --highlight: var(--vscode-list-hoverBackground, rgba(128,128,128,0.12));
    --ok: var(--vscode-testing-iconPassed, var(--vscode-charts-green, #4caf50));
    --bad: var(--vscode-testing-iconFailed, var(--vscode-errorForeground, #f14c4c));
    --warn: var(--vscode-charts-yellow, #e3b341);
    --cf: var(--vscode-charts-blue, #4daafc);
    --btn-bg: var(--vscode-button-background, #007acc);
    --btn-fg: var(--vscode-button-foreground, #ffffff);
    --btn-hover: var(--vscode-button-hoverBackground, #006bb3);
    --btn-border: var(--vscode-button-border, var(--btn-bg));
    --btn-secondary-bg: var(--vscode-button-secondaryBackground, var(--highlight));
    --btn-secondary-fg: var(--vscode-button-secondaryForeground, var(--dim));
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
    display: block; object-fit: contain;
  }
  .title { font-weight: 700; font-size: 13px; color: var(--fg); letter-spacing: 0.08em; }
  .rule { height: 1px; background: var(--border-soft); margin: 9px 0; }

  /* header icon buttons */
  .headtools { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; }
  .iconbtn {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--dim);
    border-radius: 5px;
    padding: 3px 7px;
    font-size: 10px;
    cursor: pointer;
    line-height: 1;
    font-family: var(--mono);
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .iconbtn:hover { border-color: var(--accent-dim); }
  .iconbtn svg { width: 12px; height: 12px; flex-shrink: 0; }
  .iconbtn.gh {
    background: #0d1117;
    border-color: #30363d;
    color: #f0f6fc;
  }
  .iconbtn.gh:hover { background: #161b22; border-color: #484f58; color: #fff; }
  .iconbtn.search {
    background: color-mix(in srgb, var(--cf) 16%, transparent);
    border-color: color-mix(in srgb, var(--cf) 42%, var(--border));
    color: var(--cf);
  }
  .iconbtn.search:hover {
    background: color-mix(in srgb, var(--cf) 28%, transparent);
    color: var(--cf);
  }
  .iconbtn.theme {
    background: color-mix(in srgb, var(--accent-dim) 32%, transparent);
    border-color: var(--accent-dim);
    color: var(--accent);
  }
  .iconbtn.theme:hover {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    color: var(--accent);
  }
  .iconbtn:disabled { opacity: 0.4; cursor: default; pointer-events: none; }
  .actions button:disabled { opacity: 0.45; cursor: default; }
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
  button:hover:not(.primary) { border-color: var(--accent-dim); background: var(--highlight); }
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
  /* Native theme: VS Code primary button (white label on theme button bg) */
  body[data-theme="native"] button.primary {
    background: var(--btn-bg);
    color: var(--btn-fg);
    border-color: var(--btn-border);
  }
  body[data-theme="native"] button.primary:hover {
    background: var(--btn-hover);
    border-color: var(--btn-hover);
    color: var(--btn-fg);
  }
  body[data-theme="native"] button.primary:disabled {
    opacity: 1;
    background: var(--btn-secondary-bg);
    color: var(--btn-secondary-fg);
    border-color: var(--btn-border, var(--border));
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
  .io-grid {
    display: grid;
    grid-template-columns: var(--io-in-pct, 68%) 6px minmax(0, 1fr);
    gap: 0;
    align-items: stretch;
  }
  .io-col { min-width: 0; display: flex; flex-direction: column; }
  .io-splitter {
    cursor: col-resize;
    background: var(--border-soft);
    border-radius: 2px;
    margin: 18px 0 0;
    align-self: stretch;
    touch-action: none;
  }
  .io-splitter:hover, .io-splitter.dragging { background: var(--accent-dim); }
  .io-input-box, .io-exp-box {
    position: relative;
    border-radius: 4px;
    border: 1px solid var(--border-soft);
    background: var(--input-bg);
    overflow: hidden;
  }
  .io-input-box:focus-within, .io-exp-box:focus-within { border-color: var(--accent-dim); }
  .io-line-bg, .io-exp-line-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    padding: 6px 7px 6px 0;
    overflow: hidden;
  }
  .io-line-bg .ln, .io-exp-line-bg .ln {
    display: flex;
    align-items: stretch;
    min-height: calc(11px * 1.4);
    line-height: 1.4;
    font-size: 11px;
    font-family: var(--mono);
    border-radius: 2px;
    white-space: pre;
    overflow: hidden;
  }
  .io-line-bg .ln-gutter, .io-exp-line-bg .ln-gutter {
    flex: 0 0 18px;
    text-align: right;
    padding-right: 5px;
    color: var(--dim);
    font-size: 9px;
    opacity: 0;
    user-select: none;
  }
  .io-line-bg .ln.blk-hi .ln-gutter, .io-exp-line-bg .ln.blk-hi .ln-gutter { opacity: 1; color: var(--warn); }
  .io-line-bg .ln-txt, .io-exp-line-bg .ln-txt {
    flex: 1;
    min-width: 0;
    padding-right: 4px;
    visibility: hidden;
  }
  .io-line-bg .ln.blk-odd, .io-exp-line-bg .ln.blk-odd { background: rgba(128, 128, 128, 0.11); }
  .io-line-bg .ln.blk-even, .io-exp-line-bg .ln.blk-even { background: transparent; }
  .io-line-bg .ln.blk-hi, .io-exp-line-bg .ln.blk-hi {
    background: rgba(240, 192, 96, 0.38) !important;
  }
  .io-input-box textarea.in, .io-exp-box textarea.exp {
    position: relative;
    z-index: 1;
    display: block;
    width: 100%;
    resize: vertical;
    border: none;
    background: transparent;
    color: var(--fg);
    padding: 6px 7px 6px 25px;
    font-family: var(--mono);
    font-size: 11px;
    line-height: 1.4;
    overflow-y: auto;
    caret-color: var(--fg);
  }
  .io-input-box textarea.in { min-height: 3.2em; }
  .io-exp-box textarea.exp { min-height: 2.4em; }
  .io-input-box textarea.in:focus, .io-exp-box textarea.exp:focus { outline: none; }
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
  const CPOS_LOGO = ${JSON.stringify(logoUri)};
  const GH_ICON = '<svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.18.82.63-.18 1.31-.27 1.98-.27.67 0 1.35.09 1.98.27 1.51-1.04 2.18-.82 2.18-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
  const vscode = acquireVsCodeApi();
  let state = { tests: [], results: [], source: null };
  let renderedSource = undefined;
  const saved = vscode.getState() || {};
  let theme = saved.theme || 'cpos';
  let themesOpen = false;
  let ioSplit = typeof saved.ioSplit === 'number' ? saved.ioSplit : 68;
  document.body.setAttribute('data-theme', theme);

  function persistUiState() {
    vscode.setState(Object.assign({}, vscode.getState(), { theme, ioSplit }));
  }

  function applyIoSplit(pct) {
    ioSplit = Math.min(82, Math.max(48, pct));
    document.querySelectorAll(".io-grid").forEach((grid) => {
      grid.style.setProperty("--io-in-pct", ioSplit + "%");
    });
    persistUiState();
  }

  function parseCodeforcesOutputBlockSizes(expected) {
    const lines = String(expected || "").split("\\n");
    const sizes = [];
    let i = 0;
    while (i < lines.length) {
      const s = lines[i].trim();
      if (!s) {
        i++;
        continue;
      }
      if (s === "NO") {
        sizes.push(1);
        i++;
        continue;
      }
      if (s === "YES") {
        i++;
        const k = i < lines.length ? parseInt(lines[i].trim(), 10) : NaN;
        if (!isNaN(k) && k >= 0) {
          sizes.push(2 + k);
          i++;
          i += k;
        } else {
          sizes.push(2);
        }
        continue;
      }
      sizes.push(1);
      i++;
    }
    return sizes.length ? sizes : null;
  }

  function inferOutputOffset(blockSizes, expected, outputBlockSizes) {
    if (outputBlockSizes && blockSizes.length === outputBlockSizes.length + 1) return 1;
    if (blockSizes.length > 1 && blockSizes[0] === 1) {
      const t = parseInt(String(expected || "").split("\\n")[0] || "", 10);
      const outN = outputBlockSizes ? outputBlockSizes.length : parseCodeforcesOutputBlockSizes(expected)?.length;
      if (!isNaN(t) && outN && blockSizes.length === outN + 1) return 1;
    }
    const expCount = String(expected || "").split("\\n").filter(function (l) { return l.trim().length > 0; }).length;
    if (blockSizes.length === expCount + 1) return 1;
    if (blockSizes.length > expCount && blockSizes[0] === 1) return 1;
    return 0;
  }

  function computeInputBlocks(lines, expected, blockSizes, outputOffset, outputBlockSizes) {
    if (blockSizes && blockSizes.length) {
      const offset =
        typeof outputOffset === "number"
          ? outputOffset
          : inferOutputOffset(blockSizes, expected, outputBlockSizes);
      const blocks = [];
      let idx = 0;
      for (let i = 0; i < blockSizes.length; i++) {
        const size = Math.max(1, blockSizes[i]);
        blocks.push({
          start: idx,
          end: idx + size - 1,
          outIdx: i >= offset ? i - offset : -1
        });
        idx += size;
      }
      if (idx < lines.length) {
        blocks.push({ start: idx, end: lines.length - 1, outIdx: -1 });
      }
      return { blocks: blocks, outputOffset: offset };
    }

    const expLines = String(expected || "").split("\\n");
    const expCount = expLines.filter(function (l) { return l.trim().length > 0; }).length;

    const blankBlocks = [];
    let curStart = 0;
    let inBlock = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === "") {
        if (inBlock) {
          blankBlocks.push({ start: curStart, end: i - 1, outIdx: blankBlocks.length });
          inBlock = false;
        }
      } else if (!inBlock) {
        curStart = i;
        inBlock = true;
      }
    }
    if (inBlock) blankBlocks.push({ start: curStart, end: lines.length - 1, outIdx: blankBlocks.length });
    if (blankBlocks.length > 1 && blankBlocks.length === expCount) {
      return { blocks: blankBlocks, outputOffset: 0 };
    }

    const t = parseInt(String(lines[0] || "").trim(), 10);
    if (!isNaN(t) && t > 0 && t === expCount && lines.length > t) {
      const rest = lines.length - 1;
      if (rest === t) {
        const oneLineBlocks = Array.from({ length: t }, function (_, i) {
          return { start: i + 1, end: i + 1, outIdx: i };
        });
        return { blocks: [{ start: 0, end: 0, outIdx: -1 }].concat(oneLineBlocks), outputOffset: 1 };
      }
    }

    return { blocks: [{ start: 0, end: Math.max(0, lines.length - 1), outIdx: -1 }], outputOffset: 0 };
  }

  function computeOutputBlocks(lines, blockSizes) {
    if (blockSizes && blockSizes.length) {
      const blocks = [];
      let idx = 0;
      for (let i = 0; i < blockSizes.length; i++) {
        const size = Math.max(1, blockSizes[i]);
        blocks.push({ start: idx, end: idx + size - 1, outIdx: i });
        idx += size;
      }
      if (idx < lines.length) blocks.push({ start: idx, end: lines.length - 1, outIdx: blocks.length });
      return blocks;
    }
    return lines.map(function (_, i) { return { start: i, end: i, outIdx: i }; });
  }

  function lineIndexFromTextarea(ta, clientY) {
    const style = getComputedStyle(ta);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
    const padTop = parseFloat(style.paddingTop) || 0;
    const rect = ta.getBoundingClientRect();
    const y = clientY - rect.top + ta.scrollTop - padTop;
    const lines = ta.value.split("\\n");
    const idx = Math.floor(y / lineHeight);
    return Math.max(0, Math.min(lines.length - 1, idx));
  }

  function blockForLine(blocks, lineIdx) {
    for (let i = 0; i < blocks.length; i++) {
      if (lineIdx >= blocks[i].start && lineIdx <= blocks[i].end) return i;
    }
    return -1;
  }

  function lineRowsHtml(lines, blocks, gutter) {
    return lines.map(function (line, i) {
      const blk = blockForLine(blocks, i);
      const gutterTxt = gutter && blk >= 0 && blocks[blk].start === i && blocks[blk].outIdx >= 0
        ? String(blocks[blk].outIdx + 1)
        : "";
      const blkClass = blk >= 0 && blk % 2 ? "even" : "odd";
      const blkId = blk >= 0 ? blk : -1;
      // Background rows are stripe/gutter only — text lives in the textarea to avoid duplicate rendering.
      return '<div class="ln blk-' + blkClass + '" data-blk="' + blkId + '" data-line="' + i + '"><span class="ln-gutter">' + gutterTxt + '</span><span class="ln-txt">' + (line.length ? "x" : "&nbsp;") + '</span></div>';
    }).join("");
  }

  function syncIoLines(card) {
    const inTa = card.querySelector("textarea.in");
    const expTa = card.querySelector("textarea.exp");
    if (!inTa || !expTa) return;
    const inLines = inTa.value.split("\\n");
    if (!inLines.length) inLines.push("");
    const sizesRaw = card.getAttribute("data-block-sizes");
    const blockSizes = sizesRaw ? sizesRaw.split(",").map(Number).filter(function (n) { return n > 0; }) : null;
    const offsetRaw = card.getAttribute("data-output-offset");
    const outputOffset = offsetRaw != null && offsetRaw !== "" ? parseInt(offsetRaw, 10) : undefined;
    const expLines = expTa.value.split("\\n");
    if (!expLines.length) expLines.push("");
    const outSizesRaw = card.getAttribute("data-output-block-sizes");
    let outputBlockSizes = outSizesRaw ? outSizesRaw.split(",").map(Number).filter(function (n) { return n > 0; }) : null;
    if (!outputBlockSizes || !outputBlockSizes.length) {
      outputBlockSizes = parseCodeforcesOutputBlockSizes(expTa.value);
    }
    const meta = computeInputBlocks(
      inLines,
      expTa.value,
      blockSizes && blockSizes.length ? blockSizes : null,
      outputOffset,
      outputBlockSizes
    );
    const blocks = meta.blocks;
    card._ioBlocks = blocks;
    card._ioOutputOffset = meta.outputOffset;
    const inBg = card.querySelector(".io-line-bg");
    const expBg = card.querySelector(".io-exp-line-bg");
    if (inBg) inBg.innerHTML = lineRowsHtml(inLines, blocks, true);
    const expBlocks = computeOutputBlocks(expLines, outputBlockSizes && outputBlockSizes.length ? outputBlockSizes : null);
    card._expBlocks = expBlocks;
    if (expBg) expBg.innerHTML = lineRowsHtml(expLines, expBlocks, true);
    autoResizeTextareas(card);
  }

  function setBlockHighlight(card, inputBlockIdx, expBlockIdx) {
    if (!card) return;
    const key = inputBlockIdx + ":" + expBlockIdx;
    if (card._hiKey === key) return;
    card._hiKey = key;
    card.querySelectorAll(".io-line-bg .ln").forEach(function (ln) {
      const blk = parseInt(ln.getAttribute("data-blk"), 10);
      ln.classList.toggle("blk-hi", inputBlockIdx >= 0 && blk === inputBlockIdx);
    });
    card.querySelectorAll(".io-exp-line-bg .ln").forEach(function (ln) {
      const blk = parseInt(ln.getAttribute("data-blk"), 10);
      ln.classList.toggle("blk-hi", expBlockIdx >= 0 && blk === expBlockIdx);
    });
  }

  function clearBlockHighlight(card) {
    if (!card) return;
    card._hiKey = "";
    card.querySelectorAll(".ln.blk-hi").forEach(function (ln) { ln.classList.remove("blk-hi"); });
  }

  function bindIoScroll(card) {
    const pairs = [
      [card.querySelector("textarea.in"), card.querySelector(".io-line-bg")],
      [card.querySelector("textarea.exp"), card.querySelector(".io-exp-line-bg")]
    ];
    pairs.forEach(function (pair) {
      const ta = pair[0];
      const bg = pair[1];
      if (!ta || !bg || ta._cposScrollBound) return;
      ta._cposScrollBound = true;
      ta.addEventListener("scroll", function () {
        bg.style.transform = "translateY(" + (-ta.scrollTop) + "px)";
      });
    });
  }

  function bindIoHover(card) {
    if (card._ioHoverBound) return;
    card._ioHoverBound = true;
    bindIoScroll(card);
    const inBox = card.querySelector(".io-input-box");
    const expBox = card.querySelector(".io-exp-box");
    const inTa = card.querySelector("textarea.in");
    const expTa = card.querySelector("textarea.exp");

    function pickFromInput(ev) {
      if (!inTa) return;
      const lineIdx = lineIndexFromTextarea(inTa, ev.clientY);
      const blocks = card._ioBlocks || [{ start: 0, end: 0, outIdx: -1 }];
      const b = blockForLine(blocks, lineIdx);
      const outIdx = b >= 0 && blocks[b] ? blocks[b].outIdx : -1;
      setBlockHighlight(card, b, outIdx);
    }

    function pickFromExpected(ev) {
      if (!expTa) return;
      const lineIdx = lineIndexFromTextarea(expTa, ev.clientY);
      const expBlocks = card._expBlocks || [{ start: 0, end: 0, outIdx: 0 }];
      const outBlockIdx = blockForLine(expBlocks, lineIdx);
      const inBlocks = card._ioBlocks || [];
      let inBlockIdx = -1;
      for (let j = 0; j < inBlocks.length; j++) {
        if (inBlocks[j].outIdx === outBlockIdx) {
          inBlockIdx = j;
          break;
        }
      }
      setBlockHighlight(card, inBlockIdx, outBlockIdx);
    }

    if (inBox) {
      inBox.addEventListener("mousemove", pickFromInput);
      inBox.addEventListener("mouseleave", function () { clearBlockHighlight(card); });
    }
    if (expBox) {
      expBox.addEventListener("mousemove", pickFromExpected);
      expBox.addEventListener("mouseleave", function () { clearBlockHighlight(card); });
    }
  }

  function inputLineHtml(text, expected, blockSizes, outputOffset, outputBlockSizes) {
    const lines = String(text == null ? "" : text).split("\\n");
    if (!lines.length) lines.push("");
    let outSizes = outputBlockSizes;
    if (!outSizes || !outSizes.length) outSizes = parseCodeforcesOutputBlockSizes(expected);
    const meta = computeInputBlocks(lines, expected, blockSizes, outputOffset, outSizes);
    return lineRowsHtml(lines, meta.blocks, true);
  }

  function expLineHtml(text, outputBlockSizes) {
    const lines = String(text == null ? "" : text).split("\\n");
    if (!lines.length) lines.push("");
    let outSizes = outputBlockSizes;
    if (!outSizes || !outSizes.length) outSizes = parseCodeforcesOutputBlockSizes(text);
    const blocks = computeOutputBlocks(lines, outSizes && outSizes.length ? outSizes : null);
    return lineRowsHtml(lines, blocks, true);
  }

  function syncInputLines(ta) {
    const card = ta.closest(".test");
    if (card) {
      card.removeAttribute("data-block-sizes");
      card.removeAttribute("data-output-offset");
      syncIoLines(card);
    }
  }

  function bindIoSplitters(root) {
    (root || document).querySelectorAll("[data-splitter]").forEach(function (handle) {
      if (handle._cposSplitBound) return;
      handle._cposSplitBound = true;
      handle.addEventListener("mousedown", function (ev) {
        const grid = handle.closest(".io-grid");
        if (!grid) return;
        ev.preventDefault();
        handle.classList.add("dragging");
        const rect = grid.getBoundingClientRect();
        function onMove(e) {
          const pct = ((e.clientX - rect.left) / rect.width) * 100;
          applyIoSplit(pct);
        }
        function onUp() {
          handle.classList.remove("dragging");
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        }
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      });
    });
  }

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
      const row = { input, expected_output };
      const sizesRaw = card.getAttribute("data-block-sizes");
      if (sizesRaw) {
        const sizes = sizesRaw.split(",").map(Number).filter(function (n) { return n > 0; });
        if (sizes.length) row.input_block_sizes = sizes;
      }
      const offsetRaw = card.getAttribute("data-output-offset");
      if (offsetRaw != null && offsetRaw !== "") row.input_output_offset = parseInt(offsetRaw, 10);
      const outSizesRaw = card.getAttribute("data-output-block-sizes");
      if (outSizesRaw) {
        const outSizes = outSizesRaw.split(",").map(Number).filter(function (n) { return n > 0; });
        if (outSizes.length) row.output_block_sizes = outSizes;
      }
      tests.push(row);
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
    const searchDisabled = state.meta ? "" : " disabled";
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
      + '<span class="brandrow"><img class="logo" src="' + CPOS_LOGO + '" alt="CPOS" /><span class="title">CPOS</span></span>'
      + '<span class="headtools">'
      + '<button class="iconbtn search" data-act="searchProblem" title="Search editorials on Google"' + searchDisabled + '>Search</button>'
      + '<button class="iconbtn gh" data-act="openGithub" title="CPOS on GitHub">' + GH_ICON + 'GitHub</button>'
      + '<button class="iconbtn theme" data-act="toggleThemes" title="Themes">◑ theme</button>'
      + '</span>'
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
    persistUiState();
    // Persist to the extension's global storage so it survives restarts/reinstalls.
    send('saveTheme', { theme: id });
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
    const expRows = textareaRows(t.expected_output, 2, 6);
    const blockAttr = t.input_block_sizes && t.input_block_sizes.length
      ? ' data-block-sizes="' + t.input_block_sizes.join(",") + '"'
      : "";
    const offsetAttr = typeof t.input_output_offset === "number"
      ? ' data-output-offset="' + t.input_output_offset + '"'
      : "";
    const outBlockAttr = t.output_block_sizes && t.output_block_sizes.length
      ? ' data-output-block-sizes="' + t.output_block_sizes.join(",") + '"'
      : "";
    return '<div class="box test ' + cardClass + '" data-index="' + i + '"' + blockAttr + offsetAttr + outBlockAttr + '>'
      + '<div class="test-head">'
      + '<div class="test-title"><span class="idx">Test ' + (i + 1) + '</span><span class="verdict ' + vClass + '">' + verdict + '</span></div>'
      + '<div class="test-actions">'
      + '<button class="ghost" data-act="runSingle" data-index="' + i + '">run</button>'
      + '<button class="ghost" data-act="deleteTest" data-index="' + i + '">del</button>'
      + '</div>'
      + '</div>'
      + '<div class="test-body">'
      + '<div class="io-grid" style="--io-in-pct:' + ioSplit + '%">'
      + '<div class="io-col io-col-input"><label>Input</label>'
      + '<div class="io-input-box"><div class="io-line-bg">' + inputLineHtml(t.input, t.expected_output, t.input_block_sizes, t.input_output_offset, t.output_block_sizes) + '</div>'
      + '<textarea class="in" rows="' + inRows + '" spellcheck="false">' + esc(t.input) + '</textarea></div></div>'
      + '<div class="io-splitter" data-splitter title="Drag to resize"></div>'
      + '<div class="io-col io-col-exp"><label>Expected</label>'
      + '<div class="io-exp-box"><div class="io-exp-line-bg">' + expLineHtml(t.expected_output, t.output_block_sizes) + '</div>'
      + '<textarea class="exp" rows="' + expRows + '" spellcheck="false">' + esc(t.expected_output) + '</textarea></div></div>'
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
    applyIoSplit(ioSplit);
    bindIoSplitters(app);
    app.querySelectorAll(".test").forEach(function (card) {
      syncIoLines(card);
      bindIoHover(card);
    });
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
    bindIoSplitters(app);
    app.querySelectorAll(".test").forEach(function (card) {
      syncIoLines(card);
      bindIoHover(card);
    });
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
    document.querySelectorAll("textarea.in").forEach((ta) => {
      ta.oninput = () => {
        syncInputLines(ta);
        schedulePersist();
      };
    });
    document.querySelectorAll("textarea.exp").forEach((ta) => {
      ta.oninput = () => {
        const card = ta.closest(".test");
        if (card) syncIoLines(card);
        schedulePersist();
        autoResizeTextareas(ta.closest(".test") || document);
      };
    });
    document.querySelectorAll(".test").forEach(function (card) {
      bindIoHover(card);
    });
    autoResizeTextareas(document);
  }

  function syncStateFromDom() {
    const collected = collectTests();
    if (collected.length === state.tests.length) state.tests = collected;
  }

  let themeFromHost = false;
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg.type === "state") {
      const incoming = msg.state;
      // Adopt the theme saved in the extension once (source of truth across restarts).
      if (!themeFromHost && incoming && typeof incoming.theme === "string" && incoming.theme) {
        themeFromHost = true;
        if (incoming.theme !== theme) {
          theme = incoming.theme;
          document.body.setAttribute("data-theme", theme);
          persistUiState();
        }
      }
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
