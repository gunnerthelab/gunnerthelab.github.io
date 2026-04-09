# The Adventures of Gunner the Lab... Oh, and Tiger Too

A collection of fun, illustrated short stories about a black lab named Gunner and his tabby cat sidekick Tiger — set across homesteads, road trips, and the kind of chaos only a loyal dog and a too-smart cat can create.

**Live site:** [gunnerthelab.com](https://gunnerthelab.com)

## Tech Stack

- [Astro](https://astro.build) — static site generator
- [Tailwind CSS](https://tailwindcss.com) — styling
- Based on the [Dante](https://github.com/JustGoodUI/dante-astro-theme) theme
- Hosted on GitHub Pages with auto-deploy via GitHub Actions

## Development

```bash
npm install
npm run dev        # local dev server at localhost:4321
npm run build      # production build to ./dist/
npm run preview    # preview the build locally
```

## Adding a Story

1. Create a new markdown file in `src/content/stories/` (or update an existing draft)
2. Set `draft: false` in the frontmatter when ready to publish
3. Push to `main` — GitHub Actions handles the rest

## Project Structure

```
src/
  content/stories/    # Story markdown files (33 total)
  content/pages/      # About page
  pages/              # Homepage, stories TOC, individual story routes
  components/         # Astro components (StoryCard, StoryNav, etc.)
  data/site-config.ts # Site-wide configuration
  styles/global.css   # Color palette, typography
resources/            # Internal reference docs (not published to site)
public/               # Static assets (CNAME, favicon, images)
```

## License

Story content is copyright. Theme based on Dante ([GPL-3.0](LICENSE)).
