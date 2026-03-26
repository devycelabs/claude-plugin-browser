#!/usr/bin/env node
'use strict';
/**
 * Flattens claude-plugins-official/ into docs/official.json
 * Run via: node scripts/build-official-json.js > docs/official.json
 */
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'claude-plugins-official');
const out  = [];

function authorName(a) {
  if (!a) return 'Anthropic';
  if (typeof a === 'string') return a;
  return a.name || 'Anthropic';
}

function readDir(dir, type) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir).sort()) {
    const pluginJson = path.join(dir, name, '.claude-plugin', 'plugin.json');
    if (fs.existsSync(pluginJson)) {
      try {
        const p = JSON.parse(fs.readFileSync(pluginJson, 'utf8'));
        out.push({
          name:        p.name        || name,
          description: p.description || '',
          author:      authorName(p.author),
          type,
          keywords:    Array.isArray(p.keywords) ? p.keywords : [],
          version:     p.version  || '',
          homepage:    p.homepage || '',
        });
      } catch { /* skip malformed */ }
    } else if (type === 'anthropic' && name.endsWith('-lsp')) {
      // LSP plugins have no plugin.json — synthesise entry from README first line
      const readme = path.join(dir, name, 'README.md');
      let desc = name.replace(/-lsp$/, '').replace(/-/g, ' ') + ' language server for Claude Code.';
      if (fs.existsSync(readme)) {
        const lines = fs.readFileSync(readme, 'utf8').split('\n');
        const firstBody = lines.find(l => l.trim() && !l.startsWith('#'));
        if (firstBody) desc = firstBody.trim();
      }
      out.push({
        name:        name,
        description: desc,
        author:      'Anthropic',
        type:        'lsp',
        keywords:    ['lsp', 'language-server'],
        version:     '',
        homepage:    '',
      });
    }
  }
}

readDir(path.join(ROOT, 'plugins'),          'anthropic');
readDir(path.join(ROOT, 'external_plugins'), 'external');

process.stdout.write(JSON.stringify(out, null, 2) + '\n');
