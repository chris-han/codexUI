# App-Server Attachment Handling Plan

> Superseded in part by [`cli-app-server-parity-analysis.md`](./cli-app-server-parity-analysis.md).
>
> Revision note:
> after tracing the local `codex` source and testing both `codex exec` and
> `codex app-server`, the recommended parity path is no longer "build a new
> first-class attachment planner first". The more accurate first step is:
>
> - keep web upload/staging
> - expose staged server file paths in the user-visible text prompt
> - do not use `mention` as the transport for local file attachments
>
> A deeper app-server attachment subsystem should only be pursued if that
> lighter CLI-aligned approach proves insufficient.

## Goal

Reach CLI-equivalent attachment behavior in the web product without pushing file parsing into the web UI.

The web UI should only:
- upload/stage local files so they exist on the server
- attach server-readable paths to the turn request
- make those staged paths visible in the user-visible prompt text
- show attachment chips and progress

The Codex runtime should decide:
- whether a file must be inspected before answering
- whether the file can be read directly as text
- whether extraction/conversion steps are needed
- how extracted content should be used in reasoning

## Current Vue Contract

Vue already follows the right boundary:

1. The browser uploads non-image files to `/codex-api/upload-file`.
2. The server stores the upload and returns a server-side path.
3. The composer keeps `{ label, path, fsPath }` for each attachment.
4. `turn/start` includes:
   - prompt text
   - `attachments` metadata
   - optional image data URLs for image attachments
5. The bridge forwards the RPC call to the Codex app-server.

The Vue web layer does not:
- parse `.docx`
- read text attachments itself
- extract `.pdf`
- decide conversion strategy

## Desired Behavior

### 1. Treat staged paths in prompt text as the primary parity mechanism

The first parity target is not a new app-server attachment protocol. It is making the staged absolute file paths visible in the text input the same way `codex exec` already succeeds.

Recommended prompt shape:

```md
# Attached files

- Contract: /absolute/server/path/to/file.docx

# User request

Please review the attached contract and assess its validity.
```

`attachments` metadata may still be sent for UI/client purposes, but it should not be treated as the primary semantic channel unless later app-server work proves necessary.

### 2. Add attachment-aware planning before answering

Once the file path is visible in prompt text, the Codex runtime should be expected to make the inspection decision the same way it already does in CLI and direct app-server text-only tests.

Rules:
- If the user asks about attachment contents, inspection is mandatory.
- If the file type is plainly text/code/config, direct read is preferred.
- If the file type is structured/binary such as `.docx`, `.pdf`, `.xlsx`, plan extraction first.
- If the file type is unsupported, record the limitation and continue with best-effort reasoning.

These are behavioral expectations, not a commitment to implement a new hardcoded attachment planner immediately.

### 3. Avoid `mention` for local files

`mention` should remain reserved for app/plugin semantics. Local file attachments should not be encoded as `UserInput::Mention`.

### 4. Use runtime reasoning before adding server-owned file logic

The default assumption should now be:

- text/code/config files will usually be read directly
- structured files like `.docx` may trigger ad hoc extraction chosen by Codex
- unsupported files should degrade gracefully

That behavior is already present when path semantics are correct.

### 5. Add app-server-owned augmentation only if parity tests show a gap

Only if prompt-visible staged paths are still insufficient should we add app-server-specific behavior such as:

- attachment-aware preamble/instructions
- inspection progress notifications
- stricter gating when the user explicitly asks about attachment contents

### 6. Consider first-class attachment state only as a later product feature

If later needed, a richer attachment subsystem could include:

- normalized attachment state
- inspection status tracking
- structured extraction artifacts
- reusable helper scripts for commonly problematic formats

But that is no longer the baseline parity plan.

### 7. Surface progress to the UI via notifications if useful

Add item/activity notifications such as:
- `Inspecting attachment`
- `Reading attached file`
- `Extracting docx`
- `Extracting pdf`
- `Attachment inspection failed`

These are useful, but optional until the lighter parity path is validated.

### 8. Preserve fallback behavior

If extraction fails:
- do not fail the entire turn unless the attachment is essential
- record or surface failure state
- let the model decide whether to ask the user for another format

### 9. Test matrix

Add parity-focused tests for:
- text file attachment direct read
- `.docx` attachment via staged path in prompt text
- `.pdf` attachment via staged path in prompt text
- `.xlsx` attachment via staged path in prompt text
- unsupported binary attachment fallback
- multiple attachments in one turn
- interruption during inspection or extraction

## Recommended Implementation Order

1. Keep web upload/staging as-is, but make sure staged absolute file paths are injected into the user-visible prompt in a deterministic attached-files block.
2. Stop treating local file attachments as `mention`; reserve `mention` for apps/plugins.
3. Add end-to-end tests that compare path-based app-server behavior against known-good CLI behavior for:
   - text/code/config files
   - `.docx`
   - `.pdf`
   - `.xlsx`
4. Only if those tests show consistent gaps, add light app-server augmentation:
   - attachment-aware preamble/instructions
   - attachment progress notifications
   - optional gating when the user explicitly asks about attachment contents
5. Only if gaps still remain, consider first-class app-server attachment handling and server-owned extractor helpers.

## Non-Goals

The web UI should not:
- parse `.docx`
- decide extraction strategy
- inline file contents into prompts
- maintain a file-type extractor registry

Those responsibilities belong to the Codex runtime and, only if needed later, app-server-side augmentation.
