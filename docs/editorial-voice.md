# Editorial voice — caelus

Technical writing for docs, web copy, and package READMEs. Adapted from the Mystery Schools editorial export; tuned for an ephemeris engine, not a podcast.

## Register

Dry engineer explaining a hard problem to a peer who builds software. State what was built, how it was verified, and where the limits are. No pitch, no manifesto, no performed wit.

**Sound like:** Dan Luu, a good internal design doc, a terse release note with numbers attached.

**Not like:** a YC landing page, a professor lecturing, an AI assistant performing confidence, marketing copy manufacturing urgency.

## Sentence mechanics

- Prefer 12–22 words. One idea per sentence.
- Active voice. Name the subject: `caelus`, `the suite`, `Swiss Ephemeris`, not `the project` or `this approach`.
- Concrete before abstract. Lead with the bug, the measurement, or the source.
- Technical terms: define once, then reuse (`ΔT`, `VSOP87D`, `golden fixture`).

## Cut on sight

- Filler: "it's important to note," "it's worth considering," "one might argue."
- Intensifiers without data: "remarkable," "extraordinary," "flawless," "game-changing."
- Meta-commentary: "this is what makes caelus unique," "the lesson generalizes," "what this buys you."
- Punchy closers: "Every layer needs its own referee," "full stop," "mail to Zurich."
- AI vocabulary: `landscape`, `delve`, `unpack`, `multifaceted`, `testament`, `beacon`, `tapestry`, `resonates`, `pivotal`, `holistic`, `comprehensive overview`.
- Em-dash chains. Use commas, colons, or a second sentence.

## Epistemic levels

| Level | How to write it |
|-------|-----------------|
| Measured fact | State the number and source |
| Engine limit | "VSOP87 theory limit," "series valid 1885–2099" |
| Comparison | "Swiss Ephemeris 2.10 at N random instants" — give N or "hundreds" |
| Open question | Name it; don't fake closure |

Never dress conviction as measurement. Never dress marketing as engineering.

## Web pages

- **Playground (`/`)**: one sentence on what it does; links to proof, not adjectives.
- **Provenance (`/provenance`)**: table of sources; AGPL facts without sermonizing.
- **Validation (`/validation`)**: tables and commands; CI is a fact, not a slogan.
- **Build notes (`/notes`)**: postmortems with symptoms → cause → fix → test that caught it.

## For agents

1. Read this file before editing user-facing prose under `apps/web/` or `docs/`.
2. Run `npm run lint:prose` before finishing a copy pass.
3. Mechanical fixes (banned phrases, em dashes) are yours. Tone rewrites that need judgment: propose, don't silently manifesto-ize.
4. Prefer deleting a sentence over adding a clever one.
