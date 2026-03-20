---
name: plugin-browser-setup
description: Guide the user through configuring the Plugin Browser after installation. Use this skill when the user asks to "set up plugin browser", "configure plugin browser", "plugin browser not working", or runs /plugin-browser:setup.
---

# Plugin Browser: Setup

Guide the user through configuring the Plugin Browser after installation.

## Steps

1. Ask the user: **"Do you have an external Plugin Browser server, or would you like to run one locally?"**
   - **External server** → go to step 2
   - **Local server** → go to step 3

---

### External server path

2. Ask for the server URL (e.g. `http://192.168.1.50:3747` or `http://myserver.local:3747`).

   Then instruct the user to set the env var permanently. Show them the appropriate method:

   **In shell profile** (`~/.bashrc`, `~/.zshrc`, etc.):
   ```bash
   export PLUGIN_BROWSER_URL=http://their-url
   ```

   **Or in Claude Code settings** (persists across shells):
   Run `/update-config` and set `PLUGIN_BROWSER_URL=http://their-url` in env vars.

   After they confirm it's set, tell them to reload Claude Code (`/quit` then restart) for the MCP server to pick up the new env var.

---

### Local server path

3. Check if Node.js is available by running `node --version`.

   **If Node.js is present:**
   - Tell the user to start the server:
     ```
     node ~/.claude/plugins/marketplaces/devycelabs-claude-plugin-browser/server/index.js
     ```
   - Offer to start it now by running that command.
   - Once started, open `http://localhost:3747` in the browser.
   - To use a custom port, set `PLUGIN_BROWSER_PORT=XXXX` before starting.

   **If Node.js is NOT present:**
   - Tell the user the server requires Node.js (https://nodejs.org).
   - As a no-server fallback, they can open the HTML file directly:
     ```
     ~/.claude/plugins/marketplaces/devycelabs-claude-plugin-browser/browser/index.html
     ```
     This works offline using embedded data — live sync won't be available until Node.js is installed.

---

4. After any path: confirm setup is complete by checking `http://localhost:3747/api/plugins`
   (or their external URL) responds. If it does, tell the user everything is working.
