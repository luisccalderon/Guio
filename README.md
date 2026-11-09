# Guio

Guio is a Windows desktop app for writing video scripts from web articles and your own test results. It was made for videos about local AI and open-weight models, where a wrong benchmark figure is the mistake that matters most, so every number in a script has to come from a cited source or be accepted by hand.

## Status

Early and unpackaged: there is no installer, so it runs from source. The Export step already blocks on unresolved numbers, but PDF and Markdown output are not built yet.

## Run it

Developed with Node 24 on Windows.

```powershell
npm install
npm run dev
```

Before drafting, open Settings, pick a connector, and run the connection test.

| Connector | What it needs |
|---|---|
| Claude CLI | `claude` installed and signed in. The model is optional. |
| OpenCode | `opencode` installed, and a model as `provider/model`, for example `opencode/deepseek-v4.1-flash-free`. |
| Ollama | A model you have already pulled. |
| OpenAI-compatible | The server's base URL and a model name. |

One connector handles every AI step. CLI connectors run in an empty temporary folder with their tools disabled. OpenCode keeps `read`, confined to that folder, because its free tier rejects requests that carry no tools.

## How a script gets made

| Step | What happens |
|---|---|
| Inbox | Links become clean text. If a site blocks extraction, paste the text in. |
| Cards | The AI summarizes each source into key points with exact quotes. You keep or discard them. |
| Skeleton | Approved points are ordered into a News, Comparison, or Model test template. |
| Draft | Each block is written from approved points only, as voiceover and on-screen columns. |
| Review | Edit or rewrite one block without touching the others. |
| Verify | Numbers without a source are flagged, and an AI pass looks for unsupported claims. |
| Export | Stays blocked until every flagged number is resolved. |

Accepting a flagged number applies to that exact text. If the block changes afterwards, the number has to be accepted again.

Your own benchmarks go in the My tests panel in the project sidebar, with hardware, model version, and settings. They are cited the same way as web sources.

Humanize is an optional pass, off by default, that rewrites voiceovers to remove AI writing patterns.

## Where data lives

Projects are plain folders in `Documents/Guio/<project-slug>/`. Settings are stored in Electron's user data folder.

## Development

```powershell
npm test
npm run typecheck
```

The main process owns disk, network, and child processes. The renderer is sandboxed and reaches them only through the typed IPC API in `src/shared/ipc.ts`.

The [design spec](docs/superpowers/specs/2026-11-09-guio-design.md) describes the intended product, including parts that do not exist yet.

## Credits

The bundled Humanize rules in `resources/humanizer` are by Siqi Chen, under the MIT license included in that folder.
