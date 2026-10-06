import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkPackageDocs, markdownAnchors, markdownLinks, packInventory, publicWorkspaceRoots } from "../../scripts/check-package-doc-links.mjs";

const checker = fileURLToPath(new URL("../../scripts/check-package-doc-links.mjs", import.meta.url));

function fixture(t, files, manifest = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-package-docs-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "package-docs-fixture", version: "1.0.0", files: ["docs", "assets"], ...manifest }));
  for (const [relative, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), text);
  }
  return root;
}

function inventory(...files) {
  return { files: ["package.json", "README.md", ...files].map((name) => ({ path: name })) };
}

test("npm inventory catches a source document excluded from the published package", (t) => {
  const root = fixture(t, {
    "README.md": "# Package\n[Missing from npm](private-guide.md)\n[Included](docs/guide.md#install)\n",
    "private-guide.md": "# Private guide\n",
    "docs/guide.md": "# Install\n"
  });
  const packed = packInventory(root);
  assert.equal(fs.existsSync(path.join(root, "private-guide.md")), true);
  assert.equal(packed.files.some((file) => file.path === "private-guide.md"), false);
  const result = checkPackageDocs(root, packed);
  assert.deepEqual(result.errors.map(({ code, destination }) => ({ code, destination })), [
    { code: "TARGET_NOT_PACKED", destination: "private-guide.md" }
  ]);
  assert.equal(result.localLinksChecked, 2);
});

test("dry-run pack never invokes lifecycle hooks or writes a tarball", (t) => {
  const hook = 'node -e "require(\'node:fs\').writeFileSync(\'hook-ran\', \'unexpected\')"';
  const root = fixture(t, { "README.md": "# Package\n" }, { scripts: { prepare: hook, prepack: hook, postpack: hook } });
  assert.equal(packInventory(root).files.some((file) => file.path === "README.md"), true);
  assert.equal(fs.existsSync(path.join(root, "hook-ran")), false);
  assert.deepEqual(fs.readdirSync(root).filter((name) => name.endsWith(".tgz")), []);
});

test("packed Markdown links support fragments, encoded spaces, directories and explicit anchors", (t) => {
  const root = fixture(t, {
    "README.md": '# Package\n[Self](#package)\n[Root](./#package)\n[Guide](docs/guide.md#install)\n[Repeated](docs/guide.md#install-1)\n[Space](docs/My%20Guide.md#使用)\n[Directory](docs/#overview)\n[Explicit](docs/guide.md#manual-id)\n',
    "docs/guide.md": '# Install\n# Install\n<a id="manual-id"></a>\n',
    "docs/My Guide.md": "# 使用\n",
    "docs/README.md": "Overview\n========\n"
  });
  const result = checkPackageDocs(root, packInventory(root));
  assert.deepEqual(result.errors, []);
  assert.equal(result.localLinksChecked, 7);
});

test("missing fragments fail even when their document is packed", (t) => {
  const root = fixture(t, { "README.md": "[Guide](docs/guide.md#not-a-heading)\n", "docs/guide.md": "# Real heading\n" });
  const result = checkPackageDocs(root, inventory("docs/guide.md"));
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].code, "FRAGMENT_NOT_FOUND");
});

test("package escapes are rejected before any source lookup", (t) => {
  const destinations = ["../outside.md", "%2e%2e/outside.md", "docs/../../outside.md", "/outside.md", "file:///tmp/outside.md", "C:/outside.md", "docs%5coutside.md"];
  const root = fixture(t, { "README.md": destinations.map((dest) => `[Outside](${dest})`).join("\n") });
  const result = checkPackageDocs(root, inventory());
  assert.deepEqual(result.errors.map((error) => error.destination), destinations);
  assert.equal(result.errors.every((error) => error.code === "PATH_ESCAPES_PACKAGE"), true);
});

test("external URLs are skipped without network access and invalid local URL encoding fails", (t) => {
  const root = fixture(t, {
    "README.md": "[Website](https://invalid.example/guide#missing)\n[Contact](mailto:help@example.invalid)\n![Badge](//invalid.example/badge.svg)\n[Malformed](docs/%ZZ.md)\n"
  });
  const result = checkPackageDocs(root, inventory());
  assert.equal(result.externalLinksSkipped, 3);
  assert.equal(result.localLinksChecked, 1);
  assert.equal(result.errors[0].code, "INVALID_URL_ENCODING");
});

test("reference links, linked images and HTML images use the same package inventory", (t) => {
  const root = fixture(t, {
    "README.md": '[Guide][g]\n![Logo][logo]\n[![Logo](assets/logo.svg)](docs/guide.md)\n<img src="assets/missing.png" alt="diagram">\n<a href="docs/guide.md#install">HTML guide</a>\n<source src=assets/logo.svg>\n\n[g]: docs/guide.md#install\n[logo]: assets/logo.svg\n',
    "docs/guide.md": "# Install\n", "assets/logo.svg": "<svg/>"
  });
  const result = checkPackageDocs(root, inventory("docs/guide.md", "assets/logo.svg"));
  assert.equal(result.localLinksChecked, 7);
  assert.deepEqual(result.errors.map(({ code, destination, line }) => ({ code, destination, line })), [
    { code: "TARGET_NOT_PACKED", destination: "assets/missing.png", line: 4 }
  ]);
});

test("code samples and HTML comments do not introduce documentation links", () => {
  const markdown = [
    '`[inline](missing.md)`', "```markdown", "[fenced](missing.md)", "```", "    [indented](missing.md)",
    "<!-- [comment](missing.md) -->", '<pre><a href="missing.md">example</a></pre>',
    "[real](docs/guide.md)", ""
  ].join("\n");
  assert.deepEqual(markdownLinks(markdown), [{ destination: "docs/guide.md", line: 8, kind: "link" }]);
  assert.deepEqual([...markdownAnchors("# Use `cli`\n# Use `cli`\n```\n# Hidden\n```\n")], ["use-cli", "use-cli-1"]);
});

test("only root READMEs are checked, and the report does not claim recursive coverage", (t) => {
  const root = fixture(t, { "README.md": "[Guide](docs/guide.md)\n", "docs/guide.md": "[Unexamined nested link](missing.md)\n" });
  const result = checkPackageDocs(root, inventory("docs/guide.md"));
  assert.deepEqual(result.readmes, ["README.md"]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.localLinksChecked, 1);
});

test("workspace discovery excludes private packages and the CLI emits a bounded JSON report", (t) => {
  const root = fixture(t, {
    "packages/public/package.json": JSON.stringify({ name: "public-fixture", version: "1.0.0" }),
    "packages/public/README.md": "# Public\n[Self](#public)\n",
    "packages/private/package.json": JSON.stringify({ name: "private-fixture", version: "1.0.0", private: true })
  }, { private: true, workspaces: ["packages/*"] });
  const selected = path.join(root, "packages/public");
  assert.deepEqual(publicWorkspaceRoots(root), [selected]);
  const report = JSON.parse(execFileSync(process.execPath, [checker, "--package-root", selected, "--json"], { encoding: "utf8" }));
  assert.equal(report.scope, "packed-root-readmes");
  assert.equal(report.failures, 0);
  assert.equal(report.packages.length, 1);
  assert.equal(report.packages[0].package, "public-fixture");
});
