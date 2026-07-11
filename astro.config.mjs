import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

/**
 * Stamps the built dist/sw.js's CACHE_NAME with a per-deploy version so
 * the service worker script is always byte-different after a deploy.
 * Browsers only check an installed service worker for updates when its
 * script content changes, so without this a static CACHE_NAME would let
 * the installed PWA (and its caches) go stale indefinitely between
 * deploys, even though site content keeps changing underneath it.
 *
 * public/sw.js ships with a literal `__CACHE_VERSION__` placeholder;
 * only the build output gets stamped, so the committed source stays
 * deterministic.
 */
function swCacheBuster() {
    return {
        name: 'sw-cache-buster',
        hooks: {
            'astro:build:done': async ({ dir, logger }) => {
                const swPath = fileURLToPath(new URL('sw.js', dir));
                if (!existsSync(swPath)) {
                    logger.warn('sw.js not found in build output, skipping cache-version stamp.');
                    return;
                }

                const source = readFileSync(swPath, 'utf8');
                const cacheNameLine = /const CACHE_NAME = '([^']*)';/;
                if (!cacheNameLine.test(source)) {
                    logger.warn('sw.js has no CACHE_NAME declaration, skipping cache-version stamp.');
                    return;
                }

                // GITHUB_SHA is set automatically by GitHub Actions; fall
                // back to a timestamp for local builds. Only the
                // CACHE_NAME string literal is touched, so any comments
                // mentioning the placeholder stay readable in the output.
                const version = process.env.GITHUB_SHA?.slice(0, 8) ?? Date.now().toString(36);
                const stamped = source.replace(cacheNameLine, (match, name) => match.replace(name, name.replace('__CACHE_VERSION__', version)));
                writeFileSync(swPath, stamped);
                logger.info(`sw.js cache version stamped: ${version}`);
            }
        }
    };
}

// https://astro.build/config
export default defineConfig({
    site: 'https://gunnerthelab.com',
    vite: {
        plugins: [tailwindcss()]
    },
    integrations: [mdx(), sitemap(), swCacheBuster()]
});
