#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

const SERVER_VERSION = "0.4.0";
const DEFAULT_RESULT_LIMIT = 100;
const MAX_RESULT_LIMIT = 500;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

const rawYapiUrl = process.env.YAPI_URL;
if (!rawYapiUrl) {
  console.error("Error: YAPI_URL environment variable is required (e.g., http://my-yapi-instance.com)");
  process.exit(1);
}

function normalizeYapiUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("YAPI_URL must be a valid absolute URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("YAPI_URL must use http or https");
  }

  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  url.search = "";
  url.hash = "";
  return url;
}

function readRequestTimeout(): number {
  const value = process.env.YAPI_REQUEST_TIMEOUT_MS;
  if (!value) return DEFAULT_REQUEST_TIMEOUT_MS;

  if (!/^\d+$/.test(value)) {
    throw new Error("YAPI_REQUEST_TIMEOUT_MS must be an integer between 100 and 300000");
  }

  const timeout = Number(value);
  if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 300_000) {
    throw new Error("YAPI_REQUEST_TIMEOUT_MS must be an integer between 100 and 300000");
  }
  return timeout;
}

let YAPI_BASE_URL: URL;
let REQUEST_TIMEOUT_MS: number;
try {
  YAPI_BASE_URL = normalizeYapiUrl(rawYapiUrl);
  REQUEST_TIMEOUT_MS = readRequestTimeout();
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : "Invalid YAPI configuration"}`);
  process.exit(1);
}

const PROJECT_TOKEN = process.env.YAPI_PROJECT_TOKEN;
const DEFAULT_PROJECT_ID = process.env.YAPI_PROJECT_ID;

function redactSecrets(value: string): string {
  if (!PROJECT_TOKEN) return value;

  let redacted = value.split(PROJECT_TOKEN).join("[REDACTED]");
  const encodedToken = encodeURIComponent(PROJECT_TOKEN);
  if (encodedToken !== PROJECT_TOKEN) {
    redacted = redacted.split(encodedToken).join("[REDACTED]");
  }
  return redacted;
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactSecrets(message);
}

function getProjectToken(): string {
  if (!PROJECT_TOKEN) {
    throw new Error("YAPI_PROJECT_TOKEN environment variable is required");
  }
  return PROJECT_TOKEN;
}

function getProjectId(providedId?: string): string {
  const projectId = providedId || DEFAULT_PROJECT_ID;
  if (!projectId) {
    throw new Error("Set project_id in the tool call or YAPI_PROJECT_ID in the environment");
  }
  if (!/^\d+$/.test(projectId)) {
    throw new Error("project_id must be a numeric string");
  }
  return projectId;
}

type YapiEnvelope<T> = {
  errcode: number;
  errmsg?: string;
  data: T;
};

async function yapiRequest<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const url = new URL(endpoint.replace(/^\/+/, ""), YAPI_BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  console.error(`[YAPI Server] GET ${url.pathname}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(`YAPI request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw new Error("YAPI request failed");
  }

  if (!response.ok) {
    throw new Error(`YAPI API error: ${response.status} ${response.statusText}`);
  }

  let body: YapiEnvelope<T>;
  try {
    body = (await response.json()) as YapiEnvelope<T>;
  } catch {
    throw new Error("YAPI API returned invalid JSON");
  }

  if (body.errcode !== 0) {
    throw new Error(`YAPI error (${body.errcode}): ${redactSecrets(body.errmsg || "Unknown error")}`);
  }

  return body.data;
}

const projectIdSchema = z.string().regex(/^\d+$/, "project_id must be a numeric string").optional().describe(
  "The numeric YAPI project ID. Optional if YAPI_PROJECT_ID is set."
);
const resultLimitSchema = z.number().int().min(1).max(MAX_RESULT_LIMIT).default(DEFAULT_RESULT_LIMIT).describe(
  `Maximum number of interfaces to return (1-${MAX_RESULT_LIMIT}).`
);
const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

type YapiCategory = {
  _id?: number;
  name?: string;
  desc?: string;
  list?: YapiInterfaceSummary[];
};

type YapiInterfaceSummary = {
  _id?: number;
  title?: string;
  path?: string;
  method?: string;
  status?: string;
};

type YapiInterfacePage = {
  count: number;
  total: number;
  list: YapiInterfaceSummary[];
};

function simplifyInterface(iface: YapiInterfaceSummary) {
  return {
    id: iface._id,
    title: iface.title,
    path: iface.path,
    method: iface.method,
    status: iface.status,
  };
}

function toolError(error: unknown) {
  const errorMessage = safeErrorMessage(error);
  console.error(`[YAPI Server] Error: ${errorMessage}`);
  return {
    content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
    isError: true as const,
  };
}

function createServer(): McpServer {
  const server = new McpServer(
    {
      name: "yapi-mcp-server",
      version: SERVER_VERSION,
    },
    {
      instructions:
        "Use yapi_list_category_interfaces when a YAPI URL contains /cat_<category_id>. " +
        "Use yapi_list_project_interfaces for a bounded flat page of project interfaces. " +
        "Use yapi_get_interface_details when an interface ID is known. All tools are read-only.",
    }
  );

  server.registerTool(
    "yapi_list_project_interfaces",
    {
      title: "List YAPI Project Interfaces",
      description: "Lists one server-paginated page of interfaces for a YAPI project.",
      inputSchema: z.object({
        project_id: projectIdSchema,
        page: z.number().int().min(1).default(1).describe("One-based page number."),
        limit: resultLimitSchema,
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ project_id, page, limit }) => {
      try {
        const resolvedProjectId = getProjectId(project_id);
        const result = await yapiRequest<YapiInterfacePage>("api/interface/list", {
          token: getProjectToken(),
          project_id: resolvedProjectId,
          page: page.toString(),
          limit: limit.toString(),
        });
        const interfaces = (result.list || []).map(simplifyInterface);
        const projectPage = {
          project_id: resolvedProjectId,
          page,
          limit,
          returned: interfaces.length,
          total: result.count,
          total_pages: result.total,
          interfaces,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(projectPage, null, 2) }],
          structuredContent: projectPage,
        };
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.registerTool(
    "yapi_list_interfaces",
    {
      title: "List YAPI Interfaces",
      description: "Lists interface categories and interfaces for a YAPI project, capped by limit.",
      inputSchema: z.object({
        project_id: projectIdSchema,
        limit: resultLimitSchema,
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ project_id, limit }) => {
      try {
        const result = await yapiRequest<YapiCategory[]>("api/interface/list_menu", {
          token: getProjectToken(),
          project_id: getProjectId(project_id),
        });

        let remaining = limit;
        const categories = result.map((category) => {
          const interfaces = (category.list || []).slice(0, remaining).map(simplifyInterface);
          remaining -= interfaces.length;
          return {
            category_id: category._id,
            category_name: category.name,
            category_desc: category.desc,
            interfaces,
          };
        }).filter((category) => category.interfaces.length > 0);

        const total = result.reduce((count, category) => count + (category.list?.length || 0), 0);
        return {
          content: [{ type: "text", text: JSON.stringify(categories, null, 2) }],
          structuredContent: {
            categories,
            returned: limit - remaining,
            total,
            truncated: total > limit,
          },
        };
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.registerTool(
    "yapi_list_category_interfaces",
    {
      title: "List YAPI Category Interfaces",
      description: "Lists one page of interfaces in a YAPI category by category ID.",
      inputSchema: z.object({
        category_id: z.number().int().positive().describe("The positive integer ID from a YAPI /cat_<id> URL."),
        page: z.number().int().min(1).default(1).describe("One-based page number."),
        limit: resultLimitSchema,
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ category_id, page, limit }) => {
      try {
        const result = await yapiRequest<YapiInterfacePage>("api/interface/list_cat", {
          token: getProjectToken(),
          catid: category_id.toString(),
          page: page.toString(),
          limit: limit.toString(),
        });
        const interfaces = (result.list || []).map(simplifyInterface);
        const categoryPage = {
          category_id,
          page,
          limit,
          returned: interfaces.length,
          total: result.count,
          total_pages: result.total,
          interfaces,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(categoryPage, null, 2) }],
          structuredContent: categoryPage,
        };
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.registerTool(
    "yapi_get_interface_details",
    {
      title: "Get YAPI Interface Details",
      description: "Gets detailed information for a YAPI interface by its ID.",
      inputSchema: z.object({
        project_id: projectIdSchema,
        interface_id: z.number().int().positive().describe("The positive integer YAPI interface ID."),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ project_id, interface_id }) => {
      try {
        const result = await yapiRequest<Record<string, unknown>>("api/interface/get", {
          token: getProjectToken(),
          project_id: getProjectId(project_id),
          id: interface_id.toString(),
        });

        for (const field of ["__v", "edit_uid", "add_time", "up_time", "uid"]) {
          delete result[field];
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: { interface: result },
        };
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.registerTool(
    "yapi_search_interfaces",
    {
      title: "Search YAPI Interfaces",
      description: "Searches interface titles and paths, capped by limit.",
      inputSchema: z.object({
        project_id: projectIdSchema,
        keyword: z.string().trim().min(1).max(200).describe("Keyword to find in interface titles or paths."),
        limit: resultLimitSchema,
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ project_id, keyword, limit }) => {
      try {
        const result = await yapiRequest<YapiCategory[]>("api/interface/list_menu", {
          token: getProjectToken(),
          project_id: getProjectId(project_id),
        });

        const searchKeyword = keyword.toLowerCase();
        const matchedInterfaces: Array<Record<string, unknown>> = [];
        let total = 0;

        for (const category of result) {
          for (const iface of category.list || []) {
            if (
              iface.title?.toLowerCase().includes(searchKeyword) ||
              iface.path?.toLowerCase().includes(searchKeyword)
            ) {
              total += 1;
              if (matchedInterfaces.length < limit) {
                matchedInterfaces.push({
                  id: iface._id,
                  title: iface.title,
                  path: iface.path,
                  method: iface.method,
                  status: iface.status,
                  category: category.name,
                });
              }
            }
          }
        }

        return {
          content: [{ type: "text", text: JSON.stringify(matchedInterfaces, null, 2) }],
          structuredContent: {
            interfaces: matchedInterfaces,
            returned: matchedInterfaces.length,
            total,
            truncated: total > limit,
          },
        };
      } catch (error) {
        return toolError(error);
      }
    }
  );

  return server;
}

function main(): void {
  serveStdio(createServer, {
    legacy: "reject",
    onerror: (error) => console.error(`[YAPI MCP] ${safeErrorMessage(error)}`),
  });

  console.error(`YAPI MCP Server v${SERVER_VERSION} running on stdio (MCP 2026-07-28)`);
  console.error(`Connected to YAPI instance at: ${redactSecrets(`${YAPI_BASE_URL.origin}${YAPI_BASE_URL.pathname}`)}`);
  if (PROJECT_TOKEN) console.error("Default project token configured");
  if (DEFAULT_PROJECT_ID) console.error(`Default project ID configured: ${DEFAULT_PROJECT_ID}`);
}

try {
  main();
} catch (error) {
  console.error(`Fatal error running YAPI MCP Server: ${safeErrorMessage(error)}`);
  process.exit(1);
}
