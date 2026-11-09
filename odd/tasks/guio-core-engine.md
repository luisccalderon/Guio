Objective: build and test Guio's framework-free core engine (plan 1 of 4).
Branch: feat/core-engine (bootstrap commit on main). Delivery strategy: exception-ok, local repository with no remote and one reviewable commit per task. Test runner: Vitest.
Plan with full code: docs/superpowers/plans/2026-11-09-guio-01-core-engine.md. Spec: docs/superpowers/specs/2026-11-09-guio-design.md.

## Specs

- S1: Persisted data is validated by schemas, and identifiers cannot escape their folders (spec sections 4 and 6).
- S2: Every numeric token in a block's voiceover must appear in a source cited by that block, compared by value, with ambiguous separators tried under both readings; numbers in a block with no citations are flagged (spec section 8).
- S3: A quote passes if it appears in the source text after normalizing whitespace, letter case, and typographic quotes (spec section 8).
- S4: Block duration equals voiceover word count divided by words per minute, with a default of 150 (spec section 3).
- S5: Changing, moving, or removing a skeleton point marks only the blocks that used it as stale (spec section 7).
- S6: Export is blocked while number findings are unresolved; an acceptance is stored with a hash of the block text and is voided if that text changes (spec section 8).
- S7: The humanize guard requires identical reference marks and numeric values before and after a rewrite (spec section 7).
- S8: Every write goes to a temporary file and is then renamed over the target; projects are folders with the documented layout, and steps still running at launch become interrupted (spec sections 6 and 10).
- S9: Three editable templates ship with the app: news, comparison, and model test (spec section 3).

## Tasks

Route for every task: inline. No Writer trigger holds: tasks are small and sequential.

| ID | Specs | Task | Status | Commit |
|----|-------|------|--------|--------|
| T1 | - | Project scaffold | done | 98ddf41 |
| T2 | S1 | Domain schemas and hashing | done | e4cf77d |
| T3 | S2 | Reference marks and number matching | done | 1784fa6 |
| T4 | S3 | Quote check | done | 6432ce1 |
| T5 | S4 | Timing | done | 1cbf81d |
| T6 | S2 | Number check | done | 0f53174 |
| T7 | S7 | Humanize guard | done | ea2db98 |
| T8 | S5 | Staleness | done | 204e21b |
| T9 | S6 | Export gate | done | c10ffcd |
| T10 | S8 | Atomic writes | done | e066ece |
| T11 | S1, S8 | Project store | done | 6c19b87 |
| T12 | S9 | Default templates | done | 0746e2a |

## Log

- L1 (2026-11-09, user, verbatim): "bien, lo que vamos a hacer es una app para poder hacer los guiones de mis videos de forma mas facil  rapida, desde las fuentes con informacion a extraer hasta la creacion del guio y formato de manera profesional y unica. El usuario ingresaria los links de las noticias o temas a hablar y de manera organizada deberia de crearse el guion con sus referencias aparte. Todo esto de manera organizada y profesional, una forma de automatizar algo que ya funciona"
- L2 (2026-11-09, user, verbatim): "igual solo agregalo y dejalo desactivado para mas adelante revisarlo nuevamente" (about the humanize step; the switch itself is built in plan 2).
- L3 (2026-11-09): Spec and plan approved by the user, inline execution chosen. Plan code passed 68 tests and typecheck in a scratch copy before execution.
- L4 (2026-11-09): T1-T12 complete. Each of T2-T12 observed RED on the missing module and then GREEN. Full suite: 68 passed. Typecheck: exit 0. Native assessment on every commit, against base 98ddf41: risk medium, not due (under_budget). No native review ran. Risk: none. Next: plan 2 (AI and sources).
