# CLI vs App-Server Parity Analysis

## Scope

This note compares the local `codex` CLI implementation under [`codex/`](./codex) with the app-server path currently used by the Vue/React web frontends in this repo.

The main question is whether attachment handling needs a special app-server-side attachment subsystem, or whether the current web flow can reach CLI-equivalent behavior with different input packaging.

## Executive Summary

The important finding is:

- `codex exec` and `codex app-server` share the same core runtime.
- The large parity gap is not in model/tool capability.
- The gap is in how file references are encoded into the turn.

More specifically:

- `codex exec` succeeds on `.docx` because the file path is present in plain text prompt context, so the agent decides to inspect the file and can then use shell/Python/tools.
- `codex app-server` also succeeds when the absolute file path is present in the text input.
- `codex app-server` does not treat generic filesystem paths sent via `UserInput::Mention` as file attachments. In practice, `mention` is for apps/plugins, not local files.

That means the previous app-server plan should be adjusted:

- Do not build a new first-class app-server attachment planner first.
- First align the web frontend with how the CLI/app-server runtime already reasons about file paths.
- Keep file upload/staging in the web layer.
- Put staged server paths into the user-visible text prompt in a deterministic format.
- Do not rely on `mention` for local file attachments.

## What The CLI Actually Does

### `codex exec` already uses app-server under the hood

The `exec` command starts an in-process app-server client and then sends the normal `thread/start` and `turn/start` requests:

- [`codex/codex-rs/exec/src/lib.rs`](./codex/codex-rs/exec/src/lib.rs)

Relevant behavior:

- Starts `InProcessAppServerClient`
- Calls `thread/start`
- Builds `Vec<UserInput>`
- Calls `turn/start`

So `codex exec` is not a separate agent implementation. It is a client surface on top of app-server.

### CLI input packaging is simple

In the `exec` path:

- text becomes `UserInput::Text`
- images become `UserInput::LocalImage`

There is no first-class generic file attachment input in this path.

See:

- [`codex/codex-rs/exec/src/lib.rs`](./codex/codex-rs/exec/src/lib.rs)

That is consistent with the TypeScript SDK as well:

- [`codex/sdk/typescript/src/thread.ts`](./codex/sdk/typescript/src/thread.ts)
- [`codex/sdk/typescript/src/exec.ts`](./codex/sdk/typescript/src/exec.ts)
- [`codex/sdk/typescript/README.md`](./codex/sdk/typescript/README.md)

The SDK wraps `codex exec`, not `codex app-server`, and only supports:

- text
- local images

No generic file attachment type exists there either.

## What App-Server Actually Supports

### Protocol-level `UserInput`

The app-server protocol `UserInput` supports:

- `Text`
- `Image`
- `LocalImage`
- `Skill`
- `Mention`

See:

- [`codex/codex-rs/app-server-protocol/src/protocol/v2.rs`](./codex/codex-rs/app-server-protocol/src/protocol/v2.rs)

`Mention` is:

- `name: String`
- `path: String`

But in core, `mention` is routed as explicit app/plugin activation metadata, not as a generic filesystem attachment mechanism.

### `mention` is app/plugin-oriented, not file-oriented

The core mention parsing logic explicitly filters mention paths for `app://...` and `plugin://...` semantics:

- [`codex/codex-rs/core/src/plugins/mentions.rs`](./codex/codex-rs/core/src/plugins/mentions.rs)
- [`codex/codex-rs/core/src/codex.rs`](./codex/codex-rs/core/src/codex.rs)
- [`codex/codex-rs/app-server/README.md`](./codex/codex-rs/app-server/README.md)

The app-server docs also describe `mention` in terms of:

- `app://<connector-id>`
- `plugin://<plugin-name>@<marketplace-name>`

There is no evidence in the core/app-server code that a plain filesystem path passed as `Mention.path` is treated as a special local-file attachment signal.

## Reproduced Runtime Behavior

### Test 1: app-server with `mention` for a local `.docx`

Sent:

- `turn/start`
- text asking to inspect the document
- `UserInput::Mention { name, path: "/abs/path/to/file.docx" }`

Observed:

- agent replied that it did not have access to an attached document
- no plan updates
- no command executions

Conclusion:

- generic filesystem-path `mention` does not trigger file inspection behavior

### Test 2: app-server with plain text containing the absolute `.docx` path

Sent:

- `turn/start`
- `UserInput::Text` containing the absolute `.docx` path and instruction to read/extract it

Observed:

- app-server successfully inspected the file
- returned the correct opening sentence

Conclusion:

- app-server already has the same effective reasoning capability as CLI when the file path is exposed in the user-visible text prompt

### Test 3: `codex exec` with the same absolute `.docx` path

Observed:

- `codex exec` planned extraction
- ran `unzip -l`
- ran `file`
- ran Python XML extraction for `word/document.xml`
- returned the correct sentence

Conclusion:

- CLI superiority here is not due to a stronger model/tool runtime
- it is due to a better input shape for local file references

## Current Vue Web Flow

Vue currently does this:

1. Upload non-image files to the local server
2. Receive a server-readable path
3. Store `{ label, path, fsPath }`
4. Add a prompt prefix:

   - `# Files mentioned by the user:`
   - one line per file with label and path

5. Send the turn text plus an extra `attachments` metadata field

Relevant code:

- [`src/api/codexGateway.ts`](./src/api/codexGateway.ts)
- [`src/components/content/ThreadComposer.vue`](./src/components/content/ThreadComposer.vue)

The key line is that Vue already injects the file paths into the text prompt. That is much closer to the working CLI/app-server behavior than using `mention`.

## Revised Recommendation

### Short version

Do not start by inventing a new app-server attachment planner.

Instead:

1. Keep the web frontend responsible for upload/staging only.
2. Ensure the staged server path is included in the user-visible prompt text.
3. Do not encode local files as `mention`.
4. Treat `attachments` metadata as auxiliary UI/client state, not as the primary semantic channel.

### Why

Because the current runtime already works when given the file path in the same way CLI gets it:

- a normal text request that contains a readable local path

That is the fastest route to parity.

## Adjusted Plan

### Phase 1: Fix the file reference contract

- Keep upload-to-server staging in web UI.
- Standardize prompt injection format for attachments.
- Make the injected text explicit enough that the agent knows the files are intended inputs, not incidental path mentions.

Recommended shape:

```md
# Attached files

- 契约文档: /absolute/server/path/to/file.docx

# User request

Please analyze the attached contract and assess validity under PRC contract law.
```

This is closer to the working `codex exec` behavior than `mention`.

### Phase 2: Remove misleading attachment semantics

- Do not send local files as `UserInput::Mention` unless they are truly app/plugin mentions.
- Keep `attachments` metadata only if the web client needs it for rendering/persistence/debugging.
- Do not assume app-server consumes `attachments` as first-class local files.

### Phase 3: Add deterministic guidance only if needed

Only if Phase 1 is still too weak, add app-server-side augmentation such as:

- prepend a server-owned instruction when attachments exist:
  - "The user supplied the following local files as intended inputs. Inspect them before answering if the request depends on their contents."

This is still much lighter than introducing a new attachment execution subsystem.

### Phase 4: Consider a true first-class file input only if product requirements demand it

A bigger app-server feature is justified only if you need:

- mandatory inspection semantics
- attachment progress states
- structured extraction results
- deterministic pre-answer file handling

That would be a real protocol/runtime feature, not a UI-only patch.

But that should be treated as a new product capability, not a parity fix.

## Should We Bypass App-Server And Use CLI Directly?

### There is already a CLI-direct integration path

The TypeScript SDK wraps `codex exec` directly:

- [`codex/sdk/typescript/README.md`](./codex/sdk/typescript/README.md)
- [`codex/sdk/typescript/src/exec.ts`](./codex/sdk/typescript/src/exec.ts)

So a Node-hosted frontend can absolutely drive Codex through the CLI instead of through `codex app-server`.

### But a browser cannot do this directly

A web frontend cannot spawn `codex exec` by itself.

To use the CLI path in a web product, you still need a local host process, such as:

- Electron main process
- local Node helper
- desktop shell bridge

### Tradeoff

Using `codex exec` directly would give you:

- working local-path semantics
- a simpler programming model for one active turn

But you would lose or need to reimplement:

- rich thread RPC model
- multi-thread lifecycle controls
- app-server notifications and request flows
- IDE-style long-lived connection features

For this repo, app-server remains the better architectural base for the web UI.

## Final Recommendation

For `codexUI`, do not replace app-server with CLI.

Instead:

- keep the app-server architecture
- stop treating local files as `mention`
- rely on uploaded server paths being injected into the turn text
- only escalate to a first-class app-server attachment feature if prompt-visible file paths still fail to meet product requirements

That is the parity fix most consistent with the actual local `codex` implementation.
