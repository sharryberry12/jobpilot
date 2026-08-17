# JobPilot — build specification

A personal job-application copilot for a single user, running locally. It tracks applications on a kanban board, watches a Gmail inbox (read-only) to advance application status automatically, tailors a master resume per role with a no-fabrication guardrail, and generates a learning roadmap when the resume is weak for a role.

This document is written to be executed by Claude Code, phase by phase (§9). Do not skip ahead: each phase has acceptance criteria and later phases assume earlier ones are done and tested.

## 1. Hard rules for the coding agent

1. Gmail access is **read-only** (`gmail.readonly`). Never request send/modify scopes. Never draft or send email.
2. Automated status changes must pass the state machine (§5). Anything else goes to the review queue.
3. Resume tailoring may **never invent facts**. Every tailored bullet must reference a `source_id` from the master profile. A validator enforces this; if validation fails, regenerate or surface the failure — never bypass.
4. Secrets (`secrets/`, `*.db`, `token.json`, `.env`) are gitignored from the first commit.
5. Every Claude API call has a JSON output contract (§7), `temperature: 0` for classification/extraction, and a try/catch that degrades gracefully (email → review queue; tailoring → error surfaced in UI).
6. Keep it boring: no microservices, no message queues, no Docker required to develop. One repo, one process — the web app runs its own sync.

## 2. Stack (locked)

- **Language:** TypeScript everywhere.
- **Web:** Next.js (App Router) + Tailwind + shadcn/ui.
- **DB:** SQLite via Drizzle ORM. Single file `data/jobpilot.db`.
- **Sync:** `lib/sync.ts` runs in-process — on app boot, on dashboard load when the last run is older than `POLL_MINUTES`, and on a `POLL_MINUTES` timer while the app is open — plus a manual "Sync now" button. `npm run sync` is a one-shot CLI wrapper for testing.
- **AI:** Anthropic SDK. `claude-haiku-4-5-20251001` for email classification and JD extraction; `claude-sonnet-4-6` for resume tailoring and learning plans. (Check for newer model names at build time.)
- **Gmail:** `googleapis` npm package, OAuth desktop-app flow, token cached at `secrets/token.json`.
- **Files:** resume uploads in `data/uploads/`, generated resumes in `data/out/`. Parse PDF with `pdf-parse`, DOCX with `mammoth`. Generate DOCX with the `docx` package.

## 3. Repo layout

```
jobpilot/
  app/            # Next.js routes (see §6.5)
  lib/            # db schema, state machine, claude.ts, gmail.ts, prefilter.ts, fit.ts
  scripts/sync.ts # one-shot CLI wrapper around lib/sync.ts
  fixtures/emails/*.json
  data/           # gitignored: db, uploads, generated resumes
  secrets/        # gitignored: credentials.json, token.json
  SPEC.md         # this file
```

## 4. Data model (Drizzle → SQLite)

- **applications** — id, company, role_title, jd_text, source_url, location, applied_at, status, fit_score (nullable), resume_version_id (nullable), ghosted (bool, derived), created_at, updated_at
- **status_events** — id, application_id, from_status, to_status, source (`manual|email|system`), email_id (nullable), note, created_at. Append-only.
- **emails** — id (= Gmail message id, natural key for idempotency), thread_id, from_addr, subject, body_text, received_at, application_id (nullable), event_type (nullable), confidence, decided_by (`auto|user|dismissed|null`), created_at
- **review_queue** — id, email_id, proposed_application_id, proposed_event, confidence, status (`pending|accepted|corrected|dismissed`), created_at
- **resume_master** — singleton row: profile_json, source_filename, updated_at
- **resume_versions** — id, application_id, tailored_json, docx_path, approved (bool), created_at
- **requirements** — id, application_id, extracted_json, created_at
- **plans** — id, application_id (nullable for general plans), goal, created_at
- **plan_items** — id, plan_id, kind (`learn|project`), title, detail, resource_url, status (`todo|doing|done`), evidence_bullet (nullable), completed_at

### Master profile JSON shape

```json
{
  "basics": { "name": "", "email": "", "phone": "", "location": "", "links": [] },
  "summary": "",
  "skills": [ { "id": "sk_python", "name": "Python", "level": "used in production" } ],
  "experience": [ { "id": "ex_1", "company": "", "title": "", "start": "", "end": "",
      "bullets": [ { "id": "b_1", "text": "" } ] } ],
  "projects": [ { "id": "pr_1", "name": "", "bullets": [ { "id": "b_9", "text": "" } ] } ],
  "education": [], "certs": []
}
```

Every skill, bullet, and project has a stable `id` — these are the `source_id`s the tailoring validator checks against.

## 5. Status state machine

States: `applied, screening, assessment, interview, offer, accepted, rejected, withdrawn`.

- Forward edges: applied→screening, applied→assessment, applied→interview, screening→assessment, screening→interview, assessment→interview, interview→interview (increments a round counter in the event note), interview→offer, offer→accepted.
- Any active state → rejected.
- Any active state → withdrawn (**manual only**).
- Email-sourced transitions may only use forward edges or →rejected. Backward moves are manual-only.
- **Ghosted** is not a state: it's a derived flag set during each sync run when an application is in `applied|screening|assessment|interview` and its latest status_event is older than `GHOST_DAYS` (default 21). Any new event clears it.

Implement as a pure function `canTransition(from, to, source)` in `lib/stateMachine.ts` with unit tests covering every edge and every forbidden pair.

## 6. Feature specs

### 6.1 Tracker

CRUD for applications. Creating one requires company, role title, and pasted JD text (URL optional). Kanban board grouped by status with drag-and-drop; a drag calls the state machine and writes a status_event with source=manual; illegal moves snap back with a toast explaining why. Application detail page shows a vertical timeline of status_events, matched emails, the resume version used, fit score, and the plan if one exists.

### 6.2 Resume engine

**Upload & parse (one-time, editable):** user uploads PDF/DOCX → extract raw text → Claude normalizes into the master profile JSON (§4) → user reviews/edits in a form UI → saved as the singleton `resume_master`. The profile is the source of truth from then on; re-upload replaces it after confirmation.

**JD extraction (on application create):** Claude extracts `{ must_have: [{skill_slug, evidence}], nice_to_have: [...], seniority, keywords[], role_family }`. Skill slugs are canonical lowercase (`react`, `sql`, `stakeholder-management`) so they can be compared to profile skills; the extractor is instructed to map synonyms onto the same slug the profile uses when obvious.

**Fit score (deterministic, not vibes):** `fit = 70 × (matched must-haves / total must-haves) + 30 × (matched nice-to-haves / total)`. Store subscores and the explicit gap list (unmatched must-haves first). Display as a badge with a breakdown popover — never just the bare number.

**Tailoring:** Sonnet receives the master profile + extracted requirements and returns a tailored subset: reordered experience, rephrased bullets (each with `source_id`), a role-targeted summary, and a skills section ordered by relevance. Validator rejects any bullet whose `source_id` doesn't exist or whose claim adds a technology/metric absent from the source bullet. UI shows a side-by-side diff (master vs tailored) with per-bullet accept/reject. On approve → render DOCX from one clean single-column template (name header, summary, skills, experience, projects, education) → save to `data/out/` and link as `resume_version` on the application.

### 6.3 Email pipeline

Each sync run: fetch new mail (§8) → **prefilter** → **classify** → **apply or queue**.

**Prefilter (`lib/prefilter.ts`, cheap, no LLM):** keep an email if ANY of: sender domain ∈ ATS list (`greenhouse.io, lever.co, myworkday.com, workday.com, ashbyhq.com, smartrecruiters.com, icims.com, jobvite.com, bamboohr.com, taleo.net, successfactors.com, seek.com.au, indeed.com, linkedin.com`); sender domain matches a company domain of an active application (derive from company name + a `company_domains` override field); subject/body contains an active company name; subject matches keywords (`application, interview, assessment, offer, unfortunately, next steps, coding challenge, your candidacy`). Everything else is ignored and not stored.

**Classify (Haiku, contract in §7):** input = email + compact list of active applications (id, company, role, status, applied date). Output = application match, event type, confidence, one-line evidence quote.

**Apply or queue:** if `confidence ≥ AUTO_APPLY_CONFIDENCE` (default 0.85) AND application matched AND `canTransition` allows the implied move → write status_event (source=email) and mark email decided_by=auto. Otherwise insert into review_queue. The review page shows the email beside the proposed action with one-tap accept / correct (pick application + event) / dismiss. Every correction is stored and the 10 most recent corrections are injected into the classifier prompt as few-shot examples.

### 6.4 Skill planner

Trigger: fit score < `PLAN_THRESHOLD` (default 60) at application create time, or a "Build me a plan" button anytime. Sonnet receives the gap list, role family, and existing profile, and returns a plan: gaps ranked by impact for this role family, one high-quality free-first learning resource per gap, and 1–2 scoped portfolio projects, each with a definition-of-done and a pre-written `evidence_bullet` (the resume bullet completing it would justify). Plan items are checkboxes; marking a project done opens a confirm dialog that appends its evidence_bullet (and any new skills) to the master profile — which mechanically improves fit scores on future similar roles.

### 6.5 Dashboard pages

`/` kanban + sync-now button + review-queue badge · `/applications/[id]` detail/timeline · `/review` queue · `/resume` master profile editor + upload · `/plans` all plans · `/settings` thresholds, ATS list overrides, Gmail connection status.

## 7. Claude API contracts

All calls: JSON-only responses ("Respond with only valid JSON, no markdown fences"), parsed defensively (strip fences, try/catch). Classification and extraction use `temperature: 0`.

**Email classifier (Haiku).** Output:
```json
{ "application_id": "app_12 | null", 
  "event": "received_confirmation|screening|assessment_invite|interview_invite|offer|rejected|other",
  "confidence": 0.0,
  "evidence": "short quote from the email",
  "reasoning": "one sentence" }
```
Prompt rules: never guess an application_id — null if unsure; recruiter marketing/newsletters/job alerts are `other`; `received_confirmation` maps to no status change (it confirms `applied`), it only links the email to the application. Inject up to 10 recent user corrections as few-shot examples.

**JD extractor (Haiku).** Output: the requirements JSON in §6.2, with skill slugs canonicalized against the list of slugs already present in the master profile (passed in the prompt).

**Resume tailor (Sonnet).** Output: tailored profile JSON where every bullet is `{ "source_id": "...", "text": "..." }`. System rules: rephrase and reorder only; never add tools, metrics, employers, titles, or dates not present in the source; omission is allowed, invention is not. The validator (`lib/validate.ts`) enforces source_id existence and flags added named technologies by string-diffing against the source bullet.

**Planner (Sonnet).** Output: plan JSON matching §4 plan/plan_items shape.

## 8. Gmail: one-time human setup + sync algorithm

**Human setup (I do this once, ~15 min):**
1. console.cloud.google.com → new project "jobpilot" → enable **Gmail API**.
2. OAuth consent screen → External → fill minimal fields → add my own address as a test user.
3. **Set publishing status to "In production"** (stay unverified). This avoids the 7-day refresh-token expiry that applies to Testing-status apps. At first auth Google shows an "unverified app" warning → Advanced → continue. This is acceptable for personal use.
4. Credentials → create OAuth client ID → type **Desktop app** → download JSON to `secrets/credentials.json`.
5. Run `npm run gmail:auth` → local loopback flow → token saved to `secrets/token.json`. Scope requested: `https://www.googleapis.com/auth/gmail.readonly` only.

**Sync algorithm (`lib/sync.ts`):** store `last_history_id` in a kv table. Each run: try `users.history.list(startHistoryId)` for incremental changes; on 404/expired-history fall back to `users.messages.list(q="newer_than:60d -in:chats")`. Fetch full message bodies only for ids not already in `emails` (idempotent on message id). Convert HTML bodies to text. Then prefilter → classify → apply/queue (§6.3). Log a per-run summary line: fetched / kept / auto-applied / queued.

## 9. Build phases (execute in order)

**P1 — Tracker.** Scaffold repo, schema, migrations, state machine + tests, CRUD, kanban, detail page, seed script (`npm run seed` creates 5 sample applications).
*Accept:* `npm run dev` boots clean; create/edit/delete works; drag between columns writes status_events; an illegal drag (e.g. offer → applied) snaps back with an explanatory toast; state-machine tests pass.

**P2 — Resume engine.** Upload/parse/normalize to master profile with edit UI; JD extraction on application create; fit score + gap list on detail page; tailoring with diff view, validator, DOCX render.
*Accept:* uploading a real resume produces an editable profile; creating an application with a pasted JD yields fit score + gaps; tailored DOCX opens correctly in Word/Pages; a deliberately fabricated bullet (test fixture) is rejected by the validator.

**P3 — Email pipeline.** Gmail auth script, in-app sync scheduler (boot + stale-load + timer), prefilter, classifier, auto-apply + review queue UI, ghost-flag check, sync-now button.
*Accept:* `npm run sync` runs a full cycle against my inbox without errors; a fixture rejection email auto-moves its application to rejected; a low-confidence fixture lands in `/review`; accepting/correcting from the queue updates the application and stores the correction; re-running sync creates no duplicates.

**P4 — Skill planner.** Plan generation, plan UI, done-flow that appends evidence bullets to the master profile and recomputes fit for open applications in the same role family.
*Accept:* a low-fit application offers a plan; completing a project visibly updates the master profile and improves the fit score of a matching open application.

**P5 — Polish.** Optional ntfy.sh push on auto status changes + daily digest; `npm run backup` (copies the SQLite file + uploads to a dated zip); settings page wiring; empty states.

## 10. Config (.env)

```
ANTHROPIC_API_KEY=
GOOGLE_CREDENTIALS_PATH=secrets/credentials.json
POLL_MINUTES=15
AUTO_APPLY_CONFIDENCE=0.85
PLAN_THRESHOLD=60
GHOST_DAYS=21
```

## 11. Testing & eval

- Vitest: state machine (every edge + forbidden pairs), tailoring validator, prefilter.
- `fixtures/emails/`: ~15 synthetic JSON emails — confirmations, rejections (incl. the polite-vague kind), interview invites, assessment links, recruiter spam, job-alert newsletters (negatives).
- `npm run eval:classifier`: runs fixtures through prefilter+classifier, prints a small table of expected vs got per email and overall accuracy. Run after any prompt change. Grow this set with real (redacted) emails over time.

## 12. Security & privacy

Everything stays on my machine: mail text, resume, tokens. Bind the dev server to localhost. `data/` and `secrets/` gitignored. No analytics, no third-party calls except Google and Anthropic APIs. If this is ever deployed to a VPS: put it behind Tailscale or basic auth, and encrypt the disk — it holds career PII and inbox contents.

## 13. Running it day-to-day (decided: laptop-only, TypeScript)

This runs only on the user's own machine. During the build, `npm run dev`. Once stable: `npm run build && npm start`, optionally auto-started at login (macOS Login Item, Windows Startup shortcut, or a systemd user unit on Linux) so it's up whenever the laptop is. A closed laptop misses nothing: the first sync after launch catches up via the Gmail history API and classifies everything that arrived in the meantime, so the practical worst case is that statuses update when you next open the machine rather than the moment an email lands.
