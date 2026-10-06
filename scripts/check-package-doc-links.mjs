#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// This check deliberately uses npm's file selection, not the source checkout's
// existence checks. No lifecycle hook, build, tarball write or registry read runs.
export function packInventory(packageRoot) {
  // npm 10's bundled pacote runs prepare even with --ignore-scripts. Reject
  // before spawning npm on every version rather than relying on that flag.
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  if (manifest.scripts?.prepare) {
    throw new Error("READ_ONLY_INVENTORY_UNSUPPORTED: package defines a prepare script; npm pack may execute it despite --ignore-scripts");
  }
  const args = ["pack", "--json", "--dry-run", "--ignore-scripts", "--offline", "--workspaces=false"];
  const command = process.env.npm_execpath ? process.execPath : "npm";
  const commandArgs = process.env.npm_execpath ? [process.env.npm_execpath, ...args] : args;
  const output = execFileSync(command, commandArgs, {
    cwd: packageRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000, maxBuffer: 8 * 1024 * 1024
  });
  const result = JSON.parse(output);
  if (!Array.isArray(result) || result.length !== 1 || !Array.isArray(result[0].files)) {
    throw new Error("npm pack did not return one package file inventory");
  }
  return result[0];
}

function blank(text) {
  return text.replace(/[^\n]/g, " ");
}

function withoutCodeBlocks(markdown) {
  let fence;
  const lines = markdown.split(/(?<=\n)/).map((line) => {
    const start = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence.character}{${fence.length},}\\s*$`);
      if (close.test(line.trimEnd())) fence = undefined;
      return blank(line);
    }
    if (start) {
      fence = { character: start[1][0], length: start[1].length };
      return blank(line);
    }
    return /^(?: {4}|\t)/.test(line) ? blank(line) : line;
  }).join("");
  return lines.replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, blank);
}

function withoutCode(markdown) {
  const text = withoutCodeBlocks(markdown);
  return text.replace(/(`+)([\s\S]*?)\1(?!`)/g, blank);
}

function escaped(text, index) {
  let count = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) count++;
  return count % 2 === 1;
}

function closingBracket(text, start) {
  let depth = 1;
  for (let i = start + 1; i < text.length; i++) {
    if (escaped(text, i)) continue;
    if (text[i] === "[") depth++;
    if (text[i] === "]" && --depth === 0) return i;
  }
  return -1;
}

function destination(text, start) {
  let i = start;
  while (/\s/.test(text[i] ?? "") && i < text.length) i++;
  if (text[i] === "<") {
    const end = text.indexOf(">", i + 1);
    return end < 0 ? null : { value: text.slice(i + 1, end), end: end + 1 };
  }
  const begin = i;
  let depth = 0;
  for (; i < text.length; i++) {
    if (escaped(text, i)) continue;
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      if (depth === 0) break;
      depth--;
    } else if (/\s/.test(text[i]) && depth === 0) break;
  }
  return { value: text.slice(begin, i), end: i };
}

function decodeEntities(text) {
  return text.replace(/&(?:amp|quot|apos|lt|gt);|&#(?:x[0-9a-f]+|\d+);/gi, (entity) => {
    const named = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const hex = entity[2].toLowerCase() === "x";
    const code = Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}

function referenceKey(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function markdownLinks(markdown) {
  const text = withoutCode(markdown);
  const references = new Map();
  const definitionRanges = [];
  for (const match of text.matchAll(/^ {0,3}\[([^\]\n]+)\]:[ \t]*(.*)$/gm)) {
    const value = destination(match[2], 0);
    if (value) references.set(referenceKey(match[1]), value.value);
    definitionRanges.push([match.index, match.index + match[0].length]);
  }
  const links = [];
  const referenceLabels = new Set();
  const add = (value, offset, kind) => links.push({
    destination: decodeEntities(value.replace(/\\([\\`*{}\[\]()#+.!_<> -])/g, "$1")),
    line: text.slice(0, offset).split("\n").length, kind
  });
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "[" || escaped(text, i) || referenceLabels.has(i) || definitionRanges.some(([a, b]) => i >= a && i < b)) continue;
    const end = closingBracket(text, i);
    if (end < 0) continue;
    const label = text.slice(i + 1, end);
    const kind = i > 0 && text[i - 1] === "!" ? "image" : "link";
    if (text[end + 1] === "(") {
      const value = destination(text, end + 2);
      if (value) add(value.value, i, kind);
    } else if (text[end + 1] === "[") {
      const refEnd = closingBracket(text, end + 1);
      const key = referenceKey(text.slice(end + 2, refEnd) || label);
      if (refEnd >= 0 && references.has(key)) {
        referenceLabels.add(end + 1);
        add(references.get(key), i, kind);
      }
    } else if (references.has(referenceKey(label))) {
      add(references.get(referenceKey(label)), i, kind);
    }
  }
  for (const tag of text.matchAll(/<(?:a|img|source)\b[^>]*>/gi)) {
    for (const attr of tag[0].matchAll(/\b(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      add(attr[2] ?? attr[3] ?? attr[4], tag.index, attr[1].toLowerCase() === "src" ? "image" : "link");
    }
  }
  return links;
}

export function markdownAnchors(markdown) {
  const text = withoutCodeBlocks(markdown);
  const anchors = new Set();
  const used = new Set();
  const headings = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const atx = lines[i].match(/^ {0,3}#{1,6}(?:\s+|$)(.*?)(?:\s+#+\s*)?$/);
    if (atx) headings.push(atx[1]);
    else if (i > 0 && /^ {0,3}(?:=+|-+)\s*$/.test(lines[i]) && lines[i - 1].trim()) headings.push(lines[i - 1].trim());
  }
  for (const heading of headings) {
    const base = decodeEntities(heading).replace(/<[^>]+>/g, "")
      .replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[`*~]/g, "").toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, "").replace(/\s/g, "-");
    let slug = base;
    for (let n = 1; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    anchors.add(slug);
  }
  for (const tag of text.matchAll(/<[a-z][^>]*>/gi)) {
    for (const attr of tag[0].matchAll(/\b(?:id|name)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      anchors.add(decodeEntities(attr[1] ?? attr[2] ?? attr[3]));
    }
  }
  return anchors;
}

export function checkPackageDocs(packageRoot, inventory = packInventory(packageRoot)) {
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  const files = new Set(inventory.files.map((file) => file.path));
  for (const file of files) {
    if (path.posix.isAbsolute(file) || path.posix.normalize(file) !== file || file.startsWith("../") || file.includes("\\")) {
      throw new Error(`Invalid npm inventory path: ${file}`);
    }
  }
  const readmes = [...files].filter((file) => /^readme(?:\.md|\.markdown)?$/i.test(file));
  const errors = [];
  const result = { package: manifest.name, root: path.resolve(packageRoot), readmes,
    packedFiles: files.size, localLinksChecked: 0, externalLinksSkipped: 0, errors };
  if (readmes.length !== 1) {
    errors.push({ file: "README.md", line: 1, code: "ROOT_README_MISSING_OR_AMBIGUOUS", message: "Expected one packed root Markdown README" });
    return result;
  }
  const cache = new Map();
  const anchors = (file) => {
    if (!cache.has(file)) cache.set(file, markdownAnchors(fs.readFileSync(path.join(packageRoot, file), "utf8")));
    return cache.get(file);
  };
  for (const readme of readmes) {
    const text = fs.readFileSync(path.join(packageRoot, readme), "utf8");
    for (const link of markdownLinks(text)) {
      const fail = (code, message) => errors.push({ file: readme, line: link.line, destination: link.destination, code, message });
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(link.destination) && !/^(?:file:|[a-z]:[\\/])/i.test(link.destination)) {
        result.externalLinksSkipped++;
        continue;
      }
      result.localLinksChecked++;
      let urlPath, fragment;
      try {
        const hash = link.destination.indexOf("#");
        const resource = hash < 0 ? link.destination : link.destination.slice(0, hash);
        urlPath = decodeURIComponent(resource.split("?")[0]);
        fragment = hash < 0 ? "" : decodeURIComponent(link.destination.slice(hash + 1));
      } catch {
        fail("INVALID_URL_ENCODING", "Local link is not valid URI encoding");
        continue;
      }
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(readme), urlPath || readme)).replace(/\/$/, "");
      if (/^(?:\/|[a-z]:|file:)/i.test(urlPath) || urlPath.includes("\\") || target === ".." || target.startsWith("../")) {
        fail("PATH_ESCAPES_PACKAGE", "Local documentation links must stay within the published package");
        continue;
      }
      const directory = target === "." || [...files].some((file) => file.startsWith(`${target.replace(/\/$/, "")}/`));
      if (!files.has(target) && !directory) {
        fail("TARGET_NOT_PACKED", `Target is absent from npm pack inventory: ${target}`);
        continue;
      }
      if (fragment) {
        const markdownTarget = files.has(target) ? target : target === "." ? readme : [...files].find((file) =>
          /^readme(?:\.md|\.markdown)?$/i.test(path.posix.basename(file)) && path.posix.dirname(file) === target.replace(/\/$/, ""));
        if (markdownTarget && /(?:\.md|\.markdown)$|^readme$/i.test(markdownTarget) && !anchors(markdownTarget).has(fragment)) {
          fail("FRAGMENT_NOT_FOUND", `Markdown anchor #${fragment} is absent from ${markdownTarget}`);
        } else if (!markdownTarget) {
          fail("FRAGMENT_TARGET_UNRESOLVED", "A directory fragment needs a packed README.md");
        }
      }
    }
  }
  return result;
}

export function publicWorkspaceRoots(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const patterns = Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces?.packages;
  if (!Array.isArray(patterns) || patterns.length === 0) throw new Error("No workspaces declared; use --package-root <directory>");
  const roots = new Set();
  for (const pattern of patterns) {
    for (const relative of fs.globSync(pattern, { cwd: root })) {
      const dir = path.resolve(root, relative);
      if (!fs.existsSync(path.join(dir, "package.json"))) continue;
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
      if (pkg.private !== true) roots.add(dir);
    }
  }
  if (roots.size === 0) throw new Error("No public workspace packages found");
  return [...roots].sort();
}

export function main(args = process.argv.slice(2)) {
  let root = process.cwd();
  const selected = [];
  let json = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") json = true;
    else if (["--root", "--package-root"].includes(args[i])) {
      const flag = args[i];
      if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`${flag} needs a directory`);
      if (flag === "--root") root = path.resolve(args[++i]);
      else selected.push(path.resolve(args[++i]));
    } else if (["--help", "-h"].includes(args[i])) {
      console.log("Usage: node scripts/check-package-doc-links.mjs [--root repo] [--package-root directory ...] [--json]\nChecks root package READMEs against npm pack --json --dry-run --ignore-scripts --offline. External URLs are not fetched.");
      return 0;
    } else throw new Error(`Unknown option: ${args[i]}`);
  }
  const results = [];
  for (const dir of selected.length ? [...new Set(selected)] : publicWorkspaceRoots(root)) {
    try {
      results.push(checkPackageDocs(dir));
    } catch (error) {
      results.push({ root: dir, errors: [{ code: "PACKAGE_CHECK_FAILED", message: error.message.split("\n")[0] }] });
    }
  }
  const failures = results.reduce((sum, pkg) => sum + pkg.errors.length, 0);
  if (json) console.log(JSON.stringify({ schema: "evopilot-package-documentation-check/v1", scope: "packed-root-readmes", packages: results, failures }, null, 2));
  else {
    for (const pkg of results) for (const error of pkg.errors) {
      console.error(`${path.relative(root, pkg.root)}/${error.file ?? "package.json"}:${error.line ?? 1} ${error.code}: ${error.destination ?? error.message}`);
    }
    console.log(`Package documentation: ${results.length} package(s), ${failures} error(s). Root READMEs only; no external URL checks.`);
  }
  return failures ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
