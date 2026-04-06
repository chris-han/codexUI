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

---

## Feature: HTML preview card skill guidance

### Prerequisites
- `codex-ui-react/.codex/skills/html-preview-card/SKILL.md` exists
- Start a fresh chat turn or session so skill discovery picks up the new skill
- `codex-ui-react` running if you also want to render the result in the UI

### Steps
1. Ask the assistant for a response such as: `Use curl https://www.google.com and display returned html in a card.`
2. Confirm the assistant chooses the HTML preview-card format instead of returning only plain text or a generic code block.
3. Verify the reply uses either an `:::html-card` / `:::html-preview` wrapper or a fenced `html` block that can render inline in chat.
4. If sent into the React UI thread, confirm the response renders as the existing MDMA HTML preview card.

### Expected Results
- The agent prefers the HTML preview-card format for inline HTML rendering requests.
- Helpful metadata such as `title`, `status`, or `url` is included when relevant.
- The message remains readable as both a preview and copyable HTML source.

### Rollback/Cleanup
- Remove the repo-local skill folder if this guidance is no longer desired.

## Feature: MDMA HTML preview card in chat

### Prerequisites
- `codex-ui-react` running on the local 4173 flow or via `cd codex-ui-react && bun run dev`
- An open thread in the React chat UI

### Steps
1. Ask the assistant to return an HTML preview using either a fenced `html` block or this MDMA-style block:
   ```md
   :::html-card
   title: Google Response
   status: 200 OK
   url: https://www.google.com

   ```html
   <!doctype html><html><head><title>Google</title></head><body><h1>Hello</h1></body></html>
   ```
   :::
   ```
2. Confirm the assistant bubble renders a styled card with an inline preview frame instead of only raw HTML text.
3. Verify the card header shows the provided or inferred title and any metadata chips.
4. Expand `Show HTML source` and confirm the underlying HTML source is still available in a copyable code block.
5. Repeat with a plain fenced `html` block (without the `:::html-card` wrapper) and confirm it still renders as an inline preview card.

### Expected Results
- HTML responses render inside a sandboxed inline preview card in chat.
- MDMA-style metadata such as `title`, `status`, and `url` appear as card header details when provided.
- The HTML source remains accessible behind the `Show HTML source` disclosure.
- Scripts are not executed in the preview.

### Rollback/Cleanup
- Remove the sample test message from the thread if desired.

## Feature: MessageFeedback — thumbs up / down for assistant messages

### Prerequisites
- `codex-ui-react` running (`bun run dev` or the 4173 instance)
- An open thread with at least one completed assistant response

### Steps
1. Open any thread that has a finished assistant message (not a live/streaming one).
2. Scroll to the message action row below the assistant bubble — you should see **thumbs-up** and **thumbs-down** icon buttons next to the existing Rollback / Copy buttons.
3. Click the **thumbs-up** button — it should turn green and a green "Submit" button should appear.
4. Click **Submit** — the row should replace with the text "Thanks for your feedback".
5. Refresh the page and open the same thread; the feedback is NOT expected to re-appear (state is session-local).
6. Open a second assistant message, click **thumbs-down** — it should turn red and a comment textarea should expand below.
7. Type optional feedback text and click **Submit** — row should show "Thanks for your feedback".
8. Click thumbs-down again without submitting, then click **Cancel** — the textarea should collapse and the rating should clear.
9. Click thumbs-up then click it again — it should toggle off (deselect).

### Expected Results
- Thumbs-up and thumbs-down buttons appear below every completed assistant response.
- Positive rating shows green highlight + Submit button.
- Negative rating shows red highlight + comment textarea form.
- After submission, "Thanks for your feedback" text replaces the widget.
- Feedback is persisted in `localStorage` under key `msg-feedback-<messageId>`.

### Rollback/Cleanup
- Remove `MessageFeedback` import and usage from `ThreadConversation.tsx`.
- Delete `codex-ui-react/src/components/content/MessageFeedback.tsx`.

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

### Feature: React attachment prompt uses staged file paths only

#### Prerequisites
- React app is running from this repository.
- A thread is open in the React UI.
- A non-image local file is available to attach.

#### Steps
1. In the React chat composer, attach a non-image file from the file picker.
2. Send a prompt that explicitly asks about the file contents, such as `Read the attached file and summarize it.`
3. Inspect the `turn/start` request payload in the browser devtools network panel or server logs.
4. Confirm the first text input includes an `# Attached files` block with the staged absolute server path and a `# User request` section.
5. Confirm no extra top-level `attachments` field is sent in the `turn/start` request body.

#### Expected Results
- The React frontend uploads the file and stages it on the server before send.
- The outgoing prompt text contains the staged absolute path in the attached-files block.
- The request relies on prompt-visible file paths rather than extra attachment metadata.

#### Rollback/Cleanup
- Remove any staged test upload files if you do not want them left in the server temp upload directory.

### Feature: React Skills Hub marketplace installs local skills

#### Prerequisites
- React app is running from `codex-ui-react/`.
- Codex CLI is available to the React standalone server.
- Python 3 is installed.
- A skill installer script exists under `~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py` or the React app `CODEX_HOME`.

#### Steps
1. Open the React `Skills Hub` screen.
2. Confirm the page shows an installed section and a marketplace list with search and sort controls.
3. Search for a known marketplace skill and open its detail modal.
4. Click `Install` and wait for the action to complete.
5. Confirm the skill moves into the installed section and no longer appears in the marketplace list.
6. Verify the installed skill folder now exists in the local skills directory used by the React standalone server.
7. Re-open the skill detail modal from the installed section and click `Uninstall`.

#### Expected Results
- The React Skills Hub loads marketplace entries from the skills repository.
- Installing a skill writes it into the local skills folder and refreshes the installed skills list.
- Uninstalling removes the local skill folder and refreshes the installed skills list.
- The skill detail modal can show remote or local `SKILL.md` content.
- If install or uninstall fails, the modal shows the returned error message inline instead of only leaving the action in a loading-looking state.
- Installs are written specifically into `codex-ui-react/.codex/skills` and are not redirected to another Codex home discovered from `skills/list`.
- If GitHub marketplace fetches or `skills/list` are slow or unavailable, the page returns promptly with whatever partial skill data is available instead of remaining stuck on `Loading skills…`.

#### Rollback/Cleanup
- Uninstall any test skill you installed during verification.

### Feature: Thinking block stays available after assistant content appears

#### Prerequisites
- React app is running from this repository.
- An active thread is open.
- Use a model/runtime path that streams reasoning summaries before the final answer.

#### Steps
1. Send a prompt that reliably produces visible reasoning plus a normal final answer.
2. While the turn is still streaming and assistant content has started appearing, inspect the `Thinking` panel above the live answer.
3. Wait for the turn to finish.
4. Confirm the final assistant message still includes a `Thinking` panel.
5. Toggle the `Thinking` panel open and closed.

#### Expected Results
- The `Thinking` panel is not removed when assistant content starts streaming.
- After completion, the assistant message still retains the reasoning summary in a collapsed panel.
- The panel can be expanded to inspect the full reasoning summary and collapsed again.

#### Rollback/Cleanup
- None.

### Feature: React thread actions follow Vue sidebar behavior

#### Prerequisites
- React app is running from this repository.
- At least one existing thread is visible in the React sidebar.

#### Steps
1. Open any existing thread in the React UI.
2. Verify the thread header does not show `Review`, fork, or delete/archive buttons.
3. In the sidebar, hover the same thread row and open the `...` thread menu.
4. Click `Rename thread`, enter a new title, and confirm the sidebar row updates.
5. Open the thread menu again and click `Create chat fork`.
6. Confirm the app navigates to the new forked thread.
7. Open the original thread menu again and click `Delete thread`, then confirm the archive prompt.

#### Expected Results
- Thread-level actions are available from the sidebar thread menu instead of the thread header.
- The React thread header no longer exposes the React-only review control.
- Renaming updates the thread title in the sidebar.
- Forking creates and opens a new thread.
- Deleting archives the selected thread after confirmation.

#### Rollback/Cleanup
- Archive any test fork/thread created during verification if it is no longer needed.
- Rename the test thread back to its previous title if needed.
- Delete any temporary fork thread created during the test if it should not be kept.

### Feature: React sidebar folders stay synced with new-thread folder picker

#### Prerequisites
- React app is running from this repository.
- At least one existing folder/thread group is visible in the React sidebar.
- Home/new-thread screen is accessible.

#### Steps
1. Open the home/new-thread screen and open the project folder dropdown.
2. Compare the dropdown folder list against the sidebar folder list.
3. In the sidebar, rename a folder from the `...` menu.
4. Return to the home/new-thread screen and reopen the dropdown.
5. In the dropdown, create a new folder and wait for the modal to close.
6. Verify the new folder appears in both the dropdown and the sidebar.
7. In the sidebar, hide a folder from the `...` menu.
8. Return to the home/new-thread screen and reopen the dropdown.

#### Expected Results
- The sidebar and dropdown show the same folder set in the same order.
- Folder renames from the sidebar are reflected in the dropdown label immediately.
- Creating a folder from the dropdown adds it to the sidebar without a refresh.
- Hiding a folder from the sidebar removes it from both the sidebar and the dropdown.

#### Rollback/Cleanup
- Restore any hidden folder by re-adding/opening it again if needed.
- Delete any temporary test folder created only for verification if it should not remain.

### Feature: React new-thread folder picker stays in sync and can create a folder

#### Prerequisites
- React app is running from this repository.
- Home/new-thread screen is open.
- The server can write to the target parent directory for the new folder.

#### Steps
1. Open the folder picker under `Let's build` and note the listed project folders.
2. Confirm folders already used by existing thread groups are present in the picker.
3. Click `Create new folder`.
4. Enter either a new folder name or an absolute path, then confirm the prompt.
5. Re-open the folder picker.
6. Confirm the newly created folder now appears in the list and is selected.
7. Send a first message from the home screen with that folder selected.
8. Confirm the app opens the new thread and the thread is associated with the created folder.

#### Expected Results
- The home-screen folder picker includes current workspace roots plus folders already represented in the thread tree.
- Creating a folder writes/opens the project root and immediately adds it to the picker.
- The created folder remains selectable for starting a new thread.
- Starting the thread uses the selected folder as the thread cwd.

#### Rollback/Cleanup
- Remove the test folder if it was created only for verification.
- Remove the test thread if it should not be kept.

### Feature: React thread auto-scroll stops after manual scroll

#### Prerequisites
- React app is running from this repository.
- Open a thread with enough messages to make the conversation pane scrollable.
- Use a thread that can stream or receive multiple new assistant updates.

#### Steps
1. Start a new assistant response or open a thread that is actively receiving streamed output.
2. Confirm the conversation view follows new output while the scroll position remains at the bottom.
3. While output is still arriving, manually scroll upward in the conversation pane.
4. Keep the thread streaming and observe the scroll position.
5. Scroll back down near the bottom of the conversation.
6. Let another streamed update arrive.

#### Expected Results
- The conversation auto-scrolls only while the user is near the bottom.
- After the user manually scrolls away from the bottom, new output does not force the view back down.
- Once the user returns near the bottom, auto-scroll resumes for subsequent updates.

#### Rollback/Cleanup
- None.

### Feature: React replaces browser dialogs with app modals

#### Prerequisites
- React app is running from this repository.
- At least one thread and one project group exist in the sidebar.
- Home/new-thread screen is accessible.

#### Steps
1. In the sidebar project menu, choose `Rename` and confirm an in-app modal appears instead of a browser prompt.
2. Save a new project name and confirm the sidebar updates.
3. Open the same project menu and choose `Delete`, then confirm an in-app confirmation modal appears instead of a browser confirm dialog.
4. Cancel once, then reopen and confirm the hide action.
5. In a thread row menu, choose `Rename thread` and confirm an in-app modal appears and saves the new title.
6. In the same thread row menu, choose `Delete thread` and confirm an in-app confirmation modal appears.
7. On the home/new-thread screen, open the folder picker and choose `Create new folder`.
8. Confirm the create-folder flow opens an in-app modal with inline validation/error rendering instead of browser prompt/alert dialogs.

#### Expected Results
- No browser-native `prompt`, `confirm`, or `alert` dialogs appear in these flows.
- Rename and delete/hide actions are handled by React-rendered modal dialogs.
- The create-folder flow uses the same in-app modal pattern and shows errors inline inside the dialog.

#### Rollback/Cleanup
- Restore any renamed project/thread titles if needed.
- Unhide or remove any temporary test data created during verification.

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

### Feature: Skills Hub installed skill avatar fallback

#### Prerequisites
- React app is running from `codex-ui-react/`.
- The `Skills Hub` view shows at least one installed skill from `.curated` or another non-GitHub owner group.

#### Steps
1. Open `Skills Hub` in the React UI.
2. Inspect one or more cards in the `Installed` section.
3. Confirm pseudo-owner skills (for example `.curated`) show a circular fallback avatar instead of a broken image icon or overflowing alt text.
4. Open one of those installed skills and close the detail modal to confirm the card layout remains stable.
5. If a marketplace skill with a normal GitHub owner is visible, confirm its avatar still renders as an image.
6. Type in the search box and verify the `Installed` section remains a stable skill list while the searchable marketplace area continues to show the current source repo label such as `openai/skills`.

#### Expected Results
- Installed skill cards no longer show broken-image placeholders.
- Non-GitHub owner groups render a clean fallback avatar in the card header.
- Valid GitHub-backed skills still display their remote avatar when available.
- The search source label identifies the current marketplace repo, and the installed list is not repurposed as the searchable marketplace list.

#### Rollback/Cleanup
- None.

### Feature: Skills Hub market description parsing from openai/skills SKILL.md (trailing front matter)

#### Prerequisites
- React app server is running.
- Skills Hub is open and a search query returns at least one result from the `openai/skills` market.

#### Steps
1. Open `Skills Hub` and search for a known skill such as `imagegen` or `playwright`.
2. Click on the skill card to open the detail modal.
3. Confirm the description field is populated (not blank).
4. Confirm the skill card avatar shows the `openai` org icon (GitHub avatar for `openai` user) instead of a broken image or letter fallback.

#### Expected Results
- Description is non-empty; it should come from the YAML `description:` field in the SKILL.md trailing front matter.
- Skill cards from the `openai/skills` market display the `openai` GitHub org avatar (since `.curated` is a bucket path, not a GitHub username; the code now falls back to the market repo owner's avatar).

#### Rollback/Cleanup
- None.

### Feature: Skills Hub openai/skills entries visible in search results

#### Prerequisites
- React app server is running on port 4173.
- Skills Hub is open and both `openai/skills` and `openclaw/skills` markets are active.

#### Steps
1. Open `Skills Hub` in the React UI.
2. The default tab should show `openai/skills`.
3. Confirm that skill cards from `openai/skills` (e.g. `aspnet-core`, `chatgpt-apps`, `cloudflare-deploy`) appear in the list — at least 30 cards should be visible.
4. Confirm each card has a non-empty description text (visible on the card or in the detail modal).
5. Switch to the `openclaw/skills` tab and confirm openclaw entries appear.
6. Switch back to `openai/skills` — entries should still appear.

#### Expected Results
- openai/skills entries appear at the top of the result list (they sort before community entries regardless of date).
- Descriptions are populated from the unquoted YAML `description:` field in each SKILL.md file.
- No "No skills from openai/skills" placeholder is shown.

#### Rollback/Cleanup
- None.

### Feature: pnpm dev script installs dependencies and starts Vite

### Feature: Kimi OpenAI-compatible models exposed in React dropdown

#### Prerequisites
- `codex-ui-react` dev stack is running and reachable at `http://127.0.0.1:5173`.
- The local Kimi OpenAI-compatible proxy is running on `http://127.0.0.1:3456/v1`.
- A valid Kimi API key is configured for the proxy.

#### Steps
1. Request `GET http://127.0.0.1:3456/v1/models` and confirm the response includes `kimi-k2.5`, `kimi-k2-thinking`, `kimi-k2`, and `kimi-for-coding`.
2. Open the React app and load any thread with the composer visible.
3. Click `Options` in the composer toolbar to reveal the model selector.
4. Open the model dropdown and confirm it includes `kimi-k2.5`, `kimi-k2-thinking`, `kimi-k2`, and `kimi-for-coding`.
5. Start a direct WebSocket `/v1/responses` request against the local proxy using `model: "kimi-k2.5"` and `stream: true`.
6. Confirm the stream emits `response.reasoning_summary_*` events before `response.output_text.delta`.

#### Expected Results
- The model dropdown includes the Kimi OpenAI-compatible models exposed by the local proxy.
- The local proxy exposes the same Kimi model ids from `/v1/models`.
- A direct `kimi-k2.5` streaming request returns reasoning-summary events before normal text deltas.

#### Rollback/Cleanup
- Switch the model selector back to the previous model if needed.

### Feature: Kimi upstream requests identify as Roo Code

#### Prerequisites
- `codex-ui-react` proxy code is available locally.
- Kimi upstream requests are routed through [kimiProxy.ts](/home/chris/repo/codexUI/codex-ui-react/server/kimiProxy.ts).

#### Steps
1. Open [kimiProxy.ts](/home/chris/repo/codexUI/codex-ui-react/server/kimiProxy.ts) and locate the Kimi upstream header construction in `buildUpstreamTarget`.
2. Confirm the Kimi request headers include `Authorization`, `User-Agent`, and `X-Client-Name`.
3. Verify `User-Agent` is set to `RooCode/1.0.0`.
4. Verify `X-Client-Name` is set to `roo-code`.

#### Expected Results
- All upstream Kimi Code chat-completions requests include Roo Code identification headers.
- The Roo Code identification values are centralized and not duplicated as ad hoc string literals.

#### Rollback/Cleanup
- Revert the header constants only if Kimi upstream integration requirements change.

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

### Feature: codex-ui-react assistant output streams incrementally during turn execution

#### Prerequisites
- The React app stack is running from `/home/chris/repo/codexUI/codex-ui-react`.
- `KIMI_API_KEY` is configured so `server/kimiProxy.ts` can reach the upstream API.
- A thread can be created or selected in the UI.

#### Steps
1. Send a prompt that takes long enough to stream multiple chunks, for example: `Explain how HTTP chunked transfer works in 8 short bullets, thinking step by step first.`
2. Watch the conversation immediately after submit instead of waiting for the turn to finish.
3. Confirm the assistant bubble text grows over time while the turn is still marked in progress.
4. If the selected model exposes reasoning text, confirm the `Thinking` panel also updates before the final answer completes.
5. After the turn finishes, refresh the thread and confirm the final assistant message still matches the completed streamed content.

#### Expected Results
- Assistant text appears incrementally during the turn instead of rendering only once at completion.
- The typing/thinking indicators are visible while streaming is active.
- Final persisted message content matches what was streamed live.

#### Rollback/Cleanup
- No cleanup is required beyond deleting the test thread if it was created only for verification.

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

### Feature: React settings page scrolls with long content

#### Prerequisites
- The React app is running from `/home/chris/repo/codexUI/codex-ui-react`.
- Open the `Settings` page in the app.
- Use a window height small enough that the full settings page cannot fit on screen.

#### Steps
1. Navigate to `/settings` in the React UI.
2. Confirm the top of the page shows the settings header and the first settings cards.
3. Scroll downward using the mouse wheel, trackpad, or keyboard.
4. Continue until the lower sections such as sandbox mode and marketplace settings are visible.
5. Scroll back to the top.

#### Expected Results
- The settings content area scrolls vertically inside the main content pane.
- The header stays visible while the settings sections move underneath it.
- Lower settings sections remain reachable on smaller screens and shorter browser windows.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Sandbox mode cards contain the user-files override path controls

#### Prerequisites
- The React app is running from `/home/chris/repo/codexUI/codex-ui-react`.
- Open the `Settings` page in the app.

#### Steps
1. Navigate to `/settings` in the React UI.
2. Scroll to the `Agent Sandbox Mode` section.
3. Confirm the standalone `User Files Directory` section is no longer shown.
4. Inspect the `Workspace Write` card and verify it includes `Active path`, `Default`, and `Override path` controls.
5. Inspect the `Full Access` card and verify it includes the same path controls.
6. Change the override path from either card and save it.

#### Expected Results
- There is no separate `User Files Directory` section in settings.
- Each sandbox mode card includes its own `Override path` input and browse/save controls.
- Saving the path from either card updates the shared configured user-files path correctly.

#### Rollback/Cleanup
- Restore the previous user-files override path if it was changed only for testing.

### Feature: Agent default file writes honor configured User Files Directory

#### Prerequisites
- The React app and app-server are running from `/home/chris/repo/codexUI/codex-ui-react`.
- A `User Files Directory` override is configured in `Settings`.
- Start a new thread after saving the setting.

#### Steps
1. Open `Settings` and set a distinctive `User Files Directory` path.
2. Start a brand-new thread.
3. Ask the agent to create a simple file such as `test_file.txt` without specifying any explicit folder.
4. Continue the same thread with another generic file-create request to confirm the reminder still applies on later turns.
5. Inspect the created file paths reported by the agent.

#### Expected Results
- The agent uses the configured `User Files Directory` as the default output location for generic created files.
- The same rule still applies on later turns in the same thread, not only on the first turn after thread creation.
- If the user does **not** mention a file path explicitly, the configured directory is treated as the thread fallback path via system context.
- More generally, the thread falls back to the saved Settings-page values (sandbox mode, user-files path, skills directory/marketplace defaults) unless the user explicitly overrides them in chat.
- If asked about the configured/default file path, the agent should identify the configured `User Files Directory`, not the thread `cwd`.
- If the user asks to create `test.js` or another generic file without a path, the agent should use an absolute path under the configured `User Files Directory`, not a bare relative filename.
- It does not default to the workspace cwd unless the task is explicitly about editing repo files.

#### Rollback/Cleanup
- Delete the test file and restore the previous override path if needed.

### Feature: `bun run dev` restarts both local servers and logs the restart flow

#### Prerequisites
- The React app project exists at `/home/chris/repo/codexUI/codex-ui-react`.
- `bun` dependencies are installed.
- Optional: an older proxy/app-server/Vite instance is already running.

#### Steps
1. From `/home/chris/repo/codexUI/codex-ui-react`, run `bun run dev`.
2. Watch the terminal output before the services start.
3. Confirm the script logs restart messages for the proxy, app-server, and Vite ports.
4. If prior instances were running, confirm they are terminated and replaced by the new run.

#### Expected Results
- `bun run dev` always attempts a clean restart before launching the stack.
- The terminal prints restart status messages such as `Restarting proxy`, `Restarting app-server`, and `Starting proxy, app-server, and Vite`.
- The new proxy, app-server, and Vite processes start from the same command run.

#### Rollback/Cleanup
- Stop the dev stack with `Ctrl+C` if it was started only for verification.

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

### Feature: RPC bridge includes params for no-arg methods

#### Prerequisites
- React Codex UI dev server is running so `http://localhost:3000/codex-api/rpc` is reachable.
- The bundled backend bridge is connected to the Codex app-server.

#### Steps
1. Open a terminal in the repo root.
2. Run `curl -s -X POST http://localhost:3000/codex-api/rpc -H 'Content-Type: application/json' -d '{"method":"model/list"}'`.
3. Run `curl -s -X POST http://localhost:3000/codex-api/rpc -H 'Content-Type: application/json' -d '{"method":"model/list","params":{}}'`.
4. Compare the two responses.

#### Expected Results
- The backend bridge forwards both requests without returning `missing field params`.
- Neither request returns HTTP 500 because `params` is always included in the JSON-RPC payload sent to the app-server.
- The response body contains a normal RPC `result` envelope for both commands.

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
- Bridge server sends the JSON-RPC `initialized` notification after `initialize`.
- Browser DevTools Console and Network tabs open.

#### Steps
1. Open the app root page.
2. Let startup settle.
3. Inspect console messages and network entries for the notification socket.
4. If WebSocket is intentionally blocked, verify the fallback event stream request path.

#### Expected Results
- The app connects to `ws://localhost:5173/codex-api/ws` rather than hard-coding port `3000`.
- The browser console does not show the previous `ws://localhost:3000/codex-api/ws` warning on startup.
- The SSE fallback also stays on the app origin as `/codex-api/events`.
- Live `/v1/responses` WebSocket requests that send top-level `input: [{ type: "text", text: ... }]` are translated into an upstream user message instead of an empty chat body.

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

### Feature: Route thread shell keeps live Kimi deltas visible before thread hydration

#### Prerequisites
- React Codex UI app running at `http://127.0.0.1:5173`.
- Backend config uses the Kimi proxy via `openai_base_url = http://127.0.0.1:3456/v1`.
- The selected model is `kimi-k2.5` or `kimi-k2-thinking`.

#### Steps
1. Create a new thread and navigate to its `/thread/<id>` route immediately.
2. Submit a message before the thread fully appears in the sidebar or before thread detail hydration finishes.
3. Watch the thread page while the turn is still running.
4. Let the turn complete and confirm the thread later materializes normally in the sidebar and header.

#### Expected Results
- The route does not fall back to `Thread not found` while the thread is still materializing.
- The page can temporarily show `Loading thread...` and still render the active turn.
- `Thinking` content streams into the thread while reasoning deltas are arriving.
- Assistant text also streams into the same thread view before final thread hydration completes.

#### Rollback/Cleanup
- No cleanup required.

### Feature: React dev bridge no longer depends on port 3000

#### Prerequisites
- `codex-ui-react` dependencies are installed.
- Another local process may already be bound to port `3000`.

#### Steps
1. Start the React stack with `cd codex-ui-react && bun run dev`.
2. If desired, inspect the Vite proxy target and bridge server environment in the startup logs.
3. Confirm the bridge server starts even when port `3000` is occupied by another process.
4. Optionally repeat with `BRIDGE_PORT=4567 bun run dev`.

#### Expected Results
- The bridge server defaults to port `3457`, not `3000`.
- Vite proxies `/codex-api` traffic to the same configured bridge port.
- Startup does not fail with `Failed to start server. Is port 3000 in use?`.
- Setting `BRIDGE_PORT` changes both the bridge listener and the Vite proxy target together.

#### Rollback/Cleanup
- Stop the dev processes after verification.

### Feature: Model selection writes through supported app-server config RPCs

#### Prerequisites
- React Codex UI app running at `http://127.0.0.1:5173`.
- The backend app-server is initialized and the model dropdown is visible.

#### Steps
1. Open the model dropdown in the composer toolbar.
2. Select `kimi-for-coding`.
3. Repeat with another available model such as `kimi-k2.5` or `gpt-4o`.
4. If available, switch the speed mode control and watch for RPC failures.

#### Expected Results
- Selecting a model does not return `500 Internal Server Error`.
- The app does not log `Invalid request: missing field keyPath` or `unknown variant setDefaultModel` for model changes.
- The selected model persists through the supported app-server RPC path.
- Speed mode writes continue to use a valid config write payload.
- Sending a new message after changing the model does not fail with `invalid type: string "default", expected struct CollaborationMode`.

#### Rollback/Cleanup
- Restore the previously selected model if needed.

### Feature: Kimi streaming preserves distinct reasoning and message item order

#### Prerequisites
- React Codex UI app running at `http://127.0.0.1:5173`.
- Backend config routes Kimi requests through `http://127.0.0.1:3456/v1`.
- The selected model is `kimi-k2.5` or `kimi-k2-thinking`.

#### Steps
1. Open a thread and send a prompt that yields a long reasoning phase and a longer final answer.
2. Observe the stream near the transition from reasoning to final answer text.
3. Let the turn complete and inspect the final assistant message in the thread.

#### Expected Results
- The proxy emits reasoning and assistant message items with distinct output indexes.
- The assistant answer does not stop after a short prefix near the end of the reasoning phase.
- The final completed response preserves the same item ordering as the stream.
- Once answer text starts streaming, it remains visible below the reasoning block instead of being hidden above the current scroll position.

#### Rollback/Cleanup
- No cleanup required.

### Feature: React message renderer formats markdown tables like the Vue app

#### Prerequisites
- React Codex UI app running at `http://127.0.0.1:5173`.
- A thread contains an assistant message with a markdown table.

#### Steps
1. Open a thread with a markdown table in an assistant response.
2. Inspect the rendered message block in the conversation view.
3. Confirm header cells, body rows, and inline markdown inside cells are rendered.

#### Expected Results
- Markdown table syntax renders as an HTML table instead of plain paragraph text.
- Table headers and cells have visible borders and alignment.
- Inline markdown inside cells, such as bold text, inline code, and links, still renders correctly.

#### Rollback/Cleanup
- No cleanup required.

### Feature: React message renderer matches Vue markdown block formatting

#### Prerequisites
- React Codex UI app running at `http://127.0.0.1:5173`.
- A thread contains assistant output covering multiple markdown block types.

#### Steps
1. Open a thread with assistant text containing headings, blockquotes, unordered lists, ordered lists, task lists, thematic breaks, code fences, markdown links, inline code, italics, strikethrough, and markdown images.
2. Inspect the rendered message in the React thread view.
3. Compare the same content against the Vue implementation if needed.

#### Expected Results
- Headings, blockquotes, unordered lists, ordered lists, task lists, thematic breaks, and fenced code blocks render as structured HTML rather than plain paragraphs.
- Inline bold, italic, strikethrough, inline code, URLs, and file-style markdown links render with formatting.
- Markdown images render as visible preview images instead of raw markdown text.
- Code fences use syntax highlighting via `highlight.js`.

#### Rollback/Cleanup
- No cleanup required.

### Feature: React thread view includes Vue-style message actions and image modal

#### Prerequisites
- React Codex UI app running at `http://127.0.0.1:5173`.
- A thread contains at least one assistant message with text.
- A message in the thread includes one or more images.

#### Steps
1. Hover or inspect an assistant message with text.
2. Use the `Copy` action and confirm the message text is copied.
3. Use the `Rollback` action on an assistant message and confirm the rollback request is sent for that message turn.
4. Click a message image preview.
5. Close the enlarged image preview.

#### Expected Results
- Assistant messages expose message-level `Copy` and `Rollback` actions.
- Copy changes to `Copied` briefly after success.
- Clicking a message image opens a centered modal-style preview instead of navigating away immediately.
- The modal closes when using the close button or backdrop.

#### Rollback/Cleanup
- If rollback is triggered during testing, resume or continue the thread as needed afterward.

### Feature: React home route matches Vue new-thread entry flow

#### Prerequisites
- React Codex UI app running at `http://127.0.0.1:5173`.
- The sidebar already contains one or more project/thread groups.

#### Steps
1. Open the app root route `/`.
2. Confirm the page shows a `New thread` heading and centered `Let's build` hero.
3. Select a project from the inline project dropdown.
4. Send a message from the inline composer.

#### Expected Results
- The index route is no longer a plain placeholder.
- The home route offers an inline new-thread composer similar to the Vue UI.
- The project title below `Let's build` is itself the folder dropdown trigger, instead of a separate selector rendered underneath.
- The home composer renders as a single card surface and does not sit inside a second outer card.
- Sending from the home route creates a thread for the selected project and navigates into it.

#### Rollback/Cleanup
- No cleanup required.

### Feature: React composer supports Vue-style skill selection and collaboration mode turn payloads

#### Prerequisites
- React Codex UI app running at `http://127.0.0.1:5173`.
- `skills/list` returns one or more installed skills with valid `path` values.
- At least one thread is available, or a project is available from the home route project selector.

#### Steps
1. Open either an existing thread or the home route composer.
2. Type `/` in the composer and confirm a skill menu appears.
3. Type part of a skill name after `/` and confirm the list filters.
4. Press `Enter` on a highlighted skill or click a skill row.
5. Confirm the selected skill appears as a removable chip above the input.
6. Use the `Skills` dropdown to add another skill.
7. Change the collaboration mode selector between `Default` and `Plan`.
8. Send a message with at least one selected skill.

#### Expected Results
- Typing `/` opens a slash-skill picker instead of leaving raw `/skill` text in place.
- Selecting a skill adds a visible chip and prevents duplicate selections.
- The `Skills` dropdown can add additional skills without removing existing chips.
- The collaboration mode selector updates the chosen mode before send.
- Sending the message succeeds and the selected model, reasoning effort, collaboration mode, and selected skills are included in the `turn/start` payload path instead of being dropped locally.

#### Rollback/Cleanup
- Remove any temporary skill chips before leaving the thread if desired.

### Feature: React composer supports Vue-style `@` file mention search

#### Prerequisites
- React Codex UI app running at `http://127.0.0.1:5173`.
- The active thread or selected home-route project has a valid working directory with searchable files.
- `rg` is installed in the runtime environment used by `codex-ui-react/server/standalone.ts`.

#### Steps
1. Open a thread whose project has known files in its working directory.
2. Type `@` in the composer, followed by part of a filename.
3. Wait for the file mention menu to populate.
4. Use arrow keys plus `Enter`, or click a result, to select a file.
5. Confirm the selected file appears as a removable chip above the input.
6. Send a message with one or more file chips attached.

#### Expected Results
- Typing `@` opens a file search menu backed by `/codex-api/composer-file-search`.
- Results are ranked with exact and basename-prefix matches first.
- Selecting a file removes the trailing `@query` token from the draft and adds a visible file chip.
- Sending the message succeeds and the selected file attachments are preserved in the structured turn payload path.

#### Rollback/Cleanup
- Remove any temporary file chips before leaving the thread if desired.

### Feature: React composer selector row renders stable Vue-style pills

#### Prerequisites
- React Codex UI app running at `http://127.0.0.1:5173`.
- Model config and collaboration mode config have loaded.

#### Steps
1. Open a thread composer in the React app.
2. Inspect the bottom selector row for collaboration mode, model, skills, and reasoning effort.
3. Open each selector and confirm labels are visible.
4. Watch the browser console while the composer renders.

#### Expected Results
- The leftmost selector visibly shows `Default` or `Plan` instead of a blank or collapsed control.
- The collaboration mode label remains visible even if the native browser select does not paint its own selected text reliably.
- The selector row uses flatter inline-style controls rather than large pill-shaped form fields.
- The selector row uses a consistent custom-chevron style instead of a broken native-select layout.
- The chevron icon for each selector sits immediately beside its text label rather than aligning to the far edge of the control width.
- The console does not warn about duplicate React keys from `ThreadComposer` option rendering.
- If upstream option data contains malformed rows with missing values, the composer ignores them instead of crashing.

#### Rollback/Cleanup
- No cleanup required.

### Feature: React composer uses a `+` action menu for plan and attachments

#### Prerequisites
- React Codex UI app running at `http://127.0.0.1:5173`.
- A thread or the home composer is visible.

#### Steps
1. Open the composer and inspect the left side of the control row.
2. Click the `+` button.
3. Confirm the menu shows `Plan` and `Upload attachment`.
4. Click `Plan` once and confirm plan mode is enabled.
5. Click `Plan` again and confirm it returns to default mode.
6. Click `Upload attachment` and confirm the browser file picker opens.

#### Expected Results
- The old visible collaboration-mode selector is no longer shown.
- A `+` action menu is present instead, matching the Codex web interaction model more closely.
- The `+` button shows a centered plus glyph at rest, and its circular background appears only on hover.
- The `+` glyph is visually large enough to read clearly at a glance.
- The `+` glyph does not dominate the row and stays proportionate to the nearby text controls.
- `Plan` in the menu toggles the underlying collaboration mode state.
- The `Plan` action uses the spline-pointer style icon instead of a generic text glyph.
- When plan mode is active, the composer shows a small `Plan` state chip above the input.
- `Upload attachment` opens the file picker and selected files appear as attachment chips.
- The `+`, model, skills, and reasoning menus all use the same light page-matched surface and rounded shape instead of mismatched native dropdown styling.
- Those menu surfaces use the same smaller corner radius as the surrounding card treatment instead of oversized pill-like rounding.
- Long item lists in any of those menus stay within a bounded height and expose a scrollbar instead of overflowing off-screen.
- The model, skills, and reasoning triggers sit as a compact left-side cluster instead of stretching apart across the full composer width.

#### Rollback/Cleanup
- Remove any temporary attachment chips before leaving the thread if desired.

### Feature: React chat shows submitted user input before live thinking

#### Prerequisites
- `codex-ui-react` is running locally.
- An existing thread is open in the React UI.
- The selected model emits a visible `Thinking` phase before the final response.

#### Steps
1. Open any existing thread in `codex-ui-react`.
2. Send a prompt with unique text, for example `display-order-check-001`.
3. Watch the conversation immediately after pressing send.
4. Confirm the new user bubble appears in the transcript right away.
5. While the turn is still running, confirm the `Thinking` block appears below that new user bubble.
6. Wait for the response to finish and confirm the temporary user bubble is replaced by the persisted user turn without duplication.

#### Expected Results
- The user input appears immediately after submit, before any live thinking UI.
- The `Thinking` block renders after the new user message, matching the Vue ordering.
- When the turn completes, the conversation shows one user message for that prompt and no duplicate optimistic row.

#### Rollback/Cleanup
- No cleanup required.

### Feature: React thread context tracks pending turns and active turn ids

#### Prerequisites
- `codex-ui-react` is running locally.
- An existing thread is open in the React UI.
- The selected model supports multi-second responses so the turn remains active briefly.

#### Steps
1. Open an existing thread in `codex-ui-react`.
2. Send a prompt that takes long enough to show a visible in-progress state.
3. Confirm the submitted user input appears immediately and the thread header switches to an in-progress badge.
4. While the turn is running, click `Stop`.
5. Wait for the turn state to settle, then send a second prompt in the same thread.

#### Expected Results
- The thread keeps a single in-flight pending turn state while the response is running.
- Stopping the turn clears the in-progress badge and removes the temporary pending-turn user row.
- Sending the next prompt works normally and produces a fresh pending-turn state instead of reusing stale context from the interrupted turn.

#### Rollback/Cleanup
- No cleanup required.

### Feature: React file-picker attachments are staged to a server-readable path

#### Prerequisites
- `codex-ui-react` is running locally.
- An existing thread is open in the React UI.
- A local file outside the thread working directory is available for upload, such as a `.docx` or `.txt` file.

#### Steps
1. Open the React composer and click `+`, then `Upload attachment`.
2. Select a local file from the machine using the browser file picker.
3. Confirm the attachment appears as a chip in the composer.
4. Send a prompt asking the model to inspect the attached file.
5. Repeat with an `@` file mention attachment from the thread working directory.

#### Expected Results
- The file picker uploads the selected file to a temp server directory before the turn is sent.
- The attachment chip stores a real server-side path, not just the browser filename.
- The React web UI behaves like the Vue UI contract: it uploads/stages files and passes attachment paths to the turn request, but it does not extract `.docx`, `.pdf`, or other file formats in the web layer.
- Picker-uploaded files and `@`-attached workspace files both reach the Codex app-server as attachment references for the app-server/LLM to reason about.

#### Rollback/Cleanup
- Remove any temporary uploaded files from the server temp directory if manual cleanup is desired.

### Feature: kimiProxy tool-call continuation (function_call / function_call_output)

#### Prerequisites
- `codex-ui-react` is running locally (kimi proxy on port 3456, bridge on port 3457).
- Full Auto collaboration mode is enabled in the composer.
- Model is set to a kimi model that supports tool use (e.g. `kimi-k2`).

#### Steps
1. Open the React UI and start a new thread.
2. Set collaboration mode to **Full Auto** (no approval prompts).
3. Send a multi-step task that requires tool use, e.g. "List all files in the current directory and summarize their sizes".
4. Watch the conversation panel — the model should issue tool calls (shell commands), receive results, and continue reasoning without stopping.
5. Confirm the final assistant message contains the summarized output.

#### Expected Results
- The model issues one or more tool calls.
- Each tool result is fed back to the model in the next request (confirmed via `[proxy] convertToChatFormat` log showing `function_call` and `function_call_output` types in `inputTypes`).
- The model produces a final answer that incorporates the tool results.
- The conversation does **not** stall after the first tool call with a bare response.

#### Bug Fixed
- `convertToChatFormat` in `kimiProxy.ts` previously dropped `function_call` and `function_call_output` items from the Responses API `input` array.
- As a result, the model never received tool results and stalled or produced a wrong response on the second turn.
- The fix adds proper handling for both item types, converting them to Chat Completions `tool_calls` and `tool` role messages respectively.

#### Rollback/Cleanup
- No cleanup required.

### Feature: React full-auto attachment turns keep mode instructions and force attachment-first context

#### Prerequisites
- `codex-ui-react` is running locally.
- An existing thread is open in the React UI.
- Full Auto mode is available in the composer.
- A structured attachment such as a `.docx` contract file is available for upload.

#### Steps
1. Open the React composer and enable `Full Auto` from the `+` menu.
2. Upload a `.docx` file through `Upload attachment`.
3. Send a prompt that depends on the file contents, for example `检查这份合同文件并分析其有效性`.
4. Observe the turn after submission.
5. If available in logs or request inspection tools, confirm the `turn/start` payload includes both `approvalPolicy: never` and a `collaborationMode` object.

#### Expected Results
- The React client sends the `default` collaboration mode preset even in Full Auto, so Codex receives the built-in mode instructions instead of only an approval override.
- The prompt text includes an attachment instruction block that tells Codex the uploaded files are intended inputs and should be inspected before answering when the request depends on their contents.
- Structured attachments such as `.docx` receive an explicit extract/inspect hint in the prompt prefix.
- The attachment instruction block tells Codex to actually use tools immediately rather than only narrating that it will inspect the file.
- The agent does not remain stuck on a passive `Thinking` phase after a planning sentence; either command execution becomes visible or a final analysis appears.

#### Rollback/Cleanup
- Remove any temporary uploaded attachment files if manual cleanup is desired.

### Feature: kimiProxy resumes previous_response_id turns for full-auto docx analysis

#### Prerequisites
- `codex-ui-react` is running locally on `http://127.0.0.1:4173`.
- The kimi proxy is running on port `3456`.
- Windows host Chrome remote debugging is available at `http://127.0.0.1:9222`.
- A thread is available in the React UI with `Full Auto` mode enabled.
- A `.docx` contract file is available for upload.

#### Steps
1. Open the target thread in the React UI.
2. Enable `Full Auto` from the composer actions menu.
3. Upload the `.docx` contract file through the composer.
4. Send a prompt that requires reading the attachment first, for example `检查这份合同文件并分析其有效性`.
5. Watch the proxy log for three phases:
6. Confirm the first streamed request emits a `tool_calls` finish reason.
7. Confirm the follow-up websocket request includes a non-null `previousResponseId`.
8. Confirm `convertToChatFormat` shows the follow-up request expanded back into full history instead of only `function_call_output`.
9. In the browser, wait for the assistant to render a substantive contract analysis instead of stopping after the initial extraction plan.

#### Expected Results
- The proxy surfaces streamed `function_call` items as `response.output_item.done`, so Codex executes the tool call.
- The proxy stores completed response context and rehydrates follow-up requests when `previous_response_id` is present.
- The follow-up kimi request completes with a final assistant answer instead of stalling after the tool call.
- The React thread shows a contract analysis result for the uploaded `.docx` attachment.

#### Rollback/Cleanup
- Close any extra remote Chrome tabs opened during Playwright verification if desired.
- Remove temporary uploaded attachment files if manual cleanup is desired.

### Feature: React thinking panels fold instead of fully hiding generated content

#### Prerequisites
- `codex-ui-react` is running locally on `http://127.0.0.1:4173`.
- A thread is available with an assistant response that includes a visible `Thinking` section.

#### Steps
1. Open a thread that contains an assistant message with a `Thinking` panel.
2. Observe the panel in its default collapsed state.
3. Confirm the panel still shows the beginning of the thinking content instead of hiding the body completely.
4. Click the panel toggle.
5. Confirm the full reasoning content expands.
6. Click the toggle again.

#### Expected Results
- The collapsed state shows a folded preview of the thinking content with a fade at the bottom.
- The toggle labels read `Expand` when folded and `Fold` when expanded.
- Expanding reveals the full content without changing the message text below it.
- Folding again returns to the preview state rather than hiding the content entirely.

#### Rollback/Cleanup
- No cleanup required.

### Feature: React sidebar header and mobile Skills header parity

#### Prerequisites
- `codex-ui-react` is running locally on `http://127.0.0.1:4173`.
- At least one thread exists in the sidebar.

#### Steps
1. Open the React home route on a desktop-width viewport.
2. Inspect the left sidebar header and confirm it renders as a compact icon row.
3. Click the sidebar search icon and confirm the thread filter input opens directly below the icon row.
4. Collapse the sidebar and confirm the main content header now shows the compact controls before the page title.
5. Switch to a mobile viewport and open `/skills`.
6. Confirm the mobile header shows the compact controls followed by the `Skills` title on one row.
7. Tap the sidebar toggle in the mobile header to open the drawer, then tap the backdrop to close it.

#### Expected Results
- Desktop sidebar header uses the compact Vue-style toolbar layout instead of a large labeled block.
- Collapsed desktop state moves toolbar controls into the content header and removes the old collapsed icon rail.
- Mobile `Skills` view shows a compact header with toolbar controls and title together.
- Mobile sidebar opens as an overlay drawer and closes from the backdrop.

#### Rollback/Cleanup
- No cleanup required.

### Feature: React new-thread toolbar action uses Lucide SquarePen

#### Prerequisites
- `codex-ui-react` is running locally on `http://127.0.0.1:4173`.
- Any page that renders the compact sidebar/header toolbar is accessible.

#### Steps
1. Open the home route on desktop and inspect the compact toolbar in the sidebar header.
2. Confirm the rightmost new-thread action uses the Lucide `SquarePen` glyph instead of the previous Tabler pencil icon.
3. Collapse the sidebar or switch to a mobile viewport.
4. Confirm the same `SquarePen` icon appears in the compact header toolbar there as well.
5. Click the icon and confirm navigation still goes to the home/new-thread screen.

#### Expected Results
- The new-thread action consistently renders with the Lucide `SquarePen` icon in sidebar and compact headers.
- Icon sizing and stroke weight remain visually aligned with the adjacent toolbar icons.
- Clicking the icon still starts the new-thread flow without behavior regression.

#### Rollback/Cleanup
- No cleanup required.

### Feature: React toolbar uses SquareLibrary for Skills navigation

#### Prerequisites
- `codex-ui-react` is running locally on `http://127.0.0.1:4173`.
- The compact toolbar is visible in the sidebar header or a collapsed/mobile content header.

#### Steps
1. Open the home route on desktop and inspect the compact toolbar.
2. Confirm the toolbar order is sidebar toggle, `SquareLibrary`, search, then new-thread.
3. Verify there is no separate `Skills Hub` text button below the toolbar.
4. Click the `SquareLibrary` button and confirm navigation goes to `/skills`.
5. On the `Skills` route, confirm the same `SquareLibrary` button renders in its active state.
6. Collapse the sidebar or switch to a mobile viewport and confirm the compact content header keeps the same `SquareLibrary` placement to the left of search.

#### Expected Results
- Skills navigation is represented by a `SquareLibrary` icon button placed immediately left of the search button.
- The previous standalone `Skills Hub` text button is removed.
- The icon button remains clickable in sidebar and compact headers.
- On the `Skills` route, the `SquareLibrary` button shows the active styling.

#### Rollback/Cleanup
- No cleanup required.

### Feature: React mobile composer uses card-style layout

#### Prerequisites
- `codex-ui-react` is running locally on `http://127.0.0.1:4173`.
- A page with the chat composer is open.

#### Steps
1. Switch the browser to a mobile-sized viewport.
2. Open a page that renders the composer, such as the home screen or an existing thread.
3. Inspect the composer container.
4. Confirm the text area occupies the upper portion of the card with the placeholder `Type a message... (/ for skills)`.
5. Confirm the lower row shows `+`, model, `Skills`, and reasoning controls.
6. Confirm the bottom-right area shows separate circular microphone and send buttons.
7. Return to a desktop-width viewport and confirm the original desktop composer layout still renders.

#### Expected Results
- Mobile composer renders as a larger rounded card with the input field above the controls.
- The mobile placeholder text matches the shortened skills-focused copy.
- The control row stays below the text area, while microphone and send actions sit at the bottom right.
- Desktop layout remains unchanged.

#### Rollback/Cleanup
- No cleanup required.

### Feature: React sidebar toggle uses Lucide panel icons

#### Prerequisites
- `codex-ui-react` is running locally on `http://127.0.0.1:4173`.
- The sidebar toggle control is visible in the sidebar header or compact content header.

#### Steps
1. Open the app with the sidebar expanded.
2. Inspect the leftmost toolbar button and confirm it uses Lucide `PanelLeftClose`.
3. Click the button to collapse the sidebar.
4. Inspect the same toolbar position and confirm it now uses Lucide `PanelLeftOpen`.
5. Click again to expand the sidebar.

#### Expected Results
- Expanded state shows `PanelLeftClose`.
- Collapsed state shows `PanelLeftOpen`.
- Toggling behavior remains unchanged while the icon set switches to Lucide.

#### Rollback/Cleanup
- No cleanup required.

### Feature: React sidebar toolbar top padding matches content header

#### Prerequisites
- `codex-ui-react` is running locally on `http://127.0.0.1:4173`.
- A compact content header and the sidebar toolbar can both be viewed.

#### Steps
1. Open a route with a compact content header, such as `/skills`.
2. Note the vertical offset from the top edge to the toolbar icons.
3. Open the sidebar toolbar view without a title-only content header replacing it.
4. Compare the top spacing above the icon row in both places.

#### Expected Results
- The sidebar toolbar uses the same top padding rhythm as the shared content header.
- Icon rows no longer appear visually higher or lower between the two header variants.

#### Rollback/Cleanup
- No cleanup required.

### Feature: React folder rows show rename and delete menu

#### Prerequisites
- `codex-ui-react` is running locally on `http://127.0.0.1:4173`.
- The sidebar contains one or more folder/project groups.

#### Steps
1. Hover a folder row in the sidebar and click the `...` button on the right.
2. Confirm a dropdown opens with `Rename` and `Delete`.
3. Click `Rename`, enter a new display name, and confirm the folder row label updates.
4. Refresh the page and confirm the renamed folder label persists.
5. Re-open the same folder menu and click `Delete`, then confirm the hide/delete prompt.
6. Accept the prompt and confirm the folder disappears from the sidebar.
7. Refresh the page and confirm the deleted folder remains hidden.

#### Expected Results
- Each folder row exposes a three-dots menu with `Rename` and `Delete`.
- `Rename` updates the displayed folder label without breaking the threads under that folder.
- `Delete` hides the folder from the sidebar after confirmation.
- Rename and delete state persist across reloads in the React UI.

#### Rollback/Cleanup
- Clear `codex-ui-react.project-labels.v1` and `codex-ui-react.hidden-projects.v1` from browser localStorage if you want to restore original folder labels and visibility.

### Feature: React expanded folder rows use Lucide FolderOpen

#### Prerequisites
- `codex-ui-react` is running locally on `http://127.0.0.1:4173`.
- The sidebar contains at least one folder group.

#### Steps
1. Open the sidebar and locate a collapsed folder row.
2. Expand the folder.
3. Inspect the folder row in the expanded state.

#### Expected Results
- Folder rows no longer render chevron expand/collapse icons.
- Collapsed folders keep the existing closed-folder icon.
- Expanded folders render with the Lucide `FolderOpen` icon in the same neutral gray tone instead of switching to green.

#### Rollback/Cleanup
- No cleanup required.

### Feature: React chat code blocks render with read-only CodeMirror

#### Prerequisites
- `codex-ui-react` is running locally on `http://127.0.0.1:4173`.
- A thread is available where you can send or inspect assistant messages containing fenced code blocks.

#### Steps
1. Open a thread and send or load a message containing a fenced code block, for example a short TypeScript or Bash snippet.
2. Confirm the code block renders inside a dark editor-style surface rather than plain `pre/code`.
3. Confirm syntax highlighting appears for a supported language such as TypeScript, JavaScript, JSON, or Bash.
4. Click the `Copy` button in the code block header and confirm the code content is copied.
5. Click inside the block and confirm it does not become editable.
6. Confirm non-code markdown in the same message still renders as before.

#### Expected Results
- Fenced code blocks render with a read-only CodeMirror viewer.
- Code blocks keep the language label when one is present.
- Supported languages receive syntax highlighting.
- The `Copy` button copies the full code block and briefly changes to `Copied`.
- The viewer is selectable but not editable, and no editor-style line-number gutter is shown.
- Paragraphs, lists, tables, and inline code outside fenced blocks are unchanged.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Configurable CODEX_HOME (Settings pane)

#### Prerequisites
- `codex-ui-react` server is running (port 4173).
- The default local `.codex` directory exists at `codex-ui-react/.codex`.

#### Steps
1. Click the **Settings** gear icon in the top-left sidebar toolbar.
2. Confirm the Settings page loads with three info rows: **Active now**, **Skills dir**, and **Default**.
3. Verify **Active now** shows `…/codex-ui-react/.codex` (the default local path).
4. Click the folder browse button (folder icon) next to the override field.
5. Navigate the directory browser and click **Select** on a target directory (e.g. `/home/chris/.codex`).
6. Confirm the input field is now populated with the selected path.
7. Click **Save**.
8. Confirm a yellow/amber "Settings saved. Restart the server for changes to take effect." confirmation banner appears.
9. Restart the server (`bun run build` then restart tmux session).
10. Return to Settings — confirm **Active now** shows the newly saved path and **Skills dir** reflects `$newPath/skills`.
11. Click **Reset to default**, then **Save**.
12. Confirm the saved override is cleared; after restart, the path returns to the default local `.codex`.

#### Expected Results
- Settings page is accessible via the gear icon in the sidebar.
- Current `CODEX_HOME`, Skills dir, and Default path are displayed as read-only info.
- Override path can be set via text input or directory browser.
- Saving persists to `.codex-ui-settings.json` next to the server.
- Restart causes the new `CODEX_HOME` to be active and reflected in the Settings page.
- Resetting clears the saved override, restoring the default local path after restart.
- The `CODEXUI_CODEX_HOME` environment variable still overrides any saved setting.

#### Rollback/Cleanup
- Delete `codex-ui-react/.codex-ui-settings.json` to revert to defaults.
- Restart the server.

---

## Multi-Marketplace Support in Settings (React)

### Feature
Configurable list of GitHub-based skill marketplaces with active/inactive toggles, add, and remove. The official `openclaw/skills` marketplace is always shown (labeled "Official") and cannot be removed, but can be toggled off.

### Prerequisites
- `codex-ui-react` server running (port 3457 or via `bun server/standalone.ts`).
- Navigate to Settings via the gear icon in the sidebar.

### Steps

#### Verify official marketplace always appears
1. Open Settings.
2. In the "Skills Marketplaces" section, confirm `openclaw/skills` is listed with an "Official" badge and an active toggle (ON by default).
3. Confirm there is no Remove (trash) button on the official row.

#### Toggle a marketplace on/off
1. Click the toggle switch on the `openclaw/skills` row to turn it OFF.
2. Confirm the toggle visually turns off and "Settings saved." message appears.
3. Go to Skills Hub — confirm no marketplace skills are listed (since the only active market is now off).
4. Return to Settings, toggle `openclaw/skills` back ON.
5. Reload Skills Hub — official skills appear again.

#### Add a custom marketplace
1. In the "Add marketplace" form, enter `owner` = `testuser` and `repo` = `my-skills`.
2. Click **Add** (or press Enter in the repo field).
3. Confirm a new row appears for `testuser/my-skills` with an active toggle ON and a link icon.
4. Confirm no error is shown.

#### Remove a custom marketplace
1. With `testuser/my-skills` in the list, click the Trash icon on that row.
2. Confirm the row disappears and "Settings saved." appears.
3. Confirm the official `openclaw/skills` row is still present.

#### Duplicate prevention
1. Try adding `openclaw/skills` (the built-in) again via the Add form.
2. Confirm an error message "openclaw/skills is already in the list" is shown.

#### Install from a specific marketplace
1. Add a valid second marketplace that has skills (e.g. a fork of `openclaw/skills`).
2. Open Skills Hub — both markets' skills should appear merged.
3. Install a skill from the second market.
4. Confirm installation succeeds (the server uses the correct `--repo` flag from that skill's market).

### Expected Results
- `openclaw/skills` is always shown with the "Official" badge; toggle works; trash button absent.
- Custom marketplaces can be added (owner/repo) and removed.
- All active marketplaces are fetched concurrently; skills are merged (first market wins on name collision).
- Each marketplace row has an external link icon opening `https://github.com/<owner>/<repo>`.
- Toggling and adding/removing saves immediately (no restart required); skills cache is cleared.
- Duplicate markets are rejected with an inline error message.

### Rollback/Cleanup
- Delete `codex-ui-react/.codex-ui-settings.json` to reset to a clean state.
- Restart the server.

---

### Feature: Agent Sandbox Mode – File Output to Configured Path

#### Prerequisites
- codex-ui-react server running on port 4173
- Sandbox mode set to `workspace-write` in Settings
- A configured user files path (Settings → User Files Directory)

#### Steps
1. Open the app and start a new thread from a project folder.
2. Ask the agent to create a file, e.g. "Create a file called hello.txt with the text Hello World".
3. Do NOT specify an absolute path – let the agent choose where to save.

#### Expected Result
- The file is saved inside the configured **User Files Directory** (shown in Settings), NOT in the thread's original cwd folder.
- The agent's cwd is overridden to `userFilesPath` when sandbox mode is `workspace-write`.
- If the original project cwd differs from userFilesPath, both directories remain in `writable_roots` so project code edits still work.

#### Rollback/Cleanup
- Delete any test files created in the user files directory.
- No server restart needed.
