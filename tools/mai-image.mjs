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
// for a bearer token on every real run. No key, no @azure/identity
// dependency required. (If az CLI auth ever proves awkward, @azure/identity's
// DefaultAzureCredential is a drop-in alternative for getAccessToken() below,
// but the az-cli path stays the default so this tool adds no new dependency.)
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
// Flags:
//   --story <id|all>          required. Zero-padded story id ("01") matching
//                              the on-disk naming (public/images/covers/story-01.png),
//                              or "all" to generate every story present in the
//                              prompt library for the chosen --kind.
//   --kind cover|scene         required. cover -> public/images/covers/story-<id>.png
//                              scene -> public/images/stories/<id>/<filename>.png
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
//                              the flat ~0.048 USD/image estimate for the next
//                              image, and refuses to start that call if the
//                              total would exceed the budget. The run stops
//                              cleanly (provenance for completed images is
//                              still written); it never partially spends past
//                              the cap.
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
// Robustness: retries on 429 and 5xx with exponential backoff, honoring a
// Retry-After header when present. Falls back from the primary host to the
// cognitiveservices.azure.com host on 401/403. Paces real calls at roughly
// 6.5 seconds apart to respect the Tier 5 (10 RPM) quota on this deployment.
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

// Standardized defaults (ADR-0002 decision 3). Covers historically wanted
// 1264x848 (the existing on-disk covers); that exceeds the cap, so the
// requested size below always runs through clampToCap() rather than being
// hardcoded to the clamped result, keeping the clamp logic exercised and
// visible even for the default path.
const REQUESTED_SIZE_BY_KIND = {
  cover: { width: 1264, height: 848 },
  scene: { width: 1248, height: 832 },
};

// Rate card (ai/plans/source/mai-image-2-5-art-match.md, cited as unconfirmed
// pending a live portal read; ai/verification/deployment-verification.md
// measured about 0.048 USD for one real call). Used to turn a real response's
// `usage` block into a cost, and as the flat per-image estimate for the
// pre-flight budget gate and for --dry-run reporting.
const RATE_USD_PER_MILLION = { textInput: 5, imageInput: 8, output: 47 };
const FLAT_EST_COST_USD = 0.048;

const RATE_LIMIT_SPACING_MS = 6500; // Tier 5 = 10 RPM; leave margin
const MAX_RETRIES = 5;

const HELP_TEXT = `MAI-Image-2.5 illustration generator (Gunner content production)

Prerequisite: az login   (signs in as the owner; default subscription
"This Is My Demo - MVP Subscription" must be the active one)

Usage:
  node tools/mai-image.mjs --story <id|all> --kind cover|scene --prompts <path> [options]

Required:
  --story <id|all>       zero-padded story id ("01") or "all"
  --kind cover|scene      output family
  --prompts <path>        prompt library, .json or .md (see file header for schema)

Options:
  --variants <n>          candidates per prompt (default 1)
  --size <WxH>            override size for this run, always clamped to 1,048,576 px
  --out <dir>             override the output directory
  --edit-image <path>     force the edits endpoint with this input image
  --dry-run               print the plan, no network call, no file written
  --force                 overwrite existing files
  --mai-budget-usd <n>    required for a real run; hard cumulative spend cap
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
  if (kind !== 'cover' && kind !== 'scene') {
    fail(`--kind must be "cover" or "scene", got "${kind}"`);
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

  const library = await loadPromptLibrary(resolveMaybeAbsolute(promptsPath));
  const plan = buildPlan({ library, storyArg, kind, variants, sizeOverride, outOverride, editImageOverride });

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
      const projected = cumulativeSpentUsd + FLAT_EST_COST_USD;
      const overBudget = budgetUsd !== null && projected > budgetUsd;
      cumulativeSpentUsd = projected;
      printDryRunJob(job, projected, overBudget);
    }
    console.log('');
    console.log(`[dry-run] No network call made. No file written. No az CLI invoked. Projected cumulative spend if this plan ran for real: $${cumulativeSpentUsd.toFixed(4)}${budgetUsd !== null && cumulativeSpentUsd > budgetUsd ? ' (EXCEEDS the given --mai-budget-usd)' : ''}`);
    return;
  }

  console.log('Fetching an Entra access token via az CLI (az account get-access-token)...');
  const token = await getAccessToken();
  console.log('Token acquired.');
  console.log('');

  const newProvenanceEntries = [];
  let firstCall = true;

  for (const job of plan) {
    if (!force && existsSync(job.outFile)) {
      console.log(`[skip] ${relToRoot(job.outFile)} already exists (use --force to regenerate)`);
      continue;
    }

    const projected = cumulativeSpentUsd + FLAT_EST_COST_USD;
    if (projected > budgetUsd) {
      console.error('');
      console.error(`[budget] Stopping before ${relToRoot(job.outFile)}: projected spend $${projected.toFixed(4)} would exceed --mai-budget-usd ${budgetUsd.toFixed(2)}.`);
      console.error(`[budget] Prior spend recorded: $${cumulativeSpentUsd.toFixed(4)}. Raise the budget or run a smaller --story/--variants selection to continue.`);
      break;
    }

    if (!firstCall) await sleep(RATE_LIMIT_SPACING_MS);
    firstCall = false;

    console.log(`[gen] ${relToRoot(job.outFile)}  size=${job.width}x${job.height}${job.editImagePath ? '  (edits endpoint, pseudo style-reference)' : ''}`);

    let result;
    try {
      result = await generateWithRetry({
        hosts: [PRIMARY_HOST, FALLBACK_HOST],
        model: MODEL,
        prompt: job.prompt,
        width: job.width,
        height: job.height,
        token,
        editImagePath: job.editImagePath,
      });
    } catch (err) {
      console.error(`[error] ${relToRoot(job.outFile)}: ${err.message}`);
      continue;
    }

    const b64 = result.json?.data?.[0]?.b64_json;
    if (!b64) {
      console.error(`[error] ${relToRoot(job.outFile)}: response had no data[0].b64_json. Raw keys: ${Object.keys(result.json ?? {}).join(', ')}`);
      continue;
    }

    await mkdir(dirname(job.outFile), { recursive: true });
    await writeFile(job.outFile, Buffer.from(b64, 'base64'));

    const usage = result.json.usage ?? null;
    const measuredCost = estimateCostFromUsage(usage);
    const estCostUsd = measuredCost ?? FLAT_EST_COST_USD;
    cumulativeSpentUsd += estCostUsd;

    console.log(`  -> wrote ${(Buffer.from(b64, 'base64').length / 1024).toFixed(0)} KB, host=${result.host}, cost~$${estCostUsd.toFixed(4)}, running total $${cumulativeSpentUsd.toFixed(4)}`);

    newProvenanceEntries.push({
      file: relToRoot(job.outFile).replace(/\\/g, '/'),
      storyId: job.storyId,
      kind: job.kind,
      variant: job.variantLabel,
      prompt: job.prompt,
      model: MODEL,
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

function buildPlan({ library, storyArg, kind, variants, sizeOverride, outOverride, editImageOverride }) {
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
      plan.push(...expandVariants({ storyId, kind, entry, filenameBase: `story-${storyId}`, variants, sizeOverride, outOverride, editImageOverride, defaultOutDir: join(ROOT, 'public', 'images', 'covers') }));
    } else {
      const entries = bucket[storyId];
      if (!Array.isArray(entries) || entries.length === 0) {
        fail(`Story "${storyId}" scenes entry must be a non-empty array. See tools/mai-image.mjs header for the expected shape.`);
      }
      const defaultOutDir = join(ROOT, 'public', 'images', 'stories', storyId);
      for (const raw of entries) {
        const entry = normalizeSceneEntry(raw, storyId);
        plan.push(...expandVariants({ storyId, kind, entry, filenameBase: entry.filename, variants, sizeOverride, outOverride, editImageOverride, defaultOutDir }));
      }
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

function expandVariants({ storyId, kind, entry, filenameBase, variants, sizeOverride, outOverride, editImageOverride, defaultOutDir }) {
  const requested = sizeOverride ?? entry.size ?? REQUESTED_SIZE_BY_KIND[kind];
  const { width, height, clamped } = clampToCap(requested.width, requested.height);
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
 * untouched. Throws if the aspect ratio cannot fit within the cap at the
 * minimum dimension (should not happen for any 3:2-ish request).
 */
function clampToCap(width, height) {
  if (width * height <= MAX_PIXELS && width >= MIN_DIM && height >= MIN_DIM) {
    return { width, height, clamped: false };
  }
  const scale = Math.sqrt(MAX_PIXELS / (width * height));
  let w = Math.floor((width * scale) / 2) * 2;
  let h = Math.floor((height * scale) / 2) * 2;
  while (w * h > MAX_PIXELS && w > MIN_DIM) w -= 2;
  while (w * h > MAX_PIXELS && h > MIN_DIM) h -= 2;
  if (w < MIN_DIM || h < MIN_DIM || w * h > MAX_PIXELS) {
    fail(`Cannot clamp ${width}x${height} to fit under ${MAX_PIXELS} px while keeping both dimensions >= ${MIN_DIM}.`);
  }
  return { width: w, height: h, clamped: true };
}

// ---- Prompt library loading ----

async function loadPromptLibrary(path) {
  if (!existsSync(path)) fail(`Prompt library not found: ${path}`);
  const text = await readFile(path, 'utf8');
  if (path.toLowerCase().endsWith('.json')) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      fail(`Failed to parse ${path} as JSON: ${err.message}`);
    }
    return { covers: parsed.covers ?? {}, scenes: parsed.scenes ?? {} };
  }
  if (path.toLowerCase().endsWith('.md')) {
    return parsePromptsMarkdown(text);
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

async function generateWithRetry({ hosts, model, prompt, width, height, token, editImagePath }) {
  let lastErr = null;
  for (let hostIdx = 0; hostIdx < hosts.length; hostIdx++) {
    const host = hosts[hostIdx];
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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

function printDryRunJob(job, projectedTotal, overBudget) {
  const sizeNote = job.clamped ? ` (clamped from requested ${job.requestedWidth}x${job.requestedHeight})` : '';
  console.log(`[plan] ${relToRoot(job.outFile)}`);
  console.log(`       kind=${job.kind} storyId=${job.storyId} variant=${job.variantLabel}`);
  console.log(`       endpoint=${job.editImagePath ? '/mai/v1/images/edits' : '/mai/v1/images/generations'} host=${PRIMARY_HOST}${job.editImagePath ? ` editImage=${relToRoot(job.editImagePath)}` : ''}`);
  console.log(`       size=${job.width}x${job.height}${sizeNote}  promptChars=${job.prompt.length}`);
  console.log(`       est. cost this image: $${FLAT_EST_COST_USD.toFixed(4)}  projected cumulative: $${projectedTotal.toFixed(4)}${overBudget ? '  [OVER --mai-budget-usd]' : ''}`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const name = a.slice(2);
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[name] = argv[++i];
    else out[name] = true;
  }
  return out;
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
