import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import { parse, stringify } from "yaml";
import { parseLifecycleYaml } from "../../packages/server/dist/domains/lifecycle/index.js";

const root = path.resolve(import.meta.dirname, "../..");
const schema = JSON.parse(fs.readFileSync(path.join(root, "schemas/lifecycle/lifecycle-definition-v1alpha1.schema.json"), "utf8"));
const validate = new Ajv2020({ strict: true, allowUnionTypes: true, ownProperties: true, allErrors: true }).compile(schema);
const obligationFields = ["requiredEvidence", "validators", "constraints", "requestedPermissions", "disabledHarnessEvidence", "disabledHarnessValidators", "weakenedHarnessConstraints"];
const definition = () => ({
  schema: "evopilot-lifecycle-definition/v1alpha1",
  metadata: { id: "schema-fixture", name: "Schema fixture", version: "1.0.0" },
  stages: [{ id: "validate", name: "Validate", action: { uses: "project.validate@1" }, decision: { mode: "AUTO" } }]
});
const runtimeParse = value => parseLifecycleYaml({ sourceRef: "synthetic-schema-fixture.yaml", text: stringify(value) });

function yamlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? yamlFiles(file) : entry.name.endsWith(".yaml") ? [file] : [];
  });
}

test("every checked-in Lifecycle example satisfies its public schema and Runtime parser", () => {
  const files = yamlFiles(path.join(root, "lifecycles"));
  assert.ok(files.length >= 7);
  let withObligations = 0;
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8"), value = parse(text);
    assert.equal(validate(value), true, `${path.relative(root, file)}: ${JSON.stringify(validate.errors)}`);
    const parsed = parseLifecycleYaml({ sourceRef: file, text });
    if (value.obligations) {
      withObligations += 1;
      assert.deepEqual(parsed.obligations, value.obligations);
    }
  }
  assert.ok(withObligations >= 5, "the documented obligations examples must participate in schema validation");
});

test("Lifecycle obligation schema preserves the parser's optional fields, empty arrays and duplicate strings", () => {
  const examples = [undefined, {}, ...obligationFields.flatMap(field => [
    { [field]: [] }, { [field]: ["required"] }, { [field]: ["required", "required"] }, { [field]: ["  required  "] }
  ]), Object.fromEntries(obligationFields.map(field => [field, ["required"]]))];
  for (const obligations of examples) {
    const value = { ...definition(), ...(obligations === undefined ? {} : { obligations }) };
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
    assert.deepEqual(runtimeParse(value).obligations, obligations);
  }
});

test("Lifecycle obligation schema and Runtime both reject unknown fields and non-string or blank obligations", () => {
  const invalid = [null, [], "invalid", 1, { unknownObligation: [] }, { shell: ["synthetic-never-executed"] },
    ...obligationFields.flatMap(field => [null, {}, "invalid", 1, [1], [false], [null], [""], [" \t\n"]].map(value => ({ [field]: value })))];
  for (const obligations of invalid) {
    const value = { ...definition(), obligations };
    assert.equal(validate(value), false, `schema accepted ${JSON.stringify(obligations)}`);
    assert.throws(() => runtimeParse(value), undefined, `Runtime accepted ${JSON.stringify(obligations)}`);
  }
  const executable = { ...definition(), shell: "synthetic-never-executed" };
  assert.equal(validate(executable), false);
  assert.throws(() => runtimeParse(executable), /LIFECYCLE_UNKNOWN_FIELD: lifecycle.shell/);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.obligations.additionalProperties, false);
});
