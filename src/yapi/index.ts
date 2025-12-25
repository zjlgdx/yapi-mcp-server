#!/usr/bin/env node
// src/yapi/index.ts

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from 'zod';

// --- Configuration ---
const YAPI_URL = process.env.YAPI_URL;
if (!YAPI_URL) {
  console.error("Error: YAPI_URL environment variable is required (e.g., http://my-yapi-instance.com)");
  process.exit(1);
}

const DEFAULT_PROJECT_TOKEN = process.env.YAPI_PROJECT_TOKEN;

// --- Helper function to get token ---
function getProjectToken(providedToken?: string): string {
  const token = providedToken || DEFAULT_PROJECT_TOKEN;
  if (!token) {
    throw new Error(
      "No project token provided. Either pass project_token in the request or set YAPI_PROJECT_TOKEN environment variable."
    );
  }
  return token;
}

// --- YAPI Client Logic ---
async function yapiRequest<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${YAPI_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  console.error(`[YAPI Server] Fetching: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    }
  });

  if (!response.ok) {
    throw new Error(`YAPI API error: ${response.status} ${response.statusText} - URL: ${url.toString()}`);
  }

  const data: any = await response.json();

  if (data.errcode !== 0) {
    throw new Error(`YAPI Error (${data.errcode}): ${data.errmsg}`);
  }

  return data.data as T;
}

// --- MCP Server Setup ---
const server = new McpServer({
  name: "yapi-mcp-server",
  version: "0.2.0",
});

// --- Tool: List Interfaces ---
server.registerTool(
  "yapi_list_interfaces",
  {
    title: "List YAPI Interfaces",
    description: "Lists all interface categories and the interfaces within them for a specific YAPI project.",
    inputSchema: {
      project_token: z.string().optional().describe(
        "The token for the YAPI project. Optional if YAPI_PROJECT_TOKEN env is set."
      ),
    },
  },
  async ({ project_token }) => {
    try {
      const token = getProjectToken(project_token);
      const result = await yapiRequest<any>('/api/interface/list_menu', { token });

      const simplifiedResult = result.map((category: any) => ({
        category_name: category.name,
        category_desc: category.desc,
        interfaces: category.list.map((iface: any) => ({
          id: iface._id,
          title: iface.title,
          path: iface.path,
          method: iface.method,
          status: iface.status,
        })),
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(simplifiedResult, null, 2) }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[YAPI Server] Error: ${errorMessage}`);
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: Get Interface Details ---
server.registerTool(
  "yapi_get_interface_details",
  {
    title: "Get YAPI Interface Details",
    description: "Gets detailed information for a specific YAPI interface by its ID.",
    inputSchema: {
      project_token: z.string().optional().describe(
        "The token for the YAPI project. Optional if YAPI_PROJECT_TOKEN env is set."
      ),
      interface_id: z.number().describe("The ID of the specific YAPI interface."),
    },
  },
  async ({ project_token, interface_id }) => {
    try {
      const token = getProjectToken(project_token);
      const result = await yapiRequest<any>('/api/interface/get', {
        token,
        id: interface_id.toString(),
      });

      // Clean up response
      delete result.__v;
      delete result.edit_uid;
      delete result.add_time;
      delete result.up_time;
      delete result.uid;

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[YAPI Server] Error: ${errorMessage}`);
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: Search Interfaces ---
server.registerTool(
  "yapi_search_interfaces",
  {
    title: "Search YAPI Interfaces",
    description: "Searches for interfaces by keyword in their titles or paths.",
    inputSchema: {
      project_token: z.string().optional().describe(
        "The token for the YAPI project. Optional if YAPI_PROJECT_TOKEN env is set."
      ),
      keyword: z.string().describe("The keyword to search for in interface titles or paths."),
    },
  },
  async ({ project_token, keyword }) => {
    try {
      const token = getProjectToken(project_token);
      const result = await yapiRequest<any>('/api/interface/list_menu', { token });

      const searchKeyword = keyword.toLowerCase();
      const matchedInterfaces: any[] = [];

      result.forEach((category: any) => {
        category.list.forEach((iface: any) => {
          if (
            iface.title?.toLowerCase().includes(searchKeyword) ||
            iface.path?.toLowerCase().includes(searchKeyword)
          ) {
            matchedInterfaces.push({
              id: iface._id,
              title: iface.title,
              path: iface.path,
              method: iface.method,
              status: iface.status,
              category: category.name,
            });
          }
        });
      });

      return {
        content: [{
          type: "text",
          text: matchedInterfaces.length > 0
            ? JSON.stringify(matchedInterfaces, null, 2)
            : `No interfaces found matching keyword: "${keyword}"`,
        }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[YAPI Server] Error: ${errorMessage}`);
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }
);

// --- Server Startup ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`YAPI MCP Server v0.2.0 running on stdio`);
  console.error(`Connected to YAPI instance at: ${YAPI_URL}`);
  if (DEFAULT_PROJECT_TOKEN) {
    console.error(`Default project token configured: ${DEFAULT_PROJECT_TOKEN.substring(0, 8)}...`);
  }
}

main().catch((error) => {
  console.error("Fatal error running YAPI MCP Server:", error);
  process.exit(1);
});
