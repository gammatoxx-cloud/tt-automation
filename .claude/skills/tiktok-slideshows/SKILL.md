---
name: tiktok-slideshows
description: Batch-create Skills UI TikTok slideshows and add them to the automation queue. Use this whenever the user wants to make, generate, batch, or design new slideshow(s) or carousels for the TikTok pipeline, add slideshows to the queue, turn a list of UI/design topics into posts, or "run the slideshow batch" — even if they don't say "slideshow" explicitly (e.g. "make 5 more UI posts", "queue up some content", "turn these topics into carousels"). Handles the whole flow: copy in the human-writer voice, image generation via the Higgsfield CLI (Nano Banana Pro) in the Skills UI blueprint style, a human review gate, and promotion into queue.json so the daily robot drafts them to TikTok.
---

# TikTok Slideshows (Skills UI)

Turn a list of UI/design topics into finished slideshow carousels and drop them into the automation
queue. Each slideshow is ~6 vertical (4:5) slides in the Skills UI blueprint style, with a diagram on
every slide, copy written like a real person, and a `skillsui.app` call-to-action at the end. Once a
slideshow is promoted, the daily GitHub Actions robot drafts it to TikTok (2/day); the user just adds
a sound and publishes in the app.

**The one job that can't be automated away is yours: look at every generated slide and catch garbled
text before it ships.** Image models mangle on-image text constantly. That review is the whole reason
this stays a human-in-the-loop batch instead of a cron job.

## Run from the repo

This skill operates inside the `tt-automation` repo (it needs `scripts/promote.mjs`,
`batch.config.json`, `staging/`, and `slides/`). If you're not there, `cd` there first.

## Before generating — check the tools are ready

1. **Higgsfield CLI authenticated.** `higgsfield account status` should print an email + credits.
   - `No workspace selected` → `higgsfield workspace list` then `higgsfield workspace set <id>`.
   - `Session expired` / `Not authenticated` → tell the user to run `higgsfield auth login` (it opens
     a browser and needs local port **8765** free — if something else holds 8765 the OAuth redirect
     fails; free that port, don't pass `--port`). Don't try to auth on their behalf.
   - Trial accounts have a **daily generation cap** (`grace_daily_limit_reached`) that is separate
     from the credit balance. If you hit it mid-batch, the fix is to wait for the daily reset or
     upgrade — not to retry. Surface it to the user.
2. **`batch.config.json` `repo` is real.** `scripts/promote.mjs` rejects an empty or `<...>`-bracketed
   `repo`. It must be the real `owner/repo` GitHub slug or promotion won't run.
3. **Read the config.** Pull `REVIEW_MODE`, `generation.{model,aspectRatio,resolution,brandStyle}`,
   and `repo` from `batch.config.json`. `brandStyle` names the Skills UI `DESIGN.md` — skim it each
   batch for the exact color/type tokens.

## The voice — always human-writer

Invoke the **`human-writer`** skill and write **all** copy in that voice: titles, captions, and the
on-slide headlines and body. Talk to one person, use contractions, be specific. Avoid the AI-slop
tells — no "leverage / seamless / elevate / robust / unlock", and not the "it's not X, it's Y" framing.
Design education sounds best when it sounds like a sharp friend explaining it, not a brand.

- **Title** → ≤90 chars, no hashtags or URLs (TikTok strips them from the title).
- **Caption** → ≤4000 chars, hashtags go at the end. End with a soft CTA like
  `Browse design skills for any AI builder → skillsui.app`.

## The look — Skills UI blueprint style, every slide

The full visual system is the Skills UI `DESIGN.md` (path in `batch.config.json.generation.brandStyle`),
and the durable rules live in the `slideshow-design-guide` memory. The exact prompt skeletons —
copy them — are in **`references/slide-prompts.md`**. Read that file before writing prompts. In short:

- Warm charcoal `#1C1A17` background (never pure black), warm cream `#EBE3CC` text (never white),
  muted taupe `#8A7D68` for labels/subtext, a single Electric Yellow `#EEFF3A` accent used sparingly.
- Space Grotesk for headlines/body, Space Mono (uppercase, letter-spaced) for labels/numbers.
- Zero border radius. Corner-bracket cards (only the four corners drawn). Flat — no shadows/gradients.
- **Cover & CTA:** the headline sits inside a corner-bracket card, with floating 1px isometric
  wireframe shapes and a faint diagonal hatch in the negative space.
- **Content slides:** open with a `RULE 0N` mono header + a hatch bar. Fuller ~2-sentence body.
- **Every slide has a supporting DIAGRAM** inside a corner-bracket panel — a UI mockup, swatch
  comparison, before/after, or labeled schematic — with a thin yellow annotation line and a small
  mono callout label pointing at the key element. This is what makes each slide teach, not just tell.
- A small mono **`skillsui.app`** wordmark in the bottom-left corner of every slide.
- **Final slide CTA (fixed):** a solid yellow `BROWSE DESIGN SKILLS` button with `skillsui.app` under it.

## Step by step

1. **Get the topics.** One topic → one slideshow. Aim for 5–7 slides each (2–10 is the TikTok range
   `promote.mjs` enforces): a cover, ~4 `RULE` content slides, and the CTA.
2. **Pick the id.** Scan `slides/` and `queue.json` for the highest `slideshow-NNN`; use the next
   number, zero-padded to 3 digits. Create `staging/<id>/`.
3. **Per slideshow:**
   a. Write the title + caption (human-writer voice).
   b. Design each slide's headline, ~2-sentence body, and a concrete diagram idea.
   c. Build one prompt per slide from the skeletons in `references/slide-prompts.md`. Put the exact
      on-slide text in quotes and keep strings short — that's how the model renders text cleanly.
      Write each prompt to `/tmp/<id>/N.txt`.
   d. Generate each slide with the bundled helper (reads model/ar/res from `batch.config.json`,
      downloads the result URL with retries):
      ```bash
      scripts/../.claude/skills/tiktok-slideshows/scripts/gen-slide.sh /tmp/<id>/N.txt staging/<id>/N.png
      ```
      (From the repo root, the script is at
      `.claude/skills/tiktok-slideshows/scripts/gen-slide.sh`. Loop it over the slides, or generate a
      few at a time.)
   e. **View every slide** (Read each PNG) and check the text is spelled right and nothing's garbled.
      Regenerate any bad slide by tweaking its prompt (shorter strings, exact quotes). If a domain or
      hex looks off, zoom in with a crop before trusting it.
   f. Write `staging/<id>/draft.json` = `{ "title": "...", "caption": "...", "topic": "..." }`.
4. **Review gate.** Send the staged PNGs to the user (SendUserFile) with the title + caption, and
   honor `REVIEW_MODE`:
   - `full` (default) — wait for explicit per-slideshow approval. On "change X", regenerate only the
     flagged slide(s) and re-present. On reject, delete `staging/<id>/`.
   - `copy-only` — images auto-pass your garble check; still get sign-off on the copy.
   - `auto` — promote without pausing (still only creates TikTok *drafts*, so there's a final in-app
     check). Use deliberately.
5. **Promote approved ones.** `node scripts/promote.mjs <id>` copies the images to `slides/<id>/`,
   appends a `pending` entry to `queue.json` with `raw.githubusercontent.com` URLs, commits, and
   pushes. Pushing is ~24MB per slideshow, so it's slow — for several at once, run the promotes in the
   background (or a longer timeout) rather than letting a 2-minute foreground call cut off mid-push.
   If a run gets interrupted, check `git status` / `git log`: a committed-but-unpushed slideshow just
   needs a `git push`, and a leftover `staging/<id>/` whose commit landed can be removed.
6. **Optional — draft to TikTok now.** The daily workflow drafts up to 2 pending per run. To draft
   immediately: `gh workflow run daily-tiktok.yml`. To draft *exactly one* now, promote only that one
   first, trigger the run, then promote the rest. Verify with the run log (`Posted: <id>`).
7. **Wrap up.** Tell the user what's queued and that the cron drafts 2/day in order. Each draft still
   needs the human to add a sound and publish in the TikTok app.

## Gotchas worth remembering

- The Higgsfield CLI returns a **result URL, not a local file** — always download it, promptly (URLs
  can expire). The helper retries downloads; a network blip mid-batch means re-download from the saved
  job JSON rather than regenerating (which re-spends credits).
- Never let an expiring Higgsfield URL into `queue.json` — `promote.mjs` re-hosts to GitHub raw, so
  always go through it.
- Keep on-slide copy short and quoted; verify spelling by looking. A wrong domain or hex on a slide is
  the kind of thing only a human catch prevents.
- `slideshow-NNN` ids and the queue schema are shared with the daily robot — don't hand-edit
  `queue.json`; let `promote.mjs` write it.

## Reference files

- `references/slide-prompts.md` — the cover / content / CTA prompt skeletons and the shared style
  block. Read it before writing any slide prompts.
- `scripts/gen-slide.sh` — generate + download one slide using `batch.config.json` defaults.
