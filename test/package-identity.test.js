import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expectedPackage = "@zjlgdx/yapi-mcp-server";
const expectedRepository = "git+https://github.com/zjlgdx/yapi-mcp-server.git";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("release metadata targets only the zjlgdx npm scope", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const workflow = await readFile(".github/workflows/publish.yml", "utf8");

  assert.equal(packageJson.name, expectedPackage);
  assert.equal(packageJson.repository.url, expectedRepository);
  assert.equal(packageJson.publishConfig.access, "public");
  assert.equal(packageJson.bin["mcp-server-yapi"], "dist/index.js");

  assert.match(workflow, /EXPECTED_PACKAGE: "@zjlgdx\/yapi-mcp-server"/);
  assert.match(workflow, /npm publish --access public/);
  assert.doesNotMatch(workflow, /NPM_TOKEN/);
  assert.doesNotMatch(workflow, /test "\$package_name" = "mcp-server-yapi"/);
});

test("distribution docs use the scoped npm package", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const readme = await readFile("README.md", "utf8");

  assert.match(
    readme,
    new RegExp(`${escapeRegExp(packageJson.name)}@${escapeRegExp(packageJson.version)}`),
  );
  assert.doesNotMatch(readme, /"args"\s*:\s*\[[^\]]*"mcp-server-yapi(?:@[^\"]*)?"/);
  assert.doesNotMatch(readme, /npm\s+(?:install|i|exec|publish)\s+(?:-y\s+)?mcp-server-yapi(?:@|\s|$)/);
  assert.match(readme, /unscoped `mcp-server-yapi` package belongs to an unrelated publisher/);
});
