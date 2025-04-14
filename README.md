# YAPI MCP Server

A Model Context Protocol (MCP) server for interacting with a [YAPI](https://github.com/YMFE/yapi) instance. This server enables LLMs to retrieve API documentation details from your YAPI projects.

## Features

- List interface categories and basic interface info within a project.
- Get detailed information for a specific interface by its ID.

## Tools

1.  **`yapi_list_interfaces`**
    - Lists all interface categories and the interfaces within them for a specific YAPI project.
    - **Input**:
      - `project_token` (string): The token for the YAPI project (found in YAPI project settings -> Tokens).
    - **Returns**: A JSON string containing an array of categories, each with a list of simplified interface objects (id, title, path, method, status).

2.  **`yapi_get_interface_details`**
    - Gets detailed information for a specific YAPI interface by its ID.
    - **Input**:
      - `project_token` (string): The token for the YAPI project.
      - `interface_id` (number): The ID of the specific YAPI interface (you can find this ID in the URL when viewing an interface in YAPI).
    - **Returns**: A JSON string containing the detailed interface information (request/response parameters, headers, body schemas, etc.).

## Setup

### Prerequisites

1.  A running YAPI instance.
2.  Access to the project token(s) for the YAPI projects you want to interact with. You can find this in your YAPI project's "Settings" -> "Tokens" section.
3.  Node.js and npm installed on the machine where you'll run the server or build the Docker image.

### Configuration

The server requires the base URL of your YAPI instance to be set via the `YAPI_URL` environment variable.

### Usage with Claude Desktop

Add the following to your `claude_desktop_config.json`:

#### NPX

```json
{
  "mcpServers": {
    "yapi": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-yapi"
      ],
      "env": {
        "YAPI_URL": "http://your-yapi-instance.com"
        // If you want to hardcode a default token (less secure, prefer passing via tool):
        // "YAPI_PROJECT_TOKEN": "YOUR_DEFAULT_PROJECT_TOKEN"
      }
    }
  }
}