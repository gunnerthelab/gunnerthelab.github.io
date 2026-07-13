#!/usr/bin/env node
// MAI-Image-2.5 illustration generator for the Gunner content-production run.
//
// Calls the already-deployed Azure AI Foundry MAI-Image-2.5 model deployment
// (studio-foundry, This Is My Demo - MVP Subscription, East US) to generate
// story cover and scene art. This tool only WRITES files under
// public/images/; it never touches Azure infrastructure.
//
// Prerequisite: sign in with the Azure CLI first, as the owner
// (kris@hybridsolutions.cloud, default subscription "This Is My Demo - MVP
// Subscription"):
//
//   az login
//
// Auth is keyless Entra ID: this tool shells out to
// `az account get-access-token --resource https://cognitiveservices.azure.com`
// for a bearer token at startup, then caches it in memory and reuses it
// across calls (transparently re-shelling az to refresh it once it is older
// than ~45 minutes, or immediately on any 401, since Entra tokens for this
// resource are good for about 60 minutes and a long `--story all` run easily
// outlives that). No key, no @azure/identity dependency required. (If az CLI
// auth ever proves awkward, @azure/identity's DefaultAzureCredential is a
// drop-in alternative for getAccessToken() below, but the az-cli path stays
// the default so this tool adds no new dependency.)
//
// Usage:
//
//   node tools/mai-image.mjs --help
//
//   # Plan only, no network call, no file written:
//   node tools/mai-image.mjs --story 01 --kind scene --prompts ../gunner-studio/resources/prompts.json --dry-run
//
//   # Real run, one story, default 1 candidate per scene:
//   node tools/mai-image.mjs --story 01 --kind scene --prompts ../gunner-studio/resources/prompts.json --mai-budget-usd 5
//
//   # Real run, all covers, 3 candidates each, explicit budget stop:
//   node tools/mai-image.mjs --story all --kind cover --variants 3 --prompts ../gunner-studio/resources/prompts.json --mai-budget-usd 20
//
//   # Marketing/branding art, plan only:
//   node tools/mai-image.mjs --story all --kind marketing --prompts ../gunner-studio/resources/Branding_Illustration_Prompts.md --dry-run
//
//   # Marketing/branding art, one asset for real, forcing an overwrite of the
//   # existing established file (every mapped marketing asset already has a
//   # file on disk today, so --force is required for any of them to actually
//   # regenerate; see MARKETING_OUTPUT_MAP below and the tool's report):
//   node tools/mai-image.mjs --story 1 --kind marketing --prompts ../gunner-studio/resources/Branding_Illustration_Prompts.md --force --mai-budget-usd 5
//
//   # FLUX.2-pro, multi-reference character lock, plan only (Phase 4): feed the
//   # locked character sheet, a real photo, and a graphite style anchor frame
//   # as up to 8 reference images, conditioning one new scene render on all of
//   # them at once. No network call happens with --dry-run.
//   node tools/mai-image.mjs --story 01 --kind cover --prompts ../gunner-studio/resources/Illustration_Prompts_All_Stories.md \
//     --model flux2 \
//     --ref "../gunner-studio/characters/final/gunner/locked-sheet.png,../gunner-studio/characters/reference/photos/gunner-portrait.jpg,../gunner-studio/characters/reference/stories/story-01-scene-01-the-orchard.png" \
//     --dry-run
//
//   # FLUX.1-Kontext-pro, single-reference edit, plan only: anchor one existing
//   # image and edit it in-context. --ref accepts exactly one file for this
//   # backend (it routes through the images/edits endpoint); use flux2 above
//   # for more than one reference image.
//   node tools/mai-image.mjs --story 01 --kind scene --prompts ../gunner-studio/resources/Illustration_Prompts_All_Stories.md \
//     --model flux-kontext --ref ../gunner-studio/characters/final/gunner/locked-sheet.png --dry-run
//
// FLUX backend (Phase 4, added 2026-07-12):
//
//   FLUX is deployed on the same foundry (aif-studioai-prod-eus-01) as a
//   selectable backend alongside MAI-Image-2.5, via --model. mai stays the
//   default and every existing story/cover/scene/marketing flow is unchanged
//   when --model is omitted or passed as "mai".
//
//     --model mai            (default) MAI-Image-2.5, unchanged from before.
//     --model flux2           FLUX.2-pro (deployment flux-2-pro). Primary FLUX
//                              pick: multi-reference conditioning, up to 8
//                              reference images, up to 4 MP output. Calls the
//                              BFL provider-specific API
//                              (providers/blackforestlabs/v1/flux-2-pro),
//                              which is the endpoint Microsoft Learn documents
//                              as supporting FLUX.2's multi-reference
//                              conditioning (the classic openai/deployments
//                              images/generations surface does not document
//                              multi-image reference support for FLUX.2).
//     --model flux-kontext     FLUX.1-Kontext-pro (deployment
//                              flux-1-kontext-pro). Single-reference edits via
//                              the openai/deployments/.../images/edits
//                              endpoint when --ref supplies one file; plain
//                              text-to-image via images/generations when no
//                              --ref is given. Capped at 1 reference image and
//                              1 MP output (Microsoft Learn).
//
//   --ref / --reference <path[,path...]>   repeatable, or comma-separated in
//                              one flag, or both. Reference image file paths
//                              (locked character sheets in
//                              gunner-studio/characters/final/<character>/,
//                              graphite style anchor frames in
//                              characters/reference/stories/, or the real
//                              photos in characters/reference/photos/). Only
//                              valid with --model flux2 (0-8 files) or
//                              --model flux-kontext (0-1 file); rejected for
//                              --model mai (use --edit-image instead, the
//                              existing MAI pseudo style-reference arm).
//
//   Auth per backend:
//     mai            Entra ID bearer token (unchanged; az account
//                     get-access-token, resource https://cognitiveservices.azure.com).
//     flux2          Same Entra ID bearer token, reused as-is. Microsoft
//                     Learn's FLUX doc explicitly documents Entra ID auth on
//                     the BFL provider-specific API with the same
//                     https://cognitiveservices.azure.com/.default scope this
//                     tool already acquires for MAI, so no new credential is
//                     needed for the happy path.
//     flux-kontext   Tries the same Entra ID bearer token first (Azure
//                     OpenAI-compatible surfaces generally accept it). If
//                     that is rejected after MAX_TOKEN_REFRESH_RETRIES
//                     refreshes, falls back once to an api-key header sourced
//                     at RUNTIME from Key Vault (kv-hcs-vault-01, secret name
//                     in FLUX_KEY_VAULT_SECRET_NAME below), via
//                     `az keyvault secret show`. The key is cached in memory
//                     only for the life of this process; it is never written
//                     to disk, logged, or committed. That secret does not
//                     exist in the vault yet (see studio-foundry
//                     ai/implementation/as-built.md, which records the image
//                     path as keyless Entra); the fallback exists so this
//                     tool degrades cleanly instead of crashing if Entra ever
//                     proves insufficient for this specific surface, not
//                     because a key is known to be required today.
//
//   FLUX pricing note: FLUX.2-pro's per-image cost estimate below is sourced
//   from the public Azure pricing page for Black Forest Labs models (first
//   megapixel $0.03, each additional megapixel $0.015, each reference image
//   $0.015/MP, checked 2026-07-12) and is an approximation (assumes ~1 MP per
//   reference image). FLUX.1-Kontext-pro has no confirmed published per-image
//   rate as of this writing; its estimate is an explicitly-labeled UNVERIFIED
//   placeholder for budget planning only. Both are clearly flagged as
//   estimates in --dry-run output; verify against the real Azure invoice or
//   portal cost view before any large batch FLUX run.
//
//   Response-shape note: the exact JSON field names FLUX.2-pro's BFL
//   provider-specific API returns for the generated image (base64 vs URL,
//   and under which key) are NOT confirmed by this Phase 4 build; Microsoft
//   Learn's own sample only prints the parsed response without documenting
//   field names. extractImageBuffer() below tries several plausible shapes
//   and fails loudly (listing the real top-level keys) if none match. This
//   is expected to need a one-line fix after the first real flux2 call; see
//   that function's comment.
//
// Flags:
//   --story <id|all>          required. Zero-padded story id ("01") matching
//                              the on-disk naming (public/images/covers/story-01.png)
//                              for --kind cover|scene, or the branding prompt
//                              id ("1", "8b", ...) from MARKETING_OUTPUT_MAP for
//                              --kind marketing; or "all" to generate every
//                              matching entry present in the prompt library.
//   --kind cover|scene|marketing
//                              required. cover -> public/images/covers/story-<id>.png
//                              scene -> public/images/stories/<id>/<filename>.png
//                              marketing -> a fixed established path per
//                              MARKETING_OUTPUT_MAP (logos, OG image, social
//                              banners, YouTube banner, etc; see that map and
//                              parseBrandingMarkdown() below for the doc shape).
//   --prompts <path>          required (except with --help). Path to the prompt
//                              library, .json or .md. See "Prompt library" below.
//   --variants <n>             default 1. Candidate images per prompt. 1 writes
//                              the canonical filename directly; >1 writes every
//                              candidate with a "-vN" suffix so all coexist for a
//                              human pick-best pass (never auto-overwrites the
//                              canonical file when N > 1).
//   --size <WxH>               overrides the per-kind default size for every
//                              planned image this run. Always clamped to the
//                              MAI 1,048,576-pixel cap (see clampToCap below);
//                              a clamp is logged, never silent in --dry-run output.
//   --out <dir>                overrides the computed output directory (default:
//                              public/images/covers or public/images/stories/<id>).
//                              Useful for staging candidates outside the real
//                              asset tree before a pick-best pass.
//   --edit-image <path>        optional. Forces every planned image this run
//                              through the /mai/v1/images/edits endpoint
//                              (pseudo style-reference arm, ADR-0002) using this
//                              file as the input image. A prompt-library entry's
//                              own "editImage" field (see schema) is used instead
//                              when --edit-image is not passed.
//   --dry-run                  print the full plan (host, endpoint, size, prompt
//                              length, output path, estimated cost, running
//                              budget total) and exit. NEVER calls az CLI or the
//                              network. Safe to run any time.
//   --force                    regenerate and overwrite even if the target file
//                              already exists. Without --force, an existing file
//                              is skipped (no API call, no spend).
//   --mai-budget-usd <n>       required for a real (non-dry-run) run. Hard ledger
//                              stop: before every single image, this tool sums
//                              estCostUsd across the existing provenance.json
//                              plus everything generated so far THIS run, adds
//                              the estimated USD cost of the next image (flat
//                              ~0.048 USD for --model mai; a per-megapixel
//                              estimate for --model flux2; an UNVERIFIED flat
//                              placeholder for --model flux-kontext; see the
//                              "FLUX pricing note" above), and refuses to
//                              start that call if the total would exceed the
//                              budget. The run stops cleanly (provenance for
//                              completed images is still written); it never
//                              partially spends past the cap. The flag name
//                              is unchanged (--mai-budget-usd) even for FLUX
//                              runs, to keep one budget flag across backends.
//   --model mai|flux2|flux-kontext
//                              default mai. Selects the image-generation
//                              backend; see "FLUX backend" above.
//   --backend                  alias for --model.
//   --ref <path[,path...]>     repeatable and/or comma-separated. Reference
//                              image file path(s) for FLUX multi-reference
//                              (flux2, up to 8) or single-reference (flux-kontext,
//                              up to 1) conditioning. See "FLUX backend" above.
//   --reference                alias for --ref.
//   --help                     print this block and exit 0.
//
// Prompt library (--prompts):
//
//   JSON shape (the documented, generator-agnostic source of truth):
//
//     {
//       "covers": {
//         "01": "full cover prompt text for story 01",
//         "13": { "prompt": "...", "size": { "width": 1248, "height": 832 },
//                 "editImage": "public/images/covers/story-01.png" }
//       },
//       "scenes": {
//         "01": [
//           { "filename": "story-01-scene-01-the-orchard",
//             "prompt": "full scene prompt text",
//             "size": { "width": 1248, "height": 832 },
//             "editImage": "public/images/stories/01/story-01-scene-01-the-orchard.png" }
//         ]
//       }
//     }
//
//   Every field except "prompt" (and "filename" for scenes) is optional.
//   "editImage" is a repo-relative or absolute path to an existing PNG/JPEG;
//   when present (or when --edit-image is passed), that entry generates via
//   the edits endpoint instead of generations.
//
//   MD shape (auto-detected by .md extension): this tool understands the
//   structure already used in
//   gunner-studio/resources/Illustration_Prompts_All_Stories.md, both the
//   per-story cover block and each scene block:
//
//     ### Story 1: The Voyage Home, Going East
//     ...
//     **Cover**
//     `Filename: story-01-cover.png`
//
//     <cover prompt paragraph>
//
//     ---
//
//     **Scene 1, The Orchard**
//     `Filename: story-01-scene-01-the-orchard.png`
//
//     <scene prompt paragraph>
//
//     ---
//
//   Repeated per story/scene. Cover and Scene blocks are both grouped under
//   the nearest preceding "### Story N: ..." heading. The punctuation
//   between the scene number and its title is not pinned to one character
//   (the source document has used a comma and, in an earlier revision, a
//   dash there), so the parser accepts any punctuation in that spot. A
//   --kind cover run against an .md file with no "**Cover**" blocks errors
//   with a clear message asking for a JSON file with a "covers" object.
//
//   Marketing shape (--kind marketing only, auto-detected by .md extension,
//   parsed by parseBrandingMarkdown() below): the structure used in
//   gunner-studio/resources/Branding_Illustration_Prompts.md:
//
//     **Prompt 1, The Family Portrait:**
//     <prose prompt paragraph, one or more lines>
//     **Output size: 1080×1080 (square). Save as: `family-portrait-social.png`**
//
//   Every prompt block is a "**Prompt N, Title:**" heading (N may carry a
//   letter suffix, e.g. "8b"), a prose paragraph, and a single-line bolded
//   "**Output size: ...**" closing line that may additionally mention an
//   "Existing file: `name.png` (WxH)" clause and a "Save as:" or "Save new
//   generation as:" clause with a backticked filename. Not every prompt block
//   in the source document has that closing line (some, like the merch and
//   seasonal-post prompts, are free-form prose only); those parse with a
//   prompt and title but no size, and are therefore never buildable (see
//   MARKETING_OUTPUT_MAP below, which is the deliberately curated allow-list
//   of prompt ids this tool actually knows how to plan/generate).
//
//   IMPORTANT, and the reason MARKETING_OUTPUT_MAP exists as a separate,
//   hand-maintained table rather than trusting the doc's own suggested
//   filenames: the doc's suggested "Save as" filenames (e.g.
//   "family-portrait-social.png") do NOT match this repo's actual, already-
//   established public/images/ layout (e.g. the real file is
//   public/images/brand/logo-family-portrait.png). The doc is a stale plan,
//   not a live manifest. MARKETING_OUTPUT_MAP maps each buildable prompt id
//   to the real, currently-established file path (verified by hand against
//   the on-disk tree), so a real run with --force actually refreshes the
//   asset the site and social channels already use, instead of writing an
//   orphan file nothing references.
//
// Robustness: retries on 429 and 5xx with exponential backoff, honoring a
// Retry-After header when present. On a 401, forces a token refresh and
// retries the same host (up to MAX_TOKEN_REFRESH_RETRIES times) before ever
// falling back; only falls back from the primary host to the
// cognitiveservices.azure.com host on 403, or on a 401 that survives a
// refreshed token. Paces real calls at roughly 6.5 seconds apart to respect
// the Tier 5 (10 RPM) quota on this deployment.
//
// No em-dashes anywhere in this file (grepped before every commit; hard rule).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve, dirname, basename, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---- Confirmed recipe (ai/verification/deployment-verification.md, ADR-0002) ----

const PRIMARY_HOST = 'https://aif-studioai-prod-eus-01.services.ai.azure.com';
const FALLBACK_HOST = 'https://aif-studioai-prod-eus-01.cognitiveservices.azure.com';
const MODEL = 'mai-image-25';
const TOKEN_RESOURCE = 'https://cognitiveservices.azure.com';
const MAX_PIXELS = 1_048_576;
const MIN_DIM = 768;

// ---- FLUX backend (Phase 4) ----
//
// FLUX's BFL provider-specific API (the only documented route for FLUX.2-pro
// multi-reference conditioning) is served on the classic Cognitive Services
// hostname, per Microsoft Learn's own FLUX doc examples (distinct from
// PRIMARY_HOST above, which is the newer services.ai.azure.com host MAI and
// FLUX's OpenAI-compatible Image API both use). Same underlying account
// (aif-studioai-prod-eus-01), different documented hostname for this one
// route.
const FLUX_BFL_HOST = 'https://aif-studioai-prod-eus-01.api.cognitive.microsoft.com';
const FLUX_API_VERSION = 'preview';

// Deployment names as recorded in the studio-foundry repo's deployment
// inventory (D:/git/thisismydemo/studio-foundry/ai/TASKS.md, "2026-07-12 -
// Foundry deployments" section): mai-image-25 (baseline/fallback), flux-2-pro,
// flux-1-kontext-pro. flux-1.1-pro is also deployed but has no character-lock
// use case for this tool (text-only, no reference image) and is intentionally
// not wired up as a --model choice here.
const BACKENDS = {
  mai: { deployment: MODEL, maxRefImages: 0 },
  flux2: { deployment: 'flux-2-pro', maxRefImages: 8 },
  'flux-kontext': { deployment: 'flux-1-kontext-pro', maxRefImages: 1 },
};

// Per-backend hard pixel cap for clampToCap(). FLUX.2-pro's documented max
// output resolution is 4 MP (Microsoft Learn, "Deploy and use FLUX models in
// Microsoft Foundry"); FLUX.1-Kontext-pro's is 1 MP, the same cap MAI already
// uses, so it reuses MAX_PIXELS directly.
const MAX_PIXELS_BY_BACKEND = {
  mai: MAX_PIXELS,
  flux2: 4_194_304,
  'flux-kontext': MAX_PIXELS,
};

// Key Vault fallback for flux-kontext only, if the reused Entra bearer token
// is ever rejected on that specific surface (see the "Auth per backend"
// file-header note above). Fetched at RUNTIME only, never written to disk.
// This secret does not exist in the vault as of this Phase 4 build (the
// image path has been keyless Entra to date, per studio-foundry
// ai/implementation/as-built.md); a real flux-kontext run that needs this
// fallback will fail with a clear message telling the operator the secret is
// missing, not a silent or destructive failure.
const KEY_VAULT_NAME = 'kv-hcs-vault-01';
const FLUX_KEY_VAULT_SECRET_NAME = 'studio-foundry-flux-image-key';

// FLUX.2-pro pricing: Azure pricing page for Black Forest Labs models
// (azure.microsoft.com/pricing/details/ai-foundry-models/black-forest-labs),
// checked 2026-07-12: first generated megapixel $0.03, each additional
// megapixel $0.015, each reference image $0.015/MP. The per-reference charge
// assumes ~1 MP per reference image (an approximation; the real charge
// depends on each reference file's actual pixel count, which this tool does
// not currently inspect). FLUX.1-Kontext-pro has no confirmed published
// per-image rate as of this writing; FLUX_KONTEXT_FLAT_EST_COST_USD is an
// explicitly-UNVERIFIED placeholder, deliberately set a little above MAI's
// measured rate so the budget gate errs toward stopping early rather than
// overspending. Verify both against the real Azure cost view before any
// large batch FLUX run.
const FLUX2_RATE_USD_PER_MP = { first: 0.03, extra: 0.015, ref: 0.015 };
const FLUX_KONTEXT_FLAT_EST_COST_USD = 0.06; // UNVERIFIED placeholder, see comment above

// Standardized defaults (ADR-0002 decision 3). Covers historically wanted
// 1264x848 (the existing on-disk covers); that exceeds the cap, so the
// requested size below always runs through clampToCap() rather than being
// hardcoded to the clamped result, keeping the clamp logic exercised and
// visible even for the default path.
const REQUESTED_SIZE_BY_KIND = {
  cover: { width: 1264, height: 848 },
  scene: { width: 1248, height: 832 },
};

// ---- Marketing/branding art (--kind marketing) ----
//
// Curated allow-list mapping each buildable prompt id from
// Branding_Illustration_Prompts.md to the real, already-established output
// path in this repo (verified by hand against public/images/ on 2026-07-12;
// see tools/README.md and the file-header comment above for why this table
// exists instead of trusting the doc's own suggested filenames).
//
// Every one of these paths already has a file on disk today (they are the
// live assets the site/social channels currently use), so a real
// (non-dry-run) invocation needs --force to overwrite any of them; without
// --force the tool's normal skip-if-exists behavior means nothing will be
// generated. Prompt ids intentionally NOT in this map (7, 9, 10, 13-20) are
// either already-correct/"already in use" per the doc's own text (7, 9, 10)
// or lack the doc's machine-parseable "Output size / Save as" closing line
// entirely and/or have no corresponding on-disk asset today (13-20); see
// the tool's dry-run/report output and the task write-up for the full
// breakdown of which prompts are genuine new-generation candidates.
const MARKETING_OUTPUT_MAP = {
  // Prompt 1, The Family Portrait -> the family-portrait slot used by
  // src/content/pages/about.md. Doc requests 1080x1080; no existing-file
  // clause in the doc's own text, but the real slot already holds a
  // 1024x1024 master.
  '1': { outFile: 'public/images/brand/logo-family-portrait.png' },
  // Prompt 2, Gunner & Tiger Only (Simple Profile) -> the Instagram profile
  // slot. Doc offers "resize existing 2048x2048 file" as a sufficient
  // alternative to fresh generation; this maps to the same real slot so a
  // fresh MAI generation (with --force) refreshes it in place.
  '2': { outFile: 'public/images/social/instagram-profile.png' },
  // Prompt 3, Tiger on Gunner (The Classic) -> the Instagram alternate slot.
  '3': { outFile: 'public/images/social/instagram-alternate.png' },
  // Prompt 4, The Full Adventure -> the website hero slot (16:9 master,
  // currently oversized at 2752x1536; doc requests 1920x1080).
  '4': { outFile: 'public/images/hero/hero-adventure-cover.png' },
  // Prompt 5, The Porch Scene (Horizontal Banner) -> the hero-folder porch
  // banner slot (3:1, doc requests 1500x500).
  '5': { outFile: 'public/images/hero/hero-porch-scene-banner.png' },
  // Prompt 6, Title Card Hero -> the website hero alternate slot.
  '6': { outFile: 'public/images/hero/hero-title-card.png' },
  // Prompt 8b, Duo Emblem OG Image (landscape) -> the OG/social-preview
  // image referenced by src/data/site-config.ts. The doc's heading flags
  // this one explicitly "(landscape, NEW, needs generation)"; a file
  // already exists on disk at the exact requested 1200x630, so it was
  // apparently already produced in an earlier pass and --force is required
  // to refresh it again.
  '8b': { outFile: 'public/images/brand/og-default-image.png' },
  // Prompt 11, Facebook/Twitter Banner (Wide) -> a genuinely DIFFERENT scene
  // (dirt road/autumn) than Prompt 5's porch scene, offered by the doc as an
  // alternate for the same Facebook/Twitter banner slot ("viable
  // substitute"). Deliberately NOT mapped onto the same file as Prompt 5 to
  // avoid a same-file collision between two different concepts in one
  // library; this path does not exist on disk yet, so it needs no --force
  // and is a genuine candidate/pick-best alongside Prompt 5.
  '11': { outFile: 'public/images/social/banner-facebook-twitter-alt.png' },
  // Prompt 12, YouTube/Channel Banner -> the YouTube banner referenced
  // nowhere in code (published directly to YouTube) but present in brand/.
  // Doc heading flags this one explicitly "(NEW, needs generation)"; a file
  // already exists on disk at the exact requested 2560x1440, same situation
  // as Prompt 8b: --force needed to refresh.
  '12': { outFile: 'public/images/brand/youtube-channel-banner.png' },
};

// Appended to every extracted marketing prompt's text, per the "Add quality
// tags to all prompts" instruction in Branding_Illustration_Prompts.md's
// closing Notes section (most branding prompts, unlike the story cover/scene
// prompts, do not already embed this trailer in their own prose).
const QUALITY_TAG_SUFFIX =
  'Storybook illustration style, professional quality, hand-drawn colored ' +
  'pencil texture, warm color palette. Gunner: large black Labrador ' +
  'Retriever, hunter safety orange collar, never without it. Tiger: gray ' +
  'and brown tabby cat, NOT orange.';

// Rate card (ai/plans/source/mai-image-2-5-art-match.md, cited as unconfirmed
// pending a live portal read; ai/verification/deployment-verification.md
// measured about 0.048 USD for one real call). Used to turn a real response's
// `usage` block into a cost, and as the flat per-image estimate for the
// pre-flight budget gate and for --dry-run reporting.
const RATE_USD_PER_MILLION = { textInput: 5, imageInput: 8, output: 47 };
const FLAT_EST_COST_USD = 0.048;

const RATE_LIMIT_SPACING_MS = 6500; // Tier 5 = 10 RPM; leave margin
const MAX_RETRIES = 5;

// Entra access tokens for this resource are good for about 60 minutes.
// Refresh proactively before that expiry, and refresh + retry on a 401 too
// (belt and suspenders, since a run's actual pacing can drift). A long
// `--story all` batch easily runs past 60 minutes, so a single token fetched
// once at startup is not enough.
const TOKEN_MAX_AGE_MS = 45 * 60 * 1000;
const MAX_TOKEN_REFRESH_RETRIES = 2;

const HELP_TEXT = `MAI-Image-2.5 illustration generator (Gunner content production)

Prerequisite: az login   (signs in as the owner; default subscription
"This Is My Demo - MVP Subscription" must be the active one)

Usage:
  node tools/mai-image.mjs --story <id|all> --kind cover|scene|marketing --prompts <path> [options]

Required:
  --story <id|all>       zero-padded story id ("01"), a branding prompt id
                          ("1", "8b", ...) for --kind marketing, or "all"
  --kind cover|scene|marketing
                          output family. marketing writes to the fixed,
                          already-established path in MARKETING_OUTPUT_MAP
                          (see file header) for logos/OG/social/YouTube art
  --prompts <path>        prompt library, .json or .md (see file header for
                          schema; marketing only supports .md today, in the
                          Branding_Illustration_Prompts.md shape)

Options:
  --variants <n>          candidates per prompt (default 1)
  --size <WxH>            override size for this run, always clamped to the
                          per-backend pixel cap (1,048,576 px for mai and
                          flux-kontext; 4,194,304 px for flux2)
  --out <dir>             override the output directory
  --edit-image <path>     force the edits endpoint with this input image
                          (--model mai only; use --ref for FLUX)
  --model mai|flux2|flux-kontext
                          default mai. Selects the image backend; see the
                          "FLUX backend" block in the file header.
  --backend               alias for --model
  --ref <path[,path...]>  reference image path(s) for FLUX conditioning,
                          repeatable and/or comma-separated (flux2: 0-8,
                          flux-kontext: 0-1; rejected for --model mai)
  --reference              alias for --ref
  --dry-run               print the plan, no network call, no file written
  --force                 overwrite existing files
  --mai-budget-usd <n>    required for a real run; hard cumulative spend cap
                          (flag name is shared across all backends)
  --help                  this text

See the top-of-file comment in tools/mai-image.mjs for the full prompt
library JSON/MD schema and every flag's exact behavior.
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP_TEXT);
    return;
  }

  const storyArg = requireArg(args, 'story');
  const kind = requireArg(args, 'kind');
  if (kind !== 'cover' && kind !== 'scene' && kind !== 'marketing') {
    fail(`--kind must be "cover", "scene", or "marketing", got "${kind}"`);
  }
  const promptsPath = requireArg(args, 'prompts');
  const dryRun = Boolean(args['dry-run']);
  const force = Boolean(args.force);
  const variants = args.variants ? Number(args.variants) : 1;
  if (!Number.isInteger(variants) || variants < 1) {
    fail(`--variants must be a positive integer, got "${args.variants}"`);
  }
  const sizeOverride = args.size ? parseSize(args.size) : null;
  const outOverride = args.out ? resolveMaybeAbsolute(args.out) : null;
  const editImageOverride = args['edit-image'] ? resolveMaybeAbsolute(args['edit-image']) : null;

  // --model / --backend (default "mai", unchanged behavior) and --ref /
  // --reference (FLUX only). See "FLUX backend" in the file header comment.
  const model = resolveModelArg(args);
  if (!(model in BACKENDS)) {
    fail(`--model must be one of ${Object.keys(BACKENDS).join(', ')}, got "${model}"`);
  }
  const refPaths = collectRefPaths(args);
  if (refPaths.length > 0 && model === 'mai') {
    fail('--ref/--reference is only supported with --model flux2 or --model flux-kontext (mai-image-25 has no reference-image conditioning path in this tool). Use --edit-image for the existing MAI pseudo style-reference arm instead.');
  }
  const maxRefImages = BACKENDS[model].maxRefImages;
  if (refPaths.length > maxRefImages) {
    fail(`--model ${model} accepts at most ${maxRefImages} reference image(s) (got ${refPaths.length}).${model === 'flux-kontext' ? ' Use --model flux2 for multi-reference conditioning (up to 8 images).' : ''}`);
  }
  for (const p of refPaths) {
    if (!existsSync(p)) fail(`Reference image not found: ${relToRoot(p)}`);
  }
  if (editImageOverride && model !== 'mai') {
    fail('--edit-image is a --model mai flag (the MAI pseudo style-reference arm). Use --ref/--reference for FLUX reference-image conditioning instead.');
  }

  let budgetUsd = null;
  if (!dryRun) {
    const raw = requireArg(args, 'mai-budget-usd');
    budgetUsd = Number(raw);
    if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
      fail(`--mai-budget-usd must be a positive number, got "${raw}"`);
    }
  } else if (args['mai-budget-usd']) {
    budgetUsd = Number(args['mai-budget-usd']);
  }

  const library = await loadPromptLibrary(resolveMaybeAbsolute(promptsPath), kind);
  const plan = buildPlan({ library, storyArg, kind, variants, sizeOverride, outOverride, editImageOverride, backend: model, refPaths });

  if (plan.length === 0) {
    fail(`No prompt-library entries matched --story ${storyArg} --kind ${kind}. Check the prompt library and the story id.`);
  }

  const provenancePath = join(ROOT, 'public', 'images', 'provenance.json');
  const existingProvenance = await loadProvenance(provenancePath);
  let cumulativeSpentUsd = sumProvenanceCost(existingProvenance);

  console.log(`Plan: ${plan.length} image${plan.length === 1 ? '' : 's'} (${kind}, story ${storyArg}, ${variants} variant${variants === 1 ? '' : 's'} each requested prompt)`);
  console.log(`Prior recorded spend in provenance.json: $${cumulativeSpentUsd.toFixed(4)}`);
  if (budgetUsd !== null) console.log(`Budget for this invocation: $${budgetUsd.toFixed(2)}`);
  console.log('');

  if (dryRun) {
    for (const job of plan) {
      const projected = cumulativeSpentUsd + estimateCostEstimateForJob(job);
      const overBudget = budgetUsd !== null && projected > budgetUsd;
      cumulativeSpentUsd = projected;
      printDryRunJob(job, projected, overBudget);
    }
    console.log('');
    console.log(`[dry-run] No network call made. No file written. No az CLI invoked. Projected cumulative spend if this plan ran for real: $${cumulativeSpentUsd.toFixed(4)}${budgetUsd !== null && cumulativeSpentUsd > budgetUsd ? ' (EXCEEDS the given --mai-budget-usd)' : ''}`);
    return;
  }

  console.log('Fetching an Entra access token via az CLI (az account get-access-token)...');
  const tokenState = { token: await getAccessToken(), fetchedAt: Date.now() };
  console.log('Token acquired.');
  console.log('');

  const newProvenanceEntries = [];
  let firstCall = true;

  for (const job of plan) {
    if (!force && existsSync(job.outFile)) {
      console.log(`[skip] ${relToRoot(job.outFile)} already exists (use --force to regenerate)`);
      continue;
    }

    const projected = cumulativeSpentUsd + estimateCostEstimateForJob(job);
    if (projected > budgetUsd) {
      console.error('');
      console.error(`[budget] Stopping before ${relToRoot(job.outFile)}: projected spend $${projected.toFixed(4)} would exceed --mai-budget-usd ${budgetUsd.toFixed(2)}.`);
      console.error(`[budget] Prior spend recorded: $${cumulativeSpentUsd.toFixed(4)}. Raise the budget or run a smaller --story/--variants selection to continue.`);
      break;
    }

    if (!firstCall) await sleep(RATE_LIMIT_SPACING_MS);
    firstCall = false;

    const backendNote = job.backend !== 'mai' ? `  (backend=${job.backend}${job.refPaths.length ? `, ${job.refPaths.length} reference image${job.refPaths.length === 1 ? '' : 's'}` : ''})` : '';
    console.log(`[gen] ${relToRoot(job.outFile)}  size=${job.width}x${job.height}${job.editImagePath ? '  (edits endpoint, pseudo style-reference)' : ''}${backendNote}`);

    let result;
    try {
      result = await generateImage(job, tokenState);
    } catch (err) {
      console.error(`[error] ${relToRoot(job.outFile)}: ${err.message}`);
      continue;
    }

    let imageBuf;
    if (job.backend === 'mai') {
      const b64 = result.json?.data?.[0]?.b64_json;
      if (!b64) {
        console.error(`[error] ${relToRoot(job.outFile)}: response had no data[0].b64_json. Raw keys: ${Object.keys(result.json ?? {}).join(', ')}`);
        continue;
      }
      imageBuf = Buffer.from(b64, 'base64');
    } else {
      try {
        imageBuf = await extractImageBuffer(job.backend, result.json);
      } catch (err) {
        console.error(`[error] ${relToRoot(job.outFile)}: ${err.message}`);
        continue;
      }
    }

    await mkdir(dirname(job.outFile), { recursive: true });
    await writeFile(job.outFile, imageBuf);

    const usage = result.json.usage ?? null;
    // Usage-based cost accounting (RATE_USD_PER_MILLION) is confirmed only
    // for MAI's response shape; FLUX's usage/cost fields are unconfirmed as
    // of this Phase 4 build, so FLUX always falls back to the pre-flight
    // per-image estimate (estimateCostEstimateForJob) rather than a possibly
    // wrong measured figure.
    const measuredCost = job.backend === 'mai' ? estimateCostFromUsage(usage) : null;
    const estCostUsd = measuredCost ?? estimateCostEstimateForJob(job);
    cumulativeSpentUsd += estCostUsd;

    console.log(`  -> wrote ${(imageBuf.length / 1024).toFixed(0)} KB, host=${result.host}, cost~$${estCostUsd.toFixed(4)}, running total $${cumulativeSpentUsd.toFixed(4)}`);

    newProvenanceEntries.push({
      file: relToRoot(job.outFile).replace(/\\/g, '/'),
      storyId: job.storyId,
      kind: job.kind,
      variant: job.variantLabel,
      prompt: job.prompt,
      model: job.backend === 'mai' ? MODEL : job.deploymentName,
      ...(job.backend !== 'mai' ? { backend: job.backend, referenceImages: job.refPaths.map((p) => relToRoot(p).replace(/\\/g, '/')) } : {}),
      size: `${job.width}x${job.height}`,
      width: job.width,
      height: job.height,
      usageTokens: usage,
      estCostUsd,
      host: result.host,
      generatedAtNote: 'timestamp set at write time by this run',
      generatedAt: new Date().toISOString(),
    });
  }

  if (newProvenanceEntries.length > 0) {
    const merged = mergeProvenance(existingProvenance, newProvenanceEntries);
    await mkdir(dirname(provenancePath), { recursive: true });
    await writeFile(provenancePath, JSON.stringify(merged, null, 2) + '\n');
    console.log('');
    console.log(`Wrote ${newProvenanceEntries.length} new provenance record(s) to ${relToRoot(provenancePath)} (${merged.length} total).`);
  } else {
    console.log('');
    console.log('No new images written; provenance.json unchanged.');
  }

  console.log(`Final cumulative spend recorded: $${cumulativeSpentUsd.toFixed(4)}`);
}

// ---- Planning ----

function buildPlan({ library, storyArg, kind, variants, sizeOverride, outOverride, editImageOverride, backend, refPaths }) {
  if (kind === 'marketing') return buildMarketingPlan({ library, storyArg, variants, sizeOverride, outOverride, editImageOverride, backend, refPaths });

  const bucket = kind === 'cover' ? library.covers : library.scenes;
  if (!bucket || Object.keys(bucket).length === 0) {
    fail(`The prompt library has no "${kind === 'cover' ? 'covers' : 'scenes'}" entries. See tools/mai-image.mjs header for the expected shape.`);
  }

  const storyIds = storyArg === 'all' ? Object.keys(bucket) : [storyArg];
  for (const id of storyIds) {
    if (!(id in bucket)) fail(`Story "${id}" has no ${kind} entry in the prompt library.`);
  }

  const plan = [];
  for (const storyId of storyIds) {
    if (kind === 'cover') {
      const entry = normalizeCoverEntry(bucket[storyId]);
      plan.push(...expandVariants({ storyId, kind, entry, filenameBase: `story-${storyId}`, variants, sizeOverride, outOverride, editImageOverride, defaultOutDir: join(ROOT, 'public', 'images', 'covers'), backend, refPaths }));
    } else {
      const entries = bucket[storyId];
      if (!Array.isArray(entries) || entries.length === 0) {
        fail(`Story "${storyId}" scenes entry must be a non-empty array. See tools/mai-image.mjs header for the expected shape.`);
      }
      const defaultOutDir = join(ROOT, 'public', 'images', 'stories', storyId);
      for (const raw of entries) {
        const entry = normalizeSceneEntry(raw, storyId);
        plan.push(...expandVariants({ storyId, kind, entry, filenameBase: entry.filename, variants, sizeOverride, outOverride, editImageOverride, defaultOutDir, backend, refPaths }));
      }
    }
  }
  return plan;
}

/**
 * Marketing/branding plan. Unlike cover/scene, there is no formulaic
 * output path to derive from a story id; every buildable prompt id's output
 * path comes from the curated MARKETING_OUTPUT_MAP allow-list (see that
 * constant's comment for why). storyArg reuses the same "id or all" CLI
 * convention as cover/scene for consistency, where "id" here is a branding
 * prompt id ("1", "8b", ...). "all" plans every id present in BOTH the
 * parsed prompt library and MARKETING_OUTPUT_MAP (the intersection), so
 * doc-only prompts that lack a known output mapping (or lack any parseable
 * size at all) are silently excluded from "all" rather than erroring; an
 * explicit single id that is missing from either still fails loudly.
 */
function buildMarketingPlan({ library, storyArg, variants, sizeOverride, outOverride, editImageOverride, backend, refPaths }) {
  const bucket = library.marketing;
  if (!bucket || Object.keys(bucket).length === 0) {
    fail('The prompt library has no "marketing" entries. See tools/mai-image.mjs header for the expected shape (parseBrandingMarkdown).');
  }

  const mappedIds = Object.keys(MARKETING_OUTPUT_MAP);
  const promptIds =
    storyArg === 'all' ? mappedIds.filter((id) => id in bucket) : [storyArg];

  for (const id of promptIds) {
    if (!(id in bucket)) fail(`Marketing prompt id "${id}" was not found by parseBrandingMarkdown() in the given prompt library file.`);
    if (!(id in MARKETING_OUTPUT_MAP)) {
      fail(
        `Marketing prompt id "${id}" has no output-file mapping in MARKETING_OUTPUT_MAP (tools/mai-image.mjs). ` +
          'It is likely a resize-only, already-correct, or out-of-scope prompt (see the file header comment and ' +
          'MARKETING_OUTPUT_MAP\'s own comment for the full breakdown), not a generation target this tool supports.'
      );
    }
    const raw = bucket[id];
    if (!raw.size) {
      fail(`Marketing prompt id "${id}" ("${raw.title}") has no parsed "Output size" in the source doc; cannot plan a generation for it.`);
    }
  }

  const plan = [];
  for (const id of promptIds) {
    const raw = bucket[id];
    const mapEntry = MARKETING_OUTPUT_MAP[id];
    const entry = { prompt: `${raw.prompt} ${QUALITY_TAG_SUFFIX}`, size: raw.size, editImage: null };
    const outFile = resolveMaybeAbsolute(mapEntry.outFile);
    try {
      plan.push(
        ...expandVariants({
          storyId: id,
          kind: 'marketing',
          entry,
          filenameBase: basename(outFile, '.png'),
          variants,
          sizeOverride,
          outOverride,
          editImageOverride,
          defaultOutDir: dirname(outFile),
          backend,
          refPaths,
        })
      );
    } catch (err) {
      // A requested aspect ratio wider than 16:9 is mathematically infeasible
      // under clampToCap's floor+cap (see that function's comment); this is
      // an expected, real outcome for some marketing prompts (wide banners),
      // not a usage mistake, so report it clearly and skip this one id
      // instead of aborting the whole "all" plan for every other asset.
      console.warn(`[infeasible] prompt ${id} ("${raw.title}") -> ${relToRoot(outFile)}: ${err.message}`);
    }
  }
  return plan;
}

function normalizeCoverEntry(raw) {
  if (typeof raw === 'string') return { prompt: raw, size: null, editImage: null };
  if (raw && typeof raw === 'object' && typeof raw.prompt === 'string') {
    return { prompt: raw.prompt, size: raw.size ?? null, editImage: raw.editImage ?? null };
  }
  fail('Each covers entry must be a string prompt, or an object with a "prompt" string field. See tools/mai-image.mjs header for the schema.');
}

function normalizeSceneEntry(raw, storyId) {
  if (!raw || typeof raw !== 'object' || typeof raw.prompt !== 'string' || typeof raw.filename !== 'string') {
    fail(`Each scenes[${storyId}] entry must be an object with "filename" and "prompt" string fields. See tools/mai-image.mjs header for the schema.`);
  }
  return { filename: raw.filename, prompt: raw.prompt, size: raw.size ?? null, editImage: raw.editImage ?? null };
}

function expandVariants({ storyId, kind, entry, filenameBase, variants, sizeOverride, outOverride, editImageOverride, defaultOutDir, backend, refPaths }) {
  const requested = sizeOverride ?? entry.size ?? REQUESTED_SIZE_BY_KIND[kind];
  const maxPixels = MAX_PIXELS_BY_BACKEND[backend] ?? MAX_PIXELS;
  // capLabel keeps the infeasible-aspect-ratio error message's wording
  // ("16:9") identical to before Phase 4 for every backend whose cap still
  // equals the original MAX_PIXELS (mai, flux-kontext); only flux2's larger
  // 4 MP cap gets a computed label.
  const capLabel = maxPixels === MAX_PIXELS ? '16:9' : `${(maxPixels / (MIN_DIM * MIN_DIM)).toFixed(2)}:1`;
  const { width, height, clamped } = clampToCap(requested.width, requested.height, maxPixels, capLabel);
  const outDir = outOverride ?? defaultOutDir;
  const editImagePath = editImageOverride ?? (entry.editImage ? resolveMaybeAbsolute(entry.editImage) : null);

  const jobs = [];
  for (let i = 1; i <= variants; i++) {
    const suffix = variants > 1 ? `-v${i}` : '';
    const outFile = join(outDir, `${filenameBase}${suffix}.png`);
    jobs.push({
      storyId,
      kind,
      filenameBase,
      variantLabel: variants > 1 ? `v${i}` : 'v1',
      prompt: entry.prompt,
      width,
      height,
      requestedWidth: requested.width,
      requestedHeight: requested.height,
      clamped,
      outFile,
      editImagePath,
      backend,
      deploymentName: BACKENDS[backend].deployment,
      refPaths,
    });
  }
  return jobs;
}

// ---- Sizing ----

function parseSize(str) {
  const m = /^(\d+)x(\d+)$/i.exec(String(str).trim());
  if (!m) fail(`--size must look like "1248x832", got "${str}"`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

/**
 * Clamps a requested width/height to the documented MAI cap: both
 * dimensions >= 768, width * height <= 1,048,576. Scales down preserving
 * aspect ratio when the requested size is over the cap; leaves valid sizes
 * untouched. Throws (a real Error, not fail()/process.exit, so a caller can
 * catch it) if the aspect ratio cannot fit within the cap at the minimum
 * dimension. This never happened for the ~3:2 covers/scenes this tool
 * originally shipped for, but it is an expected, real case for wide
 * marketing banners: the floor and cap together only admit aspect ratios up
 * to 1,048,576 / 768^2 = 1.7778 (exactly 16:9). Anything wider (a 3:1 social
 * banner, a ~1.9:1 OG image, etc.) is mathematically infeasible under both
 * constraints at once and always throws here; see MARKETING_OUTPUT_MAP's
 * callers for how that is surfaced as a per-asset skip instead of a crash.
 */
function clampToCap(width, height, maxPixels = MAX_PIXELS, capLabel = '16:9') {
  if (width * height <= maxPixels && width >= MIN_DIM && height >= MIN_DIM) {
    return { width, height, clamped: false };
  }
  const scale = Math.sqrt(maxPixels / (width * height));
  let w = Math.floor((width * scale) / 2) * 2;
  let h = Math.floor((height * scale) / 2) * 2;
  while (w * h > maxPixels && w > MIN_DIM) w -= 2;
  while (w * h > maxPixels && h > MIN_DIM) h -= 2;
  if (w < MIN_DIM || h < MIN_DIM || w * h > maxPixels) {
    throw new Error(`Cannot clamp ${width}x${height} to fit under ${maxPixels} px while keeping both dimensions >= ${MIN_DIM} (max feasible aspect ratio is ${capLabel}).`);
  }
  return { width: w, height: h, clamped: true };
}

// ---- Prompt library loading ----

async function loadPromptLibrary(path, kind) {
  if (!existsSync(path)) fail(`Prompt library not found: ${path}`);
  const text = await readFile(path, 'utf8');
  if (path.toLowerCase().endsWith('.json')) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      fail(`Failed to parse ${path} as JSON: ${err.message}`);
    }
    return { covers: parsed.covers ?? {}, scenes: parsed.scenes ?? {}, marketing: parsed.marketing ?? {} };
  }
  if (path.toLowerCase().endsWith('.md')) {
    if (kind === 'marketing') return { covers: {}, scenes: {}, marketing: parseBrandingMarkdown(text) };
    return { ...parsePromptsMarkdown(text), marketing: {} };
  }
  fail(`Prompt library must be .json or .md, got: ${path}`);
}

/**
 * Parses the structure used in
 * gunner-studio/resources/Illustration_Prompts_All_Stories.md:
 *
 *   ### Story N: Title
 *   ...
 *   **Cover**
 *   `Filename: story-XX-cover.png`
 *
 *   <prompt paragraph>
 *
 *   **Scene N, Title**
 *   `Filename: story-XX-scene-....png`
 *
 *   <prompt paragraph>
 *
 *   ---
 *
 * A block's prompt paragraph is not assumed to end with a "---" of its own:
 * only the last block in a story section reliably has one (observed in the
 * source document), so each block's prompt is instead read up to whichever
 * comes first: the next "**Cover**" or "**Scene ...**" heading, the next
 * "### Story" heading, a standalone "---" line, or the end of the file. Both
 * Cover and Scene blocks are grouped under the nearest preceding
 * "### Story N: ..." heading. The punctuation between the scene number and
 * its title is deliberately not pinned to one character (a comma today; an
 * earlier revision of the source document used a dash there instead), so the
 * scene-heading match tolerates any punctuation in that spot rather than a
 * specific one.
 */
function parsePromptsMarkdown(text) {
  const storyHeadingRe = /^### Story (\d+):/gm;
  const storyHeadings = [];
  let hm;
  while ((hm = storyHeadingRe.exec(text)) !== null) {
    storyHeadings.push({ index: hm.index, storyNum: hm[1] });
  }

  const findOwningStoryId = (matchIndex) => {
    let owning = null;
    for (const h of storyHeadings) {
      if (h.index <= matchIndex) owning = h.storyNum;
      else break;
    }
    return owning ? owning.padStart(2, '0') : null;
  };

  // A block's prompt paragraph ends right before the next block marker
  // (another Cover/Scene heading, a Story heading, a standalone "---" rule)
  // or at the end of the file. Shared by both the cover and scene regexes
  // below so the two block families stay in sync.
  const BLOCK_END = '(?=\\n\\s*\\n(?:\\*\\*(?:Cover|Scene\\s)|### Story|---)|\\s*$)';

  const covers = {};
  const coverRe = new RegExp('\\*\\*Cover\\*\\*\\s*\\n`Filename:\\s*([^`]+?)\\.png`\\s*\\n\\s*\\n([\\s\\S]*?)' + BLOCK_END, 'g');
  let cm;
  while ((cm = coverRe.exec(text)) !== null) {
    const storyId = findOwningStoryId(cm.index);
    if (!storyId) continue; // cover block outside any story section, ignore
    covers[storyId] = cm[2].trim();
  }

  const scenes = {};
  const sceneRe = new RegExp('\\*\\*Scene\\s+\\d+[^*\\n]*\\*\\*\\s*\\n`Filename:\\s*([^`]+?)\\.png`\\s*\\n\\s*\\n([\\s\\S]*?)' + BLOCK_END, 'g');
  let sm;
  while ((sm = sceneRe.exec(text)) !== null) {
    const storyId = findOwningStoryId(sm.index);
    if (!storyId) continue; // scene block outside any story section, ignore
    const filename = sm[1].trim();
    const prompt = sm[2].trim();
    scenes[storyId] ??= [];
    scenes[storyId].push({ filename, prompt, size: null, editImage: null });
  }
  return { covers, scenes };
}

/**
 * Parses the structure used in
 * gunner-studio/resources/Branding_Illustration_Prompts.md (see the "Marketing
 * shape" block in this file's header comment for the full shape and the
 * rationale for MARKETING_OUTPUT_MAP):
 *
 *   **Prompt N, Title:**
 *   <prose prompt paragraph, one or more lines>
 *   **Output size: WxH [(notes)]. [Existing file: `name.png` (WxH), ...]
 *   [Save as: `name.png` | Save new generation as: `name.png`]**
 *
 * Returns an object keyed by prompt id (e.g. "1", "8b") with
 * { title, prompt, size: {width, height} | null, sizeLineRaw, saveAsFilename }.
 * A prompt block with no "**Output size: ...**" closing line at all (several
 * of the merchandise and seasonal-post prompts are free-form prose only)
 * still returns an entry, but with size: null and saveAsFilename: null, so it
 * is never buildable (buildPlan requires a numeric size, and only ids present
 * in MARKETING_OUTPUT_MAP are ever planned regardless).
 */
function parseBrandingMarkdown(text) {
  const headingRe = /\*\*Prompt\s+(\d+[a-zA-Z]?),\s*([^*\n]+?):\*\*/g;
  const headings = [];
  let hm;
  while ((hm = headingRe.exec(text)) !== null) {
    headings.push({ start: hm.index, end: hm.index + hm[0].length, id: hm[1], title: hm[2].trim() });
  }

  // A top-level "## Section Heading" also ends the final prompt's block, so
  // a trailing section (e.g. "## Notes") is never swept into the last
  // prompt's prose paragraph.
  const sectionHeadingRe = /^##\s+.+$/gm;
  const sectionBoundaries = [];
  let sm;
  while ((sm = sectionHeadingRe.exec(text)) !== null) sectionBoundaries.push(sm.index);

  const marketing = {};
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const nextHeadingStart = i + 1 < headings.length ? headings[i + 1].start : text.length;
    const nextSectionStart = sectionBoundaries.find((idx) => idx > h.end) ?? text.length;
    const blockEnd = Math.min(nextHeadingStart, nextSectionStart);
    const block = text.slice(h.end, blockEnd);

    const sizeLineMatch = /\*\*Output size:\s*([^\n]*?)\*\*/.exec(block);
    const promptText = (sizeLineMatch ? block.slice(0, sizeLineMatch.index) : block)
      .replace(/\n\s*---\s*$/, '') // strip a trailing "---" section-divider rule (only reachable when there is no Output-size line, i.e. never for a buildable entry)
      .trim();

    let size = null;
    let saveAsFilename = null;
    let sizeLineRaw = null;
    if (sizeLineMatch) {
      sizeLineRaw = sizeLineMatch[1];
      const dimMatch = /(\d+)\s*[×x]\s*(\d+)/.exec(sizeLineRaw);
      if (dimMatch) size = { width: Number(dimMatch[1]), height: Number(dimMatch[2]) };
      const saveAsMatch = /Save (?:new generation )?as:\s*`([^`]+\.png)`/i.exec(sizeLineRaw);
      if (saveAsMatch) saveAsFilename = saveAsMatch[1];
    }

    marketing[h.id] = { title: h.title, prompt: promptText, size, sizeLineRaw, saveAsFilename };
  }
  return marketing;
}

// ---- Provenance ----

async function loadProvenance(path) {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn(`[warn] Could not parse existing ${relToRoot(path)}; treating as empty and will overwrite on write.`);
    return [];
  }
}

function sumProvenanceCost(entries) {
  return entries.reduce((sum, e) => sum + (Number(e.estCostUsd) || 0), 0);
}

function mergeProvenance(existing, additions) {
  const byFile = new Map(existing.map((e) => [e.file, e]));
  for (const a of additions) byFile.set(a.file, a);
  return [...byFile.values()];
}

// ---- Cost estimation ----

function estimateCostFromUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const out = (usage.num_output_tokens ?? 0) * (RATE_USD_PER_MILLION.output / 1_000_000);
  const inText = (usage.num_input_text_tokens ?? 0) * (RATE_USD_PER_MILLION.textInput / 1_000_000);
  const inImg = (usage.num_input_image_tokens ?? 0) * (RATE_USD_PER_MILLION.imageInput / 1_000_000);
  const total = out + inText + inImg;
  return total > 0 ? total : null;
}

// ---- Azure calls ----

async function getAccessToken() {
  try {
    const { stdout } = await execFileAsync(
      'az',
      ['account', 'get-access-token', '--resource', TOKEN_RESOURCE, '--query', 'accessToken', '-o', 'tsv'],
      { shell: true, windowsHide: true }
    );
    const token = stdout.trim();
    if (!token) throw new Error('az CLI returned an empty token');
    return token;
  } catch (err) {
    throw new Error(`Could not get an Entra access token. Run "az login" and confirm the active subscription is "This Is My Demo - MVP Subscription", then retry. Underlying error: ${err.message}`);
  }
}

/**
 * Returns a bearer token from tokenState, transparently re-shelling
 * `az account get-access-token` when the cached one is missing or older
 * than TOKEN_MAX_AGE_MS. tokenState is a small mutable object
 * ({ token, fetchedAt }) shared across the whole run so a long `--story all`
 * batch keeps working past the ~60 minute Entra token lifetime without
 * re-fetching on every single call.
 */
async function ensureFreshToken(tokenState) {
  const stale = !tokenState.token || Date.now() - tokenState.fetchedAt > TOKEN_MAX_AGE_MS;
  if (stale) {
    tokenState.token = await getAccessToken();
    tokenState.fetchedAt = Date.now();
  }
  return tokenState.token;
}

async function callGenerations({ host, model, prompt, width, height, token }) {
  return fetch(`${host}/mai/v1/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, width, height }),
  });
}

async function callEdits({ host, model, prompt, width, height, token, imagePath }) {
  const imageBuf = await readFile(imagePath);
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', prompt);
  if (width) form.append('width', String(width));
  if (height) form.append('height', String(height));
  form.append('image', new Blob([imageBuf]), basename(imagePath));
  return fetch(`${host}/mai/v1/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

async function generateWithRetry({ hosts, model, prompt, width, height, tokenState, editImagePath }) {
  let lastErr = null;
  for (let hostIdx = 0; hostIdx < hosts.length; hostIdx++) {
    const host = hosts[hostIdx];
    let tokenRefreshRetries = 0;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const token = await ensureFreshToken(tokenState);
      let res;
      try {
        res = editImagePath
          ? await callEdits({ host, model, prompt, width, height, token, imagePath: editImagePath })
          : await callGenerations({ host, model, prompt, width, height, token });
      } catch (networkErr) {
        lastErr = networkErr;
        if (attempt === MAX_RETRIES) break;
        await sleep(backoffMs(attempt));
        continue;
      }

      if (res.ok) return { json: await res.json(), host };

      const bodyText = await res.text().catch(() => '');

      // A 401 is overwhelmingly a stale token, not a bad host: force a
      // refresh and retry the same request on this same host first, before
      // ever falling back to the secondary host. Does not consume a
      // 429/5xx retry from the attempt budget below.
      if (res.status === 401 && tokenRefreshRetries < MAX_TOKEN_REFRESH_RETRIES) {
        tokenRefreshRetries++;
        console.warn(`  [warn] 401 on ${host} (likely an expired token), forcing a token refresh and retrying (token retry ${tokenRefreshRetries}/${MAX_TOKEN_REFRESH_RETRIES})`);
        tokenState.token = null; // forces ensureFreshToken to re-shell az on the next loop pass
        lastErr = new Error(`${res.status} on ${host}: ${bodyText}`);
        attempt--;
        continue;
      }

      if ((res.status === 401 || res.status === 403) && hostIdx < hosts.length - 1) {
        console.warn(`  [warn] ${res.status} on ${host}, falling back to ${hosts[hostIdx + 1]}`);
        lastErr = new Error(`${res.status} on ${host}: ${bodyText}`);
        break; // move to next host
      }

      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`${res.status} on ${host}: ${bodyText}`);
        if (attempt === MAX_RETRIES) break;
        const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
        console.warn(`  [warn] ${res.status} on ${host}, retrying in ${retryAfterMs ?? backoffMs(attempt)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(retryAfterMs ?? backoffMs(attempt));
        continue;
      }

      // Non-retryable (400 bad request, content-filter refusal, etc).
      throw new Error(`MAI image API error ${res.status} on ${host}: ${bodyText}`);
    }
  }
  throw new Error(`MAI image API failed after retries and host fallback: ${lastErr?.message ?? 'unknown error'}`);
}

// ---- FLUX backend (Phase 4) ----

/**
 * Dispatches a single job to the right backend's real-call path. mai is
 * unchanged (calls generateWithRetry exactly as before this Phase 4 change).
 */
async function generateImage(job, tokenState) {
  if (job.backend === 'mai') {
    return generateWithRetry({
      hosts: [PRIMARY_HOST, FALLBACK_HOST],
      model: MODEL,
      prompt: job.prompt,
      width: job.width,
      height: job.height,
      tokenState,
      editImagePath: job.editImagePath,
    });
  }
  if (job.backend === 'flux2') return generateFlux2WithRetry({ job, tokenState });
  return generateFluxKontextWithRetry({ job, tokenState });
}

/**
 * FLUX.2-pro via the BFL provider-specific API (the documented route for
 * multi-reference conditioning; see the file header's "FLUX backend" note).
 * Reuses the same Entra bearer token already fetched for MAI (Microsoft
 * Learn documents Entra auth on this route with the same
 * https://cognitiveservices.azure.com/.default scope), so no key fallback is
 * wired up here; if that assumption ever proves wrong in a real run, this is
 * the first place to add one (mirroring generateFluxKontextWithRetry's
 * api-key fallback below).
 */
async function callFlux2Generations({ host, deploymentName, prompt, width, height, token, refPaths }) {
  const body = {
    model: 'FLUX.2-pro',
    prompt,
    width,
    height,
    output_format: 'png',
  };
  for (let i = 0; i < refPaths.length; i++) {
    const buf = await readFile(refPaths[i]);
    const field = i === 0 ? 'input_image' : `input_image_${i + 1}`;
    body[field] = buf.toString('base64');
  }
  return fetch(`${host}/providers/blackforestlabs/v1/${deploymentName}?api-version=${FLUX_API_VERSION}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function generateFlux2WithRetry({ job, tokenState }) {
  const host = FLUX_BFL_HOST;
  let lastErr = null;
  let tokenRefreshRetries = 0;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const token = await ensureFreshToken(tokenState);
    let res;
    try {
      res = await callFlux2Generations({
        host,
        deploymentName: job.deploymentName,
        prompt: job.prompt,
        width: job.width,
        height: job.height,
        token,
        refPaths: job.refPaths,
      });
    } catch (networkErr) {
      lastErr = networkErr;
      if (attempt === MAX_RETRIES) break;
      await sleep(backoffMs(attempt));
      continue;
    }

    if (res.ok) return { json: await res.json(), host };

    const bodyText = await res.text().catch(() => '');

    if (res.status === 401 && tokenRefreshRetries < MAX_TOKEN_REFRESH_RETRIES) {
      tokenRefreshRetries++;
      console.warn(`  [warn] 401 on ${host} (flux2, likely an expired token), forcing a token refresh and retrying (token retry ${tokenRefreshRetries}/${MAX_TOKEN_REFRESH_RETRIES})`);
      tokenState.token = null;
      lastErr = new Error(`${res.status} on ${host}: ${bodyText}`);
      attempt--;
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`${res.status} on ${host}: ${bodyText}`);
      if (attempt === MAX_RETRIES) break;
      const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
      console.warn(`  [warn] ${res.status} on ${host}, retrying in ${retryAfterMs ?? backoffMs(attempt)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(retryAfterMs ?? backoffMs(attempt));
      continue;
    }

    throw new Error(`FLUX.2-pro API error ${res.status} on ${host}: ${bodyText}`);
  }
  throw new Error(`FLUX.2-pro API failed after retries: ${lastErr?.message ?? 'unknown error'}`);
}

/**
 * FLUX.1-Kontext-pro via the OpenAI-compatible Image API
 * (openai/deployments/<name>/images/generations or .../images/edits). Uses
 * OpenAI's own `n` + `size` (string "WxH") request fields, not MAI's
 * width/height integers. Tries the same reused Entra bearer token first;
 * falls back once to an api-key header sourced from Key Vault at runtime if
 * Entra is rejected after MAX_TOKEN_REFRESH_RETRIES refreshes (see the file
 * header's "Auth per backend" note and getFluxApiKey() below).
 */
async function callFluxKontextGenerations({ host, deploymentName, prompt, width, height, authHeader }) {
  const size = `${width}x${height}`;
  return fetch(`${host}/openai/deployments/${deploymentName}/images/generations?api-version=${FLUX_API_VERSION}`, {
    method: 'POST',
    headers: { [authHeader.name]: authHeader.value, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: deploymentName, prompt, n: 1, size }),
  });
}

async function callFluxKontextEdits({ host, deploymentName, prompt, width, height, authHeader, imagePath }) {
  const size = `${width}x${height}`;
  const imageBuf = await readFile(imagePath);
  const form = new FormData();
  form.append('model', deploymentName);
  form.append('prompt', prompt);
  form.append('n', '1');
  form.append('size', size);
  form.append('image', new Blob([imageBuf]), basename(imagePath));
  return fetch(`${host}/openai/deployments/${deploymentName}/images/edits?api-version=${FLUX_API_VERSION}`, {
    method: 'POST',
    headers: { [authHeader.name]: authHeader.value },
    body: form,
  });
}

async function generateFluxKontextWithRetry({ job, tokenState }) {
  const hosts = [PRIMARY_HOST, FALLBACK_HOST];
  const useEdits = job.refPaths.length > 0;
  let lastErr = null;
  let usedKeyFallback = false;

  for (let hostIdx = 0; hostIdx < hosts.length; hostIdx++) {
    const host = hosts[hostIdx];
    let tokenRefreshRetries = 0;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const authHeader = usedKeyFallback
        ? { name: 'api-key', value: await getFluxApiKey() }
        : { name: 'Authorization', value: `Bearer ${await ensureFreshToken(tokenState)}` };

      let res;
      try {
        res = useEdits
          ? await callFluxKontextEdits({ host, deploymentName: job.deploymentName, prompt: job.prompt, width: job.width, height: job.height, authHeader, imagePath: job.refPaths[0] })
          : await callFluxKontextGenerations({ host, deploymentName: job.deploymentName, prompt: job.prompt, width: job.width, height: job.height, authHeader });
      } catch (networkErr) {
        lastErr = networkErr;
        if (attempt === MAX_RETRIES) break;
        await sleep(backoffMs(attempt));
        continue;
      }

      if (res.ok) return { json: await res.json(), host };

      const bodyText = await res.text().catch(() => '');

      if (res.status === 401 && !usedKeyFallback) {
        if (tokenRefreshRetries < MAX_TOKEN_REFRESH_RETRIES) {
          tokenRefreshRetries++;
          console.warn(`  [warn] 401 on ${host} (flux-kontext, Entra bearer), forcing a token refresh and retrying (token retry ${tokenRefreshRetries}/${MAX_TOKEN_REFRESH_RETRIES})`);
          tokenState.token = null;
          lastErr = new Error(`${res.status} on ${host}: ${bodyText}`);
          attempt--;
          continue;
        }
        console.warn(`  [warn] Entra bearer auth did not work on the FLUX.1-Kontext-pro images endpoint after ${MAX_TOKEN_REFRESH_RETRIES} refreshes; falling back to api-key auth (Key Vault ${KEY_VAULT_NAME}/${FLUX_KEY_VAULT_SECRET_NAME}).`);
        usedKeyFallback = true;
        lastErr = new Error(`${res.status} on ${host}: ${bodyText}`);
        attempt--;
        continue;
      }

      if ((res.status === 401 || res.status === 403) && hostIdx < hosts.length - 1) {
        console.warn(`  [warn] ${res.status} on ${host}, falling back to ${hosts[hostIdx + 1]}`);
        lastErr = new Error(`${res.status} on ${host}: ${bodyText}`);
        break;
      }

      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`${res.status} on ${host}: ${bodyText}`);
        if (attempt === MAX_RETRIES) break;
        const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
        console.warn(`  [warn] ${res.status} on ${host}, retrying in ${retryAfterMs ?? backoffMs(attempt)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(retryAfterMs ?? backoffMs(attempt));
        continue;
      }

      throw new Error(`FLUX.1-Kontext-pro API error ${res.status} on ${host}: ${bodyText}`);
    }
  }
  throw new Error(`FLUX.1-Kontext-pro API failed after retries and host fallback: ${lastErr?.message ?? 'unknown error'}`);
}

// In-memory-only cache for the flux-kontext api-key fallback; never written
// to disk, never logged. See the file header's "Auth per backend" note.
let cachedFluxApiKey = null;

async function getFluxApiKey() {
  if (cachedFluxApiKey) return cachedFluxApiKey;
  try {
    const { stdout } = await execFileAsync(
      'az',
      ['keyvault', 'secret', 'show', '--vault-name', KEY_VAULT_NAME, '--name', FLUX_KEY_VAULT_SECRET_NAME, '--query', 'value', '-o', 'tsv'],
      { shell: true, windowsHide: true }
    );
    const key = stdout.trim();
    if (!key) throw new Error('az keyvault secret show returned an empty value');
    cachedFluxApiKey = key;
    return key;
  } catch (err) {
    throw new Error(
      `Could not fetch the FLUX api-key fallback from Key Vault (${KEY_VAULT_NAME}/${FLUX_KEY_VAULT_SECRET_NAME}). ` +
        'The Entra bearer path was tried first and failed; this secret does not exist in the vault as of the Phase 4 ' +
        'build (the image path has been keyless Entra to date). Provision it (az keyvault secret set --vault-name ' +
        `${KEY_VAULT_NAME} --name ${FLUX_KEY_VAULT_SECRET_NAME} --value <key>) if FLUX.1-Kontext-pro genuinely needs ` +
        `key auth, or investigate why the Entra bearer token was rejected. Underlying error: ${err.message}`
    );
  }
}

/**
 * Extracts an image Buffer from a FLUX response for either flux2 (BFL
 * provider-specific API) or flux-kontext (OpenAI-compatible Image API).
 * flux-kontext's shape (OpenAI images: data[0].b64_json or data[0].url) is
 * confirmed by Microsoft Learn's own sample code. flux2's exact BFL-native
 * response shape is NOT confirmed as of this Phase 4 build (Microsoft
 * Learn's FLUX doc sample only prints the parsed JSON without documenting
 * field names); this function tries every plausible shape and fails loudly,
 * listing the real top-level keys, so the first real flux2 call surfaces
 * exactly what needs a one-line fix here instead of silently mis-parsing.
 */
async function extractImageBuffer(backend, json) {
  const first = json?.data?.[0];
  if (first?.b64_json) return Buffer.from(first.b64_json, 'base64');
  if (first?.url) return Buffer.from(await (await fetch(first.url)).arrayBuffer());

  const candidates = [json?.result?.sample, json?.sample, json?.image, json?.b64_json, json?.result?.url, json?.url];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) {
      if (c.startsWith('http://') || c.startsWith('https://')) {
        return Buffer.from(await (await fetch(c)).arrayBuffer());
      }
      return Buffer.from(c, 'base64');
    }
  }
  throw new Error(`Could not find image data in the ${backend} response (tried data[0].b64_json/url, result.sample, sample, image, b64_json, result.url, url). Raw top-level keys: ${Object.keys(json ?? {}).join(', ')}`);
}

function backoffMs(attempt) {
  return Math.min(2000 * 2 ** attempt, 30000);
}

function parseRetryAfter(header) {
  if (!header) return null;
  const secs = Number(header);
  return Number.isFinite(secs) ? secs * 1000 : null;
}

// ---- Small utilities ----

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function relToRoot(p) {
  const rel = p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p;
  return rel;
}

function resolveMaybeAbsolute(p) {
  return isAbsolute(p) ? p : resolve(ROOT, p);
}

/**
 * Resolves the endpoint (path + host) a job would call, shared by
 * printDryRunJob (report-only) and the real-call dispatch. For --model mai
 * this returns exactly the same path/host the tool used before Phase 4.
 */
function resolveEndpoint(job) {
  if (job.backend === 'mai') {
    return { host: PRIMARY_HOST, path: job.editImagePath ? '/mai/v1/images/edits' : '/mai/v1/images/generations' };
  }
  if (job.backend === 'flux2') {
    return { host: FLUX_BFL_HOST, path: `/providers/blackforestlabs/v1/${job.deploymentName}?api-version=${FLUX_API_VERSION}` };
  }
  // flux-kontext
  const action = job.refPaths.length > 0 ? 'edits' : 'generations';
  return { host: PRIMARY_HOST, path: `/openai/deployments/${job.deploymentName}/images/${action}?api-version=${FLUX_API_VERSION}` };
}

/**
 * Per-image cost estimate used by both the --dry-run report and the
 * pre-flight budget gate in main(). Returns FLAT_EST_COST_USD for --model
 * mai (identical to the tool's pre-Phase-4 behavior). See the FLUX2_RATE_USD_PER_MP
 * and FLUX_KONTEXT_FLAT_EST_COST_USD constants' comments for sourcing and
 * accuracy caveats on the FLUX estimates.
 */
function estimateCostEstimateForJob(job) {
  if (job.backend === 'mai') return FLAT_EST_COST_USD;
  if (job.backend === 'flux2') {
    const mp = (job.width * job.height) / 1_000_000;
    const genCost = FLUX2_RATE_USD_PER_MP.first + Math.max(0, mp - 1) * FLUX2_RATE_USD_PER_MP.extra;
    const refCost = job.refPaths.length * FLUX2_RATE_USD_PER_MP.ref;
    return genCost + refCost;
  }
  return FLUX_KONTEXT_FLAT_EST_COST_USD;
}

function printDryRunJob(job, projectedTotal, overBudget) {
  const sizeNote = job.clamped ? ` (clamped from requested ${job.requestedWidth}x${job.requestedHeight})` : '';
  const ep = resolveEndpoint(job);
  console.log(`[plan] ${relToRoot(job.outFile)}`);
  console.log(`       kind=${job.kind} storyId=${job.storyId} variant=${job.variantLabel}`);
  if (job.backend !== 'mai') {
    const refNote = job.refPaths.length ? ` [${job.refPaths.map(relToRoot).join(', ')}]` : '';
    console.log(`       backend=${job.backend} deployment=${job.deploymentName} referenceImages=${job.refPaths.length}${refNote}`);
  }
  console.log(`       endpoint=${ep.path} host=${ep.host}${job.editImagePath ? ` editImage=${relToRoot(job.editImagePath)}` : ''}`);
  console.log(`       size=${job.width}x${job.height}${sizeNote}  promptChars=${job.prompt.length}`);
  const est = estimateCostEstimateForJob(job);
  const pricingNote =
    job.backend === 'flux2'
      ? '  [FLUX.2-pro estimate: Azure pricing page per-MP rate + reference-image surcharge, approximate]'
      : job.backend === 'flux-kontext'
        ? '  [FLUX.1-Kontext-pro estimate: UNVERIFIED placeholder, no confirmed published rate]'
        : '';
  console.log(`       est. cost this image: $${est.toFixed(4)}  projected cumulative: $${projectedTotal.toFixed(4)}${overBudget ? '  [OVER --mai-budget-usd]' : ''}${pricingNote}`);
}

/**
 * Accumulates repeated flags into an array (out[name] becomes an array only
 * once a flag is passed more than once); a flag passed once still resolves
 * to a plain string/true exactly as before Phase 4, so every existing
 * single-value caller (--story, --kind, --prompts, --size, --out, ...) is
 * unaffected. Added so --ref/--reference can be repeated on the command line
 * (node tools/mai-image.mjs ... --ref a.png --ref b.png) as an alternative
 * to comma-separating a single --ref value.
 */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const name = a.slice(2);
    const value = i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    if (out[name] === undefined) out[name] = value;
    else if (Array.isArray(out[name])) out[name].push(value);
    else out[name] = [out[name], value];
  }
  return out;
}

/** --model, falling back to --backend, defaulting to "mai". */
function resolveModelArg(args) {
  let raw = args.model ?? args.backend ?? 'mai';
  if (Array.isArray(raw)) raw = raw[raw.length - 1];
  if (raw === true) fail('--model requires a value: mai, flux2, or flux-kontext.');
  return raw;
}

/**
 * Collects --ref/--reference into a flat array of resolved absolute paths.
 * Accepts the flag repeated (--ref a --ref b), comma-separated in one value
 * (--ref "a,b"), or both at once. Returns [] when neither flag is passed.
 */
function collectRefPaths(args) {
  const raw = args.ref ?? args.reference;
  if (raw === undefined) return [];
  const rawList = Array.isArray(raw) ? raw : [raw];
  const paths = [];
  for (const entry of rawList) {
    if (entry === true) continue;
    for (const piece of String(entry).split(',')) {
      const trimmed = piece.trim();
      if (trimmed) paths.push(resolveMaybeAbsolute(trimmed));
    }
  }
  return paths;
}

function requireArg(args, name) {
  if (args[name] === undefined || args[name] === true) {
    fail(`Missing required --${name}. Run with --help for usage.`);
  }
  return args[name];
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err.stack ?? String(err));
  process.exit(1);
});
