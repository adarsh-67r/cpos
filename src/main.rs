use std::io::{self, IsTerminal, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc::TryRecvError;
use std::time::Duration;

use anyhow::Result;
use crossterm::ExecutableCommand;
use crossterm::event::{
    self, DisableBracketedPaste, EnableBracketedPaste, Event, KeyCode, KeyEventKind, KeyModifiers,
};
use crossterm::terminal::{
    Clear, ClearType, EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode,
    enable_raw_mode,
};
use ratatui::prelude::*;

use cpos::app::{self, App, CsesProgress, RefreshMsg, SetupStep, StartedProblem, Tab, TestMsg};
use cpos::data::cache::Cache;
use cpos::data::config::Config;
use cpos::engine::capture::{self, CaptureMsg};
use cpos::engine::ollama;
use cpos::engine::publish;
use cpos::engine::workspace;
use cpos::ui;

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Some(cmd) = args.first() {
        match cmd.trim().to_ascii_lowercase().as_str() {
            "setup-browser" => return setup_browser_command(),
            "setup-github" => return setup_github_command(),
            "setup-ollama" => return setup_ollama_command(args.get(1).map(String::as_str)),
            "update" => return cpos::engine::update::run(),
            "publish-json" => return publish_json_command(args.get(1).map(String::as_str)),
            "publish-all" => return publish_all_command(),
            "help" | "--help" | "-h" => {
                print_help();
                return Ok(());
            }
            _ => {
                eprintln!("Unknown command: {cmd}");
                eprintln!("Run `cpos help` for usage.");
                std::process::exit(1);
            }
        }
    }

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?
        .block_on(run_tui())
}

async fn run_tui() -> Result<()> {
    let config = Config::load()?;
    if maybe_prompt_for_updates(&config).await? {
        return Ok(());
    }

    let mut app = App::new(config);

    let _ = app.load_from_cache().await;
    app.restore_session();
    app.note_cache_loaded();
    app.maybe_show_publish_intro();

    // Start the browser companion capture listener.
    let (cap_tx, cap_rx) = std::sync::mpsc::channel();
    if let Some(server) = capture::start(cap_tx) {
        app.capture_port = Some(server.port);
        app.capture_server = Some(server);
        app.capture_rx = Some(cap_rx);
    }

    // First run (no handle configured yet): open the setup wizard.
    if app.needs_setup() {
        app.begin_setup();
    }

    enable_raw_mode()?;
    io::stdout().execute(EnterAlternateScreen)?;
    io::stdout().execute(EnableBracketedPaste)?;
    let backend = CrosstermBackend::new(io::stdout());
    let mut terminal = Terminal::new(backend)?;

    // Sync in the background on launch when cache is empty, contests missing,
    // or the last sync is older than a few hours.
    if !app.setup_active && (app.problems.is_empty() || app.contests.is_empty() || sync_is_stale())
    {
        trigger_refresh(&mut app);
    }

    let result = run_app(&mut terminal, &mut app).await;

    io::stdout().execute(DisableBracketedPaste)?;
    disable_raw_mode()?;
    io::stdout().execute(LeaveAlternateScreen)?;

    if let Err(e) = result {
        eprintln!("Error: {e}");
    }

    Ok(())
}

async fn maybe_prompt_for_updates(config: &Config) -> Result<bool> {
    if !cpos::engine::update::startup_check_enabled(config) {
        return Ok(false);
    }

    let check = match tokio::time::timeout(
        Duration::from_millis(900),
        cpos::engine::update::check_latest(),
    )
    .await
    {
        Ok(Ok(check)) => check,
        _ => return Ok(false),
    };

    if check.is_empty() {
        return Ok(false);
    }

    eprintln!();
    eprintln!("CPOS update available");
    for update in &check.updates {
        eprintln!("  {} -> {}", update.current, update.latest);
    }
    eprintln!();

    if check.terminal_update_available() {
        if config.updates.prompt_to_install
            && io::stdin().is_terminal()
            && io::stderr().is_terminal()
        {
            eprint!("Update CPOS now? [y/N] ");
            let _ = io::stderr().flush();
            let mut answer = String::new();
            io::stdin().read_line(&mut answer)?;
            if matches!(answer.trim().to_ascii_lowercase().as_str(), "y" | "yes") {
                cpos::engine::update::run()?;
                return Ok(true);
            }
        } else if !config.updates.prompt_to_install
            || !io::stdin().is_terminal()
            || !io::stderr().is_terminal()
        {
            eprintln!("Run `cpos update` later to update CPOS.");
        }
    }

    eprintln!("Opening CPOS...\n");
    Ok(false)
}

async fn run_app(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    app: &mut App,
) -> Result<()> {
    loop {
        drain_refresh(app).await;
        drain_aux(app);
        drain_tests(app);
        drain_captures(app);

        if app.loading || app.testing {
            app.spinner_frame = app.spinner_frame.wrapping_add(1);
        }

        terminal.draw(|frame| ui::draw(frame, app))?;

        if !app.running {
            break;
        }

        // Short poll keeps the spinner animating (~12 fps) while idle.
        if event::poll(Duration::from_millis(80))? {
            match event::read()? {
                // Bracketed paste — route the whole blob to whatever text field
                // is active (template box, config edit, URL, or search).
                Event::Paste(text) => handle_paste(app, &text),
                Event::Key(key) => {
                    if key.kind != KeyEventKind::Press {
                        continue;
                    }

                    if key.modifiers.contains(KeyModifiers::CONTROL)
                        && key.code == KeyCode::Char('c')
                    {
                        app.running = false;
                        continue;
                    }

                    // The setup wizard is modal: it owns all input while open.
                    if app.setup_active {
                        handle_setup_input(app, key.code);
                        continue;
                    }

                    if app.search_active {
                        handle_search_input(app, key.code);
                        continue;
                    }

                    if app.rating_input_active {
                        handle_rating_input(app, key.code);
                        continue;
                    }

                    if app.url_input_active {
                        handle_url_input(app, key.code);
                        continue;
                    }

                    if app.config_editing {
                        handle_config_edit_input(app, key.code);
                        continue;
                    }

                    // The test-results popup swallows input until dismissed.
                    if app.show_test_popup {
                        if matches!(key.code, KeyCode::Esc | KeyCode::Enter | KeyCode::Char('q')) {
                            app.show_test_popup = false;
                        }
                        continue;
                    }

                    handle_input(app, key.code);
                }
                _ => {}
            }
        }
    }

    Ok(())
}

/// Route a pasted blob to the active text field. This is how the setup wizard
/// lets you paste a whole template in one go.
fn handle_paste(app: &mut App, text: &str) {
    if app.setup_active && app.setup_step == SetupStep::Template {
        app.setup_template = app::normalize_template_text(text);
        app.setup_template_scroll = 0;
    } else if app.setup_active && app.setup_step == SetupStep::Cses {
        app.setup_cses.push_str(text.trim());
    } else if app.config_editing {
        app.config_edit_buf.push_str(text.trim());
    } else if app.url_input_active {
        app.url_input_buf.push_str(text.trim());
    } else if app.search_active {
        app.search_query.push_str(text.trim());
        app.apply_filters();
    }
}

/// Modal input for the first-run setup wizard.
fn handle_setup_input(app: &mut App, key: KeyCode) {
    match app.setup_step {
        SetupStep::Handle => match key {
            KeyCode::Esc => app.skip_setup(),
            KeyCode::Enter => app.setup_step = SetupStep::Language,
            KeyCode::Backspace => {
                app.setup_handle.pop();
            }
            KeyCode::Char(c) => app.setup_handle.push(c),
            _ => {}
        },
        SetupStep::Language => match key {
            KeyCode::Esc => app.skip_setup(),
            KeyCode::Enter => app.setup_step = SetupStep::Template,
            KeyCode::Left | KeyCode::Char('h') => app.setup_cycle_lang(-1),
            KeyCode::Right | KeyCode::Char('l') | KeyCode::Tab | KeyCode::Char(' ') => {
                app.setup_cycle_lang(1)
            }
            _ => {}
        },
        SetupStep::Template => match key {
            KeyCode::Esc => app.skip_setup(),
            KeyCode::Enter => {
                app.setup_step = SetupStep::Cses;
                app.setup_template_scroll = 0;
            }
            KeyCode::Backspace => {
                app.setup_template.clear();
                app.setup_template_scroll = 0;
            }
            KeyCode::Up | KeyCode::Char('k') => {
                app.setup_template_scroll = app.setup_template_scroll.saturating_sub(1);
            }
            KeyCode::Down | KeyCode::Char('j') => {
                let lines = app.setup_template.lines().count();
                let max = lines.saturating_sub(1) as u16;
                app.setup_template_scroll = (app.setup_template_scroll + 1).min(max);
            }
            KeyCode::Char(c) => {
                app.setup_template.push(c);
            }
            _ => {}
        },
        SetupStep::Cses => match key {
            KeyCode::Enter => app.setup_step = SetupStep::Github,
            KeyCode::Esc => finish_setup(app),
            KeyCode::Char('o') | KeyCode::Char('O') => {
                open_url("https://cses.fi/login");
            }
            KeyCode::Backspace => {
                app.setup_cses.clear();
            }
            _ => {}
        },
        SetupStep::Github => match key {
            KeyCode::Enter => app.setup_step = SetupStep::Updates,
            KeyCode::Esc => finish_setup(app),
            KeyCode::Char(' ')
            | KeyCode::Left
            | KeyCode::Right
            | KeyCode::Char('h')
            | KeyCode::Char('l') => {
                app.setup_github_publish = !app.setup_github_publish;
                if app.setup_github_publish {
                    app.setup_github_pages = true;
                }
            }
            KeyCode::Char('p') | KeyCode::Char('P') => {
                app.setup_github_pages = !app.setup_github_pages;
            }
            KeyCode::Char('o') | KeyCode::Char('O') => {
                app.setup_ollama_docs = !app.setup_ollama_docs;
            }
            _ => {}
        },
        SetupStep::Updates => match key {
            KeyCode::Enter | KeyCode::Esc => finish_setup(app),
            KeyCode::Left
            | KeyCode::Right
            | KeyCode::Char('h')
            | KeyCode::Char('l')
            | KeyCode::Char(' ') => {
                app.setup_update_prompts = !app.setup_update_prompts;
            }
            _ => {}
        },
    }
}

/// Persist setup and start a sync. GitHub connect is separate (press G in Config).
fn finish_setup(app: &mut App) {
    let folder = app.finish_setup();
    let mut status = if app.config.publish.auto_publish {
        format!(
            "All set! Solutions in {}. Press G in Config to connect GitHub.",
            folder.display()
        )
    } else {
        format!(
            "All set! Your solutions live in {}. Syncing…",
            folder.display()
        )
    };
    if app.config.publish.ollama_enabled {
        status.push(' ');
        status.push_str(&ollama_setup_status(&mut app.config.publish));
        let _ = app.config.save();
    }
    app.status_message = status;
    trigger_refresh(app);
}

/// Run Ollama install/start/pull; updates config. Returns a short status line.
fn ollama_setup_status(publish: &mut cpos::data::config::PublishConfig) -> String {
    if !publish.ollama_enabled {
        return "Ollama docs disabled".to_string();
    }
    let model = publish.ollama_model.clone();
    match run_ollama_setup_interactive(&model) {
        Ok(resolved) => {
            if resolved != publish.ollama_model {
                publish.ollama_model = resolved.clone();
            }
            format!("Ollama ready ({resolved})")
        }
        Err(e) => {
            publish.ollama_enabled = false;
            format!("Ollama setup failed — turned off: {e}")
        }
    }
}

fn apply_ollama_setup(app: &mut App) {
    let msg = ollama_setup_status(&mut app.config.publish);
    let _ = app.config.save();
    app.status_message = msg;
}

/// How old (seconds) a sync can be before we auto-refresh on launch.
const SYNC_STALE_SECS: u64 = 3 * 60 * 60;

fn sync_stamp_path() -> std::path::PathBuf {
    Config::data_dir().join("last_sync")
}

/// True if we've never synced or the last sync is older than the staleness window.
fn sync_is_stale() -> bool {
    let Ok(contents) = std::fs::read_to_string(sync_stamp_path()) else {
        return true;
    };
    let Ok(then) = contents.trim().parse::<u64>() else {
        return true;
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    now.saturating_sub(then) > SYNC_STALE_SECS
}

fn mark_synced() {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let _ = std::fs::create_dir_all(Config::data_dir());
    let _ = std::fs::write(sync_stamp_path(), now.to_string());
}

/// Drain background status messages (e.g. sample fetching).
fn drain_aux(app: &mut App) {
    if let Some(rx) = app.aux_rx.take() {
        let mut keep = true;
        loop {
            match rx.try_recv() {
                Ok(msg) => app.status_message = msg,
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => {
                    keep = false;
                    break;
                }
            }
        }
        if keep {
            app.aux_rx = Some(rx);
        }
    }
}

/// Drain results from the background local test runner.
fn drain_tests(app: &mut App) {
    if let Some(rx) = app.test_rx.take() {
        match rx.try_recv() {
            Ok(TestMsg::Done(results)) => {
                let passed = results.iter().filter(|r| r.passed).count();
                let total = results.len();
                app.status_message = format!("Tests finished — {passed}/{total} passed");
                app.test_results = Some(results);
                app.test_error = None;
                app.testing = false;
            }
            Ok(TestMsg::Failed(err)) => {
                app.status_message = format!("Test run failed: {err}");
                app.test_error = Some(err);
                app.test_results = None;
                app.testing = false;
            }
            Err(TryRecvError::Empty) => app.test_rx = Some(rx),
            Err(TryRecvError::Disconnected) => app.testing = false,
        }
    }
}

/// Process captured problems/progress sent by the browser companion.
fn drain_captures(app: &mut App) {
    let Some(rx) = app.capture_rx.take() else {
        return;
    };

    let mut msgs = Vec::new();
    while let Ok(msg) = rx.try_recv() {
        msgs.push(msg);
    }
    app.capture_rx = Some(rx);

    for msg in msgs {
        match msg {
            CaptureMsg::Problem(cap) => {
                let tests = cap.tests.clone();
                let external = cap.solution_path.clone();
                let problem = cap.into_problem();

                if !tests.is_empty() {
                    let _ = workspace::save_tests(&app.config, &problem, &tests);
                }
                if let Some(ref path) = external {
                    app.set_solution_path(&problem, PathBuf::from(path));
                }

                let _ = app.start_problem_from_capture(problem.clone());
                app.persist_session(&problem, external.as_deref().map(Path::new));
            }
            CaptureMsg::CsesProgress(progress) => {
                let progress = CsesProgress {
                    solved: progress.solved,
                    attempted: progress.attempted,
                };
                let n = progress.solved.len();
                let a = progress.attempted.len();
                let new_activity = match Cache::open() {
                    Ok(cache) => {
                        app::save_cses_progress_with_activity(&progress, &cache).unwrap_or_default()
                    }
                    Err(_) => {
                        app::save_cses_progress(&progress);
                        Vec::new()
                    }
                };
                let new_count = new_activity.len();
                if !new_activity.is_empty() {
                    app.submissions.extend(new_activity);
                    app.submissions
                        .sort_by(|a, b| b.submitted_at.cmp(&a.submitted_at));
                    app.compute_analytics();
                    app.compute_recommendations();
                }
                app.cses_solved = progress.solved.into_iter().collect();
                app.cses_attempted = progress.attempted.into_iter().collect();
                app.mark_solved_problems();
                app.apply_filters();
                app.status_message = if new_count > 0 {
                    format!("CSES synced — {n} solved, {a} attempted ({new_count} today)")
                } else if n > 0 {
                    format!("CSES synced — {n} solved, {a} attempted")
                } else if a > 0 {
                    format!("CSES synced — {a} attempted")
                } else {
                    "CSES synced (no scored tasks yet)".to_string()
                };
                queue_auto_publish(app);
            }
            CaptureMsg::Accepted(accepted) => {
                if let Some(problem) = app.mark_browser_accepted(accepted) {
                    queue_publish_requests(
                        app,
                        app.publish_request_for(&problem).into_iter().collect(),
                    );
                }
            }
        }
    }
}

/// Pull any pending messages from the background refresh task.
async fn drain_refresh(app: &mut App) {
    if let Some(rx) = app.refresh_rx.take() {
        let mut still_open = true;
        loop {
            match rx.try_recv() {
                Ok(RefreshMsg::Status(s)) => app.status_message = s,
                Ok(RefreshMsg::Contests(c)) => app.set_contests(c),
                Ok(RefreshMsg::Done) => {
                    still_open = false;
                    break;
                }
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => {
                    still_open = false;
                    break;
                }
            }
        }

        if still_open {
            app.refresh_rx = Some(rx);
        } else {
            app.loading = false;
            mark_synced();
            let _ = app.load_from_cache().await;
            let n_problems = app.problems.len();
            let n_subs = app.submissions.len();
            let cses_note = match app.cses_solved.len() {
                n if n > 0 => format!(" · CSES ✓ ({n} solved)"),
                _ if app.config.cses_session.is_some() => {
                    " · CSES: cookie may be expired (use browser companion instead)".to_string()
                }
                _ => String::new(),
            };
            app.status_message = if n_subs > 0 {
                format!("Synced — {n_problems} problems, {n_subs} submissions{cses_note}")
            } else if let Some(h) = app.config.cf_handle() {
                format!(
                    "Synced {n_problems} problems, but found 0 submissions — is '{h}' your exact Codeforces handle? (Config to change)"
                )
            } else {
                format!(
                    "Synced {n_problems} problems. Set your Codeforces handle in Config to track solves, rating, and recommendations."
                )
            };
            queue_auto_publish(app);
            let _ = app.write_accepted_index();
        }
    }
}

fn queue_auto_publish(app: &mut App) {
    let requests = app.pending_publish_requests();
    if requests.is_empty() {
        if !publish::is_configured(&app.config.publish) {
            return;
        }
        let accepted = app.accepted_problems().len();
        let missing = app.accepted_missing_solution_files();
        if accepted > 0 {
            app.status_message = if missing > 0 {
                format!(
                    "Backfill: {accepted} accepted, {missing} still need a local solution file before publishing"
                )
            } else {
                "Backfill: all accepted solutions are already published".to_string()
            };
        }
        return;
    }
    queue_publish_requests(app, requests);
}

fn queue_publish_requests(app: &mut App, requests: Vec<publish::PublishRequest>) {
    if requests.is_empty() {
        return;
    }
    let n = requests.len();
    let (tx, rx) = std::sync::mpsc::channel();
    app.aux_rx = Some(rx);
    app.status_message = format!(
        "Publishing {n} accepted solution{}…",
        if n == 1 { "" } else { "s" }
    );
    tokio::spawn(async move {
        for request in requests {
            let label = format!("{} {}", request.problem.platform, request.problem.id);
            match publish::publish_solution(request).await {
                Ok(outcome) => {
                    let target = if outcome.pushed {
                        outcome.site_url.as_deref().unwrap_or("GitHub").to_string()
                    } else {
                        outcome.repo_dir.display().to_string()
                    };
                    let mut msg = format!("Published {label} → {target}");
                    if !outcome.warnings.is_empty() {
                        msg.push_str(&format!(" ({})", outcome.warnings.join("; ")));
                    }
                    let _ = tx.send(msg);
                }
                Err(e) => {
                    let _ = tx.send(format!("Publish failed for {label}: {e}"));
                }
            }
        }
    });
}

/// Kick off a background data refresh if one isn't already running.
fn trigger_refresh(app: &mut App) {
    if app.loading {
        return;
    }
    let (tx, rx) = std::sync::mpsc::channel();
    app.refresh_rx = Some(rx);
    app.loading = true;
    app.spinner_frame = 0;
    app.status_message = "Starting sync…".to_string();
    let handle = app.config.cf_handle().map(|s| s.to_string());
    let cses_session = app.config.cses_session.clone();
    tokio::spawn(app::fetch_and_cache(handle, cses_session, tx));
}

/// Start working on the selected problem: scaffold the solution file, open the
/// statement in the browser, open the file in the editor, and fetch samples.
fn start_selected_problem(app: &mut App) {
    if let Some(sp) = app.start_problem() {
        launch_started(app, sp);
    }
}

/// Same, but for a problem resolved from a pasted URL.
fn start_problem_from_url(app: &mut App, url: &str) {
    if let Some(sp) = app.start_problem_from_url(url) {
        launch_started(app, sp);
    }
}

/// Open the statement in the browser, open the solution file in the editor, and
/// kick off background sample fetching.
fn launch_started(app: &mut App, started: StartedProblem) {
    let StartedProblem {
        problem,
        solution_path,
        url,
        ..
    } = started;

    open_url(&url);
    open_in_editor(app.config.editor.as_deref(), &solution_path);

    let (tx, rx) = std::sync::mpsc::channel();
    app.aux_rx = Some(rx);
    let config = app.config.clone();
    tokio::spawn(app::fetch_samples_task(problem, config, tx));
}

/// Run the selected problem's solution against its cached sample tests.
fn run_selected_tests(app: &mut App) {
    if app.testing {
        return;
    }
    let Some((source, cfg, tests)) = app.prepare_test() else {
        return;
    };
    let (tx, rx) = std::sync::mpsc::channel();
    app.test_rx = Some(rx);
    app.testing = true;
    app.show_test_popup = true;
    app.test_results = None;
    app.test_error = None;
    app.spinner_frame = 0;
    app.status_message = "Compiling and running sample tests…".to_string();
    tokio::spawn(app::run_tests_task(source, cfg, tests, tx));
}

/// Prepare a submission: queue it for the browser companion, copy to clipboard,
/// and open the platform submit page in the user's logged-in browser session.
fn submit_selected(app: &mut App) {
    let Some(problem) = app.selected_problem().cloned() else {
        return;
    };
    let Some(action) = app.prepare_submit() else {
        return;
    };

    if let Some(server) = &app.capture_server {
        app::queue_pending_submit(server, &problem, &action, &app.config.default_language);
    }

    // The submit page is opened and filled by the CPOS Chrome companion, which
    // polls this app on localhost. We deliberately do NOT open the system default
    // browser here so the submission always lands in the logged-in Chrome session.
    let copied = copy_to_clipboard(&action.code);
    app.status_message = if copied {
        format!("Submitting {} — opening submit page in Chrome…", problem.id)
    } else {
        format!(
            "Submitting {} in Chrome (clipboard unavailable — code is queued)",
            problem.id
        )
    };
}

fn open_url(url: &str) {
    let _ = std::process::Command::new("open").arg(url).spawn();
}

/// Open a file in the user's editor. Auto-detects Cursor/VS Code when no
/// working custom command is configured, then falls back to the OS default.
fn open_in_editor(editor: Option<&str>, path: &Path) {
    use std::process::Stdio;

    if let Some(tmpl) = editor.filter(|s| !s.trim().is_empty()) {
        let cmd = if tmpl.contains("{file}") {
            tmpl.replace("{file}", &path.to_string_lossy())
        } else {
            format!("{tmpl} {}", path.to_string_lossy())
        };
        if let Some(program) = cmd.split_whitespace().next() {
            if command_exists(program)
                && std::process::Command::new("sh")
                    .arg("-c")
                    .arg(&cmd)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .is_ok()
            {
                return;
            }
        }
    }

    for editor_cmd in ["cursor", "code"] {
        if command_exists(editor_cmd)
            && std::process::Command::new(editor_cmd)
                .arg(path)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .is_ok()
        {
            return;
        }
    }
    let _ = std::process::Command::new("open").arg(path).spawn();
}

fn command_exists(name: &str) -> bool {
    std::process::Command::new("sh")
        .arg("-c")
        .arg(format!("command -v {name} >/dev/null 2>&1"))
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Copy text to the macOS clipboard via `pbcopy`.
fn copy_to_clipboard(text: &str) -> bool {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let child = Command::new("pbcopy").stdin(Stdio::piped()).spawn();
    let mut child = match child {
        Ok(c) => c,
        Err(_) => return false,
    };
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(text.as_bytes());
    }
    child.wait().map(|s| s.success()).unwrap_or(false)
}

fn handle_input(app: &mut App, key: KeyCode) {
    // Keys common to every tab.
    match key {
        KeyCode::Char('q') => {
            app.running = false;
            return;
        }
        KeyCode::Tab => {
            app.active_tab = app.active_tab.next();
            return;
        }
        KeyCode::BackTab => {
            app.active_tab = app.active_tab.prev();
            return;
        }
        KeyCode::Char('r') => {
            trigger_refresh(app);
            return;
        }
        _ => {}
    }

    match app.active_tab {
        Tab::Problems => handle_problems_input(app, key),
        Tab::Config => handle_config_input(app, key),
        Tab::Recommend => handle_recommend_input(app, key),
        Tab::Contests => handle_contests_input(app, key),
        Tab::Dashboard | Tab::Analytics => {}
    }
}

fn handle_contests_input(app: &mut App, key: KeyCode) {
    match key {
        KeyCode::Char('j') | KeyCode::Down => app.contest_scroll_down(),
        KeyCode::Char('k') | KeyCode::Up => app.contest_scroll_up(),
        // Enter/o: jump into this contest's problems (solve them right here). If
        // none are cached yet (contest not started), open the page instead.
        KeyCode::Enter | KeyCode::Char('o') => {
            if app.open_contest_problems() == 0 {
                if let Some(url) = app.selected_contest_url() {
                    open_url(&url);
                    app.status_message =
                        "No problems yet (not started?) — opened the contest page".to_string();
                }
            }
        }
        KeyCode::Char('b') => {
            if let Some(url) = app.selected_contest_url() {
                open_url(&url);
                app.status_message = "Opened contest in your browser".to_string();
            }
        }
        _ => {}
    }
}

fn handle_recommend_input(app: &mut App, key: KeyCode) {
    match key {
        KeyCode::Char('j') | KeyCode::Down => app.recommend_scroll_down(),
        KeyCode::Char('k') | KeyCode::Up => app.recommend_scroll_up(),
        KeyCode::Enter | KeyCode::Char('o') => {
            if let Some(sp) = app.start_recommended() {
                launch_started(app, sp);
            }
        }
        _ => {}
    }
}

fn handle_search_input(app: &mut App, key: KeyCode) {
    match key {
        KeyCode::Esc => app.search_active = false,
        KeyCode::Enter => {
            app.search_active = false;
            app.apply_filters();
        }
        KeyCode::Backspace => {
            app.search_query.pop();
            app.apply_filters();
        }
        KeyCode::Char(c) => {
            app.search_query.push(c);
            app.apply_filters();
        }
        _ => {}
    }
}

fn handle_config_edit_input(app: &mut App, key: KeyCode) {
    match key {
        KeyCode::Esc => app.config_editing = false,
        KeyCode::Enter => app.save_config_edit(),
        KeyCode::Backspace => {
            app.config_edit_buf.pop();
        }
        KeyCode::Char(c) => app.config_edit_buf.push(c),
        _ => {}
    }
}

fn handle_problems_input(app: &mut App, key: KeyCode) {
    match key {
        KeyCode::Char('j') | KeyCode::Down => app.scroll_down(),
        KeyCode::Char('k') | KeyCode::Up => app.scroll_up(),
        KeyCode::Char('G') => app.page_down(),
        KeyCode::Char('g') => app.page_up(),
        KeyCode::Char('d') => app.page_down(),
        KeyCode::Char('u') => app.page_up(),
        KeyCode::Char('o') => start_selected_problem(app),
        KeyCode::Char('U') => {
            app.url_input_active = true;
            app.url_input_buf.clear();
        }
        KeyCode::Char('b') => app.open_selected_problem(),
        KeyCode::Char('T') => run_selected_tests(app),
        KeyCode::Char('s') => submit_selected(app),
        KeyCode::Char('/') => {
            app.search_active = true;
            app.search_query.clear();
            app.apply_filters();
        }
        KeyCode::Char('f') => {
            app.rating_input_active = true;
            app.rating_input_buf.clear();
        }
        KeyCode::Char('p') => app.cycle_platform(),
        KeyCode::Char('c') => app.clear_filters(),
        KeyCode::Char('t') => {
            if let Some(tag) = app.selected_problem().and_then(|p| p.tags.first()).cloned() {
                app.tag_filter = Some(tag);
                app.apply_filters();
            }
        }
        _ => {}
    }
}

fn handle_rating_input(app: &mut App, key: KeyCode) {
    match key {
        KeyCode::Esc => app.rating_input_active = false,
        KeyCode::Enter => {
            app.rating_input_active = false;
            app.apply_rating_input();
        }
        KeyCode::Backspace => {
            app.rating_input_buf.pop();
        }
        KeyCode::Char(c) if c.is_ascii_digit() || c == '-' || c == '+' => {
            app.rating_input_buf.push(c)
        }
        _ => {}
    }
}

fn handle_url_input(app: &mut App, key: KeyCode) {
    match key {
        KeyCode::Esc => app.url_input_active = false,
        KeyCode::Enter => {
            app.url_input_active = false;
            let url = app.url_input_buf.clone();
            if !url.trim().is_empty() {
                start_problem_from_url(app, &url);
            }
        }
        KeyCode::Backspace => {
            app.url_input_buf.pop();
        }
        KeyCode::Char(c) => app.url_input_buf.push(c),
        _ => {}
    }
}

fn print_help() {
    eprintln!(
        "CPOS v{version}

Usage:
  cpos                 Open the terminal app
  cpos update          Update the terminal app
  cpos setup-github    Connect/create the GitHub publishing repo
  cpos setup-ollama    Install/start Ollama and pull the docs model
  cpos setup-ollama M  Pull a specific model (default from config)
  cpos publish-json F  Publish one accepted solution from a JSON payload
  cpos publish-all     Publish every accepted solution not yet in the archive
  cpos setup-browser   Generate a local browser helper extension
  cpos help            Show this help

On startup, CPOS does a quick best-effort check for terminal app updates.
Set CPOS_NO_UPDATE_CHECK=1 to skip this check.
VS Code and Chrome update their extensions through their own stores.",
        version = env!("CARGO_PKG_VERSION")
    );
}

#[derive(serde::Deserialize)]
struct PublishJsonProblem {
    platform: String,
    id: String,
    name: String,
    url: String,
    #[serde(default)]
    rating: Option<u32>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    category: Option<String>,
    solution_path: String,
    language: String,
    accepted: bool,
}

fn publish_json_command(path: Option<&str>) -> Result<()> {
    let Some(path) = path else {
        anyhow::bail!("usage: cpos publish-json <payload.json>");
    };
    let payload: PublishJsonProblem = serde_json::from_str(&std::fs::read_to_string(path)?)?;
    if !payload.accepted {
        anyhow::bail!("refusing to publish because accepted=false");
    }
    let platform = match payload.platform.to_lowercase().as_str() {
        "codeforces" | "cf" => cpos::data::models::Platform::Codeforces,
        "cses" => cpos::data::models::Platform::Cses,
        "atcoder" => cpos::data::models::Platform::AtCoder,
        _ => anyhow::bail!("unsupported platform {}", payload.platform),
    };
    let config = Config::load()?;
    let problem = cpos::data::models::Problem {
        platform,
        id: payload.id,
        name: payload.name,
        url: payload.url,
        rating: payload.rating,
        tags: payload.tags,
        category: payload.category,
        solved_count: None,
        status: cpos::data::models::SolveStatus::Solved,
    };
    let request = publish::PublishRequest {
        config,
        problem,
        solution_path: PathBuf::from(payload.solution_path),
        language: payload.language,
        submission: None,
    };
    let outcome = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?
        .block_on(publish::publish_solution(request))?;
    eprintln!("Published to {}", outcome.repo_dir.display());
    if let Some(site) = outcome.site_url {
        eprintln!("Site: {site}");
    }
    for warning in outcome.warnings {
        eprintln!("Warning: {warning}");
    }
    Ok(())
}

fn publish_all_command() -> Result<()> {
    let config = Config::load()?;
    if !publish::is_configured(&config.publish) {
        anyhow::bail!("Turn on GitHub publishing in Config or the VS Code panel first");
    }

    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;
    rt.block_on(async {
        let mut app = App::new(config);
        app.load_from_cache().await?;
        app.restore_session();
        app.mark_solved_problems();
        let _ = app.write_accepted_index();

        let accepted = app.accepted_problems().len();
        let missing = app.accepted_missing_solution_files();
        let requests = app.pending_publish_requests();
        if requests.is_empty() {
            if accepted == 0 {
                eprintln!("No accepted solutions found — sync first with `cpos` then press r.");
            } else if missing > 0 {
                eprintln!(
                    "Backfill: {accepted} accepted, but {missing} have no local solution file yet. \
                     Open or recreate those files, then run `cpos publish-all` again."
                );
            } else {
                eprintln!("Backfill complete — all {accepted} accepted solutions are already published.");
            }
            return Ok(());
        }

        eprintln!(
            "Backfill: publishing {} of {accepted} accepted solution(s)…",
            requests.len()
        );
        if missing > 0 {
            eprintln!("Skipping {missing} accepted solution(s) with no local file.");
        }
        let mut pushed = 0usize;
        for request in requests {
            let label = format!("{} {}", request.problem.platform, request.problem.id);
            match publish::publish_solution(request).await {
                Ok(outcome) => {
                    eprintln!("Published {label} → {}", outcome.repo_dir.display());
                    if outcome.pushed {
                        pushed += 1;
                    }
                    for warning in outcome.warnings {
                        eprintln!("Warning ({label}): {warning}");
                    }
                }
                Err(e) => eprintln!("Failed {label}: {e:#}"),
            }
        }
        eprintln!("Done — {pushed} pushed to GitHub.");
        Ok(())
    })
}

/// Generate browser setup helpers and point users at the checked-in/publishable
/// companion extension. Runs as `cpos setup-browser` before the TUI starts.
fn setup_browser_command() -> Result<()> {
    let dir = Config::data_dir().join("browser-helper");
    std::fs::create_dir_all(&dir)?;

    let port = capture::DEFAULT_PORT;

    // --- Chrome/Edge/Brave unpacked extension ---
    let ext_dir = dir.join("chrome-extension");
    std::fs::create_dir_all(&ext_dir)?;

    let manifest = serde_json::json!({
        "manifest_version": 3,
        "name": "CPOS Companion",
        "version": "0.1.0",
        "description": "Send Codeforces/CSES problems and samples to CPOS",
        "permissions": [],
        "host_permissions": [
            format!("http://127.0.0.1:{port}/*"),
            "http://127.0.0.1:27122/*"
        ],
        "content_scripts": [{
            "matches": [
                "https://codeforces.com/problemset/problem/*",
                "https://codeforces.com/problemset/status*",
                "https://codeforces.com/submissions/*",
                "https://codeforces.com/contest/*/problem/*",
                "https://codeforces.com/contest/*/my",
                "https://codeforces.com/contest/*/status*",
                "https://codeforces.com/gym/*/problem/*",
                "https://codeforces.com/gym/*/my",
                "https://codeforces.com/gym/*/status*",
                "https://cses.fi/problemset/task/*",
                "https://cses.fi/problemset/list*",
                "https://cses.fi/problemset/list/*"
            ],
            "js": ["content.js"],
            "run_at": "document_idle"
        }],
        "icons": {}
    });
    std::fs::write(
        ext_dir.join("manifest.json"),
        serde_json::to_string_pretty(&manifest)?,
    )?;

    let content_js = generate_content_js(port);
    std::fs::write(ext_dir.join("content.js"), content_js)?;

    // --- Bookmarklet fallback ---
    let bookmarklet = generate_bookmarklet(port);
    std::fs::write(dir.join("bookmarklet.txt"), &bookmarklet)?;

    // --- Setup instructions page ---
    let setup_html = generate_setup_html(port, &ext_dir, &bookmarklet);
    let setup_path = dir.join("setup.html");
    std::fs::write(&setup_path, setup_html)?;

    // Open the setup page
    let _ = std::process::Command::new("open").arg(&setup_path).spawn();

    eprintln!("Browser companion files written to:");
    eprintln!("  {}", dir.display());
    eprintln!();
    eprintln!("Setup page opened in your browser.");
    eprintln!("Follow the instructions there to enable the extension.");

    Ok(())
}

fn generate_content_js(port: u16) -> String {
    format!(
        r#"
// CPOS Browser Companion — auto-captures problems and samples.
(function() {{
    const ENDPOINTS = [
        {{ name: 'CPOS VS Code', baseUrl: 'http://127.0.0.1:27122' }},
        {{ name: 'CPOS TUI', baseUrl: 'http://127.0.0.1:{port}' }}
    ];

    async function post(path, body) {{
        let lastError;
        for (const endpoint of ENDPOINTS) {{
            try {{
                const res = await fetch(`${{endpoint.baseUrl}}${{path}}`, {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify(body)
                }});
                const data = await res.json().catch(() => ({{}}));
                if (res.ok && data.ok !== false) return {{ endpoint, data }};
                lastError = data.error || `${{endpoint.name}} returned ${{res.status}}`;
            }} catch (e) {{
                lastError = e;
            }}
        }}
        throw lastError;
    }}

    // --- CSES problemset list: capture solved/attempted progress ---
    if (location.hostname === 'cses.fi' && location.pathname.includes('/problemset/list')) {{
        const solved = [];
        const attempted = [];
        document.querySelectorAll('.task').forEach(task => {{
            const a = task.querySelector('a');
            if (!a) return;
            const href = a.getAttribute('href') || '';
            const id = href.split('/').pop();
            if (!id) return;
            const score = task.querySelector('.task-score');
            if (!score) return;
            const cls = score.className || '';
            if (cls.includes('full')) solved.push(id);
            else if (cls.includes('zero')) attempted.push(id);
        }});
        if (solved.length > 0 || attempted.length > 0) {{
            post('/capture/cses-progress', {{ solved, attempted }}).catch(() => {{}});
        }}
        return;
    }}

    // --- Problem page: capture problem + samples ---
    const url = location.href;
    let platform, id, name;

    if (location.hostname === 'codeforces.com') {{
        platform = 'codeforces';
        const m = url.match(/problem(?:set\/problem)?\/(\d+)\/([A-Za-z0-9]+)/);
        if (!m) return;
        id = m[1] + m[2];
        const title = document.querySelector('.title');
        name = title ? title.textContent.replace(/^[A-Z]\d*\.\s*/, '').trim() : id;
    }} else if (location.hostname === 'cses.fi') {{
        platform = 'cses';
        const m = url.match(/task\/(\d+)/);
        if (!m) return;
        id = m[1];
        const h1 = document.querySelector('.title-block h1, h1');
        name = h1 ? h1.textContent.trim() : id;
    }} else {{
        return;
    }}

    // Extract samples from the live DOM.
    const tests = [];

    if (platform === 'codeforces') {{
        const inputs = document.querySelectorAll('.sample-test .input pre');
        const outputs = document.querySelectorAll('.sample-test .output pre');
        for (let i = 0; i < Math.min(inputs.length, outputs.length); i++) {{
            tests.push({{
                input: preText(inputs[i]),
                expected_output: preText(outputs[i])
            }});
        }}
    }} else if (platform === 'cses') {{
        const pres = Array.from(document.querySelectorAll('.content pre, .md pre'))
            .map(el => preText(el))
            .filter(s => s.trim().length > 0);
        for (let i = 0; i + 1 < pres.length; i += 2) {{
            tests.push({{
                input: pres[i],
                expected_output: pres[i + 1]
            }});
        }}
    }}

    // Robust <pre> text extraction that preserves line breaks.
    function preText(el) {{
        let out = '';
        for (const node of el.childNodes) {{
            if (node.nodeType === Node.TEXT_NODE) {{
                out += node.textContent;
            }} else if (node.nodeName === 'BR') {{
                out += '\n';
            }} else {{
                out += node.textContent;
                if (['DIV','P','LI'].includes(node.nodeName)) out += '\n';
            }}
        }}
        return out.replace(/^\n+|\n+$/g, '');
    }}

    const payload = {{ platform, id, name, url, tests }};
    post('/capture/problem', payload).then(({{ endpoint }}) => {{
        showToast(`CPOS: captured ${{tests.length}} sample(s) in ${{endpoint.name}}`);
    }}).catch(() => {{
        showToast('CPOS not running — start cpos or open VS Code with the CPOS extension');
    }});

    function showToast(msg) {{
        const d = document.createElement('div');
        d.textContent = msg;
        Object.assign(d.style, {{
            position: 'fixed', bottom: '20px', right: '20px', padding: '10px 18px',
            background: '#1a1a2e', color: '#e0e0e0', borderRadius: '8px', zIndex: 99999,
            fontSize: '14px', fontFamily: 'system-ui', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            border: '1px solid #7c3aed'
        }});
        document.body.appendChild(d);
        setTimeout(() => d.remove(), 3000);
    }}
}})();
"#
    )
}

fn generate_bookmarklet(port: u16) -> String {
    // Minimal bookmarklet that extracts samples from CF/CSES and POSTs to CPOS.
    format!(
        r#"javascript:void(function(){{var h=location.hostname,u=location.href,p,id,n,ts=[];function pt(e){{var o='';e.childNodes.forEach(function(n){{n.nodeType===3?o+=n.textContent:n.nodeName==='BR'?o+='\n':o+=n.textContent}});return o.replace(/^\n+|\n+$/g,'')}}if(h==='codeforces.com'){{p='codeforces';var m=u.match(/problem(?:set\/problem)?\/(\d+)\/([A-Za-z0-9]+)/);if(!m)return alert('Not a CF problem page');id=m[1]+m[2];n=(document.querySelector('.title')||{{}}).textContent||id;document.querySelectorAll('.sample-test .input pre').forEach(function(e,i){{var o=document.querySelectorAll('.sample-test .output pre')[i];if(o)ts.push({{input:pt(e),expected_output:pt(o)}})}})}}else if(h==='cses.fi'){{p='cses';var m=u.match(/task\/(\d+)/);if(!m)return alert('Not a CSES task page');id=m[1];n=(document.querySelector('h1')||{{}}).textContent||id;var pp=document.querySelectorAll('pre');for(var i=0;i+1<pp.length;i+=2)ts.push({{input:pt(pp[i]),expected_output:pt(pp[i+1])}})}}else return alert('Open a Codeforces or CSES problem first');fetch('http://127.0.0.1:{port}/capture/problem',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{platform:p,id:id,name:n,url:u,tests:ts}})}}).then(function(r){{return r.json()}}).then(function(d){{alert(d.ok?'CPOS: captured '+ts.length+' sample(s)':'CPOS: error')}}).catch(function(){{alert('CPOS not running — start cpos first')}})}}())"#
    )
}

fn generate_setup_html(port: u16, ext_dir: &std::path::Path, bookmarklet: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>CPOS Browser Companion Setup</title>
  <style>
    body {{ font-family: system-ui, sans-serif; max-width: 720px; margin: 60px auto;
           color: #e0e0e0; background: #0d0d14; padding: 0 24px; line-height: 1.6; }}
    h1 {{ color: #7c3aed; }}
    h2 {{ color: #a78bfa; margin-top: 2em; }}
    code {{ background: #1e1e2e; padding: 2px 6px; border-radius: 4px; font-size: 0.95em; }}
    .path {{ background: #1e1e2e; padding: 8px 14px; border-radius: 6px;
             border: 1px solid #333; word-break: break-all; display: block; margin: 8px 0; }}
    ol li {{ margin-bottom: 8px; }}
    .bookmarklet {{ display: inline-block; padding: 8px 16px; background: #7c3aed; color: #fff;
                    border-radius: 6px; text-decoration: none; font-weight: bold; margin: 8px 0; }}
    .section {{ background: #12121a; border: 1px solid #222; border-radius: 8px;
                padding: 16px 20px; margin: 16px 0; }}
    .status {{ padding: 8px 14px; border-radius: 6px; margin: 12px 0; font-weight: bold; }}
    .ok {{ background: #064e3b; color: #6ee7b7; }}
    .err {{ background: #7f1d1d; color: #fca5a5; }}
  </style>
</head>
<body>
  <h1>CPOS Browser Companion</h1>
  <p>This page helps you connect your browser to CPOS so that opening a problem page
     automatically sends the samples to your terminal or the CPOS VS Code extension.</p>

  <div id="statusBox" class="status err">Checking CPOS connection...</div>
  <script>
    fetch('http://127.0.0.1:{port}/health')
      .then(r => r.json())
      .then(() => {{
        const b = document.getElementById('statusBox');
        b.className = 'status ok';
        b.textContent = 'CPOS is running on port {port} ✓';
      }})
      .catch(() => {{
        const b = document.getElementById('statusBox');
        b.className = 'status err';
        b.textContent = 'CPOS is not running — start it with: cpos';
      }});
  </script>

  <h2>Install the browser companion</h2>
  <div class="section">
    <p>Install <strong>CPOS Companion</strong> from the
       <a href="https://chromewebstore.google.com/detail/gjnbapmjonegeeamdeahcoojgokeogmm" target="_blank" rel="noopener">Chrome Web Store</a>
       (works in Chrome, Edge, and Brave).</p>
    <p>Pair it with the
       <a href="https://marketplace.visualstudio.com/items?itemName=sohamaggarwal.cpos-vscode" target="_blank" rel="noopener">CPOS VS Code extension</a>
       from the Marketplace, or run the CPOS terminal app (<code>cpos</code>).</p>
    <p>Done! The extension auto-captures every Codeforces/CSES problem you open.
       It also syncs your CSES solved status when you visit the problemset list page.</p>
  </div>

  <h2>Contributors: local extension build</h2>
  <div class="section">
    <p>Only needed if you are developing the extension from source:</p>
    <ol>
      <li>Open <code>chrome://extensions</code> (or <code>edge://extensions</code> / <code>brave://extensions</code>)</li>
      <li>Enable <strong>Developer mode</strong> (toggle in the top-right)</li>
      <li>Click <strong>Load unpacked</strong></li>
      <li>Select this folder:</li>
    </ol>
    <code class="path">{ext_path}</code>
  </div>

  <h2>Bookmarklet (Safari / Firefox / any browser)</h2>
  <div class="section">
    <p>Drag this link to your bookmarks bar, then click it on any CF/CSES problem page:</p>
    <a class="bookmarklet" href="{bookmarklet_escaped}">CPOS Capture</a>
    <p style="color:#888;font-size:0.9em;">Or copy this and paste as the URL of a new bookmark:</p>
    <code class="path" style="font-size:0.85em;">{bookmarklet_escaped}</code>
  </div>

  <h2>How it works</h2>
  <p>When you visit a Codeforces or CSES problem page, the companion reads the sample
     test cases from the page DOM and sends them to the CPOS VS Code extension
     (<code>localhost:27122</code>) if it is running, otherwise CPOS TUI
     (<code>localhost:{port}</code>). CPOS creates your solution file, caches the samples, and opens it in your editor.
     Just press <code>T</code> to test.</p>
</body>
</html>"#,
        ext_path = ext_dir.display(),
        bookmarklet_escaped = bookmarklet.replace('"', "&quot;"),
    )
}

fn run_github_setup_interactive(
    config: &cpos::data::config::PublishConfig,
) -> Result<publish::PublishOutcome> {
    io::stdout().execute(DisableBracketedPaste)?;
    disable_raw_mode()?;
    io::stdout().execute(LeaveAlternateScreen)?;

    eprintln!("CPOS GitHub publishing setup");
    eprintln!("This may open GitHub in your browser via GitHub CLI.");
    eprintln!();
    let result = publish::setup_repository_interactive(config);
    eprintln!();
    eprint!("Press Enter to return to CPOS...");
    let _ = io::stderr().flush();
    let mut wait = String::new();
    let _ = io::stdin().read_line(&mut wait);

    enable_raw_mode()?;
    io::stdout().execute(EnterAlternateScreen)?;
    io::stdout().execute(EnableBracketedPaste)?;
    io::stdout().execute(Clear(ClearType::All))?;
    result
}

fn run_ollama_setup_interactive(model: &str) -> Result<String> {
    io::stdout().execute(DisableBracketedPaste)?;
    disable_raw_mode()?;
    io::stdout().execute(LeaveAlternateScreen)?;

    eprintln!("CPOS Ollama setup");
    eprintln!("CPOS will start Ollama if needed and pull the model for README write-ups.");
    eprintln!();
    let result = ollama::setup_interactive(model);
    eprintln!();
    eprint!("Press Enter to return to CPOS...");
    let _ = io::stderr().flush();
    let mut wait = String::new();
    let _ = io::stdin().read_line(&mut wait);

    enable_raw_mode()?;
    io::stdout().execute(EnterAlternateScreen)?;
    io::stdout().execute(EnableBracketedPaste)?;
    io::stdout().execute(Clear(ClearType::All))?;
    result
}

fn setup_ollama_command(model: Option<&str>) -> Result<()> {
    let config = Config::load()?;
    let model = model
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(config.publish.ollama_model.as_str());
    eprintln!("CPOS Ollama setup");
    let resolved = ollama::setup_interactive(model)?;
    eprintln!("Ready — using {resolved}");
    Ok(())
}

fn setup_github_command() -> Result<()> {
    let mut config = Config::load()?;
    config.publish.auto_publish = true;
    config.publish.github_pages = true;
    config.save()?;

    eprintln!("CPOS GitHub publishing setup");
    let outcome = publish::setup_repository_interactive(&config.publish)?;
    eprintln!("Local folder: {}", outcome.repo_dir.display());
    if let Some(url) = outcome.site_url {
        eprintln!("GitHub Pages: {url}");
    }
    for warning in outcome.warnings {
        eprintln!("Warning: {warning}");
    }

    eprintln!();
    eprintln!("Backfilling all accepted solutions with local files…");
    publish_all_command()
}

fn handle_config_input(app: &mut App, key: KeyCode) {
    match key {
        KeyCode::Char('j') | KeyCode::Down => {
            let max = app.config_fields().len().saturating_sub(1);
            app.config_selected = (app.config_selected + 1).min(max);
        }
        KeyCode::Char('k') | KeyCode::Up => {
            app.config_selected = app.config_selected.saturating_sub(1);
        }
        KeyCode::Enter | KeyCode::Right => {
            if app.config_field_is_cycle() {
                let selected = app.config_selected;
                app.cycle_config();
                if selected == 6 && app.config.publish.auto_publish {
                    queue_auto_publish(app);
                }
                if selected == 11 && app.config.publish.ollama_enabled {
                    apply_ollama_setup(app);
                }
            } else if app.config_selected == 9 {
                if let Some(url) = publish::archive_site_url(&app.config.publish) {
                    open_url(&url);
                    app.status_message = format!("Opened archive site {url}");
                } else {
                    app.status_message =
                        "Press G to connect GitHub and create the publishing repo".to_string();
                }
            } else {
                app.start_config_edit();
            }
        }
        KeyCode::Char('G') => match run_github_setup_interactive(&app.config.publish) {
            Ok(outcome) => {
                let mut status =
                    format!("GitHub publishing ready at {}", outcome.repo_dir.display());
                if let Some(url) = outcome.site_url.as_deref() {
                    status.push_str(&format!(" · site {url}"));
                }
                if !outcome.warnings.is_empty() {
                    status.push_str(&format!(" · {}", outcome.warnings.join("; ")));
                }
                app.status_message = status;
                if app.config.publish.auto_publish {
                    queue_auto_publish(app);
                }
            }
            Err(e) => {
                app.status_message = format!("Could not connect GitHub publishing: {e}");
            }
        },
        KeyCode::Char('O') => {
            if !app.config.publish.ollama_enabled {
                app.config.publish.ollama_enabled = true;
            }
            apply_ollama_setup(app);
        },
        KeyCode::Char('S') => app.begin_setup(),
        // Open CSES login so you can grab your session cookie to connect.
        KeyCode::Char('L') => {
            open_url("https://cses.fi/login");
            app.status_message =
                "Log in, then paste your PHPSESSID cookie into 'CSES Session'".to_string();
        }
        _ => {}
    }
}
