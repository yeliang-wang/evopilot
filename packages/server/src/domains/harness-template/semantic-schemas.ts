// Fixed read-only consumption schemas from evopilot-harness. Apache-2.0.
// No dynamic Catalog schemas, network references or producer lifecycle code.
import type { AnySchema } from "ajv/dist/2020.js";
export const semanticSchemaSources = {
  "harness-asset-v3": {
    "source": "schemas/harness-asset-v3.schema.json",
    "sha256": "sha256:a68feb4022fd3dcca6ef911f426ecba336d64cf696cc7a2409519898ab2b90cf"
  },
  "professional-pack-v1": {
    "source": "schemas/professional-pack-v1.schema.json",
    "sha256": "sha256:3ae204a1890e3a65d3543fc4952b74b2b59b9f40fbff91e56632b155515c92a7"
  },
  "ontology-foundation-v1": {
    "source": "schemas/ontology-foundation-v1.schema.json",
    "sha256": "sha256:396c7d80ea930f022adbd164e39c16139e658d6156d1e3dbbaa9e9448f97c018"
  },
  "project-ontology-proposal-v1": {
    "source": "schemas/project-ontology-proposal-v1.schema.json",
    "sha256": "sha256:cf4f43b183ca0815c60479100855bb235e0569193ad06ad6b96d4385bae86ebf"
  },
  "resolved-professional-pack-set-v1": {
    "source": "schemas/resolved-professional-pack-set-v1.schema.json",
    "sha256": "sha256:9850184c88f336361f1200e989f6d24acf18529b19e8192743d2499c0f72de52"
  },
  "resolved-project-ontology-snapshot-v1": {
    "source": "schemas/resolved-project-ontology-snapshot-v1.schema.json",
    "sha256": "sha256:6dc13a110230abbe1c7e6a0b18b6e392910aafd80a65c85bd2afb23ecf7e360d"
  },
  "project-ontology-artifact-set-v1": {
    "source": "schemas/project-ontology-artifact-set-v1.schema.json",
    "sha256": "sha256:0454842260731d5b7b79cb8b749b2829cee234db7e8e6d8cd1a353b9e2045bc2"
  },
  "project-ontology-skill-v1": {
    "source": "schemas/project-ontology-skill-v1.schema.json",
    "sha256": "sha256:0c5834b1f176b0ac6e7496ea49ca49256185d3e08f589adf31e0f41e76dc91b7"
  },
  "project-ontology-projection-set-v1": {
    "source": "schemas/project-ontology-projection-set-v1.schema.json",
    "sha256": "sha256:8ce9c020373c78bef06512951632ac5aa1c0f2ffccfa386305b2660b85d905b0"
  },
  "project-ontology-artifact-lifecycle-v1": {
    "source": "schemas/project-ontology-artifact-lifecycle-v1.schema.json",
    "sha256": "sha256:f7991c6f8dad618e7fa6ab25335136f94ac02ef9a9bf4f0a3fdb5c5501ecb323"
  },
  "pack-lifecycle-record-v1": {
    "source": "schemas/pack-lifecycle-record-v1.schema.json",
    "sha256": "sha256:10670bbf6463d62053ef01bdf41df1e12b696177f0dbc38b30cd4c32a9781b1f"
  },
  "ontology-reasoning-profile-v1": {
    "source": "schemas/ontology-reasoning-profile-v1.schema.json",
    "sha256": "sha256:45424fc9b600286db45628df81e9cf41106f3c5a86e2bff0b147da11abf964f2"
  },
  "semantic-index-v1": {
    "source": "schemas/semantic-index-v1.schema.json",
    "sha256": "sha256:5b5b9831e5537dbd32d2860661a4636041fcd68b734dcb86b548460e64316568"
  },
  "semantic-interoperability-projection-set-v1": {
    "source": "schemas/semantic-interoperability-projection-set-v1.schema.json",
    "sha256": "sha256:79e5fbb89f1b31e16a431578e2058b6f709a440837f28516d994f4cd3ebab85b"
  },
  "semantic-round-trip-report-v1": {
    "source": "schemas/semantic-round-trip-report-v1.schema.json",
    "sha256": "sha256:6fa78f9a1861abe2a83442302cdc50c6d5b0ef7cb89808bee838fa0bdebbf521"
  },
  "semantic-computation-v1": {
    "source": "schemas/semantic-computation-v1.schema.json",
    "sha256": "sha256:8d4fb79d5928c4e601d6674c4e5484238da24bca1858a18c26355cb5df06fe90"
  },
  "terminal-semantic-closure-v1": {
    "source": "schemas/terminal-semantic-closure-v1.schema.json",
    "sha256": "sha256:6318e53b2b584d2738345ecfb6e3b8638319000b2273a4db3e556c9071e6eb19"
  }
} as const;
export const semanticConsumptionSchemas: Readonly<Record<string, AnySchema>> = {
  "harness-asset-v3": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://evopilot.dev/schemas/harness-asset-v3.schema.json",
    "title": "EvoPilot Harness Asset v3",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "apiVersion",
      "kind",
      "metadata",
      "spec"
    ],
    "properties": {
      "apiVersion": {
        "const": "harness.evopilot.io/v3"
      },
      "kind": {
        "enum": [
          "HarnessComponent",
          "HarnessProfile",
          "HarnessBundle"
        ]
      },
      "metadata": {
        "$ref": "#/$defs/metadata"
      },
      "spec": {
        "type": "object"
      },
      "provenance": {
        "$ref": "#/$defs/provenance"
      }
    },
    "allOf": [
      {
        "if": {
          "properties": {
            "kind": {
              "const": "HarnessComponent"
            }
          }
        },
        "then": {
          "properties": {
            "spec": {
              "$ref": "#/$defs/componentSpec"
            }
          }
        }
      },
      {
        "if": {
          "properties": {
            "kind": {
              "const": "HarnessProfile"
            }
          }
        },
        "then": {
          "properties": {
            "spec": {
              "$ref": "#/$defs/profileSpec"
            }
          }
        }
      },
      {
        "if": {
          "properties": {
            "kind": {
              "const": "HarnessBundle"
            }
          }
        },
        "then": {
          "properties": {
            "spec": {
              "$ref": "#/$defs/bundleSpec"
            }
          }
        }
      }
    ],
    "$defs": {
      "identifier": {
        "type": "string",
        "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$"
      },
      "semver": {
        "type": "string",
        "pattern": "^0|[1-9][0-9]*\\.0|[1-9][0-9]*\\.0|[1-9][0-9]*$"
      },
      "digest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "nonEmptyStrings": {
        "type": "array",
        "items": {
          "type": "string",
          "minLength": 1
        },
        "minItems": 1,
        "uniqueItems": true
      },
      "metadata": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "version",
          "name",
          "description",
          "lifecycle"
        ],
        "properties": {
          "id": {
            "$ref": "#/$defs/identifier"
          },
          "version": {
            "type": "string",
            "pattern": "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$"
          },
          "name": {
            "type": "string",
            "minLength": 3
          },
          "description": {
            "type": "string",
            "minLength": 16
          },
          "lifecycle": {
            "enum": [
              "draft",
              "review",
              "approved",
              "published",
              "deprecated"
            ]
          },
          "owner": {
            "type": "string",
            "minLength": 1
          },
          "labels": {
            "type": "object",
            "additionalProperties": {
              "type": "string"
            }
          }
        }
      },
      "provenance": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "sourceDigests",
          "ontologyVersion",
          "policyVersion"
        ],
        "properties": {
          "sourceDigests": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/digest"
            },
            "uniqueItems": true
          },
          "ontologyVersion": {
            "type": "string",
            "minLength": 1
          },
          "policyVersion": {
            "type": "string",
            "minLength": 1
          },
          "advisorRunDigest": {
            "$ref": "#/$defs/digest"
          }
        }
      },
      "action": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "description",
          "executor",
          "inputs",
          "outputs"
        ],
        "properties": {
          "id": {
            "$ref": "#/$defs/identifier"
          },
          "description": {
            "type": "string",
            "minLength": 8
          },
          "executor": {
            "enum": [
              "shell",
              "http",
              "container",
              "agent",
              "manual"
            ]
          },
          "command": {
            "type": "string"
          },
          "inputs": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "uniqueItems": true
          },
          "outputs": {
            "$ref": "#/$defs/nonEmptyStrings"
          },
          "timeoutSeconds": {
            "type": "integer",
            "minimum": 1,
            "maximum": 86400
          },
          "network": {
            "enum": [
              "denied",
              "restricted",
              "allowed"
            ]
          }
        }
      },
      "validator": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "type",
          "assertion",
          "evidenceRefs"
        ],
        "properties": {
          "id": {
            "$ref": "#/$defs/identifier"
          },
          "type": {
            "enum": [
              "exit-code",
              "json-schema",
              "content",
              "metric",
              "manual-review",
              "signature"
            ]
          },
          "assertion": {
            "type": "string",
            "minLength": 3
          },
          "evidenceRefs": {
            "$ref": "#/$defs/nonEmptyStrings"
          },
          "blocking": {
            "type": "boolean"
          }
        }
      },
      "componentSpec": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "capability",
          "environment",
          "actions",
          "constraints",
          "evidence",
          "validators"
        ],
        "properties": {
          "capability": {
            "$ref": "#/$defs/identifier"
          },
          "environment": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "workspaceMode",
              "requiredTools"
            ],
            "properties": {
              "workspaceMode": {
                "enum": [
                  "read-only",
                  "read-write",
                  "isolated"
                ]
              },
              "requiredTools": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "uniqueItems": true
              },
              "requiredServices": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "uniqueItems": true
              }
            }
          },
          "actions": {
            "type": "array",
            "minItems": 1,
            "items": {
              "$ref": "#/$defs/action"
            }
          },
          "constraints": {
            "$ref": "#/$defs/nonEmptyStrings"
          },
          "evidence": {
            "$ref": "#/$defs/nonEmptyStrings"
          },
          "validators": {
            "type": "array",
            "minItems": 1,
            "items": {
              "$ref": "#/$defs/validator"
            }
          }
        }
      },
      "assetRef": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "version"
        ],
        "properties": {
          "id": {
            "$ref": "#/$defs/identifier"
          },
          "version": {
            "type": "string",
            "minLength": 1
          },
          "digest": {
            "$ref": "#/$defs/digest"
          },
          "required": {
            "type": "boolean"
          }
        }
      },
      "profileSpec": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "classification",
          "boundary",
          "match",
          "components",
          "acceptance"
        ],
        "properties": {
          "classification": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "domain",
              "role",
              "taskClass"
            ],
            "properties": {
              "domain": {
                "$ref": "#/$defs/identifier"
              },
              "role": {
                "$ref": "#/$defs/identifier"
              },
              "taskClass": {
                "$ref": "#/$defs/identifier"
              }
            }
          },
          "boundary": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "inScope",
              "outOfScope"
            ],
            "properties": {
              "inScope": {
                "$ref": "#/$defs/nonEmptyStrings"
              },
              "outOfScope": {
                "$ref": "#/$defs/nonEmptyStrings"
              }
            }
          },
          "match": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "positiveConcepts",
              "negativeConcepts",
              "requiredEvidenceKinds"
            ],
            "properties": {
              "positiveConcepts": {
                "$ref": "#/$defs/nonEmptyStrings"
              },
              "negativeConcepts": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "uniqueItems": true
              },
              "requiredEvidenceKinds": {
                "$ref": "#/$defs/nonEmptyStrings"
              }
            }
          },
          "components": {
            "type": "array",
            "minItems": 1,
            "items": {
              "$ref": "#/$defs/assetRef"
            }
          },
          "acceptance": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "requiredEvidence",
              "blockingValidators"
            ],
            "properties": {
              "requiredEvidence": {
                "$ref": "#/$defs/nonEmptyStrings"
              },
              "blockingValidators": {
                "$ref": "#/$defs/nonEmptyStrings"
              }
            }
          },
          "evaluationPackRef": {
            "type": "string",
            "minLength": 1
          }
        }
      },
      "bundleSpec": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "profile",
          "resolvedComponents",
          "executionPlan",
          "constraints",
          "evidence",
          "validators"
        ],
        "properties": {
          "profile": {
            "allOf": [
              {
                "$ref": "#/$defs/assetRef"
              },
              {
                "type": "object",
                "required": [
                  "digest"
                ],
                "properties": {
                  "digest": {
                    "$ref": "#/$defs/digest"
                  }
                }
              }
            ]
          },
          "resolvedComponents": {
            "type": "array",
            "minItems": 1,
            "items": {
              "allOf": [
                {
                  "$ref": "#/$defs/assetRef"
                },
                {
                  "type": "object",
                  "required": [
                    "digest"
                  ],
                  "properties": {
                    "digest": {
                      "$ref": "#/$defs/digest"
                    }
                  }
                }
              ]
            }
          },
          "executionPlan": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "string"
            },
            "uniqueItems": true
          },
          "constraints": {
            "$ref": "#/$defs/nonEmptyStrings"
          },
          "evidence": {
            "$ref": "#/$defs/nonEmptyStrings"
          },
          "validators": {
            "$ref": "#/$defs/nonEmptyStrings"
          },
          "semanticRequirements": {
            "$ref": "#/$defs/semanticRequirements"
          },
          "exports": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "adapter",
                "path"
              ],
              "properties": {
                "adapter": {
                  "type": "string",
                  "minLength": 1
                },
                "path": {
                  "type": "string",
                  "minLength": 1
                }
              }
            }
          }
        }
      },
      "semanticRequirements": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "schema",
          "foundationDigest",
          "requiredConcepts",
          "prohibitedConcepts",
          "relationRequirements",
          "evidenceRequirements",
          "authority",
          "requirementsDigest"
        ],
        "properties": {
          "schema": {
            "const": "evopilot-harness-semantic-requirements/v1"
          },
          "foundationDigest": {
            "$ref": "#/$defs/digest"
          },
          "requiredConcepts": {
            "$ref": "#/$defs/semanticConceptRequirements"
          },
          "prohibitedConcepts": {
            "$ref": "#/$defs/semanticConceptRequirements"
          },
          "relationRequirements": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "subjectConceptId",
                "relationType",
                "objectConceptId"
              ],
              "properties": {
                "subjectConceptId": {
                  "type": "string",
                  "minLength": 1
                },
                "relationType": {
                  "enum": [
                    "IS_A",
                    "PART_OF",
                    "REQUIRES",
                    "PERFORMS",
                    "CONSTRAINS",
                    "TRIGGERS",
                    "RECOVERS_WITH",
                    "VALIDATED_BY",
                    "ALTERNATIVE_TO",
                    "MITIGATES",
                    "PRODUCES"
                  ]
                },
                "objectConceptId": {
                  "type": "string",
                  "minLength": 1
                }
              }
            }
          },
          "evidenceRequirements": {
            "type": "array",
            "uniqueItems": true,
            "items": {
              "type": "string",
              "minLength": 1
            }
          },
          "authority": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "descriptiveConstraintOnly",
              "executable",
              "provesEligibility",
              "mayApprove",
              "mayPublish"
            ],
            "properties": {
              "descriptiveConstraintOnly": {
                "const": true
              },
              "executable": {
                "const": false
              },
              "provesEligibility": {
                "const": false
              },
              "mayApprove": {
                "const": false
              },
              "mayPublish": {
                "const": false
              }
            }
          },
          "requirementsDigest": {
            "$ref": "#/$defs/digest"
          }
        }
      },
      "semanticConceptRequirements": {
        "type": "array",
        "uniqueItems": true,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "conceptId",
            "metaType",
            "rationale",
            "evidenceRefs"
          ],
          "properties": {
            "conceptId": {
              "type": "string",
              "minLength": 1
            },
            "metaType": {
              "enum": [
                "ENTITY",
                "ATTRIBUTE",
                "RELATIONSHIP",
                "RULE",
                "EVENT",
                "ACTION",
                "ACTOR",
                "ROLE",
                "PERMISSION",
                "STATE",
                "WORKFLOW",
                "CAPABILITY",
                "SYSTEM",
                "DATA_ASSET"
              ]
            },
            "rationale": {
              "type": "string"
            },
            "evidenceRefs": {
              "type": "array",
              "uniqueItems": true,
              "items": {
                "type": "string"
              }
            }
          }
        }
      }
    }
  },
  "professional-pack-v1": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://evopilot.dev/schemas/professional-pack-v1.schema.json",
    "title": "Declarative Professional Pack v1",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "apiVersion",
      "kind",
      "metadata",
      "spec",
      "status"
    ],
    "properties": {
      "apiVersion": {
        "const": "semantics.evopilot.io/v1"
      },
      "kind": {
        "enum": [
          "DomainOntologyPack",
          "ProductOntologyPack",
          "OrganizationOntologyPack",
          "ProjectOntologyOverlay",
          "DomainHarnessPack"
        ]
      },
      "metadata": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "version",
          "name",
          "namespace",
          "root",
          "visibility",
          "generation",
          "owner",
          "provenance",
          "labels",
          "kind",
          "digest"
        ],
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "version": {
            "type": "string",
            "pattern": "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$"
          },
          "name": {
            "type": "string",
            "minLength": 1
          },
          "namespace": {
            "type": "string",
            "minLength": 2
          },
          "root": {
            "enum": [
              "COMMUNITY",
              "DOMAIN_TEAM",
              "PRIVATE_ORGANIZATION"
            ]
          },
          "visibility": {
            "enum": [
              "PUBLIC",
              "DOMAIN",
              "PRIVATE"
            ]
          },
          "generation": {
            "type": "integer",
            "minimum": 1
          },
          "owner": {
            "type": "string",
            "minLength": 1
          },
          "provenance": {
            "type": "object"
          },
          "labels": {
            "type": "object",
            "additionalProperties": {
              "type": "string"
            }
          },
          "kind": {
            "type": "string"
          },
          "digest": {
            "type": "string",
            "pattern": "^sha256:[a-f0-9]{64}$"
          }
        }
      },
      "spec": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "imports",
          "concepts",
          "equivalences",
          "replacements",
          "deprecations",
          "rules",
          "shapes",
          "harnessGuidance",
          "authority"
        ],
        "properties": {
          "imports": {
            "type": "array"
          },
          "concepts": {
            "type": "array"
          },
          "equivalences": {
            "type": "array"
          },
          "replacements": {
            "type": "array"
          },
          "deprecations": {
            "type": "array"
          },
          "rules": {
            "type": "array"
          },
          "shapes": {
            "type": "array"
          },
          "harnessGuidance": {
            "type": "array"
          },
          "authority": {
            "type": "object",
            "required": [
              "declarativeOnly",
              "executable",
              "activationRequiresIndependentDecision"
            ],
            "properties": {
              "declarativeOnly": {
                "const": true
              },
              "executable": {
                "const": false
              },
              "activationRequiresIndependentDecision": {
                "const": true
              }
            }
          }
        }
      },
      "status": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "phase",
          "conditions",
          "observedGeneration",
          "engineOwned"
        ],
        "properties": {
          "phase": {
            "enum": [
              "DRAFT",
              "APPLIED",
              "IN_REVIEW",
              "APPROVED",
              "PUBLISHED",
              "INSTALLED",
              "ACTIVE",
              "SUPERSEDED",
              "ROLLED_BACK",
              "DEPRECATED"
            ]
          },
          "conditions": {
            "type": "array"
          },
          "observedGeneration": {
            "type": "integer",
            "minimum": 1
          },
          "engineOwned": {
            "const": true
          }
        }
      }
    }
  },
  "ontology-foundation-v1": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://evopilot.dev/schemas/ontology-foundation-v1.schema.json",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema",
      "version",
      "metaTypes",
      "relationTypes",
      "limits",
      "authority",
      "foundationDigest"
    ],
    "properties": {
      "schema": {
        "const": "evopilot-harness-ontology-foundation/v1"
      },
      "version": {
        "const": 1
      },
      "metaTypes": {
        "type": "array",
        "minItems": 14,
        "maxItems": 14,
        "uniqueItems": true,
        "items": {
          "enum": [
            "ENTITY",
            "ATTRIBUTE",
            "RELATIONSHIP",
            "RULE",
            "EVENT",
            "ACTION",
            "ACTOR",
            "ROLE",
            "PERMISSION",
            "STATE",
            "WORKFLOW",
            "CAPABILITY",
            "SYSTEM",
            "DATA_ASSET"
          ]
        }
      },
      "relationTypes": {
        "type": "array",
        "minItems": 11,
        "maxItems": 11,
        "uniqueItems": true,
        "items": {
          "enum": [
            "IS_A",
            "PART_OF",
            "REQUIRES",
            "PERFORMS",
            "CONSTRAINS",
            "TRIGGERS",
            "RECOVERS_WITH",
            "VALIDATED_BY",
            "ALTERNATIVE_TO",
            "MITIGATES",
            "PRODUCES"
          ]
        }
      },
      "limits": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "maxCandidates",
          "maxConcepts",
          "maxEvidenceRefsPerCandidate"
        ],
        "properties": {
          "maxCandidates": {
            "type": "integer",
            "minimum": 1,
            "maximum": 512
          },
          "maxConcepts": {
            "type": "integer",
            "minimum": 1,
            "maximum": 4096
          },
          "maxEvidenceRefsPerCandidate": {
            "type": "integer",
            "minimum": 1,
            "maximum": 64
          }
        }
      },
      "authority": {
        "type": "object",
        "required": [
          "engineOwnedMetaModel",
          "containsBusinessValues",
          "executable",
          "mayDecideEligibility",
          "mayApprove",
          "mayPublish"
        ],
        "properties": {
          "engineOwnedMetaModel": {
            "const": true
          },
          "containsBusinessValues": {
            "const": false
          },
          "executable": {
            "const": false
          },
          "mayDecideEligibility": {
            "const": false
          },
          "mayApprove": {
            "const": false
          },
          "mayPublish": {
            "const": false
          }
        }
      },
      "foundationDigest": {
        "$ref": "#/$defs/digest"
      }
    },
    "$defs": {
      "digest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      }
    }
  },
  "project-ontology-proposal-v1": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://evopilot.dev/schemas/project-ontology-proposal-v1.schema.json",
    "type": "object",
    "required": [
      "schema",
      "proposalId",
      "revision",
      "stage",
      "project",
      "baseDigest",
      "resolvedPackSet",
      "conflictSet",
      "createdBy",
      "createdAt",
      "decisions",
      "authority",
      "proposalDigest"
    ],
    "properties": {
      "schema": {
        "const": "evopilot-harness-project-ontology-proposal/v1"
      },
      "proposalId": {
        "type": "string",
        "minLength": 1
      },
      "revision": {
        "type": "integer",
        "minimum": 1
      },
      "stage": {
        "enum": [
          "DRAFT",
          "APPLIED",
          "IN_REVIEW",
          "APPROVED",
          "REJECTED"
        ]
      },
      "project": {
        "type": "object"
      },
      "baseDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "resolvedPackSet": {
        "type": "object"
      },
      "overlay": {
        "type": [
          "object",
          "null"
        ]
      },
      "conflictSet": {
        "type": "array"
      },
      "createdBy": {
        "type": "string",
        "minLength": 1
      },
      "createdAt": {
        "type": "string",
        "minLength": 1
      },
      "decisions": {
        "type": "array"
      },
      "authority": {
        "type": "object"
      },
      "proposalDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      }
    }
  },
  "resolved-professional-pack-set-v1": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://evopilot.dev/schemas/resolved-professional-pack-set-v1.schema.json",
    "type": "object",
    "required": [
      "schema",
      "targetRoot",
      "baseDigest",
      "packs",
      "concepts",
      "dependencyGraph",
      "conflicts",
      "authority",
      "packSetDigest"
    ],
    "properties": {
      "schema": {
        "const": "evopilot-harness-resolved-professional-pack-set/v1"
      },
      "targetRoot": {
        "enum": [
          "COMMUNITY",
          "DOMAIN_TEAM",
          "PRIVATE_ORGANIZATION"
        ]
      },
      "baseDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "packs": {
        "type": "array",
        "minItems": 1
      },
      "concepts": {
        "type": "array"
      },
      "dependencyGraph": {
        "type": "array"
      },
      "conflicts": {
        "type": "array",
        "maxItems": 0
      },
      "authority": {
        "type": "object"
      },
      "packSetDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      }
    }
  },
  "resolved-project-ontology-snapshot-v1": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://evopilot.dev/schemas/resolved-project-ontology-snapshot-v1.schema.json",
    "type": "object",
    "required": [
      "schema",
      "project",
      "foundationDigest",
      "proposalDigest",
      "baseDigest",
      "packSetDigest",
      "packs",
      "dependencyGraph",
      "concepts",
      "authority",
      "snapshotDigest"
    ],
    "properties": {
      "schema": {
        "const": "evopilot-harness-resolved-project-ontology-snapshot/v1"
      },
      "project": {
        "type": "object"
      },
      "foundationDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "proposalDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "baseDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "packSetDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "packs": {
        "type": "array",
        "minItems": 1
      },
      "dependencyGraph": {
        "type": "array"
      },
      "concepts": {
        "type": "array"
      },
      "overlay": {
        "type": [
          "object",
          "null"
        ]
      },
      "predecessorSnapshotDigest": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "resolvedAt": {
        "type": [
          "string",
          "null"
        ]
      },
      "authority": {
        "type": "object"
      },
      "snapshotDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      }
    }
  },
  "project-ontology-artifact-set-v1": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://evopilot.dev/schemas/project-ontology-artifact-set-v1.schema.json",
    "type": "object",
    "required": [
      "schema",
      "kind",
      "apiVersion",
      "metadata",
      "spec",
      "authority",
      "artifactSetDigest"
    ],
    "properties": {
      "schema": {
        "const": "evopilot-harness-project-ontology-artifact-set/v1"
      },
      "kind": {
        "const": "ProjectOntologyArtifactSet"
      },
      "apiVersion": {
        "const": "semantics.evopilot.io/v1"
      },
      "metadata": {
        "type": "object"
      },
      "spec": {
        "type": "object",
        "required": [
          "project",
          "manifest",
          "snapshot",
          "snapshotDigest",
          "foundationDigest",
          "provenance",
          "dependencyLock",
          "projectionSet",
          "projectOntologySkill",
          "publication"
        ],
        "properties": {
          "project": {
            "type": "object"
          },
          "manifest": {
            "type": "object"
          },
          "snapshot": {
            "type": "object"
          },
          "snapshotDigest": {
            "type": "string",
            "pattern": "^sha256:[a-f0-9]{64}$"
          },
          "foundationDigest": {
            "type": "string",
            "pattern": "^sha256:[a-f0-9]{64}$"
          },
          "provenance": {
            "type": "array"
          },
          "dependencyLock": {
            "type": "object"
          },
          "projectionSet": {
            "type": "object"
          },
          "projectOntologySkill": {
            "type": "object"
          },
          "publication": {
            "type": "object"
          }
        }
      },
      "authority": {
        "type": "object"
      },
      "artifactSetDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      }
    }
  },
  "project-ontology-skill-v1": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://evopilot.dev/schemas/project-ontology-skill-v1.schema.json",
    "type": "object",
    "required": [
      "schema",
      "kind",
      "apiVersion",
      "metadata",
      "spec",
      "authority",
      "skillDigest"
    ],
    "properties": {
      "schema": {
        "const": "evopilot-harness-project-ontology-skill/v1"
      },
      "kind": {
        "const": "ProjectOntologySkill"
      },
      "apiVersion": {
        "const": "semantics.evopilot.io/v1"
      },
      "metadata": {
        "type": "object"
      },
      "spec": {
        "type": "object",
        "required": [
          "snapshotDigest",
          "projectionSetDigest",
          "artifactSetManifestDigest",
          "conceptIndex",
          "instructions",
          "readOnly",
          "truthSource",
          "executable"
        ],
        "properties": {
          "snapshotDigest": {
            "type": "string",
            "pattern": "^sha256:[a-f0-9]{64}$"
          },
          "projectionSetDigest": {
            "type": "string",
            "pattern": "^sha256:[a-f0-9]{64}$"
          },
          "artifactSetManifestDigest": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^sha256:[a-f0-9]{64}$"
          },
          "conceptIndex": {
            "type": "array"
          },
          "instructions": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "readOnly": {
            "const": true
          },
          "truthSource": {
            "const": "ResolvedProjectOntologySnapshot"
          },
          "executable": {
            "const": false
          }
        }
      },
      "authority": {
        "type": "object"
      },
      "skillDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      }
    }
  },
  "project-ontology-projection-set-v1": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://evopilot.dev/schemas/project-ontology-projection-set-v1.schema.json",
    "type": "object",
    "required": [
      "schema",
      "snapshotDigest",
      "projections",
      "projectionSetDigest"
    ],
    "properties": {
      "schema": {
        "const": "evopilot-harness-project-ontology-projection-set/v1"
      },
      "snapshotDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "projections": {
        "type": "array",
        "minItems": 6,
        "maxItems": 6,
        "items": {
          "type": "object",
          "required": [
            "format",
            "status",
            "snapshotDigest",
            "mediaType",
            "content",
            "contentDigest"
          ],
          "properties": {
            "format": {
              "enum": [
                "YAML",
                "OWL",
                "RDF_TURTLE",
                "JSON_LD",
                "SWRL",
                "SHACL"
              ]
            },
            "status": {
              "enum": [
                "APPLICABLE",
                "NON_APPLICABLE"
              ]
            },
            "snapshotDigest": {
              "type": "string"
            },
            "mediaType": {
              "type": "string"
            },
            "reason": {
              "type": "string"
            },
            "content": {
              "type": [
                "string",
                "null"
              ]
            },
            "contentDigest": {
              "type": [
                "string",
                "null"
              ]
            }
          }
        }
      },
      "projectionSetDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      }
    }
  },
  "project-ontology-artifact-lifecycle-v1": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://evopilot.dev/schemas/project-ontology-artifact-lifecycle-v1.schema.json",
    "type": "object",
    "required": [
      "schema",
      "artifactSetDigest",
      "stage",
      "history",
      "authority",
      "recordDigest"
    ],
    "properties": {
      "schema": {
        "const": "evopilot-harness-project-ontology-artifact-lifecycle/v1"
      },
      "artifactSetDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "stage": {
        "enum": [
          "PUBLISHED",
          "INSTALLED",
          "ACTIVE",
          "SUPERSEDED",
          "ROLLED_BACK",
          "DEPRECATED"
        ]
      },
      "history": {
        "type": "array"
      },
      "authority": {
        "type": "object"
      },
      "recordDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      }
    }
  },
  "pack-lifecycle-record-v1": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://evopilot.dev/schemas/pack-lifecycle-record-v1.schema.json",
    "type": "object",
    "required": [
      "schema",
      "stage",
      "history",
      "authority",
      "recordDigest"
    ],
    "properties": {
      "schema": {
        "const": "evopilot-harness-pack-lifecycle-record/v1"
      },
      "stage": {
        "enum": [
          "DRAFT",
          "APPLIED",
          "IN_REVIEW",
          "APPROVED",
          "PUBLISHED",
          "INSTALLED",
          "ACTIVE",
          "SUPERSEDED",
          "ROLLED_BACK",
          "DEPRECATED"
        ]
      },
      "history": {
        "type": "array"
      },
      "authority": {
        "type": "object"
      },
      "recordDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      }
    }
  },
  "ontology-reasoning-profile-v1": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://evopilot.dev/schemas/ontology-reasoning-profile-v1.schema.json",
    "title": "OntologyReasoningProfile v1",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema",
      "apiVersion",
      "kind",
      "metadata",
      "spec",
      "authority",
      "profileDigest"
    ],
    "properties": {
      "schema": {
        "const": "evopilot-harness-ontology-reasoning-profile/v1"
      },
      "apiVersion": {
        "const": "semantics.evopilot.io/v1"
      },
      "kind": {
        "const": "OntologyReasoningProfile"
      },
      "metadata": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "version"
        ],
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "version": {
            "type": "string",
            "pattern": "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$"
          }
        }
      },
      "spec": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "mode",
          "supportedRules",
          "limits",
          "externalReasoner",
          "failurePolicy",
          "fullRecomputeEquivalenceRequired",
          "cacheDigestRequired"
        ],
        "properties": {
          "mode": {
            "enum": [
              "NONE",
              "RDFS",
              "OWL_RL",
              "SWRL_SAFE",
              "EXTERNAL_REASONER"
            ]
          },
          "supportedRules": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "uniqueItems": true
          },
          "limits": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "maxNodes",
              "maxEdges",
              "maxIterations",
              "maxWallTimeMs",
              "maxConcurrentTasks",
              "maxCacheEntries"
            ],
            "properties": {
              "maxNodes": {
                "type": "integer",
                "minimum": 1
              },
              "maxEdges": {
                "type": "integer",
                "minimum": 1
              },
              "maxIterations": {
                "type": "integer",
                "minimum": 1
              },
              "maxWallTimeMs": {
                "type": "integer",
                "minimum": 1
              },
              "maxConcurrentTasks": {
                "type": "integer",
                "minimum": 1
              },
              "maxCacheEntries": {
                "type": "integer",
                "minimum": 1
              }
            }
          },
          "externalReasoner": {
            "type": [
              "object",
              "null"
            ]
          },
          "failurePolicy": {
            "const": "FAIL_CLOSED_WITH_PROOF_PATH"
          },
          "fullRecomputeEquivalenceRequired": {
            "const": true
          },
          "cacheDigestRequired": {
            "const": true
          }
        }
      },
      "authority": {
        "type": "object",
        "required": [
          "engineOwnedDecision",
          "externalReasonerEvidenceOnly",
          "externalReasonerMayApprove",
          "externalReasonerMayPublish",
          "externalReasonerMayMutate",
          "unboundedReasoningAllowed"
        ],
        "properties": {
          "engineOwnedDecision": {
            "const": true
          },
          "externalReasonerEvidenceOnly": {
            "type": "boolean"
          },
          "externalReasonerMayApprove": {
            "const": false
          },
          "externalReasonerMayPublish": {
            "const": false
          },
          "externalReasonerMayMutate": {
            "const": false
          },
          "unboundedReasoningAllowed": {
            "const": false
          }
        }
      },
      "profileDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      }
    }
  },
  "semantic-index-v1": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://evopilot.dev/schemas/semantic-index-v1.schema.json",
    "title": "SemanticIndex v1",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema",
      "apiVersion",
      "kind",
      "snapshotDigest",
      "algorithm",
      "policy",
      "toolchain",
      "cache",
      "nodes",
      "edges",
      "assets",
      "statistics",
      "authority",
      "indexDigest"
    ],
    "properties": {
      "schema": {
        "const": "evopilot-harness-semantic-index/v1"
      },
      "apiVersion": {
        "const": "semantics.evopilot.io/v1"
      },
      "kind": {
        "const": "SemanticIndex"
      },
      "snapshotDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "algorithm": {
        "type": "object"
      },
      "policy": {
        "type": "object"
      },
      "toolchain": {
        "type": "object"
      },
      "cache": {
        "type": [
          "object",
          "null"
        ]
      },
      "nodes": {
        "type": "array",
        "items": {
          "type": "object"
        }
      },
      "edges": {
        "type": "array",
        "items": {
          "type": "object"
        }
      },
      "assets": {
        "type": "array",
        "items": {
          "type": "object"
        }
      },
      "statistics": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "nodeCount",
          "edgeCount",
          "assetCount"
        ],
        "properties": {
          "nodeCount": {
            "type": "integer",
            "minimum": 0
          },
          "edgeCount": {
            "type": "integer",
            "minimum": 0
          },
          "assetCount": {
            "type": "integer",
            "minimum": 0
          }
        }
      },
      "authority": {
        "type": "object",
        "required": [
          "contentAddressed",
          "readOnly",
          "staleResultsAllowed",
          "mixedContextAllowed",
          "mayMutateSource"
        ],
        "properties": {
          "contentAddressed": {
            "const": true
          },
          "readOnly": {
            "const": true
          },
          "staleResultsAllowed": {
            "const": false
          },
          "mixedContextAllowed": {
            "const": false
          },
          "mayMutateSource": {
            "const": false
          }
        }
      },
      "indexDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      }
    }
  },
  "semantic-interoperability-projection-set-v1": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://evopilot.dev/schemas/semantic-interoperability-projection-set-v1.schema.json",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema",
      "snapshotDigest",
      "profileDigest",
      "indexDigest",
      "canonicalSemanticDigest",
      "externalMappings",
      "multilingualTerms",
      "projections",
      "authority",
      "projectionSetDigest"
    ],
    "properties": {
      "schema": {
        "const": "evopilot-harness-semantic-interoperability-projection-set/v1"
      },
      "snapshotDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "profileDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "indexDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "canonicalSemanticDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "externalMappings": {
        "type": "array",
        "items": {
          "type": "object"
        }
      },
      "multilingualTerms": {
        "type": "array",
        "items": {
          "type": "object"
        }
      },
      "projections": {
        "type": "array",
        "minItems": 5,
        "maxItems": 5,
        "items": {
          "type": "object"
        }
      },
      "authority": {
        "type": "object"
      },
      "projectionSetDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      }
    }
  },
  "semantic-round-trip-report-v1": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://evopilot.dev/schemas/semantic-round-trip-report-v1.schema.json",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema",
      "status",
      "snapshotDigest",
      "indexDigest",
      "projectionSetDigest",
      "incrementalComputationDigest",
      "fullComputationDigest",
      "bindingChecks",
      "allApplicableDigestsPresent",
      "allFormatsApplicable",
      "canonicalSemanticsPreserved",
      "unsupportedFormats",
      "computationEquivalence",
      "authority",
      "reportDigest"
    ],
    "properties": {
      "schema": {
        "const": "evopilot-harness-semantic-round-trip-report/v1"
      },
      "status": {
        "enum": [
          "PASSED",
          "FAILED"
        ]
      },
      "snapshotDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "indexDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "projectionSetDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "incrementalComputationDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "fullComputationDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "bindingChecks": {
        "type": "object"
      },
      "allApplicableDigestsPresent": {
        "type": "boolean"
      },
      "allFormatsApplicable": {
        "type": "boolean"
      },
      "canonicalSemanticsPreserved": {
        "type": "boolean"
      },
      "unsupportedFormats": {
        "type": "array",
        "items": {
          "type": "object"
        }
      },
      "computationEquivalence": {
        "type": "object"
      },
      "authority": {
        "type": "object"
      },
      "reportDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      }
    }
  },
  "semantic-computation-v1": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://evopilot.dev/schemas/semantic-computation-v1.schema.json",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema",
      "computationMode",
      "indexDigest",
      "profileDigest",
      "affectedSubgraphDigest",
      "externalReasonerEvidence",
      "outcomeDigest",
      "proofDigest",
      "telemetry",
      "status",
      "authority",
      "computationDigest"
    ],
    "properties": {
      "schema": {
        "const": "evopilot-harness-semantic-computation/v1"
      },
      "computationMode": {
        "enum": [
          "FULL",
          "INCREMENTAL"
        ]
      },
      "indexDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "profileDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "affectedSubgraphDigest": {
        "type": [
          "string",
          "null"
        ]
      },
      "externalReasonerEvidence": {
        "type": [
          "object",
          "null"
        ]
      },
      "outcomeDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "proofDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      },
      "telemetry": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "nodeCount",
          "edgeCount",
          "evaluatedConceptCount",
          "evaluatedConceptIds",
          "concurrency",
          "elapsedMs",
          "cacheEntryCount",
          "cacheDigest",
          "budgets",
          "secretsRedacted"
        ],
        "properties": {
          "nodeCount": {
            "type": "integer",
            "minimum": 0
          },
          "edgeCount": {
            "type": "integer",
            "minimum": 0
          },
          "evaluatedConceptCount": {
            "type": "integer",
            "minimum": 0
          },
          "evaluatedConceptIds": {
            "type": "array",
            "uniqueItems": true,
            "items": {
              "type": "string"
            }
          },
          "concurrency": {
            "type": "integer",
            "minimum": 1
          },
          "elapsedMs": {
            "type": "integer",
            "minimum": 0
          },
          "cacheEntryCount": {
            "type": "integer",
            "minimum": 0
          },
          "cacheDigest": {
            "type": [
              "string",
              "null"
            ]
          },
          "budgets": {
            "type": "object"
          },
          "secretsRedacted": {
            "const": true
          }
        }
      },
      "status": {
        "const": "COMPLETED"
      },
      "authority": {
        "type": "object"
      },
      "computationDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      }
    }
  },
  "terminal-semantic-closure-v1": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://evopilot.dev/schemas/terminal-semantic-closure-v1.schema.json",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "schema",
      "apiVersion",
      "kind",
      "version",
      "status",
      "snapshot",
      "reasoningProfile",
      "semanticIndex",
      "graphIndex",
      "projectionSet",
      "roundTripReport",
      "harnessAssets",
      "dependencyLocks",
      "evaluations",
      "rollbackLinks",
      "provenance",
      "publication",
      "authority",
      "closureDigest"
    ],
    "properties": {
      "schema": {
        "const": "evopilot-harness-terminal-semantic-closure/v1"
      },
      "apiVersion": {
        "const": "semantics.evopilot.io/v1"
      },
      "kind": {
        "const": "TerminalSemanticClosure"
      },
      "version": {
        "const": "4.8.0"
      },
      "status": {
        "enum": [
          "CANDIDATE",
          "PUBLISHED"
        ]
      },
      "snapshot": {
        "type": "object"
      },
      "reasoningProfile": {
        "type": "object"
      },
      "semanticIndex": {
        "type": "object"
      },
      "graphIndex": {
        "type": "object"
      },
      "projectionSet": {
        "type": "object"
      },
      "roundTripReport": {
        "type": "object"
      },
      "harnessAssets": {
        "type": "array",
        "minItems": 3,
        "items": {
          "type": "object"
        }
      },
      "dependencyLocks": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object"
        }
      },
      "evaluations": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object"
        }
      },
      "rollbackLinks": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object"
        }
      },
      "provenance": {
        "type": "object"
      },
      "publication": {
        "type": [
          "object",
          "null"
        ]
      },
      "authority": {
        "type": "object",
        "required": [
          "immutable",
          "consumerReadOnly",
          "liveMutableHarnessDependency",
          "grantsConsumerMutation",
          "grantsConsumerApproval",
          "grantsConsumerPublication",
          "grantsReleaseAuthority"
        ],
        "properties": {
          "immutable": {
            "const": true
          },
          "consumerReadOnly": {
            "const": true
          },
          "liveMutableHarnessDependency": {
            "const": false
          },
          "grantsConsumerMutation": {
            "const": false
          },
          "grantsConsumerApproval": {
            "const": false
          },
          "grantsConsumerPublication": {
            "const": false
          },
          "grantsReleaseAuthority": {
            "const": false
          }
        }
      },
      "closureDigest": {
        "type": "string",
        "pattern": "^sha256:[a-f0-9]{64}$"
      }
    }
  }
};
