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

Move attachment understanding entirely to the Codex app-server side.

The web UI should only:
- upload/stage local files so they exist on the server
- attach server-readable paths to the turn request
- show attachment chips and progress

The app-server and model/tool loop should decide:
- whether an attachment must be inspected before answering
- whether the file can be read directly as text
- whether extraction/conversion code must be planned and executed
- how extracted content should be fed back into reasoning

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

## Desired App-Server Behavior

### 1. Treat attachments as first-class turn inputs

When `turn/start` includes `attachments`, the app-server should persist them in turn runtime state as structured inputs, not rely only on the prompt prefix.

Recommended normalized attachment record:
- `label`
- `path`
- `fsPath`
- `extension`
- `mimeGuess`
- `sizeBytes`
- `sourceKind`
  - `uploaded`
  - `workspace`
- `inspectionStatus`
  - `pending`
  - `read`
  - `extracted`
  - `unsupported`
  - `failed`

### 2. Add attachment-aware planning before answering

If a turn has attachments, the planner should explicitly decide whether inspection is required before answering.

Rules:
- If the user asks about attachment contents, inspection is mandatory.
- If the file type is plainly text/code/config, direct read is preferred.
- If the file type is structured/binary such as `.docx`, `.pdf`, `.xlsx`, plan extraction first.
- If the file type is unsupported, record the limitation and continue with best-effort reasoning.

### 3. Create an internal attachment inspection phase

Before normal response generation, run an internal phase like:
- `attachment/inspect`

This phase should:
- classify each attachment
- select a strategy
- produce a compact inspection artifact for later reasoning

Outputs per attachment:
- strategy chosen
- commands or tools used
- extracted text or summary
- truncation information
- failure details if applicable

### 4. Use app-server-owned strategies, not web-ui conversions

Preferred inspection strategies:

- Text/code/config files:
  - use built-in filesystem read

- `.docx`:
  - plan extraction via unzip/XML parsing or a helper script

- `.pdf`:
  - plan extraction via available host tools or a helper script

- `.xlsx`:
  - plan structured extraction via Python/helper script

- Unknown binary:
  - mark unsupported unless the model decides to generate a converter

The key point is that the app-server/model loop owns the decision and execution.

### 5. Allow the model to generate extraction code when needed

If no built-in extractor exists for a file type, the app-server should let the model:
- inspect file extension and basic metadata
- propose a conversion approach
- write extraction code or a one-off script
- run it
- capture output back into turn state

This is where reasoning belongs for `.docx` and other complex formats.

### 6. Add reusable helper scripts on the server side

To avoid repeated ad hoc generation, add a server-owned extractor library over time:

- `server/extractors/docx`
- `server/extractors/pdf`
- `server/extractors/xlsx`

The model can call these first, and only generate code when no helper fits.

### 7. Feed extracted content back in a structured way

Do not dump entire documents blindly into the model prompt.

Store:
- extracted text
- truncation markers
- method used
- page/sheet/section markers where possible
- extraction errors

Then expose compact context to downstream reasoning.

### 8. Surface progress to the UI via notifications

Add item/activity notifications such as:
- `Inspecting attachment`
- `Reading attached file`
- `Extracting docx`
- `Extracting pdf`
- `Attachment inspection failed`

The UI remains generic while still showing useful progress.

### 9. Preserve fallback behavior

If extraction fails:
- do not fail the entire turn unless the attachment is essential
- record failure state
- let the model decide whether to ask the user for another format

### 10. Test matrix

Add app-server tests for:
- text file attachment direct read
- `.docx` attachment inspection/extraction
- unsupported binary attachment fallback
- multiple attachments in one turn
- interruption during extraction
- retry behavior after extraction failure

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

Those responsibilities belong to the app-server and the model/tool execution loop.
