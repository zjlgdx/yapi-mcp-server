# YAPI MCP Server

A Model Context Protocol (MCP) server for interacting with a [YAPI](https://github.com/YMFE/yapi) instance. This server enables LLMs to retrieve API documentation details from your YAPI projects.

This release uses the MCP `2026-07-28` protocol over stdio. Legacy MCP initialization is intentionally not supported.

## Features

- **List Interfaces**: Get all interface categories and basic interface info within a project
- **Get Interface Details**: Retrieve detailed information for a specific interface by its ID
- **Search Interfaces**: Search for interfaces by keyword in titles or paths

## Tools

### `yapi_list_interfaces`
Lists all interface categories and the interfaces within them for a specific YAPI project.

**Input**:
- `project_id` (optional): Numeric project ID. Not required if `YAPI_PROJECT_ID` is set.
- `limit` (optional, default `100`): Maximum interfaces to return; allowed range is `1` to `500`.

**Returns**: JSON array of categories with simplified interface objects (id, title, path, method, status).

### `yapi_get_interface_details`
Gets detailed information for a specific YAPI interface by its ID.

**Input**:
- `project_id` (optional): Numeric project ID. Not required if `YAPI_PROJECT_ID` is set.
- `interface_id` (number, required): The ID of the specific YAPI interface.

**Returns**: JSON object with full interface specification (request/response parameters, headers, body schemas, etc.).

### `yapi_search_interfaces`
Searches for interfaces by keyword in their titles or paths.

**Input**:
- `project_id` (optional): Numeric project ID. Not required if `YAPI_PROJECT_ID` is set.
- `keyword` (string, required): The keyword to search for.
- `limit` (optional, default `100`): Maximum matches to return; allowed range is `1` to `500`.

**Returns**: JSON array of matching interfaces with their category information.

## Prerequisites

1. A running YAPI instance
2. Access to the project token(s) for the YAPI projects you want to interact with (found in YAPI project "Settings" -> "Tokens")
3. Node.js 20+ installed

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

Use the actual published package name. Version `0.2.0` requires an MCP `2026-07-28` client:

```json
{
  "mcpServers": {
    "yapi": {
      "command": "npx",
      "args": ["-y", "mcp-server-yapi@0.2.0"],
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
- "Get details for interface ID 12345"
- "Search for APIs related to 'user' in my project"
- "Show me all POST endpoints"

## Troubleshooting

### Server not starting
- Ensure Node.js 20+ is installed
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

## License

MIT
