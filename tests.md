# Tests

This file tracks manual regression and feature verification steps.

## Template

### Feature: <name>

#### Prerequisites
- <required setup>

#### Steps
1. <action>
2. <action>

#### Expected Results
- <result>

#### Rollback/Cleanup
- <cleanup action, if any>

### Feature: Telegram bot token stored in dedicated global file

#### Prerequisites
- App server is running from this repository.
- A valid Telegram bot token is available.
- Access to `~/.codex/` on the host machine.

#### Steps
1. In the app UI, open Telegram connection and submit a bot token.
2. Verify file `~/.codex/telegram-bridge.json` exists.
3. Open `~/.codex/telegram-bridge.json` and confirm it contains a `botToken` field.
4. Restart the app server and call Telegram status endpoint from UI to confirm it still reports configured.

#### Expected Results
- Telegram token is persisted in `~/.codex/telegram-bridge.json`.
- Telegram bridge remains configured after restart.

#### Rollback/Cleanup
- Remove `~/.codex/telegram-bridge.json` to clear saved Telegram token.

### Feature: Telegram chatIds persisted for bot DM sending

#### Prerequisites
- App server is running from this repository.
- Telegram bot already configured in the app.
- Access to `~/.codex/telegram-bridge.json`.

#### Steps
1. Send `/start` to the Telegram bot from your DM.
2. Wait for the app to process the update, then open `~/.codex/telegram-bridge.json`.
3. Confirm `chatIds` contains your DM chat id as the first element.
4. In the app, reconnect Telegram bot with the same token.
5. Re-open `~/.codex/telegram-bridge.json` and confirm `chatIds` remains present.

#### Expected Results
- `chatIds` is written after Telegram DM activity.
- `chatIds` persists across bot reconfiguration.
- `botToken` and `chatIds` are both present in `~/.codex/telegram-bridge.json`.

#### Rollback/Cleanup
- Remove `chatIds` or delete `~/.codex/telegram-bridge.json` to clear persisted chat targets.

### Feature: Skills dropdown closes after selection in composer

#### Prerequisites
- App is running from this repository.
- At least one thread exists and can be selected.
- At least one installed skill is available.

#### Steps
1. Open an existing thread so the message composer is enabled.
2. Click the `Skills` dropdown in the composer footer.
3. Click any skill option in the dropdown list.
4. Re-open the `Skills` dropdown and click the same skill again to unselect it.

#### Expected Results
- The skills dropdown closes immediately after each selection click.
- Selected skill appears as a chip above the composer input when checked.
- Skill chip is removed when the skill is unchecked on the next selection.

#### Rollback/Cleanup
- Remove the selected skill chip(s) before leaving the thread, if needed.

### Feature: Skills Hub manual search trigger

#### Prerequisites
- App is running from this repository.
- Open the `Skills Hub` view.

#### Steps
1. Type a unique query value in the Skills Hub search input (for example: `docker`), but do not press Enter or click Search yet.
2. Confirm the browse results do not refresh immediately while typing.
3. Click the `Search` button.
4. Change the query text to another value and press Enter in the input.
5. Clear the query, then click `Search` to reload the default browse list.

#### Expected Results
- Typing alone does not trigger remote Skills Hub search requests.
- Results refresh only after explicit submit via the `Search` button or Enter key.
- Empty-state text (if shown) references the last submitted query.
- Submitting an empty query returns the default skills listing.

#### Rollback/Cleanup
- Clear the search input and run a blank search to return to default listing.

### Feature: Dark theme for trending GitHub projects and local project dropdown

#### Prerequisites
- App is running from this repository.
- Home/new-thread screen is open.
- Appearance is set to `Dark` in Settings.
- `GitHub trending projects` setting is enabled.

#### Steps
1. On the home/new-thread screen, inspect the `Choose folder` dropdown trigger.
2. Open the `Choose folder` dropdown and confirm menu/option contrast remains readable in dark mode.
3. Inspect the `Trending GitHub projects` section title, scope dropdown, and project cards.
4. Hover a trending project card and the scope dropdown trigger.
5. Toggle appearance back to `Light`, then return to `Dark`.

#### Expected Results
- Local project dropdown trigger/value uses dark theme colors with readable contrast.
- Trending section title, empty/loading text, scope dropdown, and cards use dark backgrounds/borders/text.
- Hover states in dark mode stay visible and do not switch to light backgrounds.
- Theme switch back/forth preserves correct styling for both controls.

#### Rollback/Cleanup
- Reset appearance to the previous user preference.

### Feature: Dark theme for worktree runtime selector and Skills Hub

#### Prerequisites
- App is running from this repository.
- Appearance is set to `Dark` in Settings.
- Skills Hub route is accessible.

#### Steps
1. Open the home/new-thread screen and inspect the `Local project / New worktree` runtime selector trigger.
2. Open the runtime selector and verify menu title, options, selected state, and checkmark visibility in dark mode.
3. Trigger a worktree action that shows worktree status and verify running/error status blocks remain readable in dark mode.
4. Open `Skills Hub` and verify header/subtitle, search bar, search/sort buttons, sync panel, badges, and status text.
5. Verify at least one skill card surface (title, owner, description, date, browse icon) in dark mode.
6. Open a skill detail modal and verify panel, title/owner, close button, README/body text, and footer actions in dark mode.

#### Expected Results
- Runtime dropdown trigger and menu use dark backgrounds, borders, and readable text/icons.
- Worktree status blocks use dark-friendly contrast for both running and error states.
- Skills Hub controls and sync panel are fully dark-themed with consistent hover/active states.
- Skill cards and the skill detail modal render with dark theme colors and accessible contrast.

#### Rollback/Cleanup
- Reset appearance to the previous user preference.

### Feature: Markdown file links with backticks and parentheses render correctly

#### Prerequisites
- App is running from this repository.
- An active thread is open.
- Local file exists at `/root/New Project (1)/qwe.txt`.

#### Steps
1. Send a message containing: `Done. Created [`/root/New Project (1)/qwe.txt`](/root/New Project (1)/qwe.txt) with content:`.
2. In the rendered assistant message, click the `/root/New Project (1)/qwe.txt` link.
3. Right-click the same link and choose `Copy link` from the context menu.
4. Paste the copied link into a text field and inspect it.

#### Expected Results
- The markdown link renders as one clickable file link (not split into partial tokens).
- Clicking opens the local browse route for the full file path.
- Copied link includes the full encoded path and still resolves to the same file.

#### Rollback/Cleanup
- Delete `/root/New Project (1)/qwe.txt` if it was created only for this test.

### Feature: Runtime selector uses a toggle-style control

#### Prerequisites
- App is running from this repository.
- Home/new-thread screen is open.

#### Steps
1. On the home/new-thread screen, locate the runtime control below `Choose folder`.
2. Verify both options (`Local project` and `New worktree`) are visible at once without opening a menu.
3. Click `New worktree` and confirm it becomes the selected option style.
4. Click `Local project` and confirm selection returns.
5. Set Appearance to `Dark` in Settings and verify selected/unselected contrast remains readable.

#### Expected Results
- Runtime mode is presented as a two-option toggle (segmented control), not a dropdown menu.
- Clicking each option immediately switches the selected state.
- Selected option has a distinct active background/border in both light and dark themes.

#### Rollback/Cleanup
- Leave runtime mode and appearance at the previous user preference.

### Feature: Dark theme states for runtime mode toggle

#### Prerequisites
- App is running from this repository.
- Home/new-thread screen is open.
- Appearance is set to `Dark` in Settings.

#### Steps
1. Locate the runtime mode toggle (`Local project` and `New worktree`) under `Choose folder`.
2. Hover each option and verify hover state is visible against dark backgrounds.
3. Select `New worktree`, then select `Local project` and compare active/inactive contrast.
4. Tab to the toggle options with keyboard navigation and verify the focus ring is visible.
5. Confirm icon color remains readable for selected and unselected options.

#### Expected Results
- Toggle container, options, and text/icons use dark-friendly colors.
- Hover and selected states are clearly distinguishable in dark mode.
- Keyboard focus ring is visible and does not blend into the background.

#### Rollback/Cleanup
- Return appearance and runtime selection to the previous user preference.

### Feature: pnpm dev script installs dependencies and starts Vite

### Feature: codex-ui-react dev startup resolves Codex CLI automatically

#### Prerequisites
- Dependencies are installed in `/home/chris/repo/codexUI/codex-ui-react`.
- `bun` is installed and can execute `bun run dev`.
- Network access is available if `bunx --bun @openai/codex` needs to fetch the CLI package.

#### Steps
1. Ensure no prior `codex-ui-react` dev processes are still bound to ports `3000`, `3456`, or `5173`.
2. From `/home/chris/repo/codexUI/codex-ui-react`, run `bun run dev`.
3. Watch the bridge server logs during startup.
4. Confirm the bridge prints a `CODEX_COMMAND` value in the proxy config and does not exit with `Executable not found in $PATH: "codex"`.
5. Confirm Vite stays up and `/codex-api/events` proxy requests stop failing due to backend startup failure.

#### Expected Results
- `bun run dev` starts the proxy, bridge server, and Vite without requiring a globally installed `codex` binary.
- The bridge resolves either the existing `codex` executable or the fallback `bunx --bun @openai/codex` command automatically.
- The previous `spawn codex ENOENT` failure does not appear.

#### Rollback/Cleanup
- Stop the dev stack with `Ctrl+C`.
- Terminate any leftover processes on ports `3000`, `3456`, or `5173` if the shell exits unexpectedly.

### Feature: codex-ui-react thread detail includes persisted turns after send

#### Prerequisites
- The React app stack is running from `/home/chris/repo/codexUI/codex-ui-react`.
- A thread can be created or selected in the UI.
- The selected model can complete a short prompt successfully.

#### Steps
1. Open an existing thread or create a new one.
2. Send a short message such as `hi`.
3. Wait for the assistant reply to complete.
4. Refresh the page or reselect the same thread so the UI reloads thread detail from `thread/read`.
5. Confirm the previously sent user message and assistant reply still render in the conversation.

#### Expected Results
- The client requests `thread/read` with `includeTurns: true`.
- Reloading or reselecting the thread preserves the completed conversation instead of showing an empty thread.
- User messages render from `userMessage.content`, and assistant messages render from `agentMessage.text`.

#### Rollback/Cleanup
- No cleanup required beyond deleting the test thread if it was created only for verification.

### Feature: codex-ui-react proxy startup clears stale port 3456 listeners

#### Prerequisites
- The React app project exists at `/home/chris/repo/codexUI/codex-ui-react`.
- `bun` is installed.
- Port `3456` can be occupied by a stale local process before startup.

#### Steps
1. Start any temporary listener on port `3456`.
2. From `/home/chris/repo/codexUI/codex-ui-react`, run `bun run proxy`.
3. Watch the proxy startup logs.
4. Confirm the proxy takes over port `3456` instead of exiting with `Failed to start server. Is port 3456 in use?`.

#### Expected Results
- The proxy detects the existing listener on port `3456`.
- The stale listener is terminated before the new proxy binds the port.
- `bun run proxy` starts successfully and logs the proxy URL.

#### Rollback/Cleanup
- Stop the proxy process with `Ctrl+C`.
- Remove any temporary listener created only for the test.

### Feature: codex-ui-react provider-backed model discovery

#### Prerequisites
- The React app stack is running from `/home/chris/repo/codexUI/codex-ui-react`.
- Codex config uses a `model_provider` entry that exposes a Responses-compatible `/models` endpoint, or the bridge is otherwise reachable for `GET /codex-api/provider-models`.

#### Steps
1. Start the React bridge server and confirm `GET /codex-api/provider-models` responds with JSON.
2. If the active provider defines `model_providers.<providerId>.wire_api = "responses"` and `base_url`, confirm the endpoint returns discovered model ids in `data`.
3. Open the React UI and inspect the model picker options after startup.
4. If provider discovery is unavailable or returns invalid data, reload the UI and confirm the model picker still shows the base `model/list` results.

#### Expected Results
- The React bridge exposes `GET /codex-api/provider-models`.
- Provider-only model ids are appended to the model picker without duplicating existing `model/list` ids.
- Discovery failures are non-fatal and fall back to the regular Codex `model/list` output.

#### Rollback/Cleanup
- Restore the prior provider config if a temporary provider was used only for verification.

### Feature: codex-ui-react directory browser for new thread location

#### Prerequisites
- The React app stack is running from `/home/chris/repo/codexUI/codex-ui-react`.
- `GET /codex-api/browse-directory` is reachable from the React app.
- At least one accessible directory exists under `/home/chris/repo/codexUI/user_threads` or the configured starting path.

#### Steps
1. Open the `New Thread` dialog in the React UI.
2. Verify the dialog shows the current parent folder path and a list of child directories instead of only a fixed base path hint.
3. Click into a child directory and confirm the displayed parent path updates.
4. Click `Up` and confirm the dialog returns to the parent directory.
5. Enter a new folder name, create the thread, and confirm the thread starts inside the selected parent folder.

#### Expected Results
- The dialog can browse directories via the bridge instead of assuming a single fixed parent path.
- Directory navigation updates the destination path before thread creation.
- Creating a thread uses the currently browsed parent directory plus the entered folder name.

#### Rollback/Cleanup
- Delete any temporary test folder/thread created only for verification.

### Feature: codex-ui-react review Git backend routes

#### Prerequisites
- The React app server is running from `/home/chris/repo/codexUI/codex-ui-react`.
- `git` is installed on the host running the React app server.
- A temporary directory is available for creating a throwaway repository.

#### Steps
1. Create a temporary directory that is not yet a Git repository and add a file inside it.
2. Call `GET /codex-api/review/snapshot?cwd=<temp-dir>&scope=workspace&workspaceView=unstaged`.
3. Confirm the response reports `isGitRepo: false`.
4. Call `POST /codex-api/review/git/init` with the same `cwd`.
5. Call `GET /codex-api/review/snapshot?cwd=<temp-dir>&scope=workspace&workspaceView=unstaged` again.
6. Confirm the response now reports `isGitRepo: true` and includes the untracked file in `data.files`.
7. Call `POST /codex-api/review/action` with `action: "stage"`, `level: "all"`, `scope: "workspace"`, and `workspaceView: "unstaged"`.
8. Call `GET /codex-api/review/snapshot?cwd=<temp-dir>&scope=workspace&workspaceView=staged` and confirm the staged file appears there.

#### Expected Results
- Review snapshot works for both non-Git and Git directories.
- Git initialization through the React bridge creates a usable repository.
- Review action endpoints can move workspace changes into the staged view.

#### Rollback/Cleanup
- Delete the temporary test directory after verification.

### Feature: codex-ui-react review pane

#### Prerequisites
- The React app stack is running from `/home/chris/repo/codexUI/codex-ui-react`.
- Open a thread whose `cwd` points at a writable project directory.
- The project directory is a Git repository, or you are willing to initialize one from the review pane.

#### Steps
1. Open an existing thread in the React UI and click `Review` in the thread header.
2. Verify the pane opens in place of the conversation and loads the current change snapshot.
3. If the folder is not a Git repository, click `Initialize Git` and confirm the pane reloads.
4. Make at least one workspace change in the thread's `cwd`, then use the pane to inspect the changed file and its hunks.
5. In `Workspace` mode, use a file or hunk action such as `Stage hunk`, `Stage file`, or `Revert hunk`.
6. Switch between `Unstaged` and `Staged` and confirm the change moves between the two views.
7. Click `Run review`, wait for the review turn to complete, then switch to the `Findings` tab.
8. Confirm the findings summary and any structured findings from the completed review are shown.

#### Expected Results
- The React thread view can toggle into a dedicated review pane.
- The pane shows Git snapshots, file/hunk diffs, and applies workspace actions through the React bridge.
- Running review sends a `review/start` request and later displays the thread's review findings.
- The review pane is code-split and only loaded when needed.

#### Rollback/Cleanup
- Revert or delete any temporary changes created only for review verification.
- Close the review pane to return to the normal conversation view.

### Feature: codex-ui-react API request logging

#### Prerequisites
- The React app server is running from `/home/chris/repo/codexUI/codex-ui-react`.
- Server stdout is visible in the terminal running `bun run server`.

#### Steps
1. Trigger at least one REST request under `/codex-api`, such as `GET /codex-api/review/snapshot` or `POST /codex-api/rpc`.
2. Watch the React app server logs after the request completes.

#### Expected Results
- The server prints a structured `[codex-api]` log entry for each completed `/codex-api` request.
- Each log entry includes the request method, original path, HTTP status, and request duration in milliseconds.

#### Rollback/Cleanup
- No cleanup is required beyond stopping the server if it was started only for verification.

### Feature: codex-ui-react rich message rendering

#### Prerequisites
- The React app stack is running from `/home/chris/repo/codexUI/codex-ui-react`.
- An existing thread is available for sending a new message.

#### Steps
1. Send a message that contains mixed formatting, for example:
   `hello **bold** \`code\` https://example.com`
2. Send or receive a message that contains a fenced code block with a language hint, for example:
   ````
   ```ts
   console.log('hi')
   ```
   ````
3. Send or receive a message with markdown headings or bullet list lines.
4. Open the thread in the React UI and inspect the rendered assistant and user message cards.

#### Expected Results
- Inline `**bold**` text is rendered in bold.
- Inline backtick code is rendered as inline code.
- HTTP/HTTPS links are rendered as clickable links.
- Triple-backtick code fences render as a distinct code block with the optional language label.
- Simple markdown headings and bullet lists render with structure instead of a single plain pre-wrapped blob.

#### Rollback/Cleanup
- No cleanup is required beyond removing any temporary test messages if they were created only for verification.

### Feature: codex-ui-react empty new thread selection fallback

#### Prerequisites
- The React app stack is running from `/home/chris/repo/codexUI/codex-ui-react`.
- The React UI can create a new thread without sending an initial user message.

#### Steps
1. Open the `New Thread` dialog in the React UI.
2. Create a new thread in a valid folder but leave the initial message empty.
3. Confirm the new thread becomes selected immediately after creation.
4. Check the browser console and confirm it does not leave the thread unselected after a `thread/read` materialization error.
5. Send the first user message in that thread.
6. Confirm the conversation loads normally after the first message is sent.

#### Expected Results
- A newly created empty thread remains selected even if `thread/read` with `includeTurns: true` reports that the thread is not materialized yet.
- The UI falls back to the thread shell from `thread/list` instead of clearing the selected thread.
- Once the first user message is sent, the thread detail loads with turns as normal.

#### Additional RPC Check
1. Create a new empty thread and capture its thread id.
2. Call `POST /codex-api/rpc` with method `thread/read` and params `{ "threadId": "<id>", "includeTurns": true }`.
3. Confirm the React standalone bridge responds with HTTP `200` and an empty thread shell instead of exposing the raw materialization `500` to the browser.

#### Rollback/Cleanup
- Delete the temporary test thread if it was created only for verification.

### Feature: codex-ui-react Skills Hub payload normalization

#### Prerequisites
- The React app stack is running from `/home/chris/repo/codexUI/codex-ui-react`.
- `skills/list` may return upstream-style grouped entries with nested `skills` arrays.

#### Steps
1. Navigate to the Skills Hub route in the React UI.
2. Confirm the page loads without throwing `Cannot read properties of undefined (reading 'toLowerCase')`.
3. Verify installed skills from a nested `skills/list` payload appear as flat cards in the grid.
4. Enter a search query and confirm filtering works for both skill names and descriptions.
5. Confirm malformed or nameless skill rows are ignored instead of crashing the page.

#### Expected Results
- The React Skills Hub no longer crashes when `skills/list` returns grouped entries instead of flat rows.
- The gateway flattens nested skill payloads into stable React `SkillInfo` items.
- Missing or malformed skills are skipped safely.

#### Rollback/Cleanup
- No cleanup is required beyond leaving the Skills Hub route.

### Feature: codex-ui-react Skills Hub installed badge layout

#### Prerequisites
- The React app stack is running from `/home/chris/repo/codexUI/codex-ui-react`.
- At least one installed skill with a long title is visible in the Skills Hub grid.

#### Steps
1. Navigate to the Skills Hub route in the React UI.
2. Find an installed skill card with a long name.
3. Verify the `Installed` badge remains inside the card border at normal desktop width.
4. Narrow the window or use a tighter column layout and verify the badge still stays inside the card.

#### Expected Results
- The installed badge does not overflow past the right edge of the skill card.
- Long skill titles wrap within the card instead of pushing the badge outside the border.

#### Rollback/Cleanup
- No cleanup is required beyond leaving the Skills Hub route.

#### Prerequisites
- `pnpm` is installed globally (`npm i -g pnpm` or via corepack).
- Repository is cloned and `node_modules/` does not exist (or may be stale).

#### Steps
1. Remove `node_modules/` if present: `rm -rf node_modules`.
2. Run `pnpm run dev`.
3. Wait for Vite dev server to start and display the local URL.
4. Open the displayed URL in a browser.

#### Expected Results
- `pnpm install` runs automatically before Vite starts (dependencies are installed).
- Vite dev server starts successfully and serves the app.
- No `npm` commands are invoked.

#### Rollback/Cleanup
- None.

### Feature: Stop button interrupts active turn without missing turnId

#### Prerequisites
- App is running from this repository.
- At least one thread can run a long response (for example, request a large code explanation).

#### Steps
1. Send a prompt that keeps the assistant generating for several seconds.
2. Immediately click the `Stop` button before the first assistant chunk fully completes.
3. Confirm generation halts.
4. Repeat with a resumed/existing in-progress thread (reload app while a turn is running, then click `Stop`).

#### Expected Results
- No error appears saying `turn/interrupt requires turnId`.
- Turn is interrupted successfully in both immediate-stop and resumed-thread scenarios.
- Thread state exits in-progress and the stop control returns to idle.

#### Rollback/Cleanup
- None.

### Feature: Revert PR #16 mobile viewport and chat scroll behavior changes

#### Prerequisites
- App is running from this repository.
- A thread exists with enough messages to scroll.
- Test on a mobile-sized viewport (for example 375x812).

#### Steps
1. Open an existing thread and scroll up to the middle of the chat history.
2. Wait for an assistant response to stream while staying at the same scroll position.
3. Send a follow-up message and observe chat positioning when completion finishes.
4. Open the composer on mobile and drag within the composer area.
5. Open/close the on-screen keyboard on mobile and verify the page layout remains usable.

#### Expected Results
- Chat behavior matches pre-PR #16 baseline (no PR #16 scroll-preservation logic active).
- No regressions from reverting PR #16 changes in conversation rendering and composer behavior.
- Mobile layout no longer includes PR #16 visual-viewport sync changes.

#### Rollback/Cleanup
- Re-apply PR #16 commits if the reverted behavior is not desired.

### Feature: Thread load capped to latest 10 turns

#### Prerequisites
- App is running from this repository.
- At least one thread exists with more than 10 turns/messages.

#### Steps
1. Open a long thread that previously caused UI lag during initial load.
2. While the thread is loading, immediately click another thread in the sidebar.
3. Return to the long thread.
4. Count visible loaded history blocks and confirm only the newest portion is shown.
5. Call `/codex-api/rpc` with method `thread/read` for the same thread and inspect `result.thread.turns.length`.
6. Call `/codex-api/rpc` with method `thread/resume` for the same thread and inspect `result.thread.turns.length`.

#### Expected Results
- Initial thread load renders only the most recent 10 turns.
- UI remains responsive during thread load.
- You can switch to another thread without the UI freezing.
- `thread/read` and `thread/resume` RPC responses contain at most 10 turns.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Skills list request scoped to active thread cwd

#### Prerequisites
- App is running from this repository.
- Browser DevTools Network tab is open.
- At least two threads exist with different `cwd` values.

#### Steps
1. Reload the app and wait for initial data load.
2. In Network tab, inspect `/codex-api/rpc` requests with method `skills/list`.
3. Verify request params contain `cwds` with only the currently selected thread cwd.
4. Switch to another thread with a different cwd.
5. Inspect the next `skills/list` request and verify `cwds` now contains only the new selected thread cwd.

#### Expected Results
- `skills/list` no longer sends every thread cwd in one request.
- Each `skills/list` call includes at most one cwd for the active thread context.
- Skills list still updates when changing selected thread.

#### Rollback/Cleanup
- No cleanup required.

---

### Feature: GitHub Website Redesign — OpenClaw-Inspired Design + Web Demo Link

#### Prerequisites
- The `docs/index.html` file has been updated with the new design.
- A browser is available to view the page locally or via GitHub Pages.

#### Steps
1. Open `docs/index.html` in a browser (local file or via GitHub Pages).
2. Verify the fixed **navigation bar** at top with brand logo, section links, and "Get the App" CTA.
3. Verify the **announcement banner** below nav shows the XCodex WASM link.
4. Verify **hero section** displays lobster emoji, "AnyClaw" title with gradient, tagline, and four CTA buttons: "Try Web Demo", "Google Play", "Download APK", "GitHub".
5. Click **"Try Web Demo"** button — confirm it navigates to `https://xcodex.slrv.md/#/`.
6. Verify the **stats bar** shows key metrics (2 AI Agents, 1 APK, 0 Root Required, 73MB, infinity).
7. Scroll to **Live Demo** section — verify embedded iframe loads `https://xcodex.slrv.md/#/` with mock browser chrome.
8. Scroll to **Screenshots** section — verify four images render (2 desktop, 2 mobile).
9. Scroll to **Features** section — verify 6 feature cards in a 3-column grid.
10. Scroll to **Testimonials** section — verify two rows of auto-scrolling marquee cards (row 2 scrolls reverse). Hover to pause.
11. Scroll through **Architecture**, **Boot Sequence**, **Quick Start**, and **Tech Stack** sections — verify content renders.
12. Verify the **footer** includes a "Web Demo" link to `https://xcodex.slrv.md/#/`.
13. Test responsive at 768px and 480px — nav links collapse, grids single-column, buttons stack vertically.

#### Expected Results
- Page has a dark, premium feel with gradient accents, grain overlay, and smooth animations.
- All links to `https://xcodex.slrv.md/#/` work (announcement, hero CTA, demo section, quick start text, footer).
- Marquee testimonials scroll continuously and pause on hover.
- Embedded iframe demo loads successfully.
- Mobile responsive layout works at all breakpoints.

#### Rollback/Cleanup
- Revert `docs/index.html` to previous commit if needed.

### Feature: Keep manual chat scroll position during streaming

#### Prerequisites
- App is running from this repository.
- A thread exists with enough history to allow scrolling away from bottom.

#### Steps
1. Open the thread and scroll upward so latest messages are not visible.
2. Send a new message that produces a streaming assistant response.
3. During streaming, do not scroll and observe viewport position.
4. After streaming completes, verify the viewport remains at the same manual position.

#### Expected Results
- Streaming updates do not force auto-scroll to the bottom when user has manually scrolled away.
- User can continue reading older history while the response streams.
- If the thread is already at the bottom when streaming starts, the latest streaming overlay remains visible.

#### Rollback/Cleanup
- Revert the scroll-preservation change in `src/components/content/ThreadConversation.vue` if manual scroll locking needs to be removed.

### Feature: Rollback API/UI no longer requires turn index in rollback payload

#### Prerequisites
- App is running from this repository.
- A thread exists with at least 2 completed turns.
- Rollback control is visible in the thread conversation message actions.

#### Steps
1. Open any existing thread with multiple turns.
2. In DevTools Network tab, keep `/codex-api/rpc` requests visible.
3. Click rollback on a user or assistant message that is not the newest one.
4. Confirm rollback succeeds and the thread is truncated to the selected turn.
5. Inspect the UI event flow by repeating rollback from a different turn and confirm the selected message can rollback without relying on a numeric turn index.
6. Use dictation resend flow (or "rollback latest user turn" flow) and confirm the latest user turn is rolled back correctly.

#### Expected Results
- Rollback works when triggered from message actions using `turnId` as the identifier.
- No UI path depends on `turnIndex` in rollback event payloads.
- Latest-user-turn rollback flow still works and targets the latest user `turnId`.
- No TypeScript/runtime errors are introduced in rollback interaction.

#### Rollback/Cleanup
- Revert the updated files if this behavior is not desired:
  - `src/types/codex.ts`
  - `src/api/normalizers/v2.ts`
  - `src/components/content/ThreadConversation.vue`
  - `src/App.vue`
  - `src/composables/useDesktopState.ts`

### Feature: Rollback init commit includes `.codex/.gitignore`

#### Prerequisites
- App server is running from this repository.
- Use a fresh temporary project directory with no existing `.codex/rollbacks/.git` history.

#### Steps
1. In a fresh test project folder, trigger rollback automation init by calling `/codex-api/worktree/auto-commit` with a valid commit message.
2. Verify rollback repo exists at `.codex/rollbacks/.git`.
3. In that rollback repo, run `git --git-dir .codex/rollbacks/.git --work-tree . show --name-only --pretty=format: HEAD`.
4. Confirm `.codex/.gitignore` appears in the file list for the init commit.
5. Open `.codex/.gitignore` and verify `rollbacks/` exists.

#### Expected Results
- First rollback-history commit is `Initialize rollback history`.
- That commit includes `.codex/.gitignore`.
- `.codex/.gitignore` contains `rollbacks/`.

#### Rollback/Cleanup
- Remove the temporary test folder after verification.

### Feature: Deterministic rollback commit + exact lookup with debug logs

#### Prerequisites
- App server is running from this repository.
- `worktree git automation` is enabled in UI settings.
- Test thread available where you can send at least 3 user turns.

#### Steps
1. Send a user turn that changes files and completes.
2. Send a user turn that produces no file edits and completes.
3. Send a third user turn and complete it.
4. In rollback git history (`.codex/rollbacks/.git`), verify each completed turn created a commit, including the no-edit turn.
5. Inspect one rollback commit body and confirm it contains the user message text plus `Rollback-User-Message-SHA256: <hash>`.
6. Trigger rollback to the second turn message via UI rollback action.
7. Verify server logs contain `[rollback-debug]` entries for lookup, stash (if dirty), reset, and completion.
8. Temporarily test missing-commit path by calling `/codex-api/worktree/rollback-to-message` with a non-existent message text.

#### Expected Results
- Auto-commit creates a rollback commit for every completed turn (`--allow-empty` behavior).
- Commit body includes the user message and stable hash trailer.
- Rollback uses exact hash-based commit lookup only.
- If exact commit is missing, rollback returns error and does not continue.
- Server logs include `[rollback-debug]` records for commit creation, lookup, stash, reset, and error paths.
- Browser console includes `[rollback-debug]` client-side start/success/error logs for auto-commit and rollback API calls.
- Rollback init no longer fails when `.codex` is ignored globally; init force-adds `.codex/.gitignore`.

#### Rollback/Cleanup
- Revert the changed files if you want previous non-deterministic behavior back.

### Feature: Per-turn changed files panel with lazy diff loading

#### Prerequisites
- App server running from this repository.
- Worktree git automation enabled.
- A thread with at least one completed turn that touched files.

#### Steps
1. Open a thread and locate a `Worked for ...` separator message.
2. Expand the worked separator.
3. Verify a changed-files panel appears above command details.
4. Confirm file list entries show file path and `+/-` counts.
5. Click one changed file row to expand it.
6. Verify diff content loads only after expansion (lazy load behavior).
7. Collapse and re-expand the same file row; verify diff reuses loaded content.
8. Switch to another thread and back; verify panel reloads for the active thread context.

#### Expected Results
- Each worked message can show changed files for its turn.
- Diff for a file is fetched only on expand, not for all files upfront.
- Errors (missing commit/diff load failure) are shown inline in the panel.
- Existing command output expand/collapse behavior remains unchanged.
- Changed-files panel still resolves after page refresh or app-server restart.
- Changed-files panel appears at the end of the worked message block (after command rows).

#### Rollback/Cleanup
- No cleanup required.

### Feature: Worked separator is non-expandable

#### Prerequisites
- App server running from this repository.
- A thread with at least one `Worked for ...` separator.

#### Steps
1. Open a thread and locate a `Worked for ...` message.
2. Click the separator line/text area.
3. Verify no expand/collapse behavior is triggered on the separator itself.
4. Verify changed-files panel still appears below the separator when data exists.

#### Expected Results
- `Worked for ...` acts as a visual separator only (non-interactive).
- Changed-files and command sections are not gated by a worked-separator expand toggle.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Changed-files lookup fallback when turnId metadata is missing

#### Prerequisites
- App server running from this repository.
- Playwright CLI available.

#### Steps
1. Create/prepare a test workspace (example: `/tmp/rollback-pw`).
2. Call `/codex-api/worktree/auto-commit` with:
   - `cwd=/tmp/rollback-pw`
   - `message='pw-msg-turn-1'`
   - `turnId='turn-real-1'`
3. Call `/codex-api/worktree/message-changes` with:
   - same `cwd`
   - same `message`
   - mismatched `turnId='turn-wrong'`
4. Verify response is still `200` and returns the matching commit data (message-hash fallback).
5. Capture Playwright artifact screenshot.

#### Expected Results
- `message-changes` first attempts turnId lookup.
- If turnId lookup misses, it falls back to exact message-hash lookup.
- API returns commit data instead of `No matching commit found for this user message` when message matches.

#### Rollback/Cleanup
- Remove temporary test workspace if created.

### Feature: Changed-files panel persists across refresh (assistant message level)

#### Prerequisites
- App server running from this repository.
- Existing thread in `TestChat` project with completed assistant messages.
- Worktree rollback auto-commit enabled.

#### Steps
1. Open a `TestChat` thread and confirm assistant message cards render.
2. Verify changed-files panel is shown at the end of assistant messages that have rollback commit data.
3. Hard refresh the page.
4. Re-open the same `TestChat` thread.
5. Verify changed-files panel is still shown for the same assistant message(s).
6. Expand one file diff and verify diff content loads.

#### Expected Results
- Changed-files panel is attached to assistant messages (not transient worked separators).
- Changed-files panel appears only once per turn (on the last assistant message in that turn).
- Changed-files panel is hidden while a turn is still in progress.
- Panels remain available after refresh/restart because lookup is turnId/message-hash based.
- File diff expansion still lazy-loads and displays content.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Rollback debug logs controlled by `.env`

#### Prerequisites
- App server stopped.
- Edit `.env` directly, and use `.env.local` for private local overrides.

#### Steps
1. Set `ROLLBACK_DEBUG=0` and `VITE_ROLLBACK_DEBUG=0` in `.env`.
2. Start app and trigger rollback auto-commit/message-changes flow.
3. Verify `[rollback-debug]` logs are not emitted in terminal/browser console.
4. Set `ROLLBACK_DEBUG=1` and `VITE_ROLLBACK_DEBUG=1` in `.env`.
5. Restart app and trigger the same flow again.
6. Verify `[rollback-debug]` logs appear in terminal/browser console.

#### Expected Results
- Debug logs are disabled when env flags are `0`.
- Debug logs are enabled when env flags are `1`.

#### Rollback/Cleanup
- Restore `.env` values to preferred defaults.

### Feature: React stale thread recovery

#### Prerequisites
- React Codex UI app running with `/codex-api/rpc` available.
- Browser storage contains a previously selected thread ID that no longer has a resumable rollout.

#### Steps
1. Open the React app with DevTools Console and Network tabs visible.
2. Let the app load with the stale thread still selected from storage.
3. Observe the initial `thread/read` request for that thread fail.
4. Observe one follow-up `thread/resume` request for the same thread.
5. Wait for the next polling interval after the failed resume.

#### Expected Results
- The app clears the invalid selected thread after the failed resume.
- The conversation view falls back to having no active thread selected for that stale ID.
- The console may show a single warning for the stale thread, but it does not continue logging repeated 500 errors every poll cycle.
- Subsequent polling refreshes thread groups without reissuing `thread/read` or `thread/resume` for the stale thread ID.

#### Rollback/Cleanup
- Select a valid thread again, or clear the app's stored selected-thread key in browser storage.

### Feature: React refresh resumes thread without console noise

#### Prerequisites
- React Codex UI app running at `http://localhost:5173`.
- An existing thread route is open directly at `/thread/<id>`.
- The backend process has been restarted or the thread is not loaded in memory yet.

#### Steps
1. Open DevTools Console and Network tabs.
2. Load or refresh the direct thread URL once.
3. Inspect the first `/codex-api/rpc` requests issued during page load.
4. Confirm the page finishes loading the thread conversation.

#### Expected Results
- The app resumes the thread before the first detail fetch instead of probing with a failing `thread/read`.
- Refresh does not emit a `500` for the normal unloaded-thread case.
- React Router does not log the `v7_relativeSplatPath` future-flag warning on startup.
- The thread conversation renders normally after refresh.

#### Rollback/Cleanup
- No cleanup required.

### Feature: New thread creation navigates to the created thread

#### Prerequisites
- React Codex UI app running at `http://localhost:5173`.
- Local app-server bridge available so `thread/start` and `thread/read` succeed.

#### Steps
1. Open the app root page.
2. Click `New Thread`.
3. Enter a unique folder name.
4. Optionally enter an initial message.
5. Click `Create Thread`.

#### Expected Results
- The modal closes after successful creation.
- The app navigates to `/thread/<new-thread-id>` automatically.
- The created thread is selected in the sidebar.
- The thread conversation view loads without showing `Thread not found`.

#### Rollback/Cleanup
- Archive or remove the temporary thread if it is no longer needed.

### Feature: Initial load avoids expected startup RPC 500s

#### Prerequisites
- React Codex UI app running at `http://localhost:5173`.
- Browser DevTools Network and Console tabs open.

#### Steps
1. Open the app root page.
2. Let the initial page load settle without opening settings or account-specific UI.
3. Inspect startup `/codex-api/rpc` requests.
4. Inspect the console for startup RPC errors.

#### Expected Results
- Startup does not issue `skills/list` with `params: null`.
- Startup does not issue `account/rateLimits/read` automatically.
- The console does not show expected startup 500s from those two RPCs.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Composer focus survives background thread refresh

#### Prerequisites
- React Codex UI app running at `http://localhost:5173`.
- An existing thread route open in the conversation view.

#### Steps
1. Click into the composer textarea.
2. Type a partial message but do not submit it.
3. Wait longer than one polling interval (at least 6 seconds).
4. Continue typing in the same textarea.

#### Expected Results
- The composer stays focused while the background refresh runs.
- The partially typed message remains in the textarea.
- The textarea is not temporarily disabled just because thread messages refreshed.

#### Rollback/Cleanup
- Clear the draft message if it was only for verification.

### Feature: Notification WebSocket uses same-origin proxied path

#### Prerequisites
- React Codex UI app running at `http://localhost:5173`.
- Vite proxy enabled for `/codex-api` with WebSocket forwarding.
- Browser DevTools Console open.

#### Steps
1. Open the app root page.
2. Let startup settle.
3. Inspect console messages and network entries for the notification socket.

#### Expected Results
- The app connects to `ws://localhost:5173/codex-api/ws` rather than hard-coding port `3000`.
- The browser console does not show the previous `ws://localhost:3000/codex-api/ws` warning on startup.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Composer model reflects active configured provider

#### Prerequisites
- React Codex UI app running at `http://localhost:5173`.
- Backend config has a non-default current model such as `kimi-for-coding`.

#### Steps
1. Open the app and wait for startup to settle.
2. Open a thread and expand `Options` in the composer.
3. Inspect the model dropdown value and available options.
4. Create a new thread and confirm it inherits the shown model.

#### Expected Results
- The selected model initializes from backend `config/read`, not a hard-coded `gpt-4o` fallback.
- If the configured model is absent from `model/list`, it still appears in the dropdown as the selected model.
- New threads use the configured model shown in the UI.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Kimi proxy accepts message sends with Codex tool definitions

#### Prerequisites
- React Codex UI app running at `http://localhost:5173`.
- Backend config uses the Kimi proxy via `openai_base_url = http://localhost:3456/v1`.
- A thread is open with `kimi-for-coding` selected in the composer options.

#### Steps
1. Open an existing thread or create a new one.
2. Type a simple message such as `Reply with one short sentence.` into the composer.
3. Submit the message once.
4. Inspect the browser console and network entries for `/codex-api/rpc`.

#### Expected Results
- The send action does not fail immediately with `Failed to send message`.
- The Kimi proxy does not return the previous `function name is invalid` error.
- The thread enters an in-progress state and then completes or streams normally.

#### Rollback/Cleanup
- Archive or ignore the verification thread if it was created only for testing.

### Feature: Thread sync is event-driven instead of constant polling

#### Prerequisites
- React Codex UI app running at `http://localhost:5173`.
- Browser DevTools Network tab open and filtered to `/codex-api/rpc`.

#### Steps
1. Open the app and let the initial load settle.
2. Stay on the page for at least 15 seconds without changing focus.
3. Confirm no repeating 5-second `thread/list` and `thread/read` cycle appears.
4. Switch to another browser tab or window, then return to the app.
5. Start or complete a turn in an open thread and observe subsequent RPC traffic.

#### Expected Results
- After the initial load, the app does not issue constant background polling every 5 seconds.
- Returning focus to the app triggers a one-time refresh instead of restarting a timer loop.
- Notification-driven events such as turn start or completion trigger targeted refreshes for thread state.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Sending a message resumes an unloaded thread before turn start

#### Prerequisites
- React Codex UI app running at `http://localhost:5173`.
- A previously created thread exists but is not currently loaded in the backend process.
- The thread still has a resumable rollout.

#### Steps
1. Open the thread route directly.
2. Wait for the thread view to load or resume.
3. Type a message into the composer and submit it once.
4. Inspect the console and `/codex-api/rpc` network entries if needed.

#### Expected Results
- The send action does not fail immediately with `thread not found` or `thread not loaded`.
- If the backend needs to reload the thread first, the app issues a single `thread/resume` and then retries `turn/start`.
- The thread enters the normal in-progress state after the retry succeeds.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Composer waits for thread detail before first send

#### Prerequisites
- React Codex UI app running at `http://localhost:5173`.
- A thread exists in the sidebar and can be opened directly from the thread route.

#### Steps
1. Open the thread route.
2. As soon as the thread shell appears, immediately type and submit a message before prior messages finish loading.
3. Inspect the network entries for `/codex-api/rpc` and the visible send behavior.

#### Expected Results
- The app loads thread detail first if it has not already been loaded into local message state.
- The first send does not fail just because the thread summary rendered before the backend thread finished loading.
- The user does not see an immediate `Failed to send message` caused by a race between route selection and the first submit.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Kimi proxy normalizes unsupported Responses roles

#### Prerequisites
- React Codex UI app running at `http://localhost:5173`.
- Backend config uses the Kimi proxy via `openai_base_url = http://localhost:3456/v1`.

#### Steps
1. Open a thread and submit a normal composer message.
2. If available, exercise a flow that includes system or developer-style instructions in the upstream request.
3. Inspect proxy-backed send behavior and any related server logs.

#### Expected Results
- The Kimi proxy does not forward unsupported or empty chat roles.
- Inputs using Responses-style `developer` role are normalized to a Kimi-supported role.
- The proxy no longer returns `invalid request: unsupported role ROLE_UNSPECIFIED`.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Kimi streaming emits response item lifecycle events

#### Prerequisites
- React Codex UI app running at `http://localhost:5173`.
- Backend config uses the Kimi proxy via `openai_base_url = http://localhost:3456/v1`.
- Browser console or backend logs are available for inspection.

#### Steps
1. Open a thread and submit a simple message.
2. Wait for the assistant response to stream or complete.
3. Inspect backend logs if needed for raw response parsing errors.

#### Expected Results
- The app-server does not log `OutputTextDelta without active item`.
- Assistant text streams or completes into a normal message item.
- The thread ends with an assistant message instead of an empty completed turn.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Azure OpenAI upstream runs through the local Responses proxy

#### Prerequisites
- `AZURE_OPENAI_API_KEY` and `AZURE_OPENAI_ENDPOINT` are present in `codex-ui-react/.env`.
- `codex-ui-react/.codex/config.toml` uses `model = "gpt-4o"` and `openai_base_url = "http://localhost:3456/v1"`.
- React Codex UI stack is restarted after the env and config change.

#### Steps
1. Start the local React Codex UI stack.
2. Call `config/read` or open the UI and inspect the selected model.
3. Create a new thread and send a simple message.
4. Inspect the bridge and app-server logs during the turn.

#### Expected Results
- `config/read` reports the selected model as `gpt-4o`.
- The Codex app-server continues to talk to `http://localhost:3456/v1` instead of trying Azure directly.
- The local proxy routes the `gpt-4o` request to Azure OpenAI upstream.
- The app-server does not log a `401 Unauthorized` websocket error against `wss://...azure.com/openai/v1/responses`.
- The Azure upstream request does not fail with `max_tokens is too large` for `gpt-4o`.

#### Rollback/Cleanup
- Restore the previous `codex-ui-react/.codex/config.toml` values if switching back to a different upstream routing setup.
