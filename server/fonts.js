#!/usr/bin/env node
'use strict';

/**
 * Font download manager.
 * Downloads Google Fonts WOFF2 files once to PLUGIN_DATA/fonts/
 * so the browser can load them from the local HTTP server.
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const FONTS_CSS_URL =
  'https://fonts.googleapis.com/css2' +
  '?family=Syne:wght@700;800' +
  '&family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;1,400' +
  '&family=Outfit:wght@400;500' +
  '&display=swap';

// Modern Chrome UA — required so Google Fonts returns WOFF2 (not TTF)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function get(url, binary = false, _redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA } }, res => {
      // Follow at most one redirect (gstatic URLs sometimes redirect)
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        res.resume();
        if (_redirects >= 1) return reject(new Error(`Too many redirects for ${url}`));
        return resolve(get(res.headers.location, binary, _redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end',  () => resolve(binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.setTimeout(20_000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/**
 * Download all font files into `fontsDir` and write a `fonts.css`
 * with @font-face rules pointing to local filenames.
 */
async function downloadFonts(fontsDir) {
  fs.mkdirSync(fontsDir, { recursive: true });

  const css = await get(FONTS_CSS_URL);

  // Each @font-face block ends at the first `}` — Google Fonts only nests one level
  const blocks = [...css.matchAll(/@font-face\s*\{[^}]+\}/g)].map(m => m[0]);
  if (!blocks.length) throw new Error('No @font-face blocks found in Google Fonts response');

  let localCss = '';
  let index = 0;

  for (const block of blocks) {
    // Extract woff2 URL (Google Fonts CSS2 always uses woff2 with a modern UA)
    const match = block.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/);
    if (!match) {
      // Keep block unchanged (shouldn't happen with woff2 UA)
      localCss += block + '\n';
      continue;
    }

    const remoteUrl = match[1];
    const filename  = `f${index}.woff2`;
    const filePath  = path.join(fontsDir, filename);

    if (!fs.existsSync(filePath)) {
      const buf = await get(remoteUrl, true);
      fs.writeFileSync(filePath, buf);
    }

    // Replace remote URL with local server path
    localCss += block.replace(remoteUrl, `/fonts/${filename}`) + '\n';
    index++;
  }

  fs.writeFileSync(path.join(fontsDir, 'fonts.css'), localCss, 'utf8');
  return index;
}

/**
 * Ensure fonts are cached locally.
 * Idempotent — skips download if fonts.css already exists.
 * Returns { cached, downloaded } or throws on network failure.
 */
async function ensureFonts(dataDir) {
  const fontsDir = path.join(dataDir, 'fonts');
  const cssPath  = path.join(fontsDir, 'fonts.css');

  if (fs.existsSync(cssPath)) return { cached: true, downloaded: 0 };

  const downloaded = await downloadFonts(fontsDir);
  return { cached: false, downloaded };
}

module.exports = { ensureFonts };
