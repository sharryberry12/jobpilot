# JobPilot

A personal job-application copilot that runs entirely on your own machine. It tracks applications on a kanban board, watches a Gmail inbox (read-only) to advance statuses automatically, tailors a master resume per role with a no-fabrication guardrail, and generates a learning roadmap when the resume is weak for a role.

The full build specification lives in [`SPEC.md`](./SPEC.md). Build phases are executed in order; the table below tracks progress.

| Phase | Scope | Status |
| ----- | ----- | ------ |
| P1 | Tracker: schema, state machine, CRUD, kanban, detail page, seed | done |
| P2 | Resume engine: upload/parse, JD extraction, fit score, tailoring + DOCX | pending |
| P3 | Email pipeline: Gmail auth, sync scheduler, prefilter, classifier, review queue | pending |
| P4 | Skill planner | pending |
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
| `npm test` | Vitest: state machine, data layer (more suites arrive per phase) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run seed` | Insert 5 sample applications (idempotent) |
| `npm run db:generate` | Generate a new Drizzle migration after editing `lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations (also happens automatically on app boot) |
| `npm run db:studio` | Drizzle Studio for poking at the database |

## Layout

```
app/            Next.js routes (board, applications, review, resume, plans, settings) + server actions
components/     UI (kanban board, forms, timeline, shadcn/ui primitives)
lib/            db schema + connection, state machine, data access, validation, config
drizzle/        SQL migrations (committed)
scripts/        one-shot CLIs: seed, migrate (sync/gmail:auth/eval arrive with P3)
data/           gitignored: jobpilot.db, uploads/, out/
secrets/        gitignored: credentials.json, token.json
```

## Status state machine

`applied → screening → assessment → interview (→ interview, new round) → offer → accepted`, plus any active state `→ rejected` (any source) or `→ withdrawn` (manual only). Email-sourced changes may only follow forward edges or go to `rejected`; backward corrections within the pre-offer pipeline are manual only; `offer` and the terminal states never move backward. See `lib/stateMachine.ts` and its tests.
