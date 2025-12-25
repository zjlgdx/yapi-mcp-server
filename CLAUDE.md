# YAPI MCP Server

MCP server for interacting with YAPI API documentation platform.

## Quick Commands

```bash
# Build
npm run build

# Watch mode (development)
npm run watch

# Run server (requires env vars)
YAPI_URL=http://example.com YAPI_PROJECT_TOKEN=xxx npm start

# Link globally for local development
npm link

# Verify MCP connection
claude mcp list
claude mcp get yapi
```

## Project Structure

```
src/yapi/index.ts    # Main server entry point, all tools defined here
dist/                # Compiled output (gitignored)
```

## Architecture

- **Transport**: STDIO (standard input/output)
- **SDK**: @modelcontextprotocol/sdk
- **Validation**: Zod schemas for tool input validation

## Tools

| Tool | Description |
|------|-------------|
| `yapi_list_interfaces` | List all API categories and interfaces |
| `yapi_get_interface_details` | Get detailed info for a specific interface by ID |
| `yapi_search_interfaces` | Search interfaces by keyword |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `YAPI_URL` | Yes | YAPI instance base URL |
| `YAPI_PROJECT_TOKEN` | No | Default project token |

## Code Conventions

- TypeScript with strict mode
- ES modules (`type: "module"`)
- Use `console.error()` for logging (STDIO transport requirement)
- Never use `console.log()` - it corrupts JSON-RPC messages

## Adding New Tools

Use `server.registerTool()` method:

```typescript
server.registerTool(
  "tool_name",
  {
    title: "Tool Title",
    description: "Tool description",
    inputSchema: {
      param: z.string().describe("Parameter description"),
    },
  },
  async ({ param }) => {
    return {
      content: [{ type: "text", text: "result" }],
    };
  }
);
```

Then rebuild: `npm run build`

## MCP Configuration

```bash
# Add to Claude Code (user scope)
claude mcp add-json yapi -s user '{
  "type": "stdio",
  "command": "mcp-server-yapi",
  "env": {
    "YAPI_URL": "<your-yapi-url>",
    "YAPI_PROJECT_TOKEN": "<your-token>"
  }
}'
```
