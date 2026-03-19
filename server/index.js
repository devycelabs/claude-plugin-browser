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

const PORT         = parseInt(process.env.PLUGIN_BROWSER_PORT || '3747', 10);
const PLUGINS_BASE = path.join(os.homedir(), '.claude', 'plugins');
const MARKETPLACE  = 'claude-plugins-official';
const MKT_DIR      = path.join(PLUGINS_BASE, 'marketplaces', MARKETPLACE);
const BROWSER_HTML = path.join(__dirname, '..', 'browser', 'index.html');
const PLUGIN_DATA  = process.env.CLAUDE_PLUGIN_DATA || path.join(PLUGINS_BASE, 'data', 'plugin-browser');
const FONTS_DIR    = path.join(PLUGIN_DATA, 'fonts');

// ── Plugin data ──────────────────────────────────────────────

function safeReadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function firstParagraph(md) {
  return md.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))[0] || '';
}

function readPluginEntries(dir, defaultType) {
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

    // Explicit URL from manifest, or construct GitHub link for known-hosted plugins
    const explicitUrl = manifest?.repository || manifest?.homepage || manifest?.author?.url || null;
    const repoSubdir  = defaultType === 'external' ? 'external_plugins' : 'plugins';
    const url = explicitUrl || `https://github.com/anthropics/claude-plugins-official/tree/main/${repoSubdir}/${name}`;

    return [{ name, desc, author, type, url }];
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

  return { marketplace: MARKETPLACE, lastUpdated, fetchedAt: new Date().toISOString(),
           pluginCount: plugins.length, plugins, installCounts, installed };
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

httpServer.listen(PORT, '127.0.0.1', () => {
  // Only log when run standalone (not as MCP server via stdio)
  if (process.stdin.isTTY) {
    console.log(`\n  Plugin Browser  →  http://localhost:${PORT}\n`);
  }
});

httpServer.on('error', err => {
  if (err.code !== 'EADDRINUSE') console.error('HTTP server error:', err.message);
  // If port is taken, HTTP is probably already running — MCP still works fine
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
      serverInfo: { name: 'plugin-browser', version: '1.0.0' },
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
