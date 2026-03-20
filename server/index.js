#!/usr/bin/env node
'use strict';

/**
 * Plugin Browser — combined MCP + HTTP server
 *
 * - MCP protocol over stdio  → Claude Code manages lifecycle when installed as a plugin
 * - HTTP server on :3747     → serves the browser UI and /api/plugins
 *
 * Standalone usage:  node server/index.js
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { ensureFonts } = require('./fonts');

// Guard: MCP env substitution may pass literal "${VAR}" when the var is unset
function env(name, fallback = '') {
  const v = process.env[name];
  return (!v || /^\$\{[^}]+\}$/.test(v)) ? fallback : v;
}

const SERVER_VERSION = '1.5.12';
const PORT           = parseInt(env('PLUGIN_BROWSER_PORT', '3747'), 10);
const DEV_MODE     = env('PLUGIN_BROWSER_DEV', '') === '1';
const PLUGINS_BASE = path.join(os.homedir(), '.claude', 'plugins');
const MARKETPLACE  = 'claude-plugins-official';
const MKT_DIR      = path.join(PLUGINS_BASE, 'marketplaces', MARKETPLACE);
const BROWSER_HTML = path.join(__dirname, '..', 'browser', 'index.html');
const LICENSE_FILE = path.join(__dirname, '..', 'LICENSE');
const PRIVACY_FILE = path.join(__dirname, '..', 'PRIVACY.md');
const PLUGIN_DATA  = env('CLAUDE_PLUGIN_DATA') || path.join(PLUGINS_BASE, 'data', 'plugin-browser');
const FONTS_DIR    = path.join(PLUGIN_DATA, 'fonts');

// ── Plugin data ──────────────────────────────────────────────

function safeReadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function firstParagraph(md) {
  return md.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))[0] || '';
}

function readPluginEntries(dir, defaultType, fallbackUrl = null) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap(name => {
    const pluginDir = path.join(dir, name);
    try { if (!fs.statSync(pluginDir).isDirectory()) return []; }
    catch { return []; }

    const manifest = safeReadJson(path.join(pluginDir, '.claude-plugin', 'plugin.json'));
    let desc = '', author = 'Anthropic';

    if (manifest) {
      desc   = manifest.description || '';
      author = manifest.author?.name || 'Anthropic';
    } else {
      const readme = path.join(pluginDir, 'README.md');
      if (fs.existsSync(readme)) desc = firstParagraph(fs.readFileSync(readme, 'utf8'));
    }
    if (!desc) return [];

    const type = defaultType === 'anthropic' && name.endsWith('-lsp') ? 'lsp' : defaultType;

    // Explicit URL from manifest, caller-supplied fallback, or official GitHub link
    const explicitUrl = manifest?.repository || manifest?.homepage || manifest?.author?.url || null;
    const repoSubdir  = defaultType === 'external' ? 'external_plugins' : 'plugins';
    const url = explicitUrl || fallbackUrl || `https://github.com/anthropics/claude-plugins-official/tree/main/${repoSubdir}/${name}`;

    const keywords = manifest?.keywords ?? [];
    return [{ name, desc, author, type, url, keywords }];
  });
}

function loadData() {
  const plugins = [
    ...readPluginEntries(path.join(MKT_DIR, 'plugins'),          'anthropic'),
    ...readPluginEntries(path.join(MKT_DIR, 'external_plugins'), 'external'),
  ];

  const countsRaw     = safeReadJson(path.join(PLUGINS_BASE, 'install-counts-cache.json'));
  const installCounts = Object.fromEntries(
    (countsRaw?.counts ?? []).map(e => [e.plugin.split('@')[0], e.unique_installs])
  );

  const installedRaw = safeReadJson(path.join(PLUGINS_BASE, 'installed_plugins.json'));
  const installed    = Object.keys(installedRaw?.plugins ?? {}).map(k => k.split('@')[0]);

  const known       = safeReadJson(path.join(PLUGINS_BASE, 'known_marketplaces.json'));
  const lastUpdated = known?.[MARKETPLACE]?.lastUpdated ?? null;

  // Installed detail: version + gitCommitSha per plugin name
  const installedDetails = {};
  for (const [key, installs] of Object.entries(installedRaw?.plugins ?? {})) {
    if (!Array.isArray(installs) || installs.length === 0) continue;
    const atIdx = key.indexOf('@');
    const name = atIdx === -1 ? key : key.slice(0, atIdx);
    const mkt  = atIdx === -1 ? null  : key.slice(atIdx + 1);
    const rec  = installs.reduce((a, b) =>
      new Date(a.lastUpdated) > new Date(b.lastUpdated) ? a : b);
    installedDetails[name] = { version: rec.version, gitCommitSha: rec.gitCommitSha,
                               installedAt: rec.installedAt, marketplace: mkt };
  }

  const marketplaces = Object.keys(known ?? {}).map(name => ({
    name, isOfficial: name === MARKETPLACE,
  }));

  // Detect stale server: compare running version against what's installed
  const pbKey = Object.keys(installedRaw?.plugins ?? {}).find(k => k.startsWith('plugin-browser@'));
  const pbInstalls = pbKey ? (installedRaw.plugins[pbKey] ?? []) : [];
  const pbLatest   = pbInstalls.length
    ? pbInstalls.reduce((a, b) => new Date(a.lastUpdated) > new Date(b.lastUpdated) ? a : b)
    : null;
  const installedVersion = pbLatest?.version ?? null;
  const needsRestart = installedVersion ? installedVersion !== SERVER_VERSION : false;

  return { marketplace: MARKETPLACE, lastUpdated, fetchedAt: new Date().toISOString(),
           pluginCount: plugins.length, plugins, installCounts, installed, installedDetails,
           marketplaces, serverVersion: SERVER_VERSION, installedVersion, needsRestart };
}

// ── Added marketplaces ────────────────────────────────────────

const https = require('https');

const DISCOVERED_CACHE_FILE = path.join(PLUGIN_DATA, 'discovered-plugins.json');
const DISCOVERED_CACHE_TTL  = 7 * 24 * 60 * 60 * 1000; // 7 days
const DISCOVERED_DATA_URL   =
  'repos/devycelabs/claude-plugin-browser-data/contents/discovered.json';

// Read a single-plugin marketplace (plugin.json lives at repo root, not inside plugins/)
function readRootPlugin(dir, defaultType) {
  const manifest = safeReadJson(path.join(dir, '.claude-plugin', 'plugin.json'));
  if (!manifest?.name) return [];
  const name   = manifest.name;
  const desc   = manifest.description || '';
  const author = manifest.author?.name || 'unknown';
  if (!desc) return [];
  const url      = manifest.repository || manifest.homepage || manifest.author?.url || null;
  const keywords = manifest.keywords ?? [];
  return [{ name, desc, author, type: defaultType, url, keywords }];
}

// Read plugins from a marketplace using its .claude-plugin/marketplace.json source paths.
// Returns array if marketplace.json was usable, null to signal caller should use fallback.
function readFromMarketplaceJson(dir, mktUrl) {
  const mkt = safeReadJson(path.join(dir, '.claude-plugin', 'marketplace.json'));
  if (!mkt?.plugins) return null;
  if (mkt.plugins.length === 0) return []; // explicitly empty — no fallback needed

  const results = [];
  let hasLocalSources = false;
  for (const entry of mkt.plugins) {
    if (!entry.name) continue;
    // Only handle string sources (local relative paths); object sources (e.g. URL refs) can't be resolved locally
    if (typeof entry.source !== 'string') continue;
    hasLocalSources = true;
    const pluginDir  = path.resolve(dir, entry.source);
    // source may point to a manifest file directly (e.g. "./plugin.json") or a plugin subdirectory
    const isJsonFile = pluginDir.endsWith('.json') && fs.existsSync(pluginDir);
    const manifest   = isJsonFile
      ? safeReadJson(pluginDir)
      : safeReadJson(path.join(pluginDir, '.claude-plugin', 'plugin.json'));
    const desc      = manifest?.description || entry.description || '';
    const author    = manifest?.author?.name || mkt.owner?.name || 'unknown';
    if (!desc) continue;
    const explicitUrl = manifest?.repository || manifest?.homepage || manifest?.author?.url || null;
    results.push({
      name:     entry.name,
      desc,
      author,
      type:     'added',
      url:      explicitUrl || entry.homepage || mktUrl || null,
      keywords: manifest?.keywords ?? [],
    });
  }
  // All entries had non-local sources → fall back to directory scan / root-plugin check
  if (!hasLocalSources) return null;
  return results;
}

function loadAddedMarketplaces() {
  const known = safeReadJson(path.join(PLUGINS_BASE, 'known_marketplaces.json'));
  const plugins = [];
  for (const [mktName, info] of Object.entries(known ?? {})) {
    if (mktName === MARKETPLACE) continue; // skip official
    const dir = info.installLocation;
    if (!dir) continue;
    const mktUrl = info.source?.repo ? `https://github.com/${info.source.repo}` : null;

    // Prefer marketplace.json source paths (authoritative, handles all layout variants)
    const fromMktJson = readFromMarketplaceJson(dir, mktUrl);
    let raw;
    if (fromMktJson !== null) {
      raw = fromMktJson;
    } else {
      // Fallback: scan well-known subdirectory layouts
      const fromSubdirs = [
        ...readPluginEntries(path.join(dir, 'plugins'),                  'added', mktUrl),
        ...readPluginEntries(path.join(dir, 'external_plugins'),          'added', mktUrl),
      ];
      raw = fromSubdirs.length === 0 ? readRootPlugin(dir, 'added') : fromSubdirs;
    }

    plugins.push(...raw.map(p => ({
      ...p,
      marketplace:     mktName,
      marketplaceRepo: info.source?.repo ?? null,
    })));
  }
  return { plugins, fetchedAt: new Date().toISOString(), pluginCount: plugins.length };
}

// ── Discovered registry ───────────────────────────────────────

let _discoveredCache       = null;
let _discoveredCacheLoaded = false;

async function discoverPlugins() {
  if (!_discoveredCacheLoaded) {
    _discoveredCacheLoaded = true;
    const raw = safeReadJson(DISCOVERED_CACHE_FILE);
    if (raw?.plugins) _discoveredCache = raw;
  }

  const stale = !_discoveredCache ||
    (Date.now() - new Date(_discoveredCache.generatedAt).getTime()) > DISCOVERED_CACHE_TTL;

  if (!DEV_MODE && !stale) return { ..._discoveredCache, cached: true };

  const raw = await githubGetRaw(DISCOVERED_DATA_URL);
  if (!raw?.content) return _discoveredCache ?? { plugins: [], error: 'unavailable' };

  let data;
  try {
    data = JSON.parse(Buffer.from(raw.content, 'base64').toString('utf8'));
  } catch { return _discoveredCache ?? { plugins: [], error: 'parse error' }; }

  _discoveredCache = data;
  try {
    fs.mkdirSync(path.dirname(DISCOVERED_CACHE_FILE), { recursive: true });
    fs.writeFileSync(DISCOVERED_CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch { /* best-effort */ }

  return data;
}

// ── Update checker ────────────────────────────────────────────

let _updateCache = null;
const UPDATE_CACHE_TTL = 60 * 60 * 1000; // 1 hour

function githubGet(apiPath) {
  return new Promise(resolve => {
    const req = https.get({
      hostname: 'api.github.com',
      path: '/' + apiPath,
      headers: { 'User-Agent': `plugin-browser/${SERVER_VERSION}`,
                 'Accept': 'application/vnd.github.v3+json' },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(res.statusCode === 200
          ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null);
        } catch { resolve(null); }
      });
    });
    req.setTimeout(10_000, () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

// Alias — GitHub Contents API returns 200 with base64-encoded body, same as other endpoints
const githubGetRaw = githubGet;

// Extract "owner/repo" from a GitHub URL, or return null
function extractGithubRepo(url) {
  if (!url) return null;
  const m = url.match(/github\.com\/([^/]+\/[^/?#]+?)(?:\.git)?(?:\/|$)/);
  return m ? m[1] : null;
}

// Read the plugin.json from the local marketplace cache for an installed plugin
function getInstalledManifest(name, mkt) {
  if (!mkt) return null;
  const base = path.join(PLUGINS_BASE, 'marketplaces', mkt);
  for (const sub of ['external_plugins', 'plugins']) {
    const manifest = safeReadJson(
      path.join(base, sub, name, '.claude-plugin', 'plugin.json'));
    if (manifest) return { manifest, sub };
  }
  // Also try root-level single-plugin marketplaces (plugin.json at marketplace root)
  const rootManifest = safeReadJson(path.join(base, '.claude-plugin', 'plugin.json'));
  if (rootManifest?.name === name) return { manifest: rootManifest, sub: null };
  return null;
}

async function checkUpdates() {
  if (!DEV_MODE && _updateCache && (Date.now() - _updateCache.fetchedAt) < UPDATE_CACHE_TTL) {
    return { ..._updateCache.data, cached: true };
  }

  const installedRaw = safeReadJson(path.join(PLUGINS_BASE, 'installed_plugins.json'));
  const updates = [];

  for (const [key, installs] of Object.entries(installedRaw?.plugins ?? {})) {
    if (!Array.isArray(installs) || installs.length === 0) continue;
    const atIdx = key.indexOf('@');
    const name  = atIdx === -1 ? key : key.slice(0, atIdx);
    const mkt   = atIdx === -1 ? null : key.slice(atIdx + 1);
    const rec   = installs.reduce((a, b) =>
      new Date(a.lastUpdated) > new Date(b.lastUpdated) ? a : b);

    // Check the plugin's own repo first (works for any plugin with a repository field)
    const found   = getInstalledManifest(name, mkt);
    const ownRepo = extractGithubRepo(
      found?.manifest?.repository || found?.manifest?.homepage);

    let latest = null;
    let source = null;

    if (ownRepo) {
      const data = await githubGet(`repos/${ownRepo}/commits?per_page=1`);
      if (data?.length > 0) { latest = data[0]; source = 'own-repo'; }
    }

    // Fall back to checking the marketplace repo entry (official plugins without their own repo)
    if (!latest && mkt === 'claude-plugins-official') {
      const searchSubs = found?.sub ? [found.sub] : ['plugins', 'external_plugins'];
      for (const sub of searchSubs) {
        const data = await githubGet(
          `repos/anthropics/claude-plugins-official/commits?path=${sub}/${name}&per_page=1`);
        if (data?.length > 0) { latest = data[0]; source = 'marketplace'; break; }
      }
    }

    if (!latest) {
      updates.push({ name, updateAvailable: null, reason: ownRepo ? 'repo-unavailable' : 'not-found' });
      continue;
    }

    const latestDate    = new Date(latest.commit.committer.date);
    const installedDate = new Date(rec.installedAt);
    updates.push({
      name,
      updateAvailable:  latestDate > installedDate,
      source,
      latestCommitSha:  latest.sha.slice(0, 12),
      latestCommitDate: latest.commit.committer.date,
      installedAt:      rec.installedAt,
      installedVersion: rec.version,
    });
  }

  const data = { checkedAt: new Date().toISOString(), updates };
  _updateCache = { data, fetchedAt: Date.now() };
  return data;
}

// ── Marketplace refresh ───────────────────────────────────────

const { execFile } = require('child_process');

function runMarketplaceUpdate(name) {
  return new Promise((resolve, reject) => {
    // Locate the claude binary — try exe on Windows, plain 'claude' elsewhere
    const bin = process.platform === 'win32' ? 'claude.exe' : 'claude';
    execFile(bin, ['plugin', 'marketplace', 'update', name],
      { timeout: 60_000, env: process.env },
      (err, stdout, stderr) => {
        if (err) return reject({ code: err.code, message: err.message, stderr });
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    );
  });
}

// ── HTTP server ───────────────────────────────────────────────

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (url.pathname === '/api/plugins') {
    try {
      const data = loadData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === '/api/deep-sync') {
    const name = url.searchParams.get('marketplace') || MARKETPLACE;
    runMarketplaceUpdate(name)
      .then(result => {
        const data = loadData();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...data, refreshLog: result.stdout || result.stderr || 'done' }));
        console.log(`[${new Date().toLocaleTimeString()}]  /api/deep-sync  → ${data.pluginCount} plugins`);
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'claude CLI not found or failed', detail: err }));
      });
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    if (fs.existsSync(BROWSER_HTML)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(BROWSER_HTML));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('browser/index.html not found');
    }
    return;
  }

  if (url.pathname === '/api/added') {
    try {
      const data = loadAddedMarketplaces();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, plugins: [] }));
    }
    return;
  }

  if (url.pathname === '/api/discover') {
    discoverPlugins()
      .then(data => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message, plugins: [] }));
      });
    return;
  }

  if (url.pathname === '/api/check-updates') {
    checkUpdates()
      .then(data => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  if (url.pathname === '/license') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(fs.existsSync(LICENSE_FILE) ? fs.readFileSync(LICENSE_FILE, 'utf8') : 'LICENSE not found');
    return;
  }

  if (url.pathname === '/privacy') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(fs.existsSync(PRIVACY_FILE) ? fs.readFileSync(PRIVACY_FILE, 'utf8') : 'PRIVACY.md not found');
    return;
  }

  // Serve locally-cached font files (downloaded once by setup-check)
  if (url.pathname.startsWith('/fonts/')) {
    const filename = path.basename(url.pathname); // prevent path traversal
    const ext      = path.extname(filename).slice(1);
    const mime     = ext === 'css' ? 'text/css; charset=utf-8' : 'font/woff2';
    const filePath = path.join(FONTS_DIR, filename);
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'max-age=604800' });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404); res.end();
    }
    return;
  }

  res.writeHead(404); res.end();
});

// Ensure fonts are cached in the correct PLUGIN_DATA dir (best-effort, non-blocking)
ensureFonts(PLUGIN_DATA).catch(() => {});

// Kill any stale process on PORT before binding, so updated code always wins.
function killStaleServer(port, cb) {
  const { execSync } = require('child_process');
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] });
      for (const line of out.split('\n')) {
        if (line.includes(`:${port} `) && line.includes('LISTENING')) {
          const pid = line.trim().split(/\s+/).pop();
          if (pid && /^\d+$/.test(pid) && pid !== '0') {
            try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch {}
          }
        }
      }
    } else {
      const pids = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim().split('\n').filter(Boolean);
      for (const pid of pids) { try { execSync(`kill -9 ${pid}`, { stdio: 'ignore' }); } catch {} }
    }
  } catch { /* port was free */ }
  setTimeout(cb, 200); // brief pause for OS to release the port
}

killStaleServer(PORT, () => {
  httpServer.listen(PORT, '127.0.0.1', () => {
    if (process.stdin.isTTY) {
      console.log(`\n  Plugin Browser  →  http://localhost:${PORT}\n`);
    }
  });

  httpServer.on('error', err => {
    if (err.code !== 'EADDRINUSE') console.error('HTTP server error:', err.message);
  });
});

// ── MCP server (stdio) ───────────────────────────────────────

const TOOLS = [
  {
    name: 'get_plugins',
    description: 'Return all plugins from the local Claude Code marketplace cache, including install counts and installed status.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'open_browser',
    description: 'Open the plugin browser UI at http://localhost:3747 in the default browser.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'deep_sync',
    description: 'Run `claude plugin marketplace update` to fetch the latest plugins from the marketplace source, then return fresh plugin data. Requires the claude CLI to be in PATH.',
    inputSchema: {
      type: 'object',
      properties: {
        marketplace: { type: 'string', description: 'Marketplace name to update (default: claude-plugins-official)' },
      },
      required: [],
    },
  },
];

function mcpSend(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function handleMcp(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return mcpSend({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'plugin-browser', version: SERVER_VERSION },
    }});
  }

  if (method === 'notifications/initialized') return; // no response

  if (method === 'tools/list') {
    return mcpSend({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  }

  if (method === 'tools/call') {
    if (params?.name === 'get_plugins') {
      try {
        const data = loadData();
        return mcpSend({ jsonrpc: '2.0', id, result: {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        }});
      } catch (err) {
        return mcpSend({ jsonrpc: '2.0', id, result: {
          content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true,
        }});
      }
    }

    if (params?.name === 'deep_sync') {
      const name = params.arguments?.marketplace || MARKETPLACE;
      runMarketplaceUpdate(name)
        .then(result => {
          const data = loadData();
          mcpSend({ jsonrpc: '2.0', id, result: {
            content: [{ type: 'text', text:
              `Marketplace updated. ${data.pluginCount} plugins now in cache.\n${result.stdout || ''}`.trim()
            }],
          }});
        })
        .catch(err => {
          mcpSend({ jsonrpc: '2.0', id, result: {
            content: [{ type: 'text', text: `Deep sync failed: ${err.message}` }], isError: true,
          }});
        });
      return; // async — response sent inside .then/.catch
    }

    if (params?.name === 'open_browser') {
      const { exec } = require('child_process');
      const cmd = process.platform === 'win32' ? `start http://localhost:${PORT}`
                : process.platform === 'darwin' ? `open http://localhost:${PORT}`
                : `xdg-open http://localhost:${PORT}`;
      exec(cmd);
      return mcpSend({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: `Plugin Browser opened at http://localhost:${PORT}` }],
      }});
    }
  }

  // Unknown method with an id — return error
  if (id !== undefined) {
    mcpSend({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  }
}

// Attach MCP stdio listener when stdin is piped (not a TTY).
// Only exit on stdin-end if MCP data was actually received —
// prevents premature exit when launched as a background process
// where stdin is non-TTY but immediately at EOF.
if (!process.stdin.isTTY) {
  let buffer = '';
  let mcpActive = false;

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    mcpActive = true;
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) {
        try { handleMcp(JSON.parse(line)); }
        catch { /* ignore malformed */ }
      }
    }
  });
  process.stdin.on('end', () => {
    if (mcpActive) process.exit(0);
    // else: standalone background mode — keep HTTP server alive
  });
}
