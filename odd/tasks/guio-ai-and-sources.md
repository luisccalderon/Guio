Objective: add AI connectors, link extraction, and the generation pipeline to the core engine (plan 2 of 4).
Branch: feat/ai-sources. Delivery strategy: exception-ok, local repository with no remote and one reviewable commit per task. Test runner: Vitest.
Plan with full code: docs/superpowers/plans/2026-11-09-guio-02-ai-and-sources.md. Spec: docs/superpowers/specs/2026-11-09-guio-design.md.

## Specs

- S1: One connector contract covers CLI, local, and API backends, with presets for Claude CLI and OpenCode plus a custom command, Ollama, OpenAI-compatible HTTP, and Anthropic HTTP (spec section 5).
- S2: "CLI connectors run with agent tools disabled and in an empty temporary working directory." A CLI that cannot be restricted, the custom command included, is flagged so the app can warn before first use (spec section 9).
- S3: Prompts are never interpolated into a shell command (spec section 9).
- S4: A link becomes clean text with title and access date; a blocked link falls back through loaders and then to manual paste (spec sections 7 and 10).
- S5: All AI output is validated against a schema; invalid output is retried once with the validation error, then reported with its raw output (spec sections 7 and 10).
- S6: Each key point carries a verbatim quote; quotes failing the check are marked unverified and need explicit approval (spec sections 7 and 8).
- S7: Draft runs once per block from approved points and quotes, and full articles are never sent; a manually edited block is never overwritten without confirmation; every regeneration stores the previous version (spec section 7).
- S8: Humanize is fully implemented but disabled by default, with the code guard described in the spec. User request, verbatim: "igual solo agregalo y dejalo desactivado para mas adelante revisarlo nuevamente" (spec section 7).
- S9: Verification combines the code number check with AI review and keeps earlier acceptances; a style profile can be generated from pasted scripts (spec sections 3 and 8).
- S10: Source text is delimited and labeled as untrusted data in prompts (spec section 7).

## Tasks

Route for every task: inline. No Writer trigger holds: tasks are sequential and each depends on earlier ones.

| ID | Specs | Task | Status | Commit |
|----|-------|------|--------|--------|
| T1 | S1, S3 | Dependencies and connector contract | done | 3d6b140 |
| T2 | S3 | Process runner | done | 56b5d2d |
| T3 | S1, S2, S3 | CLI connectors | done | 43c9450 |
| T4 | S1 | HTTP connectors | done | 083ea29 |
| T5 | S4 | Link extraction | done | 113a414 |
| T6 | S5 | Structured output and chunking | done | f7f4927 |
| T7 | S6, S10 | Prompts and source cards | done | 904600f |
| T8 | S7 | Skeleton proposal | done | d2da2ea |
| T9 | S8 | Humanize step, off by default | done | 9fee2bc |
| T10 | S7, S8 | Draft and rewrite | done | c02f6f1 |
| T11 | S9 | Verification run and style profile | done | 6355bc5 |
| T12 | S2 | Spec note on OpenCode delivery | done | 4c84a77 |
| T13 | S2 | Manual check of the OpenCode connector | pending | - |

## Log

- L1 (2026-11-09, user, verbatim): "bien, lo que vamos a hacer es una app para poder hacer los guiones de mis videos de forma mas facil  rapida, desde las fuentes con informacion a extraer hasta la creacion del guio y formato de manera profesional y unica."
- L2 (2026-11-09): User approved plan 2 and execution in this session. Plan code passed 162 tests and typecheck in a scratch copy before execution.
- L3 (2026-11-09): Risk named before implementation: item 2 (CLI agent restriction, T3) and item 5 (new dependencies, T1). T13 needs OpenCode quota, which is exhausted today.
- L4 (2026-11-09): Commits T1-T2 assessed high (process_boundary). User granted review. Native review with risk and resilience lenses approved and acknowledged; boundary now 56b5d2d. Advisory findings accepted as a follow-up commit: absolute taskkill path, taskkill error handler, and an output limit, so runProcess differs slightly from the plan text. Not addressed: POSIX process groups (Windows-only product), ENOENT for a missing cwd (connectors always create it), uncancellable connection test.
- L5 (2026-11-09): Independent verifier on T3: S1, S2, S3 met, no blockers. Its advisory on dash-prefixed model names is fixed with regression tests. Constraint for plan 4: the settings layer must not expose `command` on a preset while it reports `restricted: true`. Pre-existing advisory left open: a `.cmd` argument ending in a backslash merges with the next argument; model names cannot contain a backslash.
- L6 (2026-11-09): Commits 581f5bc, 43c9450, fc076a7 reviewed with the risk lens: approved, no findings, acknowledged. Boundary now fc076a7.
- L7 (2026-11-09): T1-T12 complete, each with observed RED then GREEN. Full suite 165 passed, typecheck exit 0. Commits after fc076a7 assessed medium, not due (under_budget), no native review. T13 remains pending because OpenCode quota is exhausted: tool denial and the text event shape are unproven against the real CLI. Risk: item 2 (CLI agent restriction), item 5 (new dependencies).
