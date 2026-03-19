#!/usr/bin/env node
// Dev entry point — runs on port 3748 so it doesn't clash with the
// formally installed plugin instance on 3747.
process.env.PLUGIN_BROWSER_PORT = process.env.PLUGIN_BROWSER_PORT || '3748';
require('./index.js');
