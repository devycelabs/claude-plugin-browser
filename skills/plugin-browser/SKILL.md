# Plugin Browser

Open the local Claude Code Plugin Browser UI.

## Steps

1. **Check if the HTTP server is already running** by making a request to `http://localhost:3747/api/plugins`.

2. **If the server responds:**
   - Open `http://localhost:3747` in the default browser using the appropriate command:
     - Windows: `start http://localhost:3747`
     - macOS: `open http://localhost:3747`
     - Linux: `xdg-open http://localhost:3747`
   - Tell the user the browser is open.

3. **If the server is not responding:**

   a. **If the MCP server is available** (i.e., the `plugin-browser` MCP tool `open_browser` is accessible):
      - Call the `open_browser` tool — it will start the HTTP server and open the UI automatically.

   b. **If no MCP server is available** (plugin not installed with MCP, or running standalone):
      - Tell the user to start the server manually:
        ```
        node ~/.claude/plugins/cache/claude-plugins-official/plugin-browser/<version>/server/index.js
        ```
        Or if they have the source repo cloned:
        ```
        node server/index.js
        ```
      - Then open `http://localhost:3747` once it's running.
      - Alternatively, they can open `browser/index.html` directly in a browser — it works offline with embedded data, but won't reflect newly installed plugins until the server is running.

## Notes
- The server runs on port **3747** and only binds to `127.0.0.1` — it is not exposed to the network.
- The browser updates live when the **⟳ Sync** button is clicked.
- Official plugin data is read from `~/.claude/plugins/` (no network needed). Community plugins and update checks fetch from GitHub when available.
