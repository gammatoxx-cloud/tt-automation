# Slide prompt skeletons (Skills UI blueprint style)

Copy these skeletons when writing Higgsfield prompts. They're tuned for **Nano Banana Pro** at
**4:5 / 2k**. Two habits that make text render cleanly: put the **exact on-slide text in quotation
marks**, and keep each string **short**. Longer strings garble — split ideas across the headline,
body, and diagram labels instead of cramming.

A slideshow is: **1 cover + ~4 `RULE 0N` content slides + 1 CTA.** Fill the `<...>` placeholders.

---

## Shared style language (present on every slide)

- Warm charcoal background `#1C1A17` (never pure black). Warm cream `#EBE3CC` text (never white).
  Muted taupe `#8A7D68` for labels/subtext. One Electric Yellow accent `#EEFF3A`, used sparingly.
- Headlines: bold geometric grotesque, Space Grotesk style, weight 700, all caps, tight tracking.
- Labels/numbers: monospace, Space Mono style, uppercase, letter-spaced.
- Zero rounded corners. Flat — no shadows, no gradients, no glow.
- Corner-bracket framing = four small L-shaped 1px marks in warm gray `#4A4438` at the corners, not a
  full rectangle border.
- A small monospace **`skillsui.app`** wordmark in the bottom-left corner of every slide.

---

## COVER (slide 1)

```
A dark UI design slide, warm charcoal background hex #1C1A17, absolutely no pure black. Centered
bold Space Grotesk headline (weight 700), warm cream #EBE3CC: "<HEADLINE, one strong line — the
hook>" with the word(s) "<KEY WORD(S)>" highlighted in electric yellow #EEFF3A. Below, smaller
monospace subtext in muted taupe #8A7D68, uppercase, letter-spaced: "<ONE-LINE SUBHOOK>". The
headline sits inside a corner-bracket card (four small L-shaped 1px warm-gray #4A4438 brackets, no
full border, zero radius). Below the card, a small diagram: <A SIMPLE SUPPORTING MOCKUP OR
BEFORE/AFTER THAT SETS UP THE TOPIC, e.g. two mini UI cards labeled "BEFORE" and "AFTER">. Faint
45-degree diagonal hatch texture behind the card at low opacity. Thin 1px isometric wireframe
shapes (an empty cube outline and a hollow frame) float in the negative space at 30% opacity, warm
gray, no fill. A small monospace "skillsui.app" wordmark in muted taupe bottom-left. Flat, zero
shadows, zero gradients. Clean technical blueprint aesthetic. Portrait 4:5, generous negative space.
```

## CONTENT (slides 2–5, one RULE each)

```
A dark UI design slide, warm charcoal background #1C1A17, no pure black. Monospace section header at
top-left: "RULE 0<N>" with a hatch bar extending right. Bold Space Grotesk headline (weight 700),
warm cream #EBE3CC: "<HEADLINE — the rule, punchy>". Muted taupe #8A7D68 body text: "<~2 sentences,
human-writer voice, explaining the rule and why it matters>". Below, a diagram inside a corner-bracket
panel: <A CONCRETE VISUAL THAT TEACHES THE RULE — a UI mockup, a two-option comparison (label the bad
one and mark it with a small red X, label the good one and mark it with a check), a swatch stack, a
dimensioned layout, etc. Keep any inside labels short and quoted>. A thin electric-yellow #EEFF3A
annotation line with a small monospace callout label reading "<SHORT TAKEAWAY>" points at the key
element. Zero border radius on the outer panel; mockups inside may have slight rounding as the subject.
A small monospace "skillsui.app" wordmark in muted taupe bottom-left. Flat, no shadows on chrome, no
gradients. Technical blueprint aesthetic. Portrait 4:5.
```

## CTA (final slide)

```
A dark UI closing slide, warm charcoal background #1C1A17. Centered bold Space Grotesk headline in
cream #EBE3CC: "<CLOSING LINE tied to the topic>" with the word "<ONE WORD>" in electric yellow
#EEFF3A. Below, smaller monospace subtext in muted taupe #8A7D68, uppercase, letter-spaced: "DESIGN
SKILLS FOR ANY AI BUILDER". Beneath the subtext, a rectangular button with a solid electric-yellow
#EEFF3A fill and dark charcoal text reading "BROWSE DESIGN SKILLS", sharp zero-radius corners, no
shadow. Below the button, a line of monospace text in cream reading "skillsui.app". The headline and
button sit inside a corner-bracket card (thin 1px warm-gray #4A4438 L-brackets, no full border). Faint
diagonal hatch texture in the background at low opacity. Thin 1px isometric wireframe shapes floating
in negative space, warm gray, 30% opacity, no fill. Flat, zero gradients, zero shadows, zero rounded
corners on chrome. Clean technical blueprint aesthetic. Portrait 4:5, generous negative space.
```

---

## Diagram ideas that have worked

Give every content slide a diagram that *teaches* the rule. Some that have rendered well:

- **Two-option comparison** — bad vs good, side by side, each with a short mono label; mark the bad one
  with a small red X and the good one with a check. (e.g. cramped vs roomy, tiny tap target vs 44px,
  vague error vs helpful error, illustration vs real screenshot.)
- **UI mockup with one highlighted element** — grey placeholder UI with a single electric-yellow button
  or a badged/outlined element the rule is about.
- **Swatch stack / comparison** — colors or neutrals as labeled chips (e.g. `#000000` "HARSH" vs
  `#1C1A17` "WARM"; a COLD column vs a WARM column; a palette-anatomy stack BACKGROUND/SURFACE/TEXT/ACCENT).
- **Dimensioned layout** — elements with spacing arrows labeled `8 / 16 / 24 / 32`, or a hero mockup
  with a dashed `FOLD` line.
- **Stacked-elevation** — nested layers getting lighter, labeled BACKGROUND / CARD / POPOVER.

Keep the annotation callouts to 1–3 short words (`ONE ACTION`, `44PX MINIMUM`, `LET IT BREATHE`).

## After generating — verify

Always view each PNG. Check spelling of headline, body, diagram labels, callout, and the
`skillsui.app` wordmark. For a critical string (a domain, a hex code), crop and zoom before trusting
it — small monospace text is where a dropped or swapped letter hides. Regenerate any slide that's off
(usually: shorten the string, re-quote it, or simplify the diagram).
