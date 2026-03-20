#!/usr/bin/env node
'use strict';

/**
 * Discover Claude Code plugins via GitHub Code Search.
 * Searches for `filename:marketplace.json path:.claude-plugin`, deduplicates by repo,
 * fetches star counts, and writes data/discovered.json.
 *
 * Run by .github/workflows/discover-plugins.yml (authenticated: 5,000 req/hr).
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const TOKEN    = process.env.GITHUB_TOKEN;
const OUT_FILE = path.join(__dirname, '..', 'data', 'discovered.json');

if (!TOKEN) {
  console.error('GITHUB_TOKEN is required');
  process.exit(1);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function githubGet(apiPath, accept = 'application/vnd.github.v3+json') {
  return new Promise((resolve) => {
    const req = https.get({
      hostname: 'api.github.com',
      path: '/' + apiPath,
      headers: {
        'User-Agent':    'plugin-browser/1.3.7',
        'Accept':        accept,
        'Authorization': `Bearer ${TOKEN}`,
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } else {
            console.warn(`  HTTP ${res.statusCode} for /${apiPath}`);
            resolve(null);
          }
        } catch { resolve(null); }
      });
    });
    req.setTimeout(15_000, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

async function searchCodePages() {
  const repos = new Map(); // full_name → { owner, repo }
  const perPage = 100;
  const maxPages = 10;

  for (let page = 1; page <= maxPages; page++) {
    const q = encodeURIComponent('filename:marketplace.json path:.claude-plugin');
    const data = await githubGet(
      `search/code?q=${q}&per_page=${perPage}&page=${page}`,
      'application/vnd.github.v3+json'
    );
    await sleep(500);

    if (!data?.items?.length) {
      if (page === 1 && !data) {
        console.error('Code search returned no data — possible API outage, aborting');
        process.exit(0); // Don't overwrite existing file
      }
      break;
    }

    for (const item of data.items) {
      const fn = item.repository.full_name;
      if (!repos.has(fn)) {
        repos.set(fn, {
          owner: item.repository.owner.login,
          repo:  item.repository.name,
        });
      }
    }

    if (data.items.length < perPage) break;
  }

  return repos;
}

async function fetchRepoDetails(owner, repo) {
  // 1. marketplace.json contents
  const contentsData = await githubGet(
    `repos/${owner}/${repo}/contents/.claude-plugin/marketplace.json`
  );
  await sleep(500);
  if (!contentsData?.content) return null;

  let marketplace;
  try {
    marketplace = JSON.parse(Buffer.from(contentsData.content, 'base64').toString('utf8'));
  } catch { return null; }

  // 2. Last commit date for marketplace.json
  const commits = await githubGet(
    `repos/${owner}/${repo}/commits?path=.claude-plugin/marketplace.json&per_page=1`
  );
  await sleep(500);
  const lastMarketplaceCommit = commits?.[0]?.commit?.committer?.date ?? null;

  // 3. Star count (authoritative)
  const repoData = await githubGet(`repos/${owner}/${repo}`);
  await sleep(500);
  const stars = repoData?.stargazers_count ?? 0;

  return { marketplace, lastMarketplaceCommit, stars };
}

async function main() {
  console.log('Searching GitHub for .claude-plugin/marketplace.json files…');
  const repos = await searchCodePages();
  console.log(`Found ${repos.size} unique repos`);

  if (repos.size === 0) {
    console.error('No repos found — aborting without overwriting existing file');
    process.exit(0);
  }

  const plugins = [];

  for (const [fullName, { owner, repo }] of repos) {
    try {
      console.log(`  Processing ${fullName}…`);
      const details = await fetchRepoDetails(owner, repo);
      if (!details) { console.log(`    skip — could not fetch details`); continue; }

      const { marketplace, lastMarketplaceCommit, stars } = details;

      // Discard zero-star repos (test/abandoned)
      if (stars < 1) { console.log(`    skip — 0 stars`); continue; }

      const tier = stars >= 5 ? 'established' : 'new';
      const mktPlugins = marketplace.plugins ?? (Array.isArray(marketplace) ? marketplace : [marketplace]);

      for (const p of mktPlugins) {
        if (!p?.name) continue;
        plugins.push({
          name:                  p.name,
          desc:                  p.description || p.desc || '',
          author:                p.author?.name || p.author || owner,
          repo:                  fullName,
          repoUrl:               `https://github.com/${fullName}`,
          stars,
          tier,
          lastMarketplaceCommit,
          keywords:              p.keywords ?? [],
        });
      }
    } catch (err) {
      console.warn(`  Error processing ${fullName}: ${err.message}`);
    }
  }

  const out = {
    generatedAt:  new Date().toISOString(),
    pluginCount:  plugins.length,
    plugins,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\nWrote ${plugins.length} plugins to ${OUT_FILE}`);
}

main().catch(err => { console.error(err); process.exit(1); });
