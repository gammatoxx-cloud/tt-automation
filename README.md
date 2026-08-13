# tt-automation

Automated TikTok slideshow pipeline. Two halves, one repo:

- **Batch prep** (human + Claude Code, on demand) — run `/batch <topics>` in Claude Code. It writes
  title/caption copy, generates slide images with the Higgsfield CLI, stages them under
  `staging/<id>/` for review, and — once approved — promotes them into `queue.json` via
  `scripts/promote.mjs`.
- **Daily robot** (GitHub Actions cron, unattended) — `.github/workflows/daily-tiktok.yml` runs
  `scripts/post-next.mjs` once a day, which calls the Zernio API to drop up to 2 approved
  slideshows into the TikTok Creator Inbox as **drafts**.

End result: up to 2 fresh TikTok drafts per day, sitting in the Creator Inbox with title and
caption pre-filled. You open the TikTok app, add a sound, and publish. Nothing here posts
automatically — the daily robot only ever produces drafts.

## How it works

```
/batch <topics>  (Claude Code)
  → writes copy + generates images (Higgsfield CLI)
  → staging/<id>/  (images + draft.json)
  → human review gate (per REVIEW_MODE)
  → node scripts/promote.mjs <id>
      → slides/<id>/  (committed images, served via raw.githubusercontent.com)
      → queue.json     (new "pending" entry)

.github/workflows/daily-tiktok.yml  (cron, daily)
  → node scripts/post-next.mjs
      → scripts/zernio.mjs  (Zernio API)
      → TikTok Creator Inbox, as a draft
      → queue.json entry marked "posted" (or "failed"), committed back
```

Images are hosted by pointing TikTok/Zernio at GitHub's raw file CDN
(`raw.githubusercontent.com/<repo>/main/slides/<id>/<n>.png`) — **this repo must be public**, or
those URLs 404.

## Repo layout

| Path | Purpose |
|---|---|
| `scripts/post-next.mjs` | Daily runner. Reads `queue.json`, posts up to `POSTS_PER_RUN` pending entries as TikTok drafts via Zernio, marks them `posted`/`failed`, writes `queue.json` back. |
| `scripts/promote.mjs` | CLI (`node scripts/promote.mjs <id>`). Moves `staging/<id>/` into `slides/<id>/`, appends a `pending` entry to `queue.json`, commits, pushes best-effort. |
| `scripts/zernio.mjs` | Thin Zernio API client (`getCreatorInfo`, `createTikTokDraft`) used by `post-next.mjs`. |
| `queue.json` | The queue. Array of `{ id, status, topic, title, caption, images, created_at, posted_at }`. Statuses: `pending` → `posted` / `failed`. |
| `batch.config.json` | Batch-prep config: `REVIEW_MODE`, `IMAGE_HOST`, `generation` defaults, `repo`. |
| `slides/<id>/` | Committed, approved slide images (`1.png`, `2.png`, ...) — what the raw-GitHub URLs in `queue.json` point at. |
| `staging/<id>/` | Working area for a batch in progress: generated images + `draft.json`, pre-approval. Never committed as final content; cleared by `promote.mjs` on success. |
| `.github/workflows/daily-tiktok.yml` | The daily cron. Runs `post-next.mjs`, commits the updated `queue.json`. |
| `.claude/commands/batch.md` | The `/batch` slash command definition used by Claude Code for batch prep. |

## Setup

1. **Prerequisites**
   - This repo hosted on GitHub, set to **public** (image hosting depends on it).
   - A [Zernio](https://zernio.com) account (free) with your TikTok account connected via OAuth.
     TikTok must be set to a **Business or Creator** account for the Content Posting API to work.
   - Higgsfield CLI installed and authenticated, with generation credits available:
     ```bash
     npm i -g @higgsfield/cli
     higgsfield auth login
     npx skills add higgsfield-ai/skills
     ```

2. **Fill in `batch.config.json`** — set `repo` to your `owner/name` GitHub slug and
   `generation.brandStyle` to real brand-voice/visual notes (both ship as placeholders).

3. **Add GitHub Secrets** (Settings → Secrets and variables → Actions):
   - `ZERNIO_API_KEY`
   - `ZERNIO_TIKTOK_ACCOUNT_ID` — find it via `GET /v1/accounts` on the Zernio API, or
     `zernio accounts:list` if you have their CLI.
   - `ALERT_WEBHOOK` (optional) — a webhook URL (e.g. Discord/Slack incoming webhook) that gets a
     POST with `{ "content": "<message>" }` whenever the queue is empty or a post fails.

   ```bash
   gh secret set ZERNIO_API_KEY
   gh secret set ZERNIO_TIKTOK_ACCOUNT_ID
   gh secret set ALERT_WEBHOOK   # optional
   ```

4. **Adjust the cron time** in `.github/workflows/daily-tiktok.yml` — the schedule (`0 15 * * *`
   by default) is UTC, and GitHub Actions cron can run 10–30 minutes late.

## Daily usage

Nothing to do day-to-day. The cron drafts up to 2 slideshows per day from whatever is `pending` in
`queue.json`. Open the TikTok app, find the drafts in the Creator Inbox, add a sound, and publish.
If the queue runs dry, `post-next.mjs` sends an alert (console log + `ALERT_WEBHOOK` if set) instead
of failing silently.

## Batch prep

In Claude Code, run:

```
/batch topic one, topic two, topic three
```

Claude Code writes copy, generates slides, and stages each slideshow under `staging/<id>/` for your
review (behavior depends on `batch.config.json.REVIEW_MODE` — `full`, `copy-only`, or `auto`).
Approved ones get promoted into `queue.json` automatically. See `.claude/commands/batch.md` for the
exact flow.

## Testing before trusting the cron

Before relying on the scheduled workflow, verify the pipeline end-to-end by hand:

1. Get one real entry into `queue.json` with `pending` status and images actually committed to
   `slides/<id>/` (run `/batch` once, or promote a hand-built `staging/<id>/`).
2. Confirm the images are actually reachable: open a
   `https://raw.githubusercontent.com/<repo>/main/slides/<id>/1.png` URL in an incognito window and
   check the raw PNG loads (proves the repo is public and the path is right).
3. Dry-run the poster locally:
   ```bash
   ZERNIO_API_KEY=... ZERNIO_TIKTOK_ACCOUNT_ID=... POSTS_PER_RUN=1 node scripts/post-next.mjs
   ```
4. Trigger the real workflow manually: **Actions → Daily TikTok Drafts → Run workflow**.
5. Confirm the draft actually shows up in the TikTok app's Creator Inbox with title and caption
   pre-filled.

## Notes

- Zernio rejects posting identical content to the same account within a 24-hour window (HTTP 409).
  If you see repeated failures for the same entry, check whether it's a near-duplicate of something
  already posted recently.
- GitHub disables scheduled workflows automatically after 60 days with no repository activity.
  `post-next.mjs`'s daily `queue.json` commit (via the workflow) counts as activity, so the cron
  keeps itself alive as long as it's actually running — but a long idle period *before* the first
  run, or a failed run, can still trip the 60-day disable.

## Run tests

```bash
npm test
```

Runs `node --test scripts/*.test.mjs` — unit tests for `post-next.mjs`, `promote.mjs`, and
`zernio.mjs`, all using injected fakes (no real git, network, or filesystem side effects outside
temp dirs).
