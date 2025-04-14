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
import fetch from 'node-fetch';

// --- Configuration ---
// Get YAPI base URL from environment variable or use a default
const YAPI_URL = process.env.YAPI_URL;
if (!YAPI_URL) {
  console.error("Error: YAPI_URL environment variable is required (e.g., http://my-yapi-instance.com)");
  process.exit(1);
}

// --- Zod Schemas for Tool Inputs ---
const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

const ListInterfacesArgsSchema = z.object({
  project_token: z.string().describe("The token for the YAPI project."),
});

const GetInterfaceDetailsArgsSchema = z.object({
  project_token: z.string().describe("The token for the YAPI project."),
  interface_id: z.number().describe("The ID of the specific YAPI interface."),
});

// --- Tool Definitions ---
const ListInterfacesTool: Tool = {
  name: "yapi_list_interfaces",
  description: "Lists all interface categories and the interfaces within them for a specific YAPI project.",
  inputSchema: zodToJsonSchema(ListInterfacesArgsSchema) as ToolInput,
};

const GetInterfaceDetailsTool: Tool = {
  name: "yapi_get_interface_details",
  description: "Gets detailed information for a specific YAPI interface by its ID.",
  inputSchema: zodToJsonSchema(GetInterfaceDetailsArgsSchema) as ToolInput,
};

// --- YAPI Client Logic ---
async function yapiRequest<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${YAPI_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  console.error(`[YAPI Server] Fetching: ${url.toString()}`); // Log the request URL

  const response = await fetch(url.toString(), {
    method: 'GET', // YAPI open API seems to use GET primarily
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
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {}, // Enable the tools capability
    },
  }
);

// --- Request Handlers ---

// List Tools Handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [ListInterfacesTool, GetInterfaceDetailsTool],
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
      const result = await yapiRequest<any>('/api/interface/list_menu', {
        token: parsedArgs.project_token,
      });
      // Optionally simplify the response for the LLM
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
      const result = await yapiRequest<any>('/api/interface/get', {
        token: parsedArgs.project_token,
        id: parsedArgs.interface_id.toString(),
      });
       // Optionally clean up or simplify the large response
       delete result.__v; // remove mongoose version key
       delete result.edit_uid;
       delete result.add_time;
       delete result.up_time;
       // Add more simplification if needed
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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
  console.error(`YAPI MCP Server running on stdio, connected to YAPI instance at ${YAPI_URL}`);
}

main().catch((error) => {
  console.error("Fatal error running YAPI MCP Server:", error);
  process.exit(1);
});