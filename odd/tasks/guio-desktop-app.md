Objective: deliver the Electron desktop app so the user can run `npm run dev` and go from links to a verified script (plan 3 of 4).
Branch: feat/desktop-app. Delivery strategy: exception-ok, local repository with no remote and one commit per task. Test runner: Vitest.
Code source: untracked draft docs/superpowers/plans/2026-11-09-guio-03-desktop-app.md, not committed by decision of L2; each task still goes test first. Spec: docs/superpowers/specs/2026-11-09-guio-design.md.

## Specs

- S1: Electron, React, TypeScript; the renderer only displays UI and reaches the main process through one typed IPC API with inputs validated (spec section 5).
- S2: Context isolation and sandbox on, no Node integration, external content rendered as text only; hidden extraction window has no preload, an isolated session, and blocks downloads and popups (spec section 9).
- S3: Projects list and three-pane workspace with steps Inbox, Cards, Skeleton, Draft, Review, Verify, Export; the right panel shows the support for the active item (spec section 2, approved mockups).
- S4: Application operations: projects, links with fallback and manual paste, personal tests, cards, selection with explicit approval for unverified points, skeleton editing with stale blocks, draft, rewrite with confirm-overwrite, manual edit, history restore, verification, acceptances, export gate (spec sections 2, 7, 8).
- S5: One running AI step per project, cancellable; steps still running at launch become interrupted (spec section 10).
- S6: Settings with one connector and model for all steps, Test connection, humanize switch off by default, words per minute. User, verbatim: "con opencode tendrias que seleccionar el modelo(ya que el default es un modelo local que tengo, pero no esta corriendo ahora mismo)". Presets expose no `command` override.

## Tasks

Route for every task: inline, by the user's choice in L2.

| ID | Delivery | Specs | Task | Status | Commit |
|----|----------|-------|------|--------|--------|
| T1 | 1 | S2 | Tooling and content security policy | done | 99912d0 |
| T2 | 1 | S6 | Connector settings and connector factory | done | 0a07efc |
| T3 | 1 | S1 | Shared typed IPC contract | done | c605bf4 |
| T4 | 1 | S5 | Step registry | done | 6091ae9 |
| T5 | 1 | S4 | Project snapshot and sources service | done | 72233f9 |
| T6 | 1 | S4 | Skeleton service | done | 950a40d |
| T7 | 1 | S4 | Script service | done | 462e164 |
| T8 | 1 | S4 | Verification service and application facade | done | 16ffd5f |
| T9 | 1 | S1 | IPC dispatcher | done | 9b63fe2 |
| T10 | 1 | S2 | Hidden-window page loader | done | ad204c1 |
| T11 | 1 | S1, S2 | Electron shell, preload, and first build | done | 037556b |
| T12 | 1 | S3, S6 | Renderer foundation, project list, and settings | done | b512c0d |
| T13 | 2 | S3, S4 | Inbox, Cards, and the support panel | done | 5f514d8 |
| T14 | 2 | S3, S4 | Skeleton screen | done | 58cc5e7 |
| T15 | 3 | S3, S4 | Draft and Review screens | done | 6a77c2b |
| T16 | 3 | S3, S4 | Verify and Export screens | done | 0cfdce0 |
| T17 | 3 | S3 | Workspace and application routes | done | 618e44d |
| T18 | 3 | S1-S6 | Manual walk of the flow with a real connector | pending | - |

## Log

- L1 (2026-11-09, user, verbatim): "bien, lo que vamos a hacer es una app para poder hacer los guiones de mis videos de forma mas facil  rapida, desde las fuentes con informacion a extraer hasta la creacion del guio y formato de manera profesional y unica."
- L2 (2026-11-09): After asking why the plan took so long, the user chose a short plan and building by deliveries in this session. A stopped worker had already left a nearly finished draft with full code, so it is reused as the code source instead of being rewritten.
- L3 (2026-11-09): Risk named before implementation: item 2 (window sandbox and IPC guards, T9-T11), item 5 (new dependencies, T1).
- L4 (2026-11-09): T1-T17 complete, each with observed RED then GREEN. Full suite 362 passed, typecheck exit 0, electron-vite build exit 0. Native assessment: medium, not due (under_budget). A launch probe over the remote debugging port found a defect no test covered: top-level await on app.whenReady() deadlocked the main process, so no window opened. Fixed by launching without top-level await; the same probe then read the rendered project screen, no console errors, `window.guio` present, no `require` or `process` in the renderer. Next: T18, the user's manual walk with a real connector.
