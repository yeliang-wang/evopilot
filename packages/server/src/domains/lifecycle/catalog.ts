import fs from "node:fs";
import path from "node:path";
import { parseLifecycleYaml, resolveLifecycleRevision, type LifecycleDefinitionCatalog, type LifecycleSource } from "./core.js";
import { LifecycleActionRegistry } from "./registry.js";
import type { LifecycleRevision } from "./types.js";

export interface LifecycleCatalogEntry {
  id: string;
  version: string;
  name: string;
  description?: string;
  sourceRef: string;
}

export interface LifecycleSelection {
  lifecycle: LifecycleCatalogEntry;
  mode: "explicit" | "label-match";
  score: number;
  reasons: string[];
}

export class FileLifecycleCatalog implements LifecycleDefinitionCatalog {
  private readonly sources = new Map<string, LifecycleSource>();

  constructor(readonly roots: string[], private readonly registry = new LifecycleActionRegistry()) {
    this.reload();
  }

  reload(): void {
    this.sources.clear();
    for (const root of this.roots) {
      if (!fs.existsSync(root)) continue;
      for (const file of walkYamlFiles(root)) {
        const source = { sourceRef: file, text: fs.readFileSync(file, "utf8") };
        const definition = parseLifecycleYaml(source, this.registry);
        const key = `${definition.metadata.id}@${definition.metadata.version}`;
        if (this.sources.has(key)) throw new Error(`LIFECYCLE_CATALOG_DUPLICATE: ${key}`);
        this.sources.set(key, source);
      }
    }
  }

  list(): LifecycleCatalogEntry[] {
    return [...this.sources.values()].map((source) => {
      const definition = parseLifecycleYaml(source, this.registry);
      return {
        id: definition.metadata.id,
        version: definition.metadata.version,
        name: definition.metadata.name,
        description: definition.metadata.description,
        sourceRef: source.sourceRef
      };
    }).sort((left, right) => `${left.id}@${left.version}`.localeCompare(`${right.id}@${right.version}`));
  }

  find(id: string, version: string): LifecycleSource | undefined {
    return this.sources.get(`${id}@${version}`);
  }

  latest(id: string): LifecycleSource | undefined {
    const candidates = this.list().filter((entry) => entry.id === id).sort((left, right) => right.version.localeCompare(left.version, undefined, { numeric: true }));
    return candidates[0] ? this.find(candidates[0].id, candidates[0].version) : undefined;
  }

  resolve(id: string, version?: string): LifecycleRevision {
    const source = version ? this.find(id, version) : this.latest(id);
    if (!source) throw new Error(`LIFECYCLE_NOT_FOUND: ${id}${version ? `@${version}` : ""}`);
    return resolveLifecycleRevision(source, this, this.registry);
  }

  select(input: { lifecycleId?: string; lifecycleVersion?: string; labels?: Record<string, string>; goalText?: string }): LifecycleSelection {
    if (input.lifecycleId) {
      const revision = this.resolve(input.lifecycleId, input.lifecycleVersion);
      const source = input.lifecycleVersion ? this.find(input.lifecycleId, input.lifecycleVersion) : this.latest(input.lifecycleId);
      return {
        lifecycle: { id: revision.ref.id, version: revision.ref.version, name: revision.definition.metadata.name, description: revision.definition.metadata.description, sourceRef: source!.sourceRef },
        mode: "explicit",
        score: Number.MAX_SAFE_INTEGER,
        reasons: ["explicit lifecycle selection"]
      };
    }
    const requestedLabels = input.labels ?? {};
    const goal = String(input.goalText ?? "").toLowerCase();
    const candidates = this.list().map((entry) => {
      const definition = parseLifecycleYaml(this.find(entry.id, entry.version)!, this.registry);
      const labels = definition.metadata.labels ?? {};
      const labelReasons = Object.entries(requestedLabels).filter(([key, value]) => labels[key] === value).map(([key, value]) => `label:${key}=${value}`);
      const textReasons = Object.entries(labels).filter(([, value]) => goal.includes(value.toLowerCase())).map(([key, value]) => `goal:${key}=${value}`);
      return { lifecycle: entry, mode: "label-match" as const, score: labelReasons.length * 100 + textReasons.length * 10, reasons: [...labelReasons, ...textReasons] };
    }).filter((candidate) => candidate.score > 0).sort((left, right) => right.score - left.score || `${left.lifecycle.id}@${left.lifecycle.version}`.localeCompare(`${right.lifecycle.id}@${right.lifecycle.version}`));
    if (!candidates[0]) throw new Error("LIFECYCLE_SELECTION_UNRESOLVED: provide lifecycleId or matching labels");
    return candidates[0];
  }
}

function walkYamlFiles(root: string): string[] {
  const result: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(candidate);
      else if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) result.push(candidate);
    }
  };
  visit(root);
  return result;
}
