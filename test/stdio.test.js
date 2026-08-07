import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { after, before, test } from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const PROJECT_TOKEN = "top-secret-project-token";
const PROJECT_ID = "42";
const REQUEST_TIMEOUT_MS = 1_000;
const TIMEOUT_RESPONSE_DELAY_MS = 1_500;
const requestPaths = [];
let mockServer;
let baseUrl;

const categories = [
  {
    _id: 77,
    name: "Users",
    desc: "User APIs",
    list: [
      { _id: 101, catid: 77, title: "List users", path: "/users", method: "GET", status: "done" },
      { _id: 102, catid: 77, title: "Create user", path: "/users", method: "POST", status: "done" },
    ],
  },
  {
    _id: 78,
    name: "Health",
    desc: "Health APIs",
    list: [{ _id: 103, catid: 78, title: "Health", path: "/health", method: "GET", status: "done" }],
  },
];

before(async () => {
  mockServer = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    requestPaths.push(request.url);

    assert.equal(url.searchParams.get("token"), PROJECT_TOKEN);
    response.setHeader("Content-Type", "application/json");
    if (url.pathname === "/base/api/interface/list_menu") {
      assert.equal(url.searchParams.get("project_id"), PROJECT_ID);
      response.end(JSON.stringify({ errcode: 0, errmsg: "success", data: categories }));
      return;
    }

    if (url.pathname === "/base/api/interface/list_cat") {
      assert.equal(url.searchParams.get("catid"), "77");
      assert.equal(url.searchParams.get("page"), "2");
      assert.equal(url.searchParams.get("limit"), "2");
      response.end(JSON.stringify({
        errcode: 0,
        errmsg: "success",
        data: { count: 3, total: 2, list: [categories[0].list[1]] },
      }));
      return;
    }

    if (url.pathname === "/base/api/interface/list") {
      assert.equal(url.searchParams.get("project_id"), PROJECT_ID);
      const page = url.searchParams.get("page");
      const limit = url.searchParams.get("limit");
      if (limit === "100") {
        const searchPages = {
          1: [
            categories[0].list[0],
            { _id: 104, catid: 77, title: "List user roles", path: "/users/roles", method: "GET", status: "done" },
          ],
          2: [categories[1].list[0]],
          3: [categories[0].list[1]],
        };
        response.end(JSON.stringify({
          errcode: 0,
          errmsg: "success",
          data: { count: 250, total: 3, list: searchPages[page] || [] },
        }));
        return;
      }

      assert.equal(page, "2");
      assert.equal(limit, "2");
      response.end(JSON.stringify({
        errcode: 0,
        errmsg: "success",
        data: { count: 3, total: 2, list: [categories[0].list[1]] },
      }));
      return;
    }

    if (url.pathname === "/base/api/interface/get") {
      assert.equal(url.searchParams.get("project_id"), PROJECT_ID);
      const id = url.searchParams.get("id");
      if (id === "999") {
        response.end(JSON.stringify({ errcode: 400, errmsg: `invalid token ${PROJECT_TOKEN}`, data: null }));
        return;
      }
      if (id === "888") {
        setTimeout(
          () => response.end(JSON.stringify({ errcode: 0, data: { _id: 888 } })),
          TIMEOUT_RESPONSE_DELAY_MS
        );
        return;
      }
      response.end(JSON.stringify({
        errcode: 0,
        errmsg: "success",
        data: { _id: Number(id), title: "List users", path: "/users", method: "GET", __v: 0, uid: 7 },
      }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ errcode: 404, errmsg: "not found", data: null }));
  });

  mockServer.listen(0, "127.0.0.1");
  await once(mockServer, "listening");
  const address = mockServer.address();
  baseUrl = `http://127.0.0.1:${address.port}/base/`;
});

after(async () => {
  if (mockServer) await new Promise((resolve) => mockServer.close(resolve));
});

function serverTransport() {
  return new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      YAPI_URL: baseUrl,
      YAPI_PROJECT_TOKEN: PROJECT_TOKEN,
      YAPI_PROJECT_ID: PROJECT_ID,
      YAPI_REQUEST_TIMEOUT_MS: REQUEST_TIMEOUT_MS.toString(),
    },
    stderr: "pipe",
  });
}

test("MCP 2026-07-28 stdio lists and calls all read-only YAPI tools without leaking credentials", async () => {
  const transport = serverTransport();
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

  const client = new Client(
    { name: "stdio-smoke-test", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } }
  );

  try {
    await client.connect(transport);
    assert.equal(client.getNegotiatedProtocolVersion(), "2026-07-28");
    assert.equal(client.getProtocolEra(), "modern");

    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      "yapi_get_interface_details",
      "yapi_list_category_interfaces",
      "yapi_list_interfaces",
      "yapi_list_project_interfaces",
      "yapi_search_interfaces",
    ]);
    for (const tool of tools) {
      assert.equal(tool.annotations?.readOnlyHint, true);
      assert.equal(tool.annotations?.destructiveHint, false);
      assert.equal(Object.hasOwn(tool.inputSchema.properties || {}, "project_token"), false);
    }

    const listResult = await client.callTool({
      name: "yapi_list_interfaces",
      arguments: { limit: 1 },
    });
    assert.equal(listResult.isError, undefined);
    assert.equal(listResult.structuredContent.returned, 1);
    assert.equal(listResult.structuredContent.total, 3);
    assert.equal(listResult.structuredContent.truncated, true);
    assert.equal(listResult.structuredContent.categories[0].category_id, 77);

    const categoryResult = await client.callTool({
      name: "yapi_list_category_interfaces",
      arguments: { category_id: 77, page: 2, limit: 2 },
    });
    assert.equal(categoryResult.isError, undefined);
    assert.equal(categoryResult.structuredContent.category_id, 77);
    assert.equal(categoryResult.structuredContent.page, 2);
    assert.equal(categoryResult.structuredContent.returned, 1);
    assert.equal(categoryResult.structuredContent.total, 3);
    assert.equal(categoryResult.structuredContent.total_pages, 2);
    assert.equal(categoryResult.structuredContent.interfaces[0].id, 102);
    assert.deepEqual(JSON.parse(categoryResult.content[0].text), categoryResult.structuredContent);

    const projectPageResult = await client.callTool({
      name: "yapi_list_project_interfaces",
      arguments: { page: 2, limit: 2 },
    });
    assert.equal(projectPageResult.isError, undefined);
    assert.equal(projectPageResult.structuredContent.project_id, PROJECT_ID);
    assert.equal(projectPageResult.structuredContent.page, 2);
    assert.equal(projectPageResult.structuredContent.limit, 2);
    assert.equal(projectPageResult.structuredContent.returned, 1);
    assert.equal(projectPageResult.structuredContent.total, 3);
    assert.equal(projectPageResult.structuredContent.total_pages, 2);
    assert.equal(projectPageResult.structuredContent.interfaces[0].id, 102);
    assert.deepEqual(JSON.parse(projectPageResult.content[0].text), projectPageResult.structuredContent);

    const detailResult = await client.callTool({
      name: "yapi_get_interface_details",
      arguments: { interface_id: 101 },
    });
    assert.equal(detailResult.isError, undefined);
    assert.equal(detailResult.structuredContent.interface._id, 101);
    assert.equal(Object.hasOwn(detailResult.structuredContent.interface, "__v"), false);
    assert.equal(Object.hasOwn(detailResult.structuredContent.interface, "uid"), false);

    const earlyStopRequestOffset = requestPaths.length;
    const searchResult = await client.callTool({
      name: "yapi_search_interfaces",
      arguments: { keyword: "users", limit: 1, max_scan_pages: 5 },
    });
    assert.equal(searchResult.isError, undefined);
    assert.equal(searchResult.structuredContent.returned, 1);
    assert.equal(searchResult.structuredContent.total, 2);
    assert.equal(searchResult.structuredContent.pages_scanned, 1);
    assert.equal(searchResult.structuredContent.interfaces_scanned, 2);
    assert.equal(searchResult.structuredContent.project_total, 250);
    assert.equal(searchResult.structuredContent.project_total_pages, 3);
    assert.equal(searchResult.structuredContent.interfaces[0].category_id, 77);
    assert.equal(searchResult.structuredContent.truncated, true);
    assert.equal(searchResult.structuredContent.truncated_reason, "match_limit");
    assert.deepEqual(
      requestPaths.slice(earlyStopRequestOffset).map((path) => new URL(path, "http://mock").searchParams.get("page")),
      ["1"],
    );

    const exhaustionRequestOffset = requestPaths.length;
    const exhaustedSearchResult = await client.callTool({
      name: "yapi_search_interfaces",
      arguments: { keyword: "missing", limit: 5, max_scan_pages: 5 },
    });
    assert.equal(exhaustedSearchResult.isError, undefined);
    assert.equal(exhaustedSearchResult.structuredContent.returned, 0);
    assert.equal(exhaustedSearchResult.structuredContent.pages_scanned, 3);
    assert.equal(exhaustedSearchResult.structuredContent.interfaces_scanned, 4);
    assert.equal(exhaustedSearchResult.structuredContent.truncated, false);
    assert.equal(exhaustedSearchResult.structuredContent.truncated_reason, null);
    assert.deepEqual(
      requestPaths.slice(exhaustionRequestOffset).map((path) => new URL(path, "http://mock").searchParams.get("page")),
      ["1", "2", "3"],
    );

    const boundedRequestOffset = requestPaths.length;
    const boundedSearchResult = await client.callTool({
      name: "yapi_search_interfaces",
      arguments: { keyword: "create", limit: 5, max_scan_pages: 2 },
    });
    assert.equal(boundedSearchResult.isError, undefined);
    assert.equal(boundedSearchResult.structuredContent.returned, 0);
    assert.equal(boundedSearchResult.structuredContent.pages_scanned, 2);
    assert.equal(boundedSearchResult.structuredContent.interfaces_scanned, 3);
    assert.equal(boundedSearchResult.structuredContent.truncated, true);
    assert.equal(boundedSearchResult.structuredContent.truncated_reason, "max_scan_pages");
    assert.deepEqual(
      requestPaths.slice(boundedRequestOffset).map((path) => new URL(path, "http://mock").searchParams.get("page")),
      ["1", "2"],
    );

    const invalidScanRequestCount = requestPaths.length;
    const invalidScanResult = await client.callTool({
      name: "yapi_search_interfaces",
      arguments: { keyword: "users", max_scan_pages: 0 },
    });
    assert.equal(invalidScanResult.isError, true);
    assert.equal(requestPaths.length, invalidScanRequestCount);

    const oversizedScanResult = await client.callTool({
      name: "yapi_search_interfaces",
      arguments: { keyword: "users", max_scan_pages: 101 },
    });
    assert.equal(oversizedScanResult.isError, true);
    assert.equal(requestPaths.length, invalidScanRequestCount);

    const validationResult = await client.callTool({
      name: "yapi_get_interface_details",
      arguments: { interface_id: 999 },
    });
    assert.equal(validationResult.isError, true);
    assert.doesNotMatch(JSON.stringify(validationResult), new RegExp(PROJECT_TOKEN));

    const timeoutResult = await client.callTool({
      name: "yapi_get_interface_details",
      arguments: { interface_id: 888 },
    });
    assert.equal(timeoutResult.isError, true);
    assert.match(JSON.stringify(timeoutResult), new RegExp(`timed out after ${REQUEST_TIMEOUT_MS}ms`));

    const invalidIdResult = await client.callTool({
      name: "yapi_get_interface_details",
      arguments: { interface_id: 0 },
    });
    assert.equal(invalidIdResult.isError, true);
    assert.match(JSON.stringify(invalidIdResult), /greater than 0|positive|>0/i);

    const invalidProjectResult = await client.callTool({
      name: "yapi_list_interfaces",
      arguments: { project_id: "not-numeric" },
    });
    assert.equal(invalidProjectResult.isError, true);
    assert.match(JSON.stringify(invalidProjectResult), /numeric string/i);

    const invalidCategoryResult = await client.callTool({
      name: "yapi_list_category_interfaces",
      arguments: { category_id: 0 },
    });
    assert.equal(invalidCategoryResult.isError, true);
  } finally {
    await client.close();
  }

  assert.equal(requestPaths.some((path) => path.includes("//api/")), false);
  assert.equal(
    requestPaths.filter((path) => {
      const url = new URL(path, "http://mock");
      return url.pathname === "/base/api/interface/list" && url.searchParams.get("limit") === "2";
    }).length,
    1,
  );
  assert.equal(requestPaths.filter((path) => path.startsWith("/base/api/interface/list_menu?")).length, 1);
  assert.doesNotMatch(stderr, new RegExp(PROJECT_TOKEN));
  assert.doesNotMatch(stderr, new RegExp(PROJECT_TOKEN.slice(0, 8)));
  assert.doesNotMatch(stderr, /\?token=/);
});

test("legacy initialization is rejected instead of falling back", async () => {
  const transport = serverTransport();
  const client = new Client({ name: "legacy-client", version: "1.0.0" });

  try {
    await assert.rejects(client.connect(transport), /unsupported protocol version/i);
  } finally {
    await client.close().catch(() => {});
  }
});
