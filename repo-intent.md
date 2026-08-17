# What this repo is for

**Plain-language reminder, written for future-you who hasn't touched this in a while.**

This is **the public website** — [gunnerthelab.com](https://gunnerthelab.com). It's
an Astro + Tailwind static site (based on the Dante theme) that publishes the
illustrated *Gunner the Lab* short stories, hosted on GitHub Pages with an
auto-deploy GitHub Action.

**Visibility: PUBLIC.** This is the one repo in the family that's meant to be seen —
readers, search engines, and anyone with the link can see everything here. Never put
anything private (drafts, illustration prompts, planning notes) in this repo — that
material lives in `gunner-studio` instead.

## What lives here

- `src/content/stories/` — the published story markdown (42 stories as of
  2026-08-17), one file per story, numbered `NN-slug.md`. Frontmatter fields:
  `title`, `storyNumber`, `subtitle`, `era`, `eraLabel`, `description`,
  `publishDate`, `timeframe`, `coverImage`, `artStyle`, `draft`, `order`, `seo` —
  enforced by a Zod schema in `src/content.config.ts`.
- `src/content/pages/` — static page content.
- `public/images/` — covers (`images/covers/`), inline scene illustrations
  (`images/stories/`), plus brand/hero/social/UI assets.
- `astro.config.mjs`, `tsconfig.json` — Astro build config.
- `tools/` — build/content helper scripts.

## How it relates to the other repos

- **`gunner-studio`** (private) — the workshop behind this storefront: prompts,
  drafts, style guides, planning. Nothing there is meant to end up here until a
  story is actually ready to publish.
- **`storyreader-gunner`** (private, being retired) — reads this repo's published
  markdown to generate the read/listen PWA content at `app.gunnerthelab.com` /
  `content.gunnerthelab.com`.
- **In progress (as of 2026-08-17):** a migration is moving `src/content/stories/`
  and `public/images/` *out* of this repo into a new private `gunner-content` repo,
  so both this site and a future StoryLark-based reader consume the same source of
  truth. The plan is to wire this repo to pull content from `gunner-content` via a
  GitHub Action at build time (read-only deploy key/PAT, no submodule), and only
  remove the duplicated local content once a build from the new source succeeds and
  renders identically. **As of now, nothing has moved yet** — this repo still holds
  the live copy of all 42 stories.

## If you're picking this back up cold

1. `npm install && npm run dev` to run it locally; `npm run build` to build.
2. The content schema lives in `src/content.config.ts` — if a story frontmatter
   field doesn't match, the build fails there, not silently.
3. Check whether the `gunner-content` migration (see `gunner-studio/pmo/plans/`)
   has landed — if it has, story content here may be Action-fetched rather than
   locally committed, so don't assume `src/content/stories/` is still the source
   of truth without checking the workflow file first.
