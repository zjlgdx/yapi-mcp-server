#!/usr/bin/env node
// src/yapi/index.ts

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// --- Configuration ---
// Get YAPI base URL from environment variable (required)
const YAPI_URL = process.env.YAPI_URL;
if (!YAPI_URL) {
  console.error("Error: YAPI_URL environment variable is required (e.g., http://my-yapi-instance.com)");
  process.exit(1);
}

// Optional default project token from environment variable
const DEFAULT_PROJECT_TOKEN = process.env.YAPI_PROJECT_TOKEN;

// --- Type for Tool Input Schema ---
type ToolInput = Tool["inputSchema"];

const ListInterfacesArgsSchema = z.object({
  project_token: z.string().optional().describe(
    "The token for the YAPI project. Optional if YAPI_PROJECT_TOKEN env is set."
  ),
});

const GetInterfaceDetailsArgsSchema = z.object({
  project_token: z.string().optional().describe(
    "The token for the YAPI project. Optional if YAPI_PROJECT_TOKEN env is set."
  ),
  interface_id: z.number().describe("The ID of the specific YAPI interface."),
});

const SearchInterfacesArgsSchema = z.object({
  project_token: z.string().optional().describe(
    "The token for the YAPI project. Optional if YAPI_PROJECT_TOKEN env is set."
  ),
  keyword: z.string().describe("The keyword to search for in interface titles or paths."),
});

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

// --- Tool Definitions ---
const ListInterfacesTool: Tool = {
  name: "yapi_list_interfaces",
  description: "Lists all interface categories and the interfaces within them for a specific YAPI project. Returns a structured list of API categories with their interfaces.",
  inputSchema: zodToJsonSchema(ListInterfacesArgsSchema) as ToolInput,
};

const GetInterfaceDetailsTool: Tool = {
  name: "yapi_get_interface_details",
  description: "Gets detailed information for a specific YAPI interface by its ID. Returns full API specification including request/response parameters, headers, body schemas, etc.",
  inputSchema: zodToJsonSchema(GetInterfaceDetailsArgsSchema) as ToolInput,
};

const SearchInterfacesTool: Tool = {
  name: "yapi_search_interfaces",
  description: "Searches for interfaces by keyword in their titles or paths. Useful for finding specific APIs without browsing the full list.",
  inputSchema: zodToJsonSchema(SearchInterfacesArgsSchema) as ToolInput,
};

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

  // YAPI specific error handling
  if (data.errcode !== 0) {
    throw new Error(`YAPI Error (${data.errcode}): ${data.errmsg}`);
  }

  return data.data as T;
}

// --- MCP Server Setup ---
const server = new Server(
  {
    name: "yapi-mcp-server",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// --- Request Handlers ---

// List Tools Handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [ListInterfacesTool, GetInterfaceDetailsTool, SearchInterfacesTool],
  };
});

// Call Tool Handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error(`No arguments provided for tool: ${name}`);
  }

  try {
    if (name === ListInterfacesTool.name) {
      const parsedArgs = ListInterfacesArgsSchema.parse(args);
      const token = getProjectToken(parsedArgs.project_token);

      const result = await yapiRequest<any>('/api/interface/list_menu', {
        token,
      });

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
    } else if (name === GetInterfaceDetailsTool.name) {
      const parsedArgs = GetInterfaceDetailsArgsSchema.parse(args);
      const token = getProjectToken(parsedArgs.project_token);

      const result = await yapiRequest<any>('/api/interface/get', {
        token,
        id: parsedArgs.interface_id.toString(),
      });

      // Clean up response for readability
      delete result.__v;
      delete result.edit_uid;
      delete result.add_time;
      delete result.up_time;
      delete result.uid;

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } else if (name === SearchInterfacesTool.name) {
      const parsedArgs = SearchInterfacesArgsSchema.parse(args);
      const token = getProjectToken(parsedArgs.project_token);

      // First get all interfaces
      const result = await yapiRequest<any>('/api/interface/list_menu', {
        token,
      });

      // Search through all interfaces
      const keyword = parsedArgs.keyword.toLowerCase();
      const matchedInterfaces: any[] = [];

      result.forEach((category: any) => {
        category.list.forEach((iface: any) => {
          if (
            iface.title?.toLowerCase().includes(keyword) ||
            iface.path?.toLowerCase().includes(keyword)
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
            : `No interfaces found matching keyword: "${parsedArgs.keyword}"`,
        }],
      };
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[YAPI Server] Error calling tool ${name}: ${errorMessage}`);
    return {
      content: [{ type: "text", text: `Error executing tool ${name}: ${errorMessage}` }],
      isError: true,
    };
  }
});

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
