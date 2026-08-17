#!/usr/bin/env node
// Copies stories + images from the gunner-content repo (source of truth) into
// this repo's src/content/stories and public/images, mirroring what
// .github/workflows/deploy.yml does in CI. Run before `npm run dev` or
// `npm run build` if src/content/stories is empty or stale.
//
// Usage: npm run sync-content
// Override the source path with GUNNER_CONTENT_PATH if gunner-content isn't
// checked out as a sibling directory (default: ../gunner-content).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gunnerContentPath = process.env.GUNNER_CONTENT_PATH
    ? path.resolve(process.env.GUNNER_CONTENT_PATH)
    : path.resolve(repoRoot, '..', 'gunner-content');

if (!fs.existsSync(gunnerContentPath)) {
    console.error(`gunner-content not found at ${gunnerContentPath}`);
    console.error('Clone it as a sibling directory, or set GUNNER_CONTENT_PATH.');
    process.exit(1);
}

function copyDir(src, dst) {
    fs.rmSync(dst, { recursive: true, force: true });
    fs.mkdirSync(dst, { recursive: true });
    fs.cpSync(src, dst, { recursive: true });
    // Keep the tracked .gitkeep placeholder present so a fresh clone (before
    // any sync has run) still has these directories for Astro's glob loader.
    fs.writeFileSync(path.join(dst, '.gitkeep'), '');
}

const storiesSrc = path.join(gunnerContentPath, 'stories');
const storiesDst = path.join(repoRoot, 'src', 'content', 'stories');
copyDir(storiesSrc, storiesDst);

const coversSrc = path.join(gunnerContentPath, 'images', 'covers');
const coversDst = path.join(repoRoot, 'public', 'images', 'covers');
copyDir(coversSrc, coversDst);

const scenesSrc = path.join(gunnerContentPath, 'images', 'stories');
const scenesDst = path.join(repoRoot, 'public', 'images', 'stories');
copyDir(scenesSrc, scenesDst);

const storyCount = fs.readdirSync(storiesDst).filter(f => f.endsWith('.md')).length;
console.log(`Synced ${storyCount} stories, ${fs.readdirSync(coversDst).length} covers, ${fs.readdirSync(scenesDst).length} scene images from ${gunnerContentPath}`);
