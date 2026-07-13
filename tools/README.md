# tools/

Build-time and content-production scripts for the gunnerthelab.github.io site.
None of these run in the Astro build; they are invoked manually.

## mai-image.mjs

Illustration generator for the Gunner content-production run. Calls the
already-deployed Azure AI Foundry models on `aif-studioai-prod-eus-01`
(studio-foundry, This Is My Demo - MVP Subscription, East US) and writes
cover, scene, and marketing/branding art under `public/images/`. As of Phase
4 (2026-07-12) the tool supports three selectable image backends via
`--model`; MAI-Image-2.5 stays the default and every pre-Phase-4 command is
unchanged.

### Backends (`--model` / `--backend`)

| `--model` | Model | Deployment | References | Max output | Notes |
| --- | --- | --- | --- | --- | --- |
| `mai` (default) | MAI-Image-2.5 | `mai-image-25` | none (pseudo-reference only via `--edit-image`) | 1 MP | Unchanged from before Phase 4. |
| `flux2` | FLUX.2-pro | `flux-2-pro` | 0-8, via `--ref`/`--reference` | 4 MP | Primary FLUX pick: multi-reference character lock. |
| `flux-kontext` | FLUX.1-Kontext-pro | `flux-1-kontext-pro` | 0-1, via `--ref`/`--reference` | 1 MP | Single-reference in-context edits. |

`--ref`/`--reference <path[,path...]>` takes one or more reference image file
paths, repeatable and/or comma-separated. The intended sources are the
locked character sheets in `gunner-studio/characters/final/<character>/`,
the graphite style anchor frames in `characters/reference/stories/`, and the
real photos in `characters/reference/photos/`. `--ref` is rejected for
`--model mai` (use the existing `--edit-image` flag instead) and is capped
per backend (8 for `flux2`, 1 for `flux-kontext`).

Example, FLUX.2-pro multi-reference plan (no network call, `--dry-run`):

```bash
node tools/mai-image.mjs --story 01 --kind cover \
  --prompts ../gunner-studio/resources/Illustration_Prompts_All_Stories.md \
  --model flux2 \
  --ref "../gunner-studio/characters/final/gunner/locked-sheet.png,../gunner-studio/characters/reference/photos/gunner-portrait.jpg,../gunner-studio/characters/reference/stories/story-01-scene-01-the-orchard.png" \
  --dry-run
```

That plan prints, per image: the backend and deployment, the reference-image
count and paths, the resolved endpoint and host, the (possibly clamped) size,
and an estimated cost. It never calls the network.

### Auth per backend

- **mai** and **flux2**: Microsoft Entra ID bearer token (`az account
  get-access-token --resource https://cognitiveservices.azure.com`), reused
  across both. Microsoft Learn's FLUX documentation explicitly confirms Entra
  ID auth works on the BFL provider-specific API (the route `flux2` uses for
  multi-reference conditioning) with this same scope, so no new credential is
  needed for the flux2 happy path.
- **flux-kontext**: tries the same Entra bearer token first; if that is
  rejected after a token refresh retry, falls back once to an `api-key`
  header sourced at **runtime** from Key Vault (`kv-hcs-vault-01`, secret
  `studio-foundry-flux-image-key`) via `az keyvault secret show`. That secret
  does not exist in the vault yet (the image path has been keyless Entra to
  date) - the fallback exists so the tool degrades cleanly instead of
  crashing if Entra ever proves insufficient on this specific surface, not
  because a key is known to be required. The key is cached in memory only for
  the life of the process; it is never written to disk, logged, or committed.

### Endpoints

- `mai`: `{host}/mai/v1/images/generations` or `.../images/edits` (unchanged).
- `flux2`: `{host}/providers/blackforestlabs/v1/flux-2-pro?api-version=preview`
  (BFL provider-specific API - the documented route for FLUX.2's
  multi-reference conditioning; a different host,
  `aif-studioai-prod-eus-01.api.cognitive.microsoft.com`, than mai/flux-kontext
  use, per Microsoft Learn's own FLUX examples).
- `flux-kontext`: `{host}/openai/deployments/flux-1-kontext-pro/images/generations`
  or `.../images/edits` (the OpenAI-compatible Image API, same
  `services.ai.azure.com` host as `mai`), `?api-version=preview`. Routes to
  `images/edits` automatically when `--ref` supplies one file.

FLUX pricing is not as firmly confirmed as MAI's measured rate: `flux2`'s
per-image estimate is sourced from the public Azure pricing page for Black
Forest Labs models (checked 2026-07-12); `flux-kontext`'s estimate is an
explicitly-labeled UNVERIFIED placeholder. Both are flagged in `--dry-run`
output; verify against the real Azure cost view before any large batch FLUX
run. FLUX.2-pro's exact real-response JSON shape is also unconfirmed as of
this Phase 4 build (Microsoft Learn's own doc sample doesn't show field
names); `extractImageBuffer()` in `tools/mai-image.mjs` tries several
plausible shapes and fails loudly, listing the real response keys, if none
match, so the first real `flux2` call will surface exactly what needs a
one-line fix.

`--kind marketing` reads
`gunner-studio/resources/Branding_Illustration_Prompts.md` (logos, OG image,
social banners, YouTube banner, etc) and writes each buildable prompt to the
already-established file path recorded in `MARKETING_OUTPUT_MAP` in
`tools/mai-image.mjs` (every one of those files already exists today, so a
real run needs `--force` to overwrite it). Not every prompt in that doc is a
generation target; see the `MARKETING_OUTPUT_MAP` comment and the file-header
comment for the full breakdown of genuine-new-generation vs resize-only vs
out-of-scope prompts.

Prerequisite: `az login` as the owner, with "This Is My Demo - MVP
Subscription" as the active subscription. No new npm dependency was added for
FLUX; it reuses the same global `fetch`/`FormData`/`Blob` and the same `az`
CLI shell-out pattern the MAI path already used.

```bash
node tools/mai-image.mjs --help
```

Always prove a plan with `--dry-run` before a real (spend-incurring) run.
Every real run requires `--mai-budget-usd <n>` regardless of `--model`, a
hard cumulative-spend ledger stop tracked against
`public/images/provenance.json`.

Full flag reference, the prompt library's JSON and Markdown schemas, the FLUX
backend design (auth, endpoints, pricing, response-shape caveats), retry and
rate-limit behavior, and every design decision are documented in the
top-of-file comment in `tools/mai-image.mjs`.
