# Graph Report - .  (2026-06-22)

## Corpus Check
- Large corpus: 206 files · ~832,578 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 4484 nodes · 11100 edges · 174 communities (163 shown, 11 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- CodeMirror Bundle (Firefox) #1
- CodeMirror Bundle (Chrome) #1
- CodeMirror Bundle (Chrome) #2
- CodeMirror Bundle (Firefox) #2
- CodeMirror Bundle (Chrome) #3
- CodeMirror Bundle (Chrome) #4
- CodeMirror Bundle (Chrome) #5
- CodeMirror Bundle (Firefox) #3
- CodeMirror Bundle (Firefox) #4
- CodeMirror Bundle (Chrome) #6
- TUI Event Loop & Key Handling
- CodeMirror Bundle (Firefox) #5
- CodeMirror Bundle (Chrome) #7
- CodeMirror Bundle (Firefox) #6
- CodeMirror Bundle (Chrome) #8
- Workspace & Solution Files
- CodeMirror Bundle (Firefox) #7
- CodeMirror Bundle (Chrome) #9
- Capture Content Script (Chrome)
- Capture Content Script (Firefox)
- CodeMirror Bundle (Firefox) #8
- CodeMirror Bundle (Chrome) #10
- CodeMirror Bundle (Firefox) #9
- App State & Sync Orchestrator #1
- CodeMirror Bundle (Firefox) #10
- Self-Update Engine
- CodeMirror Bundle (Chrome) #11
- VS Code Extension Host #1
- Problems View (TUI)
- In-Browser IDE Panel (Chrome)
- In-Browser IDE Panel (Firefox)
- Recommender & Target Engine
- CodeMirror Bundle (Firefox) #11
- Recommender
- Codeforces Client
- App State & Sync Orchestrator #2
- Core Data Models
- Code Annotation Overlay (Chrome)
- Code Annotation Overlay (Firefox)
- CF Problem Enhancer (Chrome)
- CF Problem Enhancer (Firefox)
- CodeMirror Bundle (Firefox) #12
- Companion Style Core (Chrome)
- Statement Capture Engine
- Companion Style Core (Firefox)
- CodeMirror Bundle (Firefox) #13
- Daily Challenge Background (Chrome)
- Daily Challenge Background (Firefox)
- Firefox Extension Manifest
- VS Code Extension Host #2
- Capture Server Engine
- Architecture Documentation
- SQLite Cache Layer
- CSES Client
- CF Contest Timer (Chrome)
- Config & Handles
- CF Contest Timer (Firefox)
- CF Standings Enhancer (Chrome)
- CF Profile Enhancer (Chrome)
- CF Standings Enhancer (Firefox)
- CF Profile Enhancer (Firefox)
- Handle Compare / VS Mode (Chrome)
- Handle Compare / VS Mode (Firefox)
- VS Code Extension Host #3
- Screenshot Generator
- CodeMirror Bundle (Chrome) #12
- Chrome Extension Manifest
- Daily Challenge (Chrome)
- Daily Challenge Core (Chrome)
- CodeMirror Bundle (Firefox) #14
- Daily Challenge (Firefox)
- Daily Challenge Core (Firefox)
- App State & Sync Orchestrator #3
- VS Code Extension Host #4
- Theme Palette (TUI)
- Service Worker (Chrome)
- CF Problemset Enhancer (Chrome)
- Daily Problem Widget (Chrome)
- Local Test Runner
- Background Script (Firefox)
- CF Problemset Enhancer (Firefox)
- Daily Problem Widget (Firefox)
- VS Code Manifest & Commands #1
- Chrome Extension Docs #1
- Popup Hub (Firefox)
- Popup Hub (Chrome)
- Setup Wizard (TUI)
- Target View (TUI)
- VS Code Extension Host #5
- Chrome Package Manifest
- CF Favorites (Chrome)
- Daily Challenge UI (Chrome)
- Analytics View Screenshot
- CF Favorites (Firefox)
- Daily Challenge UI (Firefox)
- Dashboard View (TUI)
- Carrot Rating Predictor (Chrome)
- Carrot Rating Predictor (Firefox)
- Landing Page Script
- App State & Sync Orchestrator #4
- App State & Sync Orchestrator #5
- CodeMirror Build Entry
- VS Code TS Config
- VS Code Manifest & Commands #2
- Contests Widget (Chrome)
- Companion Themes (Chrome)
- Contests Widget (Firefox)
- Companion Themes (Firefox)
- Companion Analytics Shot
- App State & Sync Orchestrator #6
- VS Code Extension Host #6
- Analytics View (TUI)
- Companion Config (Chrome)
- Syntax Highlight (Chrome)
- Companion Config (Firefox)
- Syntax Highlight (Firefox)
- PlatformClient Trait
- Contests UI (Chrome)
- Stress Test Engine
- Contests UI (Firefox)
- VS Code Extension Host #7
- UI Header / Tabs / Status
- Recommend View (TUI)
- Companion Slides Tool
- VS Code Manifest & Commands #3
- Bug Report Template
- Companion Highlight (Chrome)
- Practice UI (Chrome)
- Companion Highlight (Firefox)
- Practice UI (Firefox)
- Promo Tiles Tool
- Package Manifest Writer
- Browser Capture Flow Diagram
- Site Theme (Chrome)
- Site Theme (Firefox)
- Progress Bars (TUI)
- VS Code Manifest & Commands #4
- Release Workflow
- Modernize CF UI (Chrome)
- Modernize CF UI (Firefox)
- Install Script (Unix)
- Config View (TUI)
- Vercel Config
- VS Code Manifest & Commands #5
- VS Code Manifest & Commands #6
- VS Code Manifest & Commands #7
- Install Docs
- App State & Sync Orchestrator #7
- Screen Renderer Tool
- VS Code Manifest & Commands #8
- VS Code Manifest & Commands #9
- VS Code Manifest & Commands #10
- VS Code Manifest & Commands #11
- VS Code Manifest & Commands #12
- VS Code Manifest & Commands #13
- VS Code Manifest & Commands #14
- VS Code Manifest & Commands #15
- Changelog #1
- Homebrew Formula
- VS Code Manifest & Commands #16
- Changelog #2
- Chrome Packaging Script
- Firefox Packaging Script
- Changelog #3
- Chrome Extension Docs #2
- Contributing Docs
- README #1
- README #2

## God Nodes (most connected - your core abstractions)
1. `update()` - 141 edges
2. `update()` - 141 edges
3. `constructor()` - 105 edges
4. `constructor()` - 105 edges
5. `App` - 97 edges
6. `facet()` - 78 edges
7. `facet()` - 78 edges
8. `slice()` - 65 edges
9. `slice()` - 65 edges
10. `of()` - 62 edges

## Surprising Connections (you probably didn't know these)
- `Profile Analytics (in-browser)` --semantically_similar_to--> `Recommendation Engine`  [INFERRED] [semantically similar]
  CHANGELOG.md → README.md
- `CI VS Code Extension Job` --references--> `VS Code Extension README`  [INFERRED]
  .github/workflows/ci.yml → extensions/vscode/README.md
- `Local /run Endpoint` --references--> `VS Code Extension (capture server :27122)`  [INFERRED]
  CHANGELOG.md → ARCHITECTURE.md
- `Troubleshooting Guide` --references--> `Statement HTML Capture (MathJax/KaTeX TeX recovery)`  [INFERRED]
  TROUBLESHOOTING.md → CHANGELOG.md
- `CPOS Funding Config` --references--> `CPOS Project`  [EXTRACTED]
  .github/FUNDING.yml → extensions/chrome/README.md

## Import Cycles
- 1-file cycle: `examples/gen_screenshots.rs -> examples/gen_screenshots.rs`
- 1-file cycle: `src/main.rs -> src/main.rs`
- 1-file cycle: `src/app.rs -> src/app.rs`
- 1-file cycle: `src/data/cache.rs -> src/data/cache.rs`
- 1-file cycle: `src/data/config.rs -> src/data/config.rs`
- 1-file cycle: `src/ui/contests.rs -> src/ui/contests.rs`
- 1-file cycle: `src/engine/capture.rs -> src/engine/capture.rs`
- 1-file cycle: `src/engine/runner.rs -> src/engine/runner.rs`
- 1-file cycle: `src/engine/stress.rs -> src/engine/stress.rs`
- 1-file cycle: `src/engine/update.rs -> src/engine/update.rs`
- 1-file cycle: `src/engine/workspace.rs -> src/engine/workspace.rs`
- 1-file cycle: `src/ui/target.rs -> src/ui/target.rs`
- 1-file cycle: `src/platforms/codeforces.rs -> src/platforms/codeforces.rs`
- 1-file cycle: `src/platforms/cses.rs -> src/platforms/cses.rs`
- 1-file cycle: `src/ui/analytics.rs -> src/ui/analytics.rs`
- 1-file cycle: `src/ui/config_view.rs -> src/ui/config_view.rs`
- 1-file cycle: `src/ui/dashboard.rs -> src/ui/dashboard.rs`
- 1-file cycle: `src/ui/mod.rs -> src/ui/mod.rs`
- 1-file cycle: `src/ui/problems.rs -> src/ui/problems.rs`
- 1-file cycle: `src/ui/progress.rs -> src/ui/progress.rs`

## Hyperedges (group relationships)
- **TUI Release Pipeline Stages** — workflows_release_build_job, workflows_release_publish_job, workflows_release_package_manifests_job, workflows_release_update_package_files_job [EXTRACTED 0.90]
- **Three-client local stack over localhost** — architecture_browser_companion, architecture_vscode_extension, architecture_terminal_tui, architecture_shared_data_dirs [EXTRACTED 1.00]
- **Capture-to-submit problem workflow** — architecture_capture_flow, architecture_submit_flow, architecture_pending_submit_queue, architecture_browser_companion [EXTRACTED 0.85]
- **Compete Race Delivery Flow** — concept_compete, concept_ntfy_relay, concept_codeforces, concept_cpos_companion [EXTRACTED 0.90]
- **CPOS Three Synced Surfaces (TUI, VS Code, Browser)** — concept_cpos, concept_cpos_companion, vscode_readme, concept_localhost_capture [INFERRED 0.85]
- **VS Code Panel and Workflow** — assets_vscode_panel, assets_vscode_workflow [INFERRED 0.85]
- **CPOS Terminal UI Views** — docs_dashboard, docs_problems, docs_contests, docs_analytics, docs_recommend, docs_config, docs_theme_light [INFERRED 0.85]
- **Browser Companion Feature Shots** — shots_companion_analytics, shots_companion_compare, shots_companion_editor, shots_companion_modernize, shots_companion_popup [INFERRED 0.95]

## Communities (174 total, 11 thin omitted)

### Community 0 - "CodeMirror Bundle (Firefox) #1"
Cohesion: 0.01
Nodes (79): allowsNesting(), autoDirection(), balance(), balanceRange(), byGroup(), canStartStringAt(), captureCopy(), capturePaste() (+71 more)

### Community 1 - "CodeMirror Bundle (Chrome) #1"
Cohesion: 0.01
Nodes (72): allowsNesting(), autoDirection(), balance(), balanceRange(), byGroup(), canStartStringAt(), captureCopy(), capturePaste() (+64 more)

### Community 2 - "CodeMirror Bundle (Chrome) #2"
Cohesion: 0.03
Nodes (160): accept(), add(), addChunk(), addElement(), addEventListener(), addInfoPane(), addInner(), addLineDeco() (+152 more)

### Community 3 - "CodeMirror Bundle (Firefox) #2"
Cohesion: 0.03
Nodes (157): accept(), add(), addChunk(), addElement(), addEventListener(), addInfoPane(), addInner(), addLineDeco() (+149 more)

### Community 4 - "CodeMirror Bundle (Chrome) #3"
Cohesion: 0.04
Nodes (89): addActive(), addInsert(), addSection(), bindHandler(), charAfter(), charBefore(), checkSelection(), chunk() (+81 more)

### Community 5 - "CodeMirror Bundle (Chrome) #4"
Cohesion: 0.04
Nodes (86): absoluteColumn(), addBlock(), addCursorVertically(), baseDirAt(), baseIndent(), baseIndentFor(), basicMouseSelection(), bidiIn() (+78 more)

### Community 6 - "CodeMirror Bundle (Chrome) #5"
Cohesion: 0.05
Nodes (83): atLastNode(), checkSide(), child(), childAfter(), childBefore(), continue(), cursor(), cutAt() (+75 more)

### Community 7 - "CodeMirror Bundle (Firefox) #3"
Cohesion: 0.06
Nodes (81): addComposition(), checkSide(), child(), childAfter(), childBefore(), continue(), cursor(), cursorAt() (+73 more)

### Community 8 - "CodeMirror Bundle (Firefox) #4"
Cohesion: 0.04
Nodes (79): absoluteColumn(), addBlock(), addCursorVertically(), baseIndent(), baseIndentFor(), basicMouseSelection(), bidiSpans(), blankContent() (+71 more)

### Community 9 - "CodeMirror Bundle (Chrome) #6"
Cohesion: 0.04
Nodes (78): addTree(), announceFold(), announceMatch(), autocompletion(), baseTheme(), between(), blur(), bracketMatching() (+70 more)

### Community 10 - "TUI Event Loop & Key Handling"
Cohesion: 0.09
Nodes (76): ContestPhase, CrosstermBackend, Duration, KeyCode, KeyEvent, command_exists(), copy_to_clipboard(), drain_aux() (+68 more)

### Community 11 - "CodeMirror Bundle (Firefox) #5"
Cohesion: 0.05
Nodes (77): acceptToken(), addActions(), advance(), advanceFully(), advanceStack(), allActions(), allows(), apply() (+69 more)

### Community 12 - "CodeMirror Bundle (Chrome) #7"
Cohesion: 0.05
Nodes (73): acceptToken(), addActions(), advance(), advanceFully(), advanceStack(), allActions(), allows(), apply() (+65 more)

### Community 13 - "CodeMirror Bundle (Firefox) #6"
Cohesion: 0.04
Nodes (69): addActive(), addMapping(), addMappingToBranch(), addSelection(), blockTiles(), charAfter(), charBefore(), chunk() (+61 more)

### Community 14 - "CodeMirror Bundle (Chrome) #8"
Cohesion: 0.06
Nodes (62): addBlockWidget(), addBreak(), addComposition(), addInlineWidget(), addLine(), addLineStart(), addLineStartIfNotCovered(), addMark() (+54 more)

### Community 15 - "Workspace & Solution Files"
Cohesion: 0.10
Nodes (52): active_user_save_dir(), cf_index_order(), codeforces_solution_uses_id(), compare_problems(), cses_problem(), cses_solution_uses_slug(), expand_tilde(), has_explicit_workspace_dir() (+44 more)

### Community 16 - "CodeMirror Bundle (Firefox) #7"
Cohesion: 0.06
Nodes (59): addChanges(), addInsert(), addSection(), applyDefaultInsert(), applyTransaction(), asArray(), asSingle(), bindHandler() (+51 more)

### Community 17 - "CodeMirror Bundle (Chrome) #9"
Cohesion: 0.05
Nodes (58): addChanges(), addMapping(), addMappingToBranch(), addSelection(), applyDefaultInsert(), applyEdits(), applyTransaction(), asArray() (+50 more)

### Community 18 - "Capture Content Script (Chrome)"
Cohesion: 0.09
Nodes (53): aceEditorReady(), ackSubmit(), attachCsesFile(), autofillCodeforcesSubmit(), autofillCsesSubmit(), autofillSubmit(), blockSizesFromExample(), captureCsesProgress() (+45 more)

### Community 19 - "Capture Content Script (Firefox)"
Cohesion: 0.09
Nodes (53): aceEditorReady(), ackSubmit(), attachCsesFile(), autofillCodeforcesSubmit(), autofillCsesSubmit(), autofillSubmit(), blockSizesFromExample(), captureCsesProgress() (+45 more)

### Community 20 - "CodeMirror Bundle (Firefox) #8"
Cohesion: 0.05
Nodes (56): addTree(), autocompletion(), baseTheme(), bracketMatching(), buildTheme(), checkAsyncSchedule(), closeBrackets(), codeFolding() (+48 more)

### Community 21 - "CodeMirror Bundle (Chrome) #10"
Cohesion: 0.06
Nodes (55): after(), applyDOMChange(), applyDOMChangeInner(), atElementStart(), before(), betweenUneditable(), buildSelectionRangeFromRange(), clip() (+47 more)

### Community 22 - "CodeMirror Bundle (Firefox) #9"
Cohesion: 0.05
Nodes (54): applyCompletion(), applyDOMChange(), applyDOMChangeInner(), between(), buildKeymap(), clearTouchedFolds(), closedBracketAt(), cmd() (+46 more)

### Community 23 - "App State & Sync Orchestrator #1"
Cohesion: 0.05
Nodes (14): CaptureMsg, Picker, Receiver, Recommendation, SetupStep, App, HashMap, HashSet (+6 more)

### Community 24 - "CodeMirror Bundle (Firefox) #10"
Cohesion: 0.06
Nodes (52): after(), atElementStart(), before(), betweenUneditable(), buildSelectionRangeFromRange(), contains(), domAtPos(), domBoundsAround() (+44 more)

### Community 25 - "Self-Update Engine"
Cohesion: 0.10
Nodes (44): ComponentUpdate, binary_update(), cargo_install_path(), cargo_version(), check_latest(), ComponentUpdate, current_exe_paths(), detect_method() (+36 more)

### Community 26 - "CodeMirror Bundle (Chrome) #11"
Cohesion: 0.06
Nodes (47): activeForPoint(), addRange(), attrsEq(), boundChange(), cmd(), cmpVal(), commit(), compare() (+39 more)

### Community 27 - "VS Code Extension Host #1"
Cohesion: 0.06
Nodes (43): absolutizeCommand(), absolutizeConfig(), applyPlatformRun(), CapturedProblem, cCompiler(), cfContestCache, CfContestInfo, Challenge (+35 more)

### Community 28 - "Problems View (TUI)"
Cohesion: 0.14
Nodes (41): Alignment, App, Color, Frame, Line, Problem, Rect, StatementDocument (+33 more)

### Community 29 - "In-Browser IDE Panel (Chrome)"
Cohesion: 0.10
Nodes (33): applyChrome(), applyEditorTheme(), buildPanel(), callRunner(), closePanel(), computeMatches(), diffBlock(), findInputs() (+25 more)

### Community 30 - "In-Browser IDE Panel (Firefox)"
Cohesion: 0.10
Nodes (33): applyChrome(), applyEditorTheme(), buildPanel(), callRunner(), closePanel(), computeMatches(), diffBlock(), findInputs() (+25 more)

### Community 31 - "Recommender & Target Engine"
Cohesion: 0.11
Nodes (33): ac(), already_solved_problems_are_never_recommended(), analyze_target(), build_step_reason(), build_steps(), clamp_target(), cycle_milestone(), lower_tags() (+25 more)

### Community 32 - "CodeMirror Bundle (Firefox) #11"
Cohesion: 0.07
Nodes (39): activeForPoint(), addRange(), attrsEq(), boundChange(), checkValid(), cmpVal(), compare(), comparePoint() (+31 more)

### Community 33 - "Recommender"
Cohesion: 0.11
Nodes (33): build_reason(), diversify(), fills_default_count_when_pool_is_large(), fills_recommendations_from_local_cache_if_present(), known_rating_prefers_stretch_band_before_easy_fallbacks(), percentile_rating(), PracticeProfile, prefers_weak_topic_problems() (+25 more)

### Community 34 - "Codeforces Client"
Cohesion: 0.11
Nodes (28): CfContest, CfProblem, CfProblemsResult, CfProblemStats, CfRatingChange, CfResponse, CfSubmission, CodeforcesClient (+20 more)

### Community 35 - "App State & Sync Orchestrator #2"
Cohesion: 0.10
Nodes (31): Cache, cses_progress_path(), cses_progress_submission(), CsesProgress, current_streak_counts_all_platform_activity_days(), fetch_and_cache(), has_saved_cses_progress(), legacy_cses_progress_path() (+23 more)

### Community 36 - "Core Data Models"
Cohesion: 0.13
Nodes (25): captured_problem_parses_minimal_json(), captured_problem_parses_with_optional_fields(), CapturedCsesProgress, CapturedProblem, Contest, ContestPhase, PendingSubmit, Platform (+17 more)

### Community 37 - "Code Annotation Overlay (Chrome)"
Cohesion: 0.12
Nodes (29): applySelection(), applyThemeVars(), bindEvents(), boundaryOffset(), build(), buildBar(), closePopover(), ensureTheme() (+21 more)

### Community 38 - "Code Annotation Overlay (Firefox)"
Cohesion: 0.12
Nodes (29): applySelection(), applyThemeVars(), bindEvents(), boundaryOffset(), build(), buildBar(), closePopover(), ensureTheme() (+21 more)

### Community 39 - "CF Problem Enhancer (Chrome)"
Cohesion: 0.16
Nodes (29): addCopyButtons(), applyFocusMode(), applyTheme(), buildAll(), buildTools(), button(), cfApi(), el() (+21 more)

### Community 40 - "CF Problem Enhancer (Firefox)"
Cohesion: 0.16
Nodes (29): addCopyButtons(), applyFocusMode(), applyTheme(), buildAll(), buildTools(), button(), cfApi(), el() (+21 more)

### Community 41 - "CodeMirror Bundle (Firefox) #12"
Cohesion: 0.08
Nodes (32): appendText(), asSource(), balanced(), combine(), combineConfig(), completeFromList(), configure(), createTokenType() (+24 more)

### Community 42 - "Companion Style Core (Chrome)"
Cohesion: 0.13
Nodes (30): alpha(), buildModernizeCf(), buildModernizeCses(), buildPalette(), buildThemeCf(), buildThemeCses(), cfBlogComments(), cfColorBase() (+22 more)

### Community 43 - "Statement Capture Engine"
Cohesion: 0.17
Nodes (30): basic_math_fallback(), compact(), normalize_latex_aliases(), normalized_text(), parse(), parse_element(), pre_text(), preserves_semantic_sections_math_code_and_images() (+22 more)

### Community 44 - "Companion Style Core (Firefox)"
Cohesion: 0.13
Nodes (30): alpha(), buildModernizeCf(), buildModernizeCses(), buildPalette(), buildThemeCf(), buildThemeCses(), cfBlogComments(), cfColorBase() (+22 more)

### Community 45 - "CodeMirror Bundle (Firefox) #13"
Cohesion: 0.12
Nodes (30): addBlockWidget(), addBreak(), addInlineWidget(), addLine(), addLineStart(), addLineStartIfNotCovered(), addMark(), addText() (+22 more)

### Community 46 - "Daily Challenge Background (Chrome)"
Cohesion: 0.21
Nodes (26): featureEnabled(), getSince(), loadChallenges(), loadSettings(), myHandle(), netPollInbox(), netSend(), normalizeRange() (+18 more)

### Community 47 - "Daily Challenge Background (Firefox)"
Cohesion: 0.21
Nodes (26): featureEnabled(), getSince(), loadChallenges(), loadSettings(), myHandle(), netPollInbox(), netSend(), normalizeRange() (+18 more)

### Community 48 - "Firefox Extension Manifest"
Cohesion: 0.07
Nodes (26): action, default_icon, default_popup, default_title, background, scripts, browser_specific_settings, gecko (+18 more)

### Community 49 - "VS Code Extension Host #2"
Cohesion: 0.14
Nodes (20): activeSolutionPath(), buildSolutionQuery(), cfContestOngoing(), CposActionsProvider, csesTaskId(), currentState(), fetchAndCacheSolution(), isSolutionBlocked() (+12 more)

### Community 50 - "Capture Server Engine"
Cohesion: 0.16
Nodes (24): Arc, Cursor, capture_server_receives_problem(), capture_server_starts_and_responds_to_health(), CaptureMsg, CaptureServer, cors_headers(), json_response() (+16 more)

### Community 51 - "Architecture Documentation"
Cohesion: 0.10
Nodes (26): Browser Companion, Capture Flow, Compete Feature (ntfy.sh races), CPOS Architecture Overview, Localhost Protocol (127.0.0.1), Pending Submit Queue, Shared Data Directories (config, cache), Shared Per-Language Templates (+18 more)

### Community 52 - "SQLite Cache Layer"
Cohesion: 0.16
Nodes (12): Connection, Cache, Contest, Option, Platform, Problem, RatingChange, Result (+4 more)

### Community 53 - "CSES Client"
Cohesion: 0.16
Nodes (16): CsesClient, estimate_cses_difficulty(), parse_cses_samples(), Client, Contest, Option, Platform, PlatformClient (+8 more)

### Community 54 - "CF Contest Timer (Chrome)"
Cohesion: 0.18
Nodes (22): applyPos(), applyTheme(), build(), clamp(), doPause(), doReset(), doStart(), doToggle() (+14 more)

### Community 55 - "Config & Handles"
Cohesion: 0.18
Nodes (11): CompileConfig, Config, default_theme(), CompileConfig, Default, HashMap, Option, PathBuf (+3 more)

### Community 56 - "CF Contest Timer (Firefox)"
Cohesion: 0.18
Nodes (22): applyPos(), applyTheme(), build(), clamp(), doPause(), doReset(), doStart(), doToggle() (+14 more)

### Community 57 - "CF Standings Enhancer (Chrome)"
Cohesion: 0.17
Nodes (21): applyFriendsFilter(), applyTheme(), bodyRows(), buildAll(), buildPanel(), cfApi(), clearFilter(), clearRows() (+13 more)

### Community 58 - "CF Profile Enhancer (Chrome)"
Cohesion: 0.17
Nodes (23): applyTheme(), bars(), build(), cfApi(), computeStats(), donut(), el(), fact() (+15 more)

### Community 59 - "CF Standings Enhancer (Firefox)"
Cohesion: 0.17
Nodes (21): applyFriendsFilter(), applyTheme(), bodyRows(), buildAll(), buildPanel(), cfApi(), clearFilter(), clearRows() (+13 more)

### Community 60 - "CF Profile Enhancer (Firefox)"
Cohesion: 0.17
Nodes (23): applyTheme(), bars(), build(), cfApi(), computeStats(), donut(), el(), fact() (+15 more)

### Community 61 - "Handle Compare / VS Mode (Chrome)"
Cohesion: 0.17
Nodes (18): applyTheme(), build(), cfApi(), chipRow(), el(), fetchHandle(), fetchSolved(), getExtraHandles() (+10 more)

### Community 62 - "Handle Compare / VS Mode (Firefox)"
Cohesion: 0.17
Nodes (18): applyTheme(), build(), cfApi(), chipRow(), el(), fetchHandle(), fetchSolved(), getExtraHandles() (+10 more)

### Community 63 - "VS Code Extension Host #3"
Cohesion: 0.13
Nodes (21): dataDir(), evaluate(), expandCommand(), hashPath(), languageForFile(), loadCsesMetaBySlug(), loadSamples(), needsWindowsQuoting() (+13 more)

### Community 64 - "Screenshot Generator"
Cohesion: 0.19
Nodes (20): Buffer, ac(), CellOut, cf_problem(), cses_problem(), demo_app(), dump_buffer(), hex() (+12 more)

### Community 65 - "CodeMirror Bundle (Chrome) #12"
Cohesion: 0.13
Nodes (21): appendText(), asSource(), balanced(), completeFromList(), decompose(), decomposeLeft(), decomposeRight(), defaultQuery() (+13 more)

### Community 66 - "Chrome Extension Manifest"
Cohesion: 0.10
Nodes (20): action, default_icon, default_popup, default_title, background, service_worker, content_scripts, 128 (+12 more)

### Community 67 - "Daily Challenge (Chrome)"
Cohesion: 0.22
Nodes (19): acceptChallenge(), challengeFromLink(), closePopover(), createOnPageChallenge(), declineChallenge(), detectHandle(), el(), featureOn() (+11 more)

### Community 68 - "Daily Challenge Core (Chrome)"
Cohesion: 0.14
Nodes (10): b64urlDecode(), b64urlEncode(), buildInvite(), decode(), encode(), genNonce(), link(), makeId() (+2 more)

### Community 69 - "CodeMirror Bundle (Firefox) #14"
Cohesion: 0.10
Nodes (20): atLastNode(), blur(), dist(), dragScrollSpeed(), getPanel(), getScrollMargins(), getSearchInput(), getTooltip() (+12 more)

### Community 70 - "Daily Challenge (Firefox)"
Cohesion: 0.22
Nodes (19): acceptChallenge(), challengeFromLink(), closePopover(), createOnPageChallenge(), declineChallenge(), detectHandle(), el(), featureOn() (+11 more)

### Community 71 - "Daily Challenge Core (Firefox)"
Cohesion: 0.14
Nodes (10): b64urlDecode(), b64urlEncode(), buildInvite(), decode(), encode(), genNonce(), link(), makeId() (+2 more)

### Community 72 - "App State & Sync Orchestrator #3"
Cohesion: 0.27
Nodes (5): language_display(), Option, Problem, StartedProblem, submit_url_for()

### Community 73 - "VS Code Extension Host #4"
Cohesion: 0.17
Nodes (20): challengeAcceptPublic(), challengeCreate(), challengeRemove(), challengeSetHandle(), challengeSetPublic(), challengeSetStatus(), chRandId(), handleRequest() (+12 more)

### Community 74 - "Theme Palette (TUI)"
Cohesion: 0.20
Nodes (7): Block, Color, Default, Option, Self, Style, Theme

### Community 75 - "Service Worker (Chrome)"
Cohesion: 0.20
Nodes (17): ack(), activeTabIds, attemptCounts, bringTabToFront(), CF_LANGUAGE_IDS, cfSubmitFlags(), cposCsesSubmitOnPage(), cposSubmitOnPage() (+9 more)

### Community 76 - "CF Problemset Enhancer (Chrome)"
Cohesion: 0.20
Nodes (16): applyTheme(), buildAll(), cfApi(), clearCounts(), clearRows(), clearRowTokens(), colorRows(), loadStats() (+8 more)

### Community 77 - "Daily Problem Widget (Chrome)"
Cohesion: 0.22
Nodes (17): applyBannerTheme(), candidates(), cfApi(), computeStreaks(), get(), getProblemset(), hashStr(), maybeBanner() (+9 more)

### Community 78 - "Local Test Runner"
Cohesion: 0.23
Nodes (17): build_dir(), compile(), expand_command(), expand_command_quotes_run_output_and_dir(), expand_command_quotes_shell_placeholders(), run_all_tests(), run_test(), shell_quote() (+9 more)

### Community 79 - "Background Script (Firefox)"
Cohesion: 0.20
Nodes (17): ack(), activeTabIds, attemptCounts, bringTabToFront(), CF_LANGUAGE_IDS, cfSubmitFlags(), cposCsesSubmitOnPage(), cposSubmitOnPage() (+9 more)

### Community 80 - "CF Problemset Enhancer (Firefox)"
Cohesion: 0.20
Nodes (16): applyTheme(), buildAll(), cfApi(), clearCounts(), clearRows(), clearRowTokens(), colorRows(), loadStats() (+8 more)

### Community 81 - "Daily Problem Widget (Firefox)"
Cohesion: 0.22
Nodes (17): applyBannerTheme(), candidates(), cfApi(), computeStreaks(), get(), getProblemset(), hashStr(), maybeBanner() (+9 more)

### Community 82 - "VS Code Manifest & Commands #1"
Cohesion: 0.11
Nodes (18): activationEvents, bugs, url, categories, description, displayName, engines, vscode (+10 more)

### Community 83 - "Chrome Extension Docs #1"
Cohesion: 0.16
Nodes (17): Chrome Companion Privacy Policy, Chrome Companion README, Chrome Web Store Listing, Codeforces Judge, Compete (1v1 Codeforces Races), CPOS Companion Browser Extension, CSES Judge, In-Browser Editor (CodeMirror) (+9 more)

### Community 84 - "Popup Hub (Firefox)"
Cohesion: 0.15
Nodes (9): Shared Theme Palette (themes.js), defaultSwatchEl(), fetchSharedConfig(), pushSharedTemplate(), renderSwatches(), swatchEl(), wire(), wireCustomColor() (+1 more)

### Community 85 - "Popup Hub (Chrome)"
Cohesion: 0.17
Nodes (8): defaultSwatchEl(), fetchSharedConfig(), pushSharedTemplate(), renderSwatches(), swatchEl(), wire(), wireCustomColor(), wirePopupNavigation()

### Community 86 - "Setup Wizard (TUI)"
Cohesion: 0.28
Nodes (15): Paragraph, App, Frame, Line, Rect, String, centered_rect(), draw() (+7 more)

### Community 87 - "Target View (TUI)"
Cohesion: 0.27
Nodes (15): Readiness, App, Color, Frame, Rect, String, TargetPlan, Theme (+7 more)

### Community 88 - "VS Code Extension Host #5"
Cohesion: 0.22
Nodes (16): activeEditorFilePath(), activeNameMatchesProblem(), captureProblem(), config(), exists(), forwardCaptureToTui(), isCsesPlatform(), platformSlug() (+8 more)

### Community 89 - "Chrome Package Manifest"
Cohesion: 0.13
Nodes (14): dependencies, @codemirror/autocomplete, @codemirror/commands, @codemirror/lang-cpp, @codemirror/lang-java, @codemirror/lang-javascript, @codemirror/lang-python, @codemirror/language (+6 more)

### Community 90 - "CF Favorites (Chrome)"
Cohesion: 0.26
Nodes (12): applyBtnTheme(), build(), get(), isFav(), paint(), parseProblem(), problemName(), problemRating() (+4 more)

### Community 91 - "Daily Challenge UI (Chrome)"
Cohesion: 0.26
Nodes (12): acceptIncoming(), card(), el(), enrich(), ensureStyle(), getProblems(), loadSettings(), normalizeRange() (+4 more)

### Community 92 - "Analytics View Screenshot"
Cohesion: 0.16
Nodes (14): CPOS Analytics Screenshot, Analytics View, CPOS Config Screenshot, Configuration View, CPOS Contests Screenshot, Contests View, CPOS Dashboard Screenshot, Dashboard View (+6 more)

### Community 93 - "CF Favorites (Firefox)"
Cohesion: 0.26
Nodes (12): applyBtnTheme(), build(), get(), isFav(), paint(), parseProblem(), problemName(), problemRating() (+4 more)

### Community 94 - "Daily Challenge UI (Firefox)"
Cohesion: 0.26
Nodes (12): acceptIncoming(), card(), el(), enrich(), ensureStyle(), getProblems(), loadSettings(), normalizeRange() (+4 more)

### Community 95 - "Dashboard View (TUI)"
Cohesion: 0.42
Nodes (13): App, Color, Frame, Rect, String, draw(), draw_banner(), draw_lower() (+5 more)

### Community 96 - "Carrot Rating Predictor (Chrome)"
Cohesion: 0.29
Nodes (11): annotate(), applyTheme(), cfApi(), clearTheme(), computeDeltas(), contestId(), fetchRatings(), getDeltas() (+3 more)

### Community 97 - "Carrot Rating Predictor (Firefox)"
Cohesion: 0.29
Nodes (11): annotate(), applyTheme(), cfApi(), clearTheme(), computeDeltas(), contestId(), fetchRatings(), getDeltas() (+3 more)

### Community 98 - "Landing Page Script"
Cohesion: 0.22
Nodes (6): fetchJson(), fetchVscodeInstalls(), formatCompact(), formatInstallCount(), loadLiveStats(), trimDecimal()

### Community 99 - "App State & Sync Orchestrator #4"
Cohesion: 0.19
Nodes (5): fetch_samples_task(), Config, Self, Sender, target_defaults_to_first_rank_goal_without_rating_history()

### Community 100 - "App State & Sync Orchestrator #5"
Cohesion: 0.21
Nodes (8): CaptureServer, normalize_template_text(), parse_cf_parts(), queue_pending_submit(), Result, String, StatementImageMsg, SubmitAction

### Community 101 - "CodeMirror Build Entry"
Cohesion: 0.23
Nodes (10): cposHighlightStyle, CPP_WORDS, createEditor(), editorTheme(), JAVA_WORDS, JS_WORDS, languageFor(), localCompletionSource() (+2 more)

### Community 102 - "VS Code TS Config"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, lib, module, outDir, rootDir, skipLibCheck, sourceMap (+3 more)

### Community 103 - "VS Code Manifest & Commands #2"
Cohesion: 0.18
Nodes (11): properties, title, configuration, default, description, type, default, description (+3 more)

### Community 104 - "Contests Widget (Chrome)"
Cohesion: 0.44
Nodes (9): featureEnabled(), fireReminder(), fmtLocal(), getCachedList(), getLead(), getReminders(), pickUpcoming(), refreshList() (+1 more)

### Community 105 - "Companion Themes (Chrome)"
Cohesion: 0.40
Nodes (9): applyTheme(), buildFromAccent(), clamp8(), get(), luminance(), mix(), parseHex(), registerCustom() (+1 more)

### Community 106 - "Contests Widget (Firefox)"
Cohesion: 0.44
Nodes (9): featureEnabled(), fireReminder(), fmtLocal(), getCachedList(), getLead(), getReminders(), pickUpcoming(), refreshList() (+1 more)

### Community 107 - "Companion Themes (Firefox)"
Cohesion: 0.40
Nodes (9): applyTheme(), buildFromAccent(), clamp8(), get(), luminance(), mix(), parseHex(), registerCustom() (+1 more)

### Community 108 - "Companion Analytics Shot"
Cohesion: 0.22
Nodes (10): Companion Profile Analytics, Profile Analytics, Companion Compare (VS Mode), Compare Handles (VS Mode), Companion In-Browser Editor, In-Browser Editor, Companion Modernize (Cleaner Codeforces), Codeforces Restyle / Modernize (+2 more)

### Community 109 - "App State & Sync Orchestrator #6"
Cohesion: 0.29
Nodes (8): refresh_contest_phases(), CompileConfig, Contest, PathBuf, TestCase, Vec, run_tests_task(), TestMsg

### Community 110 - "VS Code Extension Host #6"
Cohesion: 0.31
Nodes (10): expandHome(), readSharedTemplate(), resolveDefaultLanguage(), sharedConfigPayload(), sharedTemplatePath(), templateFor(), TuiConfig, tuiConfigPath() (+2 more)

### Community 111 - "Analytics View (TUI)"
Cohesion: 0.49
Nodes (9): App, Frame, Rect, String, draw(), draw_heatmap(), draw_rating_graph(), draw_tag_breakdown() (+1 more)

### Community 112 - "Companion Config (Chrome)"
Cohesion: 0.36
Nodes (6): activePageThemeId(), activeThemeId(), ensureDefaults(), feature(), get(), load()

### Community 113 - "Syntax Highlight (Chrome)"
Cohesion: 0.36
Nodes (6): candidates(), ensureTheme(), process(), styleBlock(), sync(), unprocess()

### Community 114 - "Companion Config (Firefox)"
Cohesion: 0.36
Nodes (6): activePageThemeId(), activeThemeId(), ensureDefaults(), feature(), get(), load()

### Community 115 - "Syntax Highlight (Firefox)"
Cohesion: 0.36
Nodes (6): candidates(), ensureTheme(), process(), styleBlock(), sync(), unprocess()

### Community 116 - "PlatformClient Trait"
Cohesion: 0.28
Nodes (5): PlatformClient, pre(), pre_text(), ElementRef, String

### Community 117 - "Contests UI (Chrome)"
Cohesion: 0.46
Nodes (7): doRefresh(), el(), fmtCountdown(), fmtLocal(), loadState(), render(), sendMsg()

### Community 118 - "Stress Test Engine"
Cohesion: 0.46
Nodes (7): run_program(), stress_test(), StressResult, Option, Path, Result, String

### Community 119 - "Contests UI (Firefox)"
Cohesion: 0.46
Nodes (7): doRefresh(), el(), fmtCountdown(), fmtLocal(), loadState(), render(), sendMsg()

### Community 120 - "VS Code Extension Host #7"
Cohesion: 0.32
Nodes (8): activate(), deactivate(), refreshActions(), refreshCfContestList(), startCaptureServer(), stopCaptureServer(), updateStatus(), warnServer()

### Community 121 - "UI Header / Tabs / Status"
Cohesion: 0.68
Nodes (7): App, Frame, Rect, draw(), draw_header(), draw_status_bar(), draw_tabs()

### Community 122 - "Recommend View (TUI)"
Cohesion: 0.32
Nodes (7): App, Frame, Problem, Rect, String, draw(), top_topics()

### Community 123 - "Companion Slides Tool"
Cohesion: 0.43
Nodes (7): draw_tracked(), font(), make_slide(), Resolve a Desktop screenshot by its time prefix (macOS uses a U+202F     narrow, rounded_shot(), SRC(), wrap()

### Community 124 - "VS Code Manifest & Commands #3"
Cohesion: 0.25
Nodes (8): contributes, commands, menus, views, viewsContainers, editor/title, cpos, activitybar

### Community 125 - "Bug Report Template"
Cohesion: 0.33
Nodes (7): Bug Report Issue Template, CPOS Project, Local-First Architecture, Issue Template Config, Feature Request Issue Template, CPOS Funding Config, Pull Request Template

### Community 126 - "Companion Highlight (Chrome)"
Cohesion: 0.43
Nodes (4): buildRe(), highlight(), norm(), reFor()

### Community 127 - "Practice UI (Chrome)"
Cohesion: 0.52
Nodes (6): featOn(), hashStr(), mulberry32(), pickAnother(), removeFav(), render()

### Community 128 - "Companion Highlight (Firefox)"
Cohesion: 0.43
Nodes (4): buildRe(), highlight(), norm(), reFor()

### Community 129 - "Practice UI (Firefox)"
Cohesion: 0.52
Nodes (6): featOn(), hashStr(), mulberry32(), pickAnother(), removeFav(), render()

### Community 130 - "Promo Tiles Tool"
Cohesion: 0.62
Nodes (6): font(), logo(), marquee_tile(), pills(), small_tile(), tracked()

### Community 131 - "Package Manifest Writer"
Cohesion: 0.62
Nodes (6): main(), Path, release_url(), sha256(), write_homebrew(), write_scoop()

### Community 132 - "Browser Capture Flow Diagram"
Cohesion: 0.33
Nodes (6): Browser Capture Flow (CPOS TUI Dashboard), CPOS Terminal Dashboard, VS Code Panel (CPOS Problems TUI), CPOS Problems View, VS Code Workflow (CPOS Actions Panel + Editor), CPOS VS Code Actions Panel

### Community 133 - "Site Theme (Chrome)"
Cohesion: 0.60
Nodes (5): apply(), protectCss(), remove(), siteCss(), sync()

### Community 134 - "Site Theme (Firefox)"
Cohesion: 0.60
Nodes (5): apply(), protectCss(), remove(), siteCss(), sync()

### Community 135 - "Progress Bars (TUI)"
Cohesion: 0.47
Nodes (5): Color, Line, Theme, bar_line(), rate_color()

### Community 136 - "VS Code Manifest & Commands #4"
Cohesion: 0.33
Nodes (6): default, description, enum, enumDescriptions, type, cpos.saveLocation

### Community 137 - "Release Workflow"
Cohesion: 0.60
Nodes (6): Release TUI Workflow, Release Build Job, Release Package-Manifests Job, Release Publish Job, Release Update-Package-Files Job, write_package_manifests.py

### Community 138 - "Modernize CF UI (Chrome)"
Cohesion: 0.70
Nodes (4): apply(), css(), remove(), sync()

### Community 139 - "Modernize CF UI (Firefox)"
Cohesion: 0.70
Nodes (4): apply(), css(), remove(), sync()

### Community 141 - "Config View (TUI)"
Cohesion: 0.50
Nodes (4): App, Frame, Rect, draw()

### Community 142 - "Vercel Config"
Cohesion: 0.40
Nodes (4): buildCommand, cleanUrls, outputDirectory, trailingSlash

### Community 143 - "VS Code Manifest & Commands #5"
Cohesion: 0.40
Nodes (5): default, description, enum, type, cpos.defaultLanguage

### Community 144 - "VS Code Manifest & Commands #6"
Cohesion: 0.40
Nodes (5): devDependencies, @types/node, @types/vscode, typescript, @vscode/vsce

### Community 145 - "VS Code Manifest & Commands #7"
Cohesion: 0.40
Nodes (5): scripts, compile, package, publish, watch

### Community 146 - "Install Docs"
Cohesion: 0.67
Nodes (4): cpos update (package-manager delegation), Homebrew Tap Install, GitHub Release Workflow (release.yml), Scoop Bucket Install

### Community 148 - "Screen Renderer Tool"
Cohesion: 0.83
Nodes (3): load_font(), main(), render()

### Community 149 - "VS Code Manifest & Commands #8"
Cohesion: 0.50
Nodes (4): default, description, type, cpos.autoStartCaptureServer

### Community 150 - "VS Code Manifest & Commands #9"
Cohesion: 0.50
Nodes (4): default, description, type, cpos.capturePort

### Community 151 - "VS Code Manifest & Commands #10"
Cohesion: 0.50
Nodes (4): default, description, type, cpos.fixedDir

### Community 152 - "VS Code Manifest & Commands #11"
Cohesion: 0.50
Nodes (4): default, description, type, cpos.openOnCapture

### Community 153 - "VS Code Manifest & Commands #12"
Cohesion: 0.50
Nodes (4): default, description, type, cpos.saveSamplesNextToSolution

### Community 154 - "VS Code Manifest & Commands #13"
Cohesion: 0.50
Nodes (4): default, description, type, cpos.subfolderPerPlatform

### Community 155 - "VS Code Manifest & Commands #14"
Cohesion: 0.50
Nodes (4): default, description, type, cpos.templateFile

### Community 156 - "VS Code Manifest & Commands #15"
Cohesion: 0.50
Nodes (4): repository, directory, type, url

### Community 157 - "Changelog #1"
Cohesion: 0.67
Nodes (3): Profile Analytics (in-browser), Coverage-aware Recommendations, Recommendation Engine

### Community 159 - "VS Code Manifest & Commands #16"
Cohesion: 0.67
Nodes (3): galleryBanner, color, theme

## Knowledge Gaps
- **293 isolated node(s):** `Vec`, `Color`, `Submission`, `Verdict`, `ENDPOINTS` (+288 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Issue Template Config` connect `Bug Report Template` to `Screenshot Generator`, `TUI Event Loop & Key Handling`, `Local Test Runner`, `Capture Server Engine`, `SQLite Cache Layer`, `Target View (TUI)`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `CPOS Project` connect `Bug Report Template` to `Chrome Extension Docs #1`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `VS Code Extension README` connect `Chrome Extension Docs #1` to `Bug Report Template`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `Vec`, `Color`, `Submission` to the rest of the system?**
  _297 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `CodeMirror Bundle (Firefox) #1` be split into smaller, more focused modules?**
  _Cohesion score 0.010814452363223771 - nodes in this community are weakly interconnected._
- **Should `CodeMirror Bundle (Chrome) #1` be split into smaller, more focused modules?**
  _Cohesion score 0.010954263128176172 - nodes in this community are weakly interconnected._
- **Should `CodeMirror Bundle (Chrome) #2` be split into smaller, more focused modules?**
  _Cohesion score 0.025864779874213838 - nodes in this community are weakly interconnected._