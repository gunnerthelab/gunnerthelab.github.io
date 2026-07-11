# Handoff

<!--
  Written at the END of every session by whichever tool was used.
  This is the single most important cross-tool file — the next session
  (possibly a different tool) starts by reading it.
-->

## 2026-07-11 - A1-site: PWA update toast + stale-cache fix

- **What changed and why:** The installed site PWA (gunnerthelab.com, added to home screen on iPhone/iPad) was serving stale cached content. Root cause: `CACHE_NAME` in `public/sw.js` was a static string, so the service worker script was byte-identical across deploys and the browser never detected an update, never re-ran `install`/`activate`, and never refreshed the precached shell. Fixed the root cause with per-deploy cache versioning and added a visible, user-confirmed update flow so an already-open tab is never swapped out from under the user silently.
- **Files touched:**
  - `astro.config.mjs` - new `swCacheBuster` integration; an `astro:build:done` hook stamps `dist/sw.js`'s `CACHE_NAME` with `GITHUB_SHA` (or a build timestamp for local builds). Only the `CACHE_NAME` string literal is touched so the explanatory comment above it stays readable.
  - `public/sw.js` - `CACHE_NAME` now carries a `__CACHE_VERSION__` placeholder (replaced only in the build artifact, source stays deterministic); `install` no longer auto-calls `skipWaiting()` (lets a real update sit in the "waiting" state instead of taking over immediately); added a `message` listener for `{type:'SKIP_WAITING'}`. `activate`'s old-cache cleanup was already correct and is unchanged.
  - `src/components/BaseHead.astro` - replaced the old "activated-state" banner with a toast keyed off `updatefound`/`registration.waiting`. Tapping it posts `SKIP_WAITING` to the waiting worker; the page reloads once on `controllerchange` (once-flag guard). Added a `visibilitychange` nudge that calls `registration.update()`, since iOS home-screen PWAs rarely re-check for updates on their own.
- **Commands / tests run and results:** `npm run build` passed (47 pages). Ran it twice locally and confirmed `dist/sw.js` got a different stamped `CACHE_NAME` suffix each time. `npx prettier --check` clean on all three touched files after `--write`.
- **Branch:** main - committed: yes - pushed: yes (see git log for hash).
- **Blockers:** None.
- **Exact next steps:** None required for this task. Optional future polish (not done, out of scope): reconsider whether the browser `Notification` ("New stories have been published!") in `sw.js`'s `activate` handler still makes sense now that `activate` only runs after a user-confirmed update (or true first install) rather than automatically on every deploy.

## Previous session (scaffold onboarding)

- **What changed and why:** Initial multi-model scaffold onboarding (AGENTS.md, CLAUDE.md shim, Codex/Copilot config, .mcp.json, .ai/ workspace).
- **Files touched:** AGENTS.md, CLAUDE.md, .codex/config.toml, .github/copilot-instructions.md, .mcp.json, .ai/*
- **Commands / tests run and results:** N/A - scaffold only
- **Branch:** main - committed: yes - pushed: no
- **Blockers:** None
- **Exact next steps:** Fill in .ai/memory/PROJECT_CONTEXT.md and .ai/memory/COMMANDS.md with real repo-specific detail.
