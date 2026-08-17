# JobPilot

A personal job-application copilot that runs entirely on your own machine. It tracks applications on a kanban board, watches a Gmail inbox (read-only) to advance statuses automatically, tailors a master resume per role with a no-fabrication guardrail, and generates a learning roadmap when the resume is weak for a role.

The full build specification lives in [`SPEC.md`](./SPEC.md). Build phases are executed in order; the table below tracks progress.

| Phase | Scope | Status |
| ----- | ----- | ------ |
| P1 | Tracker: schema, state machine, CRUD, kanban, detail page, seed | done |
| P2 | Resume engine: upload/parse, JD extraction, fit score, tailoring + DOCX | done |
| P3 | Email pipeline: Gmail auth, sync scheduler, prefilter, classifier, review queue | done |
| P4 | Skill planner | done |
| P5 | Polish: notifications, backup, settings, empty states | pending |

## Stack

TypeScript · Next.js (App Router) · Tailwind + shadcn/ui · SQLite via Drizzle ORM (`better-sqlite3`) · Anthropic SDK · `googleapis` · Vitest.

## Getting started

```bash
npm install
cp .env.example .env        # fill in keys as features need them
npm run dev                 # http://127.0.0.1:3000 — schema is created on first boot
npm run seed                # optional: 5 sample applications
```

The dev server binds to `127.0.0.1` only. All data lives in `data/` (SQLite, uploads, generated resumes) and `secrets/` (Google OAuth credentials + token); both are gitignored.

## Scripts

| Script | What it does |
| ------ | ------------ |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm test` | Vitest: state machine, data layer, fit score, tailoring validator, prefilter |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run seed` | Insert 5 sample applications (idempotent) |
| `npm run gmail:auth` | One-time Google OAuth (desktop loopback flow, `gmail.readonly` only) → `secrets/token.json` |
| `npm run sync` | One-shot sync cycle against your inbox; `-- --fixtures` runs the pipeline over `fixtures/emails/` instead |
| `npm run eval:classifier` | Prefilter + classifier over the email fixtures; prints expected vs got and accuracy |
| `npm run db:generate` | Generate a new Drizzle migration after editing `lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations (also happens automatically on app boot) |
| `npm run db:studio` | Drizzle Studio for poking at the database |

## AI features and the API key

Resume normalisation, JD extraction and tailoring call the Anthropic API (`ANTHROPIC_API_KEY` in `.env`). Haiku 4.5 handles classification/extraction (`temperature: 0`); Sonnet 5 handles tailoring and plans. Override the model ids with `CLAUDE_FAST_MODEL` / `CLAUDE_SMART_MODEL`.

For offline development, `JOBPILOT_MOCK_AI=1` swaps every AI call for a deterministic local stand-in (keyword extraction, verbatim tailoring) so all screens can be exercised without a key or spend.

Tailoring is guarded by `lib/validate.ts`: every bullet must cite a `source_id` from the master profile, and a bullet that adds a technology or number absent from its source is rejected. On failure the tailor regenerates once with the errors fed back, then surfaces the failure in the UI — it is never bypassed.

## Gmail sync

One-time setup is in SPEC.md §8 (Google Cloud project → Gmail API → Desktop-app OAuth client → `secrets/credentials.json` → `npm run gmail:auth`). The app only ever requests the read-only scope and never drafts or sends mail.

Sync runs in-process: on boot, when the board loads and the last run is older than `POLL_MINUTES`, on a `POLL_MINUTES` timer, and from the **Sync now** button. Each run: `history.list` since the stored history id (falling back to a 60-day `messages.list`) → skip known ids → prefilter (ATS domains, company domains, company mentions, subject keywords) → store → Haiku classifier → auto-apply when confidence ≥ `AUTO_APPLY_CONFIDENCE` **and** the state machine allows the move, otherwise the review queue. Corrections made in `/review` are fed back to the classifier as few-shot examples. Ghost flags are refreshed every run.

## Skill planner

When an application's fit is below `PLAN_THRESHOLD` at create time (or via **Build me a plan**), Sonnet turns the gap list into a roadmap: gaps ranked by impact for the role family, one free-first resource per gap, and 1–2 scoped portfolio projects each with a definition of done and a pre-written evidence bullet. Marking a project done (confirm dialog) appends that bullet and any new skills to the master profile and recomputes fit for open applications in the same role family. All plans are listed at `/plans`.

## Layout

```
app/            Next.js routes (board, applications, review, resume, plans, settings) + server actions
components/     UI (kanban board, forms, timeline, shadcn/ui primitives)
lib/            db schema + connection, state machine, data access, validation, config
lib/ai/         Claude features: resume normaliser, JD extractor, tailor, email classifier, planner (+ offline mocks)
lib/sync.ts     the sync run; lib/gmail.ts Gmail access; lib/prefilter.ts; lib/scheduler.ts + instrumentation.ts
fixtures/       resume + tailoring fixtures; fixtures/emails/*.json synthetic inbox for eval + --fixtures sync
drizzle/        SQL migrations (committed)
scripts/        one-shot CLIs: seed, migrate (sync/gmail:auth/eval arrive with P3)
data/           gitignored: jobpilot.db, uploads/, out/
secrets/        gitignored: credentials.json, token.json
```

## Status state machine

`applied → screening → assessment → interview (→ interview, new round) → offer → accepted`, plus any active state `→ rejected` (any source) or `→ withdrawn` (manual only). Email-sourced changes may only follow forward edges or go to `rejected`; backward corrections within the pre-offer pipeline are manual only; `offer` and the terminal states never move backward. See `lib/stateMachine.ts` and its tests.
