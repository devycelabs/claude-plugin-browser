#!/usr/bin/env node
'use strict';

/**
 * Kill any stale plugin-browser server on port 3747 at session start.
 * Runs cross-platform: uses netstat + taskkill on Windows, lsof + kill elsewhere.
 */

const { execSync } = require('child_process');

const PORT = process.env.PLUGIN_BROWSER_PORT || '3747';

function getPidsOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano`, { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] });
      const pids = new Set();
      for (const line of out.split('\n')) {
        if (line.includes(`:${port} `) && line.includes('LISTENING')) {
          const pid = line.trim().split(/\s+/).pop();
          if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
        }
      }
      return [...pids];
    } else {
      const out = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] });
      return out.trim().split('\n').filter(Boolean);
    }
  } catch { return []; }
}

function killPid(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
    } else {
      execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
    }
  } catch { /* already gone */ }
}

const pids = getPidsOnPort(PORT);
for (const pid of pids) killPid(pid);
