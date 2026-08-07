import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export interface HarnessTemplateEvolutionSourceArgs {
  options: Record<string, string | boolean | string[]>;
}

export interface HarnessTemplateEvolutionSourceHelpers {
  usage: (message: string) => Error;
  localPackSourceFromPath: (packPath: string) => Record<string, unknown>;
}

export function harnessTemplateEvolutionSourcesFromArgs(
  args: HarnessTemplateEvolutionSourceArgs,
  helpers: HarnessTemplateEvolutionSourceHelpers
): Record<string, unknown>[] {
  const sources: Record<string, unknown>[] = [];
  for (const source of repeatedOption(args, "source")) {
    sources.push(parseHarnessTemplateEvolutionSource(source, helpers));
  }
  for (const file of repeatedOption(args, "file")) {
    sources.push(harnessTemplateEvolutionSourceFromFile(file, helpers));
  }
  for (const project of repeatedOption(args, "source-project").concat(repeatedOption(args, "project-source"), repeatedOption(args, "historical-project"))) {
    sources.push(harnessTemplateEvolutionSourceFromProject(project, helpers));
  }
  for (const logFile of repeatedOption(args, "production-log").concat(repeatedOption(args, "runtime-log"), repeatedOption(args, "log"))) {
    sources.push(harnessTemplateEvolutionSourceFromProductionLog(logFile, helpers));
  }
  for (const history of repeatedOption(args, "evopilot-history").concat(repeatedOption(args, "history"))) {
    sources.push(harnessTemplateEvolutionSourceFromEvopilotHistory(history));
  }
  const localPack = stringOption(args, "local-pack") ?? stringOption(args, "pack");
  if (localPack) sources.push(helpers.localPackSourceFromPath(localPack));
  const corpus = stringOption(args, "source-corpus") ?? stringOption(args, "corpus");
  if (corpus) sources.push(harnessTemplateEvolutionSourceFromCorpus(corpus, helpers));
  const github = stringOption(args, "github") ?? stringOption(args, "github-repo");
  if (github) sources.push(parseHarnessTemplateEvolutionSource(`github=${github}`, helpers));
  const url = stringOption(args, "url") ?? stringOption(args, "website");
  if (url) sources.push(parseHarnessTemplateEvolutionSource(`url=${url}`, helpers));
  const template = stringOption(args, "existing-template");
  if (template) sources.push(parseHarnessTemplateEvolutionSource(`template=${template}`, helpers));
  const runtimeEvidence = stringOption(args, "runtime-evidence") ?? stringOption(args, "evidence");
  if (runtimeEvidence) sources.push(parseHarnessTemplateEvolutionSource(`runtime-evidence=${runtimeEvidence}`, helpers));
  const note = stringOption(args, "note") ?? stringOption(args, "admin-note");
  if (note) sources.push({ type: "admin-note", name: "Administrator note", contentText: note });
  return sources;
}

function parseHarnessTemplateEvolutionSource(value: string, helpers: HarnessTemplateEvolutionSourceHelpers): Record<string, unknown> {
  const trimmed = value.trim();
  const separator = trimmed.indexOf("=");
  const key = separator > 0 ? trimmed.slice(0, separator).trim().toLowerCase() : "";
  const raw = separator > 0 ? trimmed.slice(separator + 1).trim() : trimmed;
  if (key === "url" || key === "web" || key === "website" || (!key && /^https?:\/\//i.test(raw))) {
    return { type: "web-url", name: raw, uri: raw };
  }
  if (key === "github" || key === "github-repo") {
    const [uri, ref] = raw.split("#", 2);
    return { type: "github-repo", name: raw, uri, ref };
  }
  if (key === "gitlab" || key === "gitlab-repo") {
    const [uri, ref] = raw.split("#", 2);
    return { type: "gitlab-repo", name: raw, uri, ref };
  }
  if (key === "source-project" || key === "project" || key === "historical-project" || key === "local-project") return harnessTemplateEvolutionSourceFromProject(raw, helpers);
  if (key === "source-corpus" || key === "corpus" || key === "project-corpus" || key === "domain-corpus") return harnessTemplateEvolutionSourceFromCorpus(raw, helpers);
  if (key === "production-log" || key === "runtime-log" || key === "incident-log" || key === "log") return harnessTemplateEvolutionSourceFromProductionLog(raw, helpers);
  if (key === "evopilot-history" || key === "history" || key === "goal-history" || key === "loop-history" || key === "project-history") return harnessTemplateEvolutionSourceFromEvopilotHistory(raw);
  if (key === "runtime-evidence" || key === "evidence") return { type: "runtime-evidence", name: raw, uri: raw };
  if (key === "local-pack" || key === "pack") return helpers.localPackSourceFromPath(raw);
  if (key === "file" || key === "attachment") return harnessTemplateEvolutionSourceFromFile(raw, helpers);
  if (key === "template" || key === "existing-template") {
    const [templateId, version] = raw.split("@", 2);
    return { type: "existing-template", name: raw, uri: templateId, ref: version, metadata: { templateId, templateVersion: version } };
  }
  if (key === "note" || key === "admin-note" || !key) return { type: "admin-note", name: key || "Administrator note", contentText: raw };
  return { type: "admin-note", name: key, contentText: raw, metadata: { originalType: key } };
}

function harnessTemplateEvolutionSourceFromFile(file: string, helpers: HarnessTemplateEvolutionSourceHelpers): Record<string, unknown> {
  const absolute = path.resolve(file);
  if (!fs.existsSync(absolute)) throw helpers.usage(`HarnessTemplate evolution source file does not exist: ${absolute}`);
  if (!fs.statSync(absolute).isFile()) throw helpers.usage(`HarnessTemplate evolution source file must be a file: ${absolute}`);
  const buffer = fs.readFileSync(absolute);
  const text = extractAttachmentText(absolute, buffer);
  return {
    type: "attachment",
    name: path.basename(absolute),
    fileName: path.basename(absolute),
    mediaType: mediaTypeFromFile(absolute),
    contentText: text,
    contentDigest: digestCliBuffer(buffer),
    metadata: {
      path: absolute,
      byteLength: buffer.byteLength,
      extractedBy: attachmentExtractorName(absolute, text),
      extractionWarning: !text && path.extname(absolute).toLowerCase() === ".pdf" ? "pdf-text-extraction-produced-no-content" : undefined
    }
  };
}

function harnessTemplateEvolutionSourceFromProductionLog(fileOrId: string, helpers: HarnessTemplateEvolutionSourceHelpers): Record<string, unknown> {
  const absolute = path.resolve(fileOrId);
  if (fs.existsSync(absolute)) {
    if (!fs.statSync(absolute).isFile()) throw helpers.usage(`HarnessTemplate production log source must be a file: ${absolute}`);
    const buffer = fs.readFileSync(absolute);
    return {
      type: "production-log",
      name: path.basename(absolute),
      uri: absolute,
      fileName: path.basename(absolute),
      mediaType: mediaTypeFromFile(absolute),
      contentText: buffer.toString("utf8").slice(0, 500_000),
      contentDigest: digestCliBuffer(buffer),
      metadata: {
        path: absolute,
        byteLength: buffer.byteLength,
        extractedBy: "cli-production-log-reader",
        redactionExpected: true
      }
    };
  }
  return {
    type: "production-log",
    name: fileOrId,
    uri: fileOrId,
    metadata: {
      evidenceId: fileOrId,
      redactionExpected: true
    }
  };
}

function harnessTemplateEvolutionSourceFromProject(projectPathOrId: string, helpers: HarnessTemplateEvolutionSourceHelpers): Record<string, unknown> {
  const absolute = path.resolve(projectPathOrId);
  if (fs.existsSync(absolute)) {
    if (!fs.statSync(absolute).isDirectory()) throw helpers.usage(`HarnessTemplate source-project path must be a directory: ${absolute}`);
    const extracted = readSourceProjectKnowledge(absolute);
    return {
      type: "source-project",
      name: path.basename(absolute),
      uri: absolute,
      contentText: extracted.text,
      contentDigest: digestCliBuffer(Buffer.from(extracted.text, "utf8")),
      metadata: {
        ...extracted.metadata,
        path: absolute,
        extractedBy: "cli-source-project-reader"
      }
    };
  }
  return {
    type: "source-project",
    name: projectPathOrId,
    uri: projectPathOrId,
    metadata: {
      projectId: projectPathOrId,
      extractedBy: "server-project-reader"
    }
  };
}

function harnessTemplateEvolutionSourceFromCorpus(value: string, helpers: HarnessTemplateEvolutionSourceHelpers): Record<string, unknown> {
  const members = value.split(",").map((item) => item.trim()).filter(Boolean);
  const extractedSources = members.map((member) => harnessTemplateEvolutionSourceFromProject(member, helpers));
  const textParts = extractedSources
    .map((source) => typeof source.contentText === "string" && source.contentText.trim()
      ? `# SOURCE ${source.name}\n${source.contentText}`
      : "")
    .filter(Boolean);
  return {
    type: "source-corpus",
    name: members.length > 1 ? `Corpus ${members.length} source projects` : value,
    uri: value,
    contentText: textParts.length > 0 ? textParts.join("\n\n") : undefined,
    contentDigest: textParts.length > 0 ? digestCliBuffer(Buffer.from(textParts.join("\n\n"), "utf8")) : undefined,
    metadata: {
      sourceProjects: members,
      sourceCount: members.length,
      extractedBy: textParts.length > 0 ? "cli-source-corpus-reader" : "server-source-corpus-reader"
    }
  };
}

function harnessTemplateEvolutionSourceFromEvopilotHistory(value: string): Record<string, unknown> {
  const [projectPart, detailPart] = value.split(":", 2);
  const metadata: Record<string, unknown> = { projectId: projectPart, extractedBy: "server-evopilot-history-reader" };
  if (detailPart?.startsWith("goal=")) metadata.goalId = detailPart.slice("goal=".length);
  else if (detailPart?.startsWith("loop=")) metadata.loopId = detailPart.slice("loop=".length);
  else if (detailPart?.startsWith("evidence=")) metadata.evidenceBundleId = detailPart.slice("evidence=".length);
  return {
    type: "evopilot-history",
    name: value,
    uri: projectPart,
    metadata
  };
}

function readSourceProjectKnowledge(root: string): { text: string; metadata: Record<string, unknown> } {
  const selectedFiles: string[] = [];
  const allFiles: string[] = [];
  walkSourceProject(root, "", allFiles, selectedFiles);
  const maxTotalBytes = 260_000;
  const maxFileBytes = 18_000;
  let usedBytes = 0;
  const sections: string[] = [
    "# Source Project Inventory",
    `root=${root}`,
    "",
    "## Selected Files",
    ...selectedFiles.map((file) => `- ${file}`),
    "",
    "## Project Tree",
    ...allFiles.slice(0, 220).map((file) => `- ${file}`)
  ];
  for (const relative of selectedFiles) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile() || !isTextLikeFile(absolute)) continue;
    const content = fs.readFileSync(absolute, "utf8").slice(0, maxFileBytes);
    usedBytes += Buffer.byteLength(content, "utf8");
    if (usedBytes > maxTotalBytes) break;
    sections.push("", `## FILE ${relative}`, content);
  }
  return {
    text: sections.join("\n").slice(0, maxTotalBytes),
    metadata: {
      root,
      fileCount: allFiles.length,
      selectedFileCount: selectedFiles.length,
      selectedFiles: selectedFiles.slice(0, 80),
      skippedDirectories: SOURCE_PROJECT_SKIPPED_DIRECTORIES
    }
  };
}

const SOURCE_PROJECT_SKIPPED_DIRECTORIES = [".git", "node_modules", "dist", "build", "target", ".venv", "venv", "vendor", "coverage", ".next", ".turbo", ".cache", "__pycache__", ".idea", ".vscode"];
const SOURCE_PROJECT_SELECTED_FILE_PATTERNS = [
  /(^|\/)readme(\.[^/]+)?$/i,
  /(^|\/)(architecture|design|adr|runbook|operations?|deploy|deployment|observability|troubleshooting|incident|postmortem|requirements?)(\/|[-_.][^/]+|$)/i,
  /(^|\/)docs?\//i,
  /(^|\/)(package\.json|pyproject\.toml|pom\.xml|build\.gradle|settings\.gradle|go\.mod|cargo\.toml|dockerfile|docker-compose[^/]*\.ya?ml|makefile)$/i,
  /(^|\/)(\.github\/workflows|\.gitlab-ci\.yml)/i,
  /(^|\/)(test|tests|spec|specs)\//i
];

function walkSourceProject(root: string, relativeDir: string, allFiles: string[], selectedFiles: string[]): void {
  const absoluteDir = path.join(root, relativeDir);
  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relative = path.join(relativeDir, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      if (SOURCE_PROJECT_SKIPPED_DIRECTORIES.includes(entry.name)) continue;
      if (relative.split("/").length > 5) continue;
      walkSourceProject(root, relative, allFiles, selectedFiles);
      continue;
    }
    if (!entry.isFile()) continue;
    allFiles.push(relative);
    if (selectedFiles.length >= 80) continue;
    if (!SOURCE_PROJECT_SELECTED_FILE_PATTERNS.some((pattern) => pattern.test(relative))) continue;
    if (!isTextLikeFile(relative)) continue;
    selectedFiles.push(relative);
  }
}

function extractOfficeOpenXmlText(file: string): string | undefined {
  if (!isOfficeOpenXmlFile(file)) return undefined;
  try {
    const entries = execFileSync("unzip", ["-Z1", file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .filter((entry) => officeXmlEntrySelected(file, entry));
    const parts = entries.map((entry) => {
      const xml = execFileSync("unzip", ["-p", file, entry], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 8 * 1024 * 1024 });
      return xmlToPlainText(xml);
    }).filter(Boolean);
    return parts.join("\n").trim() || undefined;
  } catch {
    return undefined;
  }
}

function extractAttachmentText(file: string, buffer: Buffer): string | undefined {
  if (isTextLikeFile(file)) return buffer.toString("utf8");
  if (isOfficeOpenXmlFile(file)) return extractOfficeOpenXmlText(file);
  if (path.extname(file).toLowerCase() === ".pdf") return extractPdfText(buffer);
  return undefined;
}

function attachmentExtractorName(file: string, text: string | undefined): string {
  if (isTextLikeFile(file)) return "cli-text-reader";
  if (isOfficeOpenXmlFile(file) && text) return "cli-office-xml-reader";
  if (path.extname(file).toLowerCase() === ".pdf" && text) return "cli-pdf-text-reader";
  return "cli-binary-digest-only";
}

function extractPdfText(buffer: Buffer): string | undefined {
  const raw = buffer.toString("latin1");
  const streamTexts: string[] = [];
  const streamPattern = /<<(.*?)>>\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(raw))) {
    const dictionary = match[1] ?? "";
    const streamBody = match[2] ?? "";
    let streamText = streamBody;
    if (/\/Filter\s*(?:\[\s*)?\/FlateDecode\b/.test(dictionary)) {
      try {
        streamText = zlib.inflateSync(Buffer.from(streamBody, "latin1")).toString("latin1");
      } catch {
        continue;
      }
    }
    streamTexts.push(streamText);
  }
  const extracted = extractPdfTextOperators([raw, ...streamTexts].join("\n"));
  return extracted || undefined;
}

function extractPdfTextOperators(content: string): string {
  const parts: string[] = [];
  const literalPattern = /\(((?:\\.|[^\\()])*)\)\s*(?:Tj|'|"|TJ)/g;
  let literal: RegExpExecArray | null;
  while ((literal = literalPattern.exec(content))) {
    parts.push(decodePdfLiteralString(literal[1] ?? ""));
  }
  const arrayPattern = /\[((?:\s*(?:\((?:\\.|[^\\()])*\)|<[\da-fA-F\s]+>|-?\d+(?:\.\d+)?)\s*)+)\]\s*TJ/g;
  let arrayMatch: RegExpExecArray | null;
  while ((arrayMatch = arrayPattern.exec(content))) {
    parts.push(...extractPdfArrayStrings(arrayMatch[1] ?? ""));
  }
  const hexPattern = /<([\da-fA-F\s]+)>\s*(?:Tj|'|"|TJ)/g;
  let hex: RegExpExecArray | null;
  while ((hex = hexPattern.exec(content))) {
    const decoded = decodePdfHexString(hex[1] ?? "");
    if (decoded) parts.push(decoded);
  }
  return parts.map((part) => part.trim()).filter(Boolean).join("\n").replace(/[ \t]+/g, " ").trim();
}

function extractPdfArrayStrings(arrayContent: string): string[] {
  const parts: string[] = [];
  const tokenPattern = /\((?:\\.|[^\\()])*\)|<[\da-fA-F\s]+>/g;
  let token: RegExpExecArray | null;
  while ((token = tokenPattern.exec(arrayContent))) {
    const value = token[0];
    if (value.startsWith("(")) parts.push(decodePdfLiteralString(value.slice(1, -1)));
    else parts.push(decodePdfHexString(value.slice(1, -1)));
  }
  return parts.filter(Boolean);
}

function decodePdfLiteralString(value: string): string {
  return value.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_match, escape: string) => {
    if (escape === "n") return "\n";
    if (escape === "r") return "\r";
    if (escape === "t") return "\t";
    if (escape === "b") return "\b";
    if (escape === "f") return "\f";
    if (escape === "(" || escape === ")" || escape === "\\") return escape;
    return String.fromCharCode(Number.parseInt(escape, 8));
  });
}

function decodePdfHexString(value: string): string {
  const normalized = value.replace(/\s+/g, "");
  if (!normalized) return "";
  const even = normalized.length % 2 === 0 ? normalized : `${normalized}0`;
  return Buffer.from(even, "hex").toString("utf8").replace(/\0/g, "").trim();
}

function isOfficeOpenXmlFile(file: string): boolean {
  return [".docx", ".pptx", ".xlsx"].includes(path.extname(file).toLowerCase());
}

function officeXmlEntrySelected(file: string, entry: string): boolean {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".docx") return /^word\/(document|footnotes|endnotes|comments)\.xml$/.test(entry);
  if (extension === ".pptx") return /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/.test(entry);
  if (extension === ".xlsx") return entry === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(entry);
  return false;
}

function xmlToPlainText(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isTextLikeFile(file: string): boolean {
  return [".txt", ".md", ".markdown", ".yaml", ".yml", ".json", ".toml", ".xml", ".html", ".htm", ".rst", ".csv", ".tsv", ".log"].includes(path.extname(file).toLowerCase());
}

function mediaTypeFromFile(file: string): string {
  const extension = path.extname(file).toLowerCase();
  const map: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
    ".json": "application/json",
    ".log": "text/plain",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  };
  return map[extension] ?? "application/octet-stream";
}

function digestCliBuffer(buffer: Buffer): string {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function stringOption(args: HarnessTemplateEvolutionSourceArgs, name: string): string | undefined {
  const value = args.options[name];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[value.length - 1] === "string") return value[value.length - 1];
  return undefined;
}

function repeatedOption(args: HarnessTemplateEvolutionSourceArgs, name: string): string[] {
  const value = args.options[name];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" ? [value] : [];
}
