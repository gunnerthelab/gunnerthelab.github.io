# The Adventures of Gunner the Lab... Oh, and Tiger Too

A collection of fun, illustrated short stories about a black lab named Gunner and his tabby cat sidekick Tiger — set across homesteads, road trips, and the kind of chaos only a loyal dog and a too-smart cat can create.

**Live site:** [gunnerthelab.com](https://gunnerthelab.com)

## Tech Stack

- [Astro](https://astro.build) — static site generator
- [Tailwind CSS](https://tailwindcss.com) — styling
- Based on the [Dante](https://github.com/JustGoodUI/dante-astro-theme) theme
- Hosted on GitHub Pages with auto-deploy via GitHub Actions

## Development

Story content lives in the private [`gunner-content`](https://github.com/gunnerthelab/gunner-content)
repo, not in this one (since 2026-08-17) — `src/content/stories/` and
`public/images/{covers,stories}/` are populated from it, not committed here.

```bash
npm install
npm run sync-content  # pulls stories + images from ../gunner-content (sibling checkout)
npm run dev            # local dev server at localhost:4321
npm run build           # production build to ./dist/
npm run preview        # preview the build locally
```

`sync-content` expects `gunner-content` cloned as a sibling directory
(`../gunner-content`); set `GUNNER_CONTENT_PATH` to point elsewhere. In CI,
`.github/workflows/deploy.yml` does the equivalent checkout + copy before
`astro build`, using a fine-grained PAT (`GUNNER_CONTENT_PAT` repo secret)
scoped to `Contents: Read` on `gunner-content` only.

## Adding a Story

Stories are authored in `gunner-content`, not here — see that repo's
`CONTRIBUTING.md`. Once pushed there and synced (`npm run sync-content` locally,
or automatically in CI), it appears on the next build.

## Project Structure

```
src/
  content/stories/    # Story markdown — synced from gunner-content, not committed here
  content/pages/      # About page
  pages/              # Homepage, stories TOC, individual story routes
  components/         # Astro components (StoryCard, StoryNav, etc.)
  data/site-config.ts # Site-wide configuration
  styles/global.css   # Color palette, typography
tools/sync-content.mjs # Pulls content from gunner-content (see Development above)
resources/            # Internal reference docs (not published to site)
public/               # Static assets (CNAME, favicon, images — covers/stories synced from gunner-content)
```

## License

Story content is copyright. Theme based on Dante ([GPL-3.0](LICENSE)).
