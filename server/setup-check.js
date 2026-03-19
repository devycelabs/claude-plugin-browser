#!/usr/bin/env node
'use strict';

/**
 * Runs on SessionStart. Outputs setup guidance once if the server
 * isn't reachable and no external URL is configured.
 * Silences itself permanently once the user is set up.
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const PLUGIN_ROOT  = process.env.CLAUDE_PLUGIN_ROOT  || path.join(__dirname, '..');
const PLUGIN_DATA  = process.env.CLAUDE_PLUGIN_DATA  || path.join(os.homedir(), '.claude', 'plugins', 'data', 'plugin-browser');
const EXTERNAL_URL = process.env.PLUGIN_BROWSER_URL  || '';
const PORT         = process.env.PLUGIN_BROWSER_PORT || '3747';
const FLAG_FILE    = path.join(PLUGIN_DATA, '.setup-complete');

// If user configured an external URL, mark as set up and exit silently
if (EXTERNAL_URL) {
  markComplete(`external server at ${EXTERNAL_URL}`);
  process.exit(0);
}

// Check if the local server is already responding
const req = http.get(`http://127.0.0.1:${PORT}/api/plugins`, { timeout: 800 }, () => {
  markComplete(`local server on port ${PORT}`);
  process.exit(0);
});

req.on('timeout', () => req.destroy());

req.on('error', () => {
  // Server not reachable — only print guidance if we haven't already
  if (fs.existsSync(FLAG_FILE)) {
    process.exit(0); // user knows, stay silent
  }

  console.log(`
┌─ Plugin Browser: setup needed ──────────────────────────────────┐
│                                                                  │
│  Choose one:                                                     │
│                                                                  │
│  A) Start the local server (reads your ~/.claude/plugins):      │
│     node "${PLUGIN_ROOT}/server/index.js"             │
│     then open: http://localhost:${PORT}                          │
│                                                                  │
│  B) Point to an external server:                                 │
│     Set PLUGIN_BROWSER_URL=http://your-host:${PORT}             │
│     in your shell or settings.json, then reload Claude Code.    │
│                                                                  │
│  Run /plugin-browser:setup for guided configuration.            │
└──────────────────────────────────────────────────────────────────┘
`.trim());
});

req.end();

function markComplete(note) {
  try {
    fs.mkdirSync(PLUGIN_DATA, { recursive: true });
    fs.writeFileSync(FLAG_FILE, JSON.stringify({ configuredAt: new Date().toISOString(), note }));
  } catch { /* data dir may not be writable in all envs */ }
}
