# Guio: Design Specification

Date: 2026-11-09
Status: Awaiting user review

## 1. Purpose

Guio is a single-user Windows desktop app that turns links and personal test results into a professionally formatted video script, with its references kept in a separate document. It automates a process the creator already runs by hand.

Original request (verbatim):

> "una app para poder hacer los guiones de mis videos de forma mas facil rapida, desde las fuentes con informacion a extraer hasta la creacion del guio y formato de manera profesional y unica. El usuario ingresaria los links de las noticias o temas a hablar y de manera organizada deberia de crearse el guion con sus referencias aparte."

Target content: local AI, model comparisons, and tests of open-weight models.

### Success criteria

- A user can go from a list of links to an exported script and a separate references document inside the app.
- Every claim in the script can be traced back to a source passage or a personal test.
- No number reaches an export unless it appears in a cited source or the user explicitly accepted it.
- The AI backend can be swapped per step (CLI, local, or API) without changing any other part of the app.
- One block can be rewritten without touching the rest of the script.

## 2. Workflow

| # | Step | Actor | Result |
|---|------|-------|--------|
| 1 | Inbox | App | Links are extracted into clean text. Manual paste is the fallback. |
| 2 | Cards | AI | Each source gets a summary and key points with exact quotes. |
| 3 | Selection | User | Sources and key points are kept or discarded. |
| 4 | Skeleton | AI proposes, user edits | Approved points are ordered into template blocks. |
| 5 | Draft | AI | One script block is written per skeleton block, from approved points only. |
| 6 | Humanize (off by default) | AI, guarded by code | When enabled, every generated voiceover is rewritten to remove AI writing patterns. |
| 7 | Review | User | Blocks are edited, shortened, rewritten, or corrected one at a time. |
| 8 | Verify | Code and AI | Unsupported numbers and claims are flagged. |
| 9 | Export | App | Script and references are written as separate documents. |

Selection happens inside the Cards step, and Humanize, when enabled, runs automatically as part of Draft and Rewrite, so the sidebar shows seven entries: Inbox, Cards, Skeleton, Draft, Review, Verify, Export. New links can be added and their cards inspected from the Inbox view.

## 3. Script Format

Scripts use two columns per block: **Voiceover** and **On screen**. Each block has a title and an estimated duration.

```
BLOCK 3 - SPEED TEST                                  ~1:20

VOICEOVER                             ON SCREEN
En mi equipo, el modelo A llegó a     Terminal capture
[X] tokens por segundo [P1]...        A vs B comparison chart
```

### Templates

Three editable templates ship with the app. A template is an ordered list of blocks, each with a title and writing guidance.

| Block | News | Comparison | Model test |
|-------|------|------------|------------|
| Opening | Hook with the main story | The question: which one is worth it? | The model's promise vs. the doubt |
| Context | Why it matters | Contenders and criteria | What it is, license, requirements |
| Body | 3 to 5 stories with opinion | One round per criterion | Tests with results |
| Own value | What it means for people running local AI | Verdict per use case | The good, the bad, the odd |
| Closing | Recap and call to action | Winner and recommendation | Is it worth installing? |

### Timing

Block duration equals voiceover word count divided by words per minute. The rate defaults to 150 and is configurable in settings. The target duration is set per project and is compared with the total.

### Style profile

Optional. The user pastes past scripts, the AI produces a plain-text style description, and the user can edit it. It is added to every draft and rewrite prompt. With no profile, drafting uses template guidance only.

### Language

Script language is set per project and defaults to Spanish. Application UI text is English. This is an assumption the user may override during review.

## 4. Sources and References

There are two source types.

- **Web sources (F1, F2, ...)**: extracted from a link or pasted manually. Exported with link, title, and access date.
- **My tests (P1, P2, ...)**: written by the user. Fields: title, hardware, model version, quantization, settings, results, notes. Exported with the full setup so tests are reproducible.

Both are citable with the same mechanism.

The references document lists every source cited by the final script, and only those. The script export has an option to show or hide reference marks. The export screen can copy references as plain text for a video description.

## 5. Architecture

Stack: Electron, TypeScript, React. Distribution is a Windows installer with no auto-update and no code signing.

The main process owns all disk, network, and process access. The renderer displays UI only and talks to the main process over a typed IPC API.

| Module | Process | Responsibility | Depends on |
|--------|---------|----------------|------------|
| UI | Renderer | Screens only | IPC API |
| Projects | Main | Read and write project folders atomically | File system |
| Extractor | Main | Link to clean text with title and date | Network, hidden window |
| Connectors | Main | One contract over CLI, local, and API backends | Child processes, network |
| Pipeline | Main | Run steps, build prompts, validate outputs, track runs | Connectors, Projects, Templates |
| Templates | Main | Templates and style profile | Projects |
| Verifier | Main | Quote check, number check, AI review, staleness | Connectors |
| Exporter | Main | PDF and Markdown output | Hidden window for PDF |

### Connector contract

```ts
interface Connector {
  id: string;
  testConnection(): Promise<ConnectionResult>;
  generate(request: GenerateRequest, signal: AbortSignal): Promise<string>;
}

interface GenerateRequest {
  system: string;
  prompt: string;
  timeoutMs: number;
}
```

Initial connectors:

- **CLI**: presets for Claude CLI and OpenCode, plus a custom command.
- **Ollama**: local HTTP API.
- **OpenAI-compatible HTTP**: any compatible endpoint, including local servers.
- **Anthropic HTTP**: Messages API.

Settings assign one connector and model to each AI step: Cards, Skeleton, Draft, Rewrite, Humanize, AI review, and Style profile. A default applies to any step without its own assignment.

## 6. Data

Each project is a folder under `Documents/Guio/<project-slug>/`.

```
project.json          Metadata, template, language, target duration
sources/F1.json       URL, title, access date, extracted text, card
sources/P1.json       Personal test fields
skeleton.json         Blocks and ordered points
script.json           Blocks, voiceover, on-screen text, citations, state
history/<block>.json  Previous versions of each block
verification.json     Findings and user resolutions
runs.json             Step run status
exports/              Generated documents
```

Global settings and templates live in the app's user data folder. API keys are encrypted with Electron `safeStorage` and are never written to project folders.

Every write goes to a temporary file and is then renamed over the target.

### Traceability chain

```
Source -> Key point + exact quote -> Skeleton point -> Script block
```

- A key point stores its source ID, text, exact quote, and quote status (`verified` or `unverified`).
- A skeleton point references a key point or is a user-authored point.
- A script block stores the IDs and content hashes of its skeleton points.

## 7. Generation Pipeline

All AI output is requested as JSON and validated against a schema before it is accepted.

- **Cards**: long sources are split into chunks, and results are merged. Each key point includes a verbatim quote in the source's own language. Quotes are never translated.
- **Skeleton**: receives selected key points and template blocks and proposes an arrangement.
- **Draft**: runs once per block. Input is the template guidance, style profile, full skeleton outline, the previous block's voiceover, and that block's approved points with their quotes. Full articles are never sent. Numbers must be written in digits.
- **Rewrite**: receives the same input as Draft for a single block, plus the current text and the user's instruction.
- **Style profile**: receives the pasted scripts and returns a style description.

Source text is delimited in prompts and explicitly labeled as untrusted data.

### Humanize

The humanize step applies the `humanizer` skill (MIT license, Siqi Chen). It is fully implemented but **disabled by default**, pending a later review by the user.

- **Activation.** A single on/off setting controls the step and starts off. While it is off, Draft and Rewrite skip the step and no humanize badge or export warning appears. Turning it on affects only text generated afterwards. While it is on, every voiceover produced by Draft or Rewrite passes through the step before the user sees it.
- **Delivery.** The app bundles a copy of the skill's `SKILL.md` with its license notice and sends the text as system instructions. This works with every connector, including ones with no skill support, and does not require the skill to be installed. The rules are editable in settings, and a reset restores the bundled copy.
- **Mode.** The skill runs in embedded mode, so the model returns only the final text.
- **Scope.** Only the voiceover column is rewritten. On-screen directions, block titles, and text the user wrote by hand are left alone.
- **Input.** The block's voiceover, the script language, a note that the text is a spoken video script, and the previous block's voiceover as read-only context so transitions stay fluid. The style profile, when present, is passed as the writing sample, which takes precedence over the skill's default patterns.
- **Code guard.** The set of reference marks and the set of numeric values must be identical before and after the rewrite, using the same normalization as the number check. On a mismatch, the step retries once with the difference listed. If it still fails, the block keeps its pre-humanize text and shows a "Not humanized" badge with a retry action.
- **History.** The pre-humanize text is stored in the block's history, so the user can compare or restore it. Timing is computed from the final text.

While the step is on, export warns, without blocking, when any block has the "Not humanized" badge.

### Edits and staleness

- Changing, moving, or removing a skeleton point marks only the blocks that used it as stale. Stale blocks show a badge and keep their text until the user regenerates them.
- Every regeneration stores the previous version in history, and any version can be restored.
- A manually edited block is never overwritten without confirmation.

## 8. Verification

**Quote check (code, at Cards).** A quote passes if it appears in the source text after normalizing whitespace, letter case, and typographic quotes. Failing points are marked `unverified`. They are shown with a warning and need explicit approval before they can enter the skeleton.

**Number check (code, at Verify).** Every numeric token in a block's voiceover must appear in the full text of a source cited by that block. Comparison is by numeric value, so `7,5` matches `7.5`, and ambiguous separators such as `1,000` are tried under both readings. Numbers in a block with no citations are flagged. User-edited text is checked too. Numbers spelled out in words are not caught by this check and are left to AI review.

**AI review (AI, at Verify).** Each block's claims are compared with its cited quotes, and claims that overstate or misrepresent a source are flagged.

**Export gate.** Export is blocked while number findings are unresolved. A user can correct the text, change the source, remove the text, or accept the finding. An acceptance is stored with a hash of the block text and is voided if that text changes. AI review findings warn but do not block.

## 9. Security

- The renderer runs with context isolation and sandboxing, without Node integration. External content is rendered as text, never as HTML.
- The hidden extraction window has no preload script, uses an isolated session, and blocks downloads and popups.
- CLI connectors run with agent tools disabled and in an empty temporary working directory. Each preset's restriction flags are confirmed against that CLI's current documentation at implementation time.
- If a CLI cannot be restricted, the custom command included, the app warns the user before its first use.
- Prompts are passed through stdin, or as a file attachment for CLIs that do not read stdin, such as OpenCode. They are never interpolated into a shell command.
- OpenCode is restricted through a deny-all agent written to the temporary working directory.

## 10. Failure Handling

| Failure | Behavior |
|---------|----------|
| Link blocked or paywalled | Retry in the hidden window, then ask the user to paste the text |
| CLI missing or signed out | "Test connection" in settings reports it, and a failed run shows the same message |
| Invalid AI output | Retry once with the validation error; on a second failure, show the error and raw output and keep prior data |
| Humanize changes marks or numbers | Retry once with the difference listed, then keep the pre-humanize text and show the "Not humanized" badge |
| Timeout or cancel | Stop the process and keep prior data |
| App closed during a step | On launch, a step still marked running becomes interrupted and can be rerun |

## 11. Export

PDF is produced by rendering an export page in a hidden window. Markdown is written directly. Script and references are always separate files. PDF uses the two-column layout, and Markdown uses a two-column table per block.

## 12. Testing

Unit tests cover quote checking, number checking and normalization, the humanize guard, schema validation, staleness, timing, and atomic writes.

Connector tests use a fake CLI process and a fake HTTP server, so no real model or tokens are used.

One end-to-end test drives the packaged UI through the whole workflow using a fake connector.

## 13. Out of Scope for the First Version

- Finding topics inside the app; the user brings the links
- YouTube transcripts
- Word export
- macOS and Linux
- Auto-update and code signing
- Multiple users or collaboration
