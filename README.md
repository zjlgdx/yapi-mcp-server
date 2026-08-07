# YAPI MCP Server

A Model Context Protocol (MCP) server for interacting with a [YAPI](https://github.com/YMFE/yapi) instance. This server enables LLMs to retrieve API documentation details from your YAPI projects.

This release uses the MCP `2026-07-28` protocol over stdio. Legacy MCP initialization is intentionally not supported.

## Features

- **List Interfaces**: Get all interface categories and basic interface info within a project
- **List Project Interfaces**: Page through a flat project interface list without loading the whole project
- **List Category Interfaces**: Page through interfaces for a category ID from a YAPI `/cat_<id>` URL
- **Get Interface Details**: Retrieve detailed information for a specific interface by its ID
- **Search Interfaces**: Search for interfaces by keyword in titles or paths

## Tools

### `yapi_list_interfaces`
Lists all interface categories and the interfaces within them for a specific YAPI project.

**Input**:
- `project_id` (optional): Numeric project ID. Not required if `YAPI_PROJECT_ID` is set.
- `limit` (optional, default `100`): Maximum interfaces to return; allowed range is `1` to `500`.

**Returns**: JSON array of categories, including `category_id`, with simplified interface objects (id, category_id, title, path, method, status).

### `yapi_list_category_interfaces`
Lists one page of interfaces for a category ID without loading every interface in the project.

**Input**:
- `category_id` (positive integer, required): The numeric ID from a YAPI `/cat_<id>` URL.
- `page` (optional, default `1`): One-based page number.
- `limit` (optional, default `100`): Page size; allowed range is `1` to `500`.

**Returns**: Interface summaries plus `returned`, `total`, and `total_pages` pagination metadata.

### `yapi_list_project_interfaces`
Lists exactly one server-paginated page of interfaces for a project.

**Input**:
- `project_id` (optional): Numeric project ID. Not required if `YAPI_PROJECT_ID` is set.
- `page` (optional, default `1`): One-based page number.
- `limit` (optional, default `100`): Page size; allowed range is `1` to `500`.

**Returns**: A flat interface page with `project_id`, `page`, `limit`, `returned`, `total`, and `total_pages` metadata.

### `yapi_get_interface_details`
Gets detailed information for a specific YAPI interface by its ID.

**Input**:
- `project_id` (optional): Numeric project ID. Not required if `YAPI_PROJECT_ID` is set.
- `interface_id` (number, required): The ID of the specific YAPI interface.

**Returns**: JSON object with full interface specification (request/response parameters, headers, body schemas, etc.).

### `yapi_search_interfaces`
Searches for interfaces by keyword in their titles or paths using bounded server-paginated scanning.

**Input**:
- `project_id` (optional): Numeric project ID. Not required if `YAPI_PROJECT_ID` is set.
- `keyword` (string, required): The keyword to search for.
- `limit` (optional, default `100`): Maximum matches to return; allowed range is `1` to `500`.
- `max_scan_pages` (optional, default `10`): Maximum YAPI pages to scan; allowed range is `1` to `100`.

**Returns**: Matching interfaces (including `category_id` when supplied by YAPI) plus `pages_scanned`, `interfaces_scanned`, project pagination totals, and truncation metadata. `total` is the number of matches found in the scanned pages. `truncated_reason` is `match_limit`, `max_scan_pages`, or `null` after a complete scan.

## Prerequisites

1. A running YAPI instance
2. Access to the project token(s) for the YAPI projects you want to interact with (found in YAPI project "Settings" -> "Tokens")
3. Node.js 22+ installed

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `YAPI_URL` | Yes | Base URL of your YAPI instance (e.g., `http://yapi.example.com`) |
| `YAPI_PROJECT_TOKEN` | Yes | Project credential. It is read only from the process environment and never accepted as tool input |
| `YAPI_PROJECT_ID` | No | Default numeric project ID. Tool calls may override it with `project_id` |
| `YAPI_REQUEST_TIMEOUT_MS` | No | HTTP timeout in milliseconds (`100`-`300000`, default `10000`) |

## Installation & Configuration

### Build from Source

```bash
git clone <this-repo>
cd yapi-mcp-server
npm install
npm run build
```

### Local Development (npm link)

For local development, use `npm link` to create a global symlink:

```bash
cd yapi-mcp-server
npm link
```

This makes `mcp-server-yapi` command available globally, avoiding hardcoded paths.

### Claude Desktop

Add to your `claude_desktop_config.json`:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%AppData%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "yapi": {
      "command": "mcp-server-yapi",
      "env": {
        "YAPI_URL": "<your-yapi-url>",
        "YAPI_PROJECT_TOKEN": "<your-project-token>"
      }
    }
  }
}
```

### Claude Code (CLI)

Use the `claude mcp` command to add the server:

```bash
# Add to user config (available in all projects)
claude mcp add-json yapi -s user '{
  "type": "stdio",
  "command": "mcp-server-yapi",
  "env": {
    "YAPI_URL": "<your-yapi-url>",
    "YAPI_PROJECT_TOKEN": "<your-project-token>"
  }
}'

# Or add to project config (only for current project)
claude mcp add-json yapi -s project '{
  "type": "stdio",
  "command": "mcp-server-yapi",
  "env": {
    "YAPI_URL": "<your-yapi-url>",
    "YAPI_PROJECT_TOKEN": "<your-project-token>"
  }
}'

# Verify the configuration
claude mcp list
claude mcp get yapi
```

### Cursor IDE

Add to your Cursor MCP settings:

**macOS**: `~/.cursor/mcp.json`
**Windows**: `%USERPROFILE%\.cursor\mcp.json`

```json
{
  "mcpServers": {
    "yapi": {
      "command": "mcp-server-yapi",
      "env": {
        "YAPI_URL": "<your-yapi-url>",
        "YAPI_PROJECT_TOKEN": "<your-project-token>"
      }
    }
  }
}
```

### Using npx (Recommended for distribution)

Version `0.5.0` requires an MCP `2026-07-28` client:

```json
{
  "mcpServers": {
    "yapi": {
      "command": "npx",
      "args": ["-y", "@zjlgdx/yapi-mcp-server@0.5.0"],
      "env": {
        "YAPI_URL": "<your-yapi-url>",
        "YAPI_PROJECT_TOKEN": "<your-project-token>"
      }
    }
  }
}
```

## Usage Examples

Once configured, you can ask Claude to:

- "List all APIs in my YAPI project"
- "List interfaces from YAPI category URL .../cat_114557"
- "Get details for interface ID 12345"
- "Search for APIs related to 'user' in my project"
- "Show me all POST endpoints"

## Troubleshooting

### Server not starting
- Ensure Node.js 22+ is installed
- Verify the path to `dist/index.js` is correct
- Check that `YAPI_URL` is set and accessible

### Authentication errors
- Verify your `YAPI_PROJECT_TOKEN` is correct
- Check token permissions in YAPI project settings

### Network errors
- Ensure your YAPI instance is accessible from your machine
- Check firewall settings if using internal network

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Build and run the MCP 2026-07-28 stdio smoke tests
npm test

# Watch mode
npm run watch

# Run directly (requires env vars)
YAPI_URL=http://yapi.example.com YAPI_PROJECT_TOKEN=xxx npm start
```

The server is read-only: all exposed tools use YAPI `GET` endpoints and are advertised with MCP read-only annotations. Diagnostic output is written only to stderr; stdout is reserved for MCP messages.

## Publishing

The npm package is `@zjlgdx/yapi-mcp-server`. The unscoped `mcp-server-yapi` package belongs to an unrelated publisher and must never be used as this repository's release target.

After the one-time bootstrap below, publishing is performed only by `.github/workflows/publish.yml` when a stable GitHub Release is published. The release tag must be `v<package.json version>`, point to a commit on `main`, and pass the same build, test, audit, and package-content gates used by CI. The workflow uses npm Trusted Publishing through GitHub OIDC; do not add an `NPM_TOKEN` secret or use manual publishing as a fallback.

Because npm requires a package to exist before Trusted Publishing can be configured, the owner of the npm `zjlgdx` user or organization scope must perform a one-time bootstrap with an npm account protected by 2FA:

1. Confirm that the authenticated npm account owns the `@zjlgdx` scope.
2. From a temporary clean copy of an exact, verified `main` commit, set a disposable prerelease version such as `0.0.0-bootstrap.0` without committing it, then run `npm publish --access public --tag bootstrap`. Do not manually publish a stable release version.
3. Immediately configure Trusted Publishing on the new package with these exact values:

- Publisher: GitHub Actions
- Organization or user: `zjlgdx`
- Repository: `yapi-mcp-server`
- Workflow filename: `publish.yml`
- Environment: `npm`
- Allowed action: `npm publish`

4. Set package publishing access to require 2FA and disallow traditional tokens.

The bootstrap prerelease is the only manual publish. Every stable version must use the release workflow. The GitHub `npm` environment must allow only tags matching `v*`. Enable required reviewers when a reviewer distinct from the releaser is available. Trusted Publishing requires a public GitHub-hosted runner and automatically generates npm provenance for this public package.

## License

MIT
