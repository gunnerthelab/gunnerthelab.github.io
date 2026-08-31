# Current task

_Nothing in flight on the site side._

Context as of 2026-08-30: this repo no longer masters the story content.
`src/content/stories/` and `public/images/` are synced in at build time from the private
`gunner-content` repo by `.github/workflows/deploy.yml` before the Astro build runs. Do not
treat the local copies as the source of truth.

The Astro-to-VitePress question was raised and answered on 2026-08-30: **stay on Astro.**
VitePress is a docs generator and this is an illustrated story site; the move would mean
rewriting all 23 components as a custom Vue theme and would drop the Zod frontmatter schema,
`astro:assets` image optimisation, and the RSS/sitemap integrations. Do not re-open.

The new-story push-alerts feature (see HANDOFF, 2026-07-11 S1-push) is still built and inert,
pending a CORS patch on the worker. That worker now lives in StoryLark (`storylark-gunner`),
not `storyreader-gunner`, so the original patch note points at a repo that is being archived.
Re-check where the push route actually lives before acting on it.
