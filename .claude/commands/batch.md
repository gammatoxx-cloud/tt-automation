---
description: Batch-prep TikTok slideshows — write copy, generate slides via Higgsfield, stage for review, promote approved ones into queue.json
---

# /batch — prep TikTok slideshows for review

Arguments (`$ARGUMENTS`): a list of topics, one per slideshow. Split on newlines or commas —
whatever the user gave you. If `$ARGUMENTS` is empty, ask the user for at least one topic before
doing anything else.

This command turns each topic into a staged slideshow (images + title + caption) under
`staging/<id>/`, gets it past a human review gate, then promotes approved ones into `queue.json`
via `scripts/promote.mjs` so the daily robot (`scripts/post-next.mjs`, run by
`.github/workflows/daily-tiktok.yml`) can draft them to TikTok. Nothing you generate here reaches
TikTok directly — the daily cron does that, and only for entries that made it into `queue.json`.

## 0. Load config, sanity-check

Read `batch.config.json`. Pull out:
- `REVIEW_MODE` (`full` | `copy-only` | `auto`; default to `full` if absent)
- `generation.model`, `generation.aspectRatio`, `generation.resolution`, `generation.brandStyle`
- `repo`

`scripts/promote.mjs` rejects `repo` when it's empty or still wrapped in angle brackets (e.g. the
shipped default `<owner>/<repo-name>`). If `repo` looks like that, **stop and tell the user**: set
`repo` in `batch.config.json` to your real `owner/repo` GitHub slug before promoting — the script
will refuse to run without it. Don't generate anything until it's fixed.

Confirm the Higgsfield CLI is ready: `higgsfield` should be on `$PATH` and authenticated. If
`higgsfield account status` fails with "Session expired" / "Not authenticated", tell the user to
run `higgsfield auth login` (interactive) and wait — don't try to auth on their behalf.

## 1. For each topic

Work through topics one at a time; don't parallelize image generation for a single slideshow (you
need to review garbled output slide by slide).

### a. Copy
Write:
- **title** — ≤90 characters, no hashtags, no URLs (TikTok strips them from the title anyway).
- **caption** — ≤4000 characters, hashtags go here.

Voice: follow `batch.config.json.generation.brandStyle`. If it's still the placeholder TODO value,
tell the user and ask for real brand-voice notes before writing copy that matters — don't silently
invent a voice.

### b. Pick an id
Scan `slides/` and the existing entries in `queue.json` for the highest `slideshow-NNN` in use,
then use the next free number, e.g. `slideshow-014`. Zero-pad to 3 digits, consistent with what's
already there.

### c. Design the slide set
Aim for 5–7 slides (TikTok slideshows allow 2–10 — `scripts/promote.mjs` enforces that range and
will reject anything outside it). Each slide needs its own Higgsfield prompt at the configured
aspect ratio (`generation.aspectRatio`, default `4:5`). Lean on the installed
`higgsfield-ai/skills` (`higgsfield-generate`) for prompt construction and model choice —
`generation.model` (default `nano_banana_2`) is the default but the skill's model-catalog guidance
can override it when a slide clearly needs something else.

### d. Generate + download each slide
For each slide, run:

```bash
higgsfield generate create <model> --prompt "<slide prompt>" --aspect_ratio <aspectRatio> --resolution <resolution> --wait --json
```

using `model`/`aspectRatio`/`resolution` from `batch.config.json.generation`. `--wait` blocks until
the job finishes; `--json` gives you a machine-readable result. **The CLI returns a result URL, not
a local file** — parse the JSON, pull the result URL out, and download it yourself to
`staging/<id>/<n>.png` (1-indexed, matching slide order — `promote.mjs` sorts these numerically).

### e. Write the draft manifest
Write `staging/<id>/draft.json`:

```json
{
  "title": "...",
  "caption": "...",
  "topic": "<the original topic string>"
}
```

### f. Review for garbled text
Look at every generated slide yourself before presenting it. Image models routinely mangle
on-image text — this review step is the whole reason the human gate exists downstream, and your
own first pass catches the obvious failures before the user even sees them. Call out any slide
with garbled, misspelled, or illegible text so it can be regenerated before — or during — review.

## 2. Present each staged slideshow

For every `staging/<id>/`, show the user the images (in order), the title, and the caption
together, clearly labeled by `id` and topic. Flag anything you noted as garbled in step 1f.

## 3. Honor REVIEW_MODE

- **`full`** (default) — wait for explicit per-slideshow approval before promoting *anything*. If
  the user requests changes, regenerate only the flagged slides (reuse the rest, keep the same
  `id`) and re-present that slideshow. If the user rejects it, delete `staging/<id>/` entirely and
  move on.
- **`copy-only`** — images are auto-approved once they pass your garbled-text check; still show
  title + caption and wait for the user's approval on the copy before promoting.
- **`auto`** — generate and promote with no pause. This still only produces a TikTok *draft*
  (`scripts/post-next.mjs` never auto-publishes), so there's a final in-app check before anything
  goes live, but nothing here waits on you. Use this mode deliberately, not as a default.

## 4. Promote approved slideshows

For each approved `id`, run:

```bash
node scripts/promote.mjs <id>
```

This copies `staging/<id>/*` into `slides/<id>/`, appends a `pending` entry to `queue.json` with
`raw.githubusercontent.com` image URLs built from `batch.config.json.repo`, commits, and pushes
best-effort (it warns rather than fails if there's no upstream yet or the push fails). It cleans up
`staging/<id>/` on success and is atomic on failure — if the git commit fails, the on-disk changes
roll back and `staging/<id>/` is left intact for a retry.

## 5. Wrap up

Tell the user how many slideshows were queued (and how many were rejected/skipped), and remind them
the daily robot only drafts **2 per day** — so if they queued more than 2, it'll take multiple days
to work through the backlog. Point out that queued entries still need to be turned into published
posts by the user: TikTok drafts land in the Creator Inbox, where a sound needs to be added in-app
before publishing.
