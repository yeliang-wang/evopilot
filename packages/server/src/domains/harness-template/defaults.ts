import { hydrateHarnessTemplate } from "./template.js";
import type {
  HarnessCapabilityDefinition,
  HarnessTemplateMaturityPhase,
  HarnessTemplateProfile,
  HarnessTemplateSourceReference
} from "./types.js";

export function defaultHarnessTemplates(): HarnessTemplateProfile[] {
  return builtInHarnessTemplateInputs().map(hydrateHarnessTemplate);
}

const BUILT_IN_HARNESS_TEMPLATE_VERSION = "1.1.0";
const BUILT_IN_HARNESS_TEMPLATE_UPDATED_AT = "2026-07-31T06:00:00.000Z";

function builtInHarnessTemplateInputs(): Array<Omit<HarnessTemplateProfile, "digest"> & { digest?: string }> {
  const createdAt = "2026-07-31T00:00:00.000Z";
  return [
    builtInHarnessTemplate({
      id: "python-enterprise-harness",
      name: "Python Enterprise Harness",
      description: "Platform baseline for enterprise Python projects: capability boundaries, validation, evidence, diagnostics, observability, failure handling, and release governance.",
      languageFamily: "python",
      runtimeCapability: {
        id: "python-runtime",
        name: "Python runtime harness",
        boundary: "Install, lint, type, unit, smoke, package, and service readiness commands are declared by the project profile.",
        requiredEvidence: ["install-output", "lint-output", "typecheck-output", "unit-output", "smoke-output"]
      },
      runtimePatterns: {
        language: "python",
        packageManagers: ["uv", "pip", "poetry"],
        architectureStyles: ["ddd-application-service", "api-service", "async-worker"],
        defaultCommands: {
          install: ["uv sync", "pip install -e ."],
          lint: ["ruff check ."],
          typecheck: ["mypy ."],
          unit: ["pytest"],
          smoke: ["pytest -q tests"]
        },
        exceptionTracking: {
          handlers: ["FastAPI exception handlers", "ASGI middleware", "domain exception mapper"],
          requiredErrorEnvelope: ["errorCode", "message", "requestId", "traceId", "retryable", "userAction", "supportReference"],
          exceptionAttributes: ["exception.type", "exception.message", "exception.stacktrace", "http.route", "tenant.id", "actor.id"],
          regressionTests: ["pytest exception mapping", "pytest dependency timeout", "pytest permission denial", "pytest validation error"]
        },
        observability: {
          instrumentation: ["opentelemetry-instrumentation-fastapi", "OpenTelemetry SDK", "Prometheus-compatible metrics"],
          logs: ["structlog-or-json-logging", "requestId", "traceId", "spanId", "tenantId", "workspaceId", "errorCode"],
          metrics: ["http.server.duration", "http.server.request.count", "python.gc", "db.client.duration", "worker.job.duration"],
          traces: ["ASGI inbound request", "dependency call", "database query", "background task", "external API call"],
          alerts: ["high_error_rate", "p95_latency_slo_breach", "dependency_timeout_spike", "worker_failure_rate"]
        },
        diagnostics: {
          commands: ["python --version", "uv pip freeze || pip freeze", "pytest -q --maxfail=1", "ruff check .", "mypy ."],
          artifacts: ["pytest-report", "coverage-report", "openapi-schema", "dependency-lock", "runtime-log-sample"]
        },
        service: {
          healthPath: "/health",
          readinessTimeoutSeconds: 60
        }
      },
      validationBaseline: {
        requiredCommandGroups: ["install", "lint", "typecheck", "unit", "smoke"],
        contractChecks: ["openapi-or-interface-contract", "repository-boundary", "dependency-lock"],
        coverageExpectation: "project-profile-defined",
        commandEvidenceRequired: true,
        realBoundaryEvidenceRequired: true,
        noMockEvidenceForReleaseClaims: true
      },
      phaseMapping: {
        alpha: ["source-boundary", "python-runtime", "exception-tracking", "failure-diagnostics"],
        beta: ["test-and-quality", "observability", "exception-tracking", "slo-monitoring", "failure-diagnostics"],
        rc: ["observability", "slo-monitoring", "operational-runbooks", "release-governance", "test-and-quality"],
        ga: ["release-governance", "observability", "slo-monitoring", "operational-runbooks", "source-boundary"]
      },
      sourceReferences: [
        referenceSource("FastAPI", "https://github.com/fastapi/fastapi", "github", "Python API service conventions, OpenAPI ergonomics, dependency injection, validation, and testable service boundaries."),
        referenceSource("FastAPI Full Stack Template", "https://github.com/fastapi/full-stack-fastapi-template", "github", "Python web application project layout, test/runtime defaults, and operational service assumptions."),
        referenceSource("OpenTelemetry FastAPI instrumentation", "https://github.com/open-telemetry/opentelemetry-python-contrib/tree/main/instrumentation/opentelemetry-instrumentation-fastapi", "github", "Automatic and manual FastAPI HTTP request instrumentation for traces, metrics, and log correlation."),
        referenceSource("Sentry", "https://github.com/getsentry/sentry", "github", "Developer-focused error tracking, issue grouping, stack traces, breadcrumbs, release health, and performance diagnostics."),
        referenceSource("Enterprise Python service practice", undefined, "engineering-practice", "Typed runtime commands, dependency locks, command evidence, error classification, and health/readiness controls.")
      ],
      changelogSummary: "Initial Python enterprise harness template.",
      createdAt
    }),
    builtInHarnessTemplate({
      id: "java-ddd-service-harness",
      name: "Java DDD Service Harness",
      description: "Platform baseline for Java services that need tactical DDD, layered modules, API contracts, integration tests, diagnostics, and release governance.",
      languageFamily: "java",
      runtimeCapability: {
        id: "java-runtime",
        name: "Java runtime harness",
        boundary: "Build, static analysis, unit, integration, contract, package, and JVM service readiness commands are explicit.",
        requiredEvidence: ["build-output", "unit-output", "integration-output", "contract-output", "jvm-runtime-log"]
      },
      extraCapabilities: [
        {
          id: "ddd-boundaries",
          name: "DDD module boundaries",
          boundary: "Domain, application, infrastructure, and interface adapters remain explicit; aggregate and repository contracts are reviewable.",
          requiredEvidence: ["module-boundary-report", "aggregate-contract", "repository-contract"]
        }
      ],
      runtimePatterns: {
        language: "java",
        buildTools: ["maven", "gradle"],
        architectureStyles: ["tactical-ddd", "hexagonal", "spring-boot-service"],
        defaultCommands: {
          install: ["./mvnw -q -DskipTests package", "./gradlew assemble"],
          lint: ["./mvnw -q checkstyle:check", "./gradlew check"],
          typecheck: ["./mvnw -q -DskipTests compile", "./gradlew classes"],
          unit: ["./mvnw test", "./gradlew test"],
          smoke: ["./mvnw verify", "./gradlew integrationTest"]
        },
        exceptionTracking: {
          handlers: ["Spring @ControllerAdvice", "domain exception hierarchy", "problem-details response mapper"],
          requiredErrorEnvelope: ["errorCode", "message", "requestId", "traceId", "retryable", "domainAggregate", "supportReference"],
          exceptionAttributes: ["exception.type", "exception.message", "exception.stacktrace", "http.route", "jvm.thread", "tenant.id"],
          regressionTests: ["controller advice contract", "aggregate invariant failure", "repository timeout", "permission denial"]
        },
        observability: {
          instrumentation: ["Spring Boot Actuator", "Micrometer", "OpenTelemetry Java instrumentation", "Prometheus registry"],
          logs: ["MDC requestId", "traceId", "spanId", "tenantId", "workspaceId", "aggregateId", "errorCode"],
          metrics: ["http.server.requests", "jvm.memory.used", "jvm.threads.live", "jdbc.connections.active", "executor.completed"],
          traces: ["controller", "application service", "repository", "transaction boundary", "outbound HTTP"],
          alerts: ["actuator_health_down", "jvm_memory_pressure", "jdbc_pool_exhaustion", "p95_latency_slo_breach"]
        },
        diagnostics: {
          commands: ["java -version", "./mvnw -q -DskipTests compile || ./gradlew classes", "./mvnw test || ./gradlew test", "jcmd <pid> Thread.print", "jcmd <pid> GC.heap_info"],
          artifacts: ["surefire-report", "jacoco-report", "actuator-health", "actuator-prometheus-sample", "jvm-thread-dump"]
        },
        service: {
          healthPath: "/actuator/health",
          readinessTimeoutSeconds: 90
        }
      },
      validationBaseline: {
        requiredCommandGroups: ["install", "lint", "typecheck", "unit", "smoke"],
        requiredBoundaries: ["domain", "application", "infrastructure", "interfaces"],
        contractChecks: ["openapi", "repository-contract", "aggregate-invariant"],
        commandEvidenceRequired: true,
        realBoundaryEvidenceRequired: true,
        noMockEvidenceForReleaseClaims: true
      },
      phaseMapping: {
        alpha: ["source-boundary", "java-runtime", "ddd-boundaries", "exception-tracking", "failure-diagnostics"],
        beta: ["test-and-quality", "ddd-boundaries", "observability", "exception-tracking", "slo-monitoring"],
        rc: ["observability", "slo-monitoring", "operational-runbooks", "release-governance", "test-and-quality"],
        ga: ["release-governance", "observability", "slo-monitoring", "operational-runbooks", "source-boundary"]
      },
      sourceReferences: [
        referenceSource("Spring Boot", "https://github.com/spring-projects/spring-boot", "github", "Java service runtime conventions, actuator-style health/readiness, build/test lifecycle, and application packaging."),
        referenceSource("Microsoft tactical DDD guidance", "https://learn.microsoft.com/en-us/azure/architecture/microservices/model/tactical-domain-driven-design", "official-doc", "Aggregate, entity, value object, repository, and domain service concepts for tactical service design."),
        referenceSource("Micrometer", "https://github.com/micrometer-metrics/micrometer", "github", "Java metrics facade used by Spring Boot for dimensional metrics, Prometheus export, and observability correlation."),
        referenceSource("OpenTelemetry Java instrumentation", "https://github.com/open-telemetry/opentelemetry-java-instrumentation", "github", "Java auto-instrumentation for HTTP, JDBC, messaging, JVM, and framework telemetry."),
        referenceSource("Enterprise Java service practice", undefined, "engineering-practice", "Layered boundaries, contract tests, integration tests, dependency governance, JVM diagnostics, and release gates.")
      ],
      changelogSummary: "Initial Java DDD service harness template.",
      createdAt
    }),
    builtInHarnessTemplate({
      id: "node-saas-control-plane-harness",
      name: "Node SaaS Control Plane Harness",
      description: "Platform baseline for Node.js SaaS control planes: tenancy, workspace scope, RBAC, API contracts, queues, audit, observability, and release governance.",
      languageFamily: "node",
      runtimeCapability: {
        id: "node-runtime",
        name: "Node runtime harness",
        boundary: "Install, lint, type, unit, API, worker, build, and service readiness commands are declared before execution.",
        requiredEvidence: ["install-output", "lint-output", "typecheck-output", "unit-output", "api-contract-output", "worker-output"]
      },
      extraCapabilities: [
        {
          id: "saas-control-plane",
          name: "SaaS control-plane boundaries",
          boundary: "Tenant, workspace, RBAC, quota, audit, API, queue, and background worker contracts are explicit and evidence-backed.",
          requiredEvidence: ["tenant-scope-test", "rbac-test", "audit-event", "queue-worker-proof"]
        }
      ],
      runtimePatterns: {
        language: "node",
        packageManagers: ["npm", "pnpm", "yarn"],
        architectureStyles: ["saas-control-plane", "api-worker", "evented-backend"],
        defaultCommands: {
          install: ["npm ci"],
          lint: ["npm run lint --if-present"],
          typecheck: ["npm run typecheck --if-present", "npm run build"],
          unit: ["npm test"],
          smoke: ["npm run smoke --if-present"],
          functional: ["npm run test:functional --if-present"]
        },
        exceptionTracking: {
          handlers: ["NestJS exception filter", "Express error middleware", "worker dead-letter handler", "AsyncLocalStorage context"],
          requiredErrorEnvelope: ["errorCode", "message", "requestId", "traceId", "retryable", "tenantId", "supportReference"],
          exceptionAttributes: ["exception.type", "exception.message", "exception.stacktrace", "http.route", "messaging.destination", "tenant.id"],
          regressionTests: ["global exception filter", "RBAC denial", "tenant isolation violation", "queue poison message"]
        },
        observability: {
          instrumentation: ["OpenTelemetry JS", "NestJS/Express instrumentation", "pino-or-winston JSON logs", "Prometheus metrics"],
          logs: ["requestId", "traceId", "spanId", "tenantId", "workspaceId", "actorId", "errorCode", "workerId"],
          metrics: ["http.server.duration", "nodejs.eventloop.lag", "queue.lag", "worker.job.duration", "db.client.duration"],
          traces: ["controller", "guard", "service", "repository", "queue publish", "queue consume", "outbound HTTP"],
          alerts: ["tenant_error_budget_burn", "queue_backlog", "event_loop_lag_high", "worker_failure_rate"]
        },
        diagnostics: {
          commands: ["node --version", "npm --version", "npm run build --if-present", "npm test -- --runInBand", "npm run test:functional --if-present"],
          artifacts: ["jest-report", "openapi-schema", "rbac-matrix", "audit-event-sample", "worker-log-sample"]
        },
        service: {
          healthPath: "/health",
          readinessTimeoutSeconds: 60
        }
      },
      validationBaseline: {
        requiredCommandGroups: ["install", "lint", "typecheck", "unit", "smoke"],
        requiredBoundaries: ["tenant", "workspace", "rbac", "audit", "api", "worker"],
        contractChecks: ["openapi", "rbac-matrix", "tenant-isolation", "idempotency"],
        commandEvidenceRequired: true,
        realBoundaryEvidenceRequired: true,
        noMockEvidenceForReleaseClaims: true
      },
      phaseMapping: {
        alpha: ["source-boundary", "node-runtime", "saas-control-plane", "exception-tracking", "failure-diagnostics"],
        beta: ["test-and-quality", "observability", "saas-control-plane", "exception-tracking", "slo-monitoring"],
        rc: ["observability", "slo-monitoring", "operational-runbooks", "release-governance", "test-and-quality"],
        ga: ["release-governance", "observability", "slo-monitoring", "operational-runbooks", "source-boundary"]
      },
      sourceReferences: [
        referenceSource("EvoPilot SaaS control-plane practice", undefined, "engineering-practice", "Tenant/workspace/RBAC/audit/queue/release-governance controls already used by EvoPilot production flows."),
        referenceSource("NestJS exception filters", "https://docs.nestjs.com/exception-filters", "official-doc", "Global exception filtering and user-friendly error response contracts for Node/NestJS services."),
        referenceSource("OpenTelemetry JS Contrib", "https://github.com/open-telemetry/opentelemetry-js-contrib", "github", "Node.js framework instrumentation for HTTP, Express, NestJS, database, and messaging telemetry."),
        referenceSource("Sentry JavaScript", "https://github.com/getsentry/sentry-javascript", "github", "JavaScript error tracking, performance tracing, release health, breadcrumbs, and source-map backed diagnostics."),
        referenceSource("Node.js service ecosystem practice", undefined, "engineering-practice", "Scriptable build/test/lint/typecheck lifecycle, API contracts, and worker runtime diagnostics."),
        referenceSource("OpenTelemetry Specification", "https://github.com/open-telemetry/opentelemetry-specification", "github", "Telemetry signal model for traces, metrics, logs, baggage, and context propagation.")
      ],
      changelogSummary: "Initial Node SaaS control-plane harness template.",
      createdAt
    }),
    builtInHarnessTemplate({
      id: "go-middleware-harness",
      name: "Go Middleware Harness",
      description: "Platform baseline for Go middleware and infrastructure services: explicit APIs, concurrency, reliability, metrics, health, performance, and release governance.",
      languageFamily: "go",
      runtimeCapability: {
        id: "go-runtime",
        name: "Go runtime harness",
        boundary: "Module download, fmt, vet, unit, race, integration, benchmark, build, and service readiness commands are explicit.",
        requiredEvidence: ["mod-download-output", "fmt-output", "vet-output", "unit-output", "race-output", "build-output"]
      },
      extraCapabilities: [
        {
          id: "middleware-reliability",
          name: "Middleware reliability boundary",
          boundary: "Concurrency, idempotency, backpressure, config reload, storage/network dependency, and SLO behaviors are observable.",
          requiredEvidence: ["race-test", "load-or-benchmark-proof", "slo-metric", "dependency-failure-proof"]
        }
      ],
      runtimePatterns: {
        language: "go",
        packageManagers: ["go modules"],
        architectureStyles: ["middleware", "control-loop", "infrastructure-service"],
        defaultCommands: {
          install: ["go mod download"],
          lint: ["gofmt -w .", "go vet ./..."],
          typecheck: ["go test ./... -run TestNonExistent"],
          unit: ["go test ./..."],
          smoke: ["go test ./... -race"],
          functional: ["go test ./... -run Integration"]
        },
        exceptionTracking: {
          handlers: ["panic recovery middleware", "context cancellation classifier", "dependency error wrapper", "controller reconcile error policy"],
          requiredErrorEnvelope: ["errorCode", "message", "requestId", "traceId", "retryable", "component", "supportReference"],
          exceptionAttributes: ["exception.type", "exception.message", "exception.stacktrace", "go.package", "goroutine.id", "tenant.id"],
          regressionTests: ["panic recovery", "context deadline exceeded", "race detection", "backpressure behavior"]
        },
        observability: {
          instrumentation: ["OpenTelemetry Go", "Prometheus client_golang", "net/http/pprof", "structured logr/klog"],
          logs: ["requestId", "traceId", "spanId", "component", "controller", "resource", "namespace", "errorCode"],
          metrics: ["http.server.duration", "go.goroutines", "process.cpu.seconds", "queue.depth", "reconcile.duration", "dependency.latency"],
          traces: ["HTTP handler", "controller reconcile", "storage call", "network dependency", "queue worker"],
          alerts: ["goroutine_leak", "race_or_deadlock_signal", "dependency_error_rate", "controller_reconcile_backlog"]
        },
        diagnostics: {
          commands: ["go version", "go env", "go test ./... -race", "go test ./... -bench . -run TestNonExistent", "curl -s http://localhost:6060/debug/pprof/goroutine?debug=1"],
          artifacts: ["race-output", "benchmark-output", "pprof-goroutine", "pprof-heap", "metric-sample"]
        },
        service: {
          healthPath: "/healthz",
          readinessTimeoutSeconds: 60
        }
      },
      validationBaseline: {
        requiredCommandGroups: ["install", "lint", "typecheck", "unit", "smoke"],
        requiredBoundaries: ["api", "concurrency", "storage", "network", "config", "observability"],
        contractChecks: ["api-compatibility", "race-safety", "metric-contract", "dependency-failure-mode"],
        commandEvidenceRequired: true,
        realBoundaryEvidenceRequired: true,
        noMockEvidenceForReleaseClaims: true
      },
      phaseMapping: {
        alpha: ["source-boundary", "go-runtime", "middleware-reliability", "exception-tracking", "failure-diagnostics"],
        beta: ["test-and-quality", "middleware-reliability", "observability", "exception-tracking", "slo-monitoring"],
        rc: ["observability", "slo-monitoring", "operational-runbooks", "release-governance", "test-and-quality"],
        ga: ["release-governance", "observability", "slo-monitoring", "operational-runbooks", "source-boundary"]
      },
      sourceReferences: [
        referenceSource("Kubernetes", "https://github.com/kubernetes/kubernetes", "github", "Go control-loop, API, health, config, controller, and reliability patterns for infrastructure software."),
        referenceSource("Prometheus", "https://github.com/prometheus/prometheus", "github", "Go monitoring/middleware service practices, metrics, reliability, storage, and operational evidence."),
        referenceSource("Prometheus Go client", "https://github.com/prometheus/client_golang", "github", "Go metrics instrumentation, collectors, labels, and Prometheus exposition conventions."),
        referenceSource("OpenTelemetry Go", "https://github.com/open-telemetry/opentelemetry-go", "github", "Go tracing, metrics, baggage, context propagation, and semantic convention APIs."),
        referenceSource("Kubernetes contextual logging", "https://kubernetes.io/blog/2022/05/25/contextual-logging/", "official-doc", "Go contextual structured logging patterns for controller and infrastructure components."),
        referenceSource("Infrastructure middleware practice", undefined, "engineering-practice", "Concurrency, race detection, config reload, backpressure, and SLO-oriented release gates.")
      ],
      changelogSummary: "Initial Go middleware harness template.",
      createdAt
    }),
    builtInHarnessTemplate({
      id: "observability-apm-harness",
      name: "Observability APM Harness",
      description: "Platform baseline for observability and APM systems: telemetry signal contracts, instrumentation, ingestion, query, storage, alerting, and production diagnostics.",
      languageFamily: "generic",
      runtimeCapability: {
        id: "telemetry-runtime",
        name: "Telemetry runtime harness",
        boundary: "Telemetry ingestion, storage, query, UI/API, alert, and collector/agent commands are declared by the project profile.",
        requiredEvidence: ["collector-output", "ingestion-proof", "query-proof", "alert-proof", "storage-proof"]
      },
      extraCapabilities: [
        {
          id: "telemetry-signal-contract",
          name: "Telemetry signal contract",
          boundary: "Trace, metric, log, context, resource, sampling, cardinality, and retention behaviors are explicit.",
          requiredEvidence: ["trace-sample", "metric-sample", "log-sample", "cardinality-review", "retention-policy"]
        }
      ],
      runtimePatterns: {
        language: "generic",
        architectureStyles: ["apm", "observability-platform", "collector-pipeline"],
        defaultCommands: {
          install: ["make deps", "npm ci", "go mod download"],
          lint: ["make lint"],
          typecheck: ["make build"],
          unit: ["make test"],
          smoke: ["make smoke"],
          functional: ["make e2e"]
        },
        telemetryContracts: {
          signals: ["traces", "metrics", "logs", "profiles", "events"],
          schemaCompatibility: ["OpenTelemetry semantic conventions", "collector pipeline contracts", "query API compatibility"],
          cardinalityControls: ["bounded labels", "tenant cardinality budget", "attribute allowlist", "high-cardinality detection"],
          retentionControls: ["hot retention", "cold retention", "downsampling", "delete/export policy"]
        },
        exceptionTracking: {
          handlers: ["collector receiver error", "processor/exporter error", "query API error", "storage timeout", "alert route failure"],
          requiredErrorEnvelope: ["errorCode", "component", "pipeline", "signal", "tenantId", "traceId", "retryable", "droppedCount"],
          exceptionAttributes: ["exception.type", "exception.message", "exception.stacktrace", "otel.signal", "otel.pipeline", "storage.backend"],
          regressionTests: ["collector malformed payload", "storage unavailable", "query timeout", "alert delivery failure"]
        },
        observability: {
          instrumentation: ["OpenTelemetry Collector", "SkyWalking", "Prometheus", "Grafana/Loki/Tempo/Mimir-style signal split"],
          logs: ["traceId", "spanId", "service.name", "pipeline", "signal", "tenantId", "errorCode", "droppedCount"],
          metrics: ["ingestion_rate", "dropped_spans", "dropped_logs", "query_latency", "storage_latency", "alert_delivery_latency"],
          traces: ["collector receive", "processor", "exporter", "query", "storage", "alert"],
          alerts: ["telemetry_drop_rate_high", "collector_queue_backlog", "query_p95_latency", "storage_error_rate", "cardinality_budget_breach"]
        },
        diagnostics: {
          commands: ["make status", "make smoke", "make e2e", "promtool check rules alerts.yml", "otelcol validate --config config.yaml"],
          artifacts: ["trace-sample", "metric-sample", "log-sample", "profile-sample", "alert-sample", "dashboard-json"]
        },
        service: {
          healthPath: "/health",
          readinessTimeoutSeconds: 120
        }
      },
      validationBaseline: {
        requiredCommandGroups: ["install", "lint", "typecheck", "unit", "smoke"],
        requiredBoundaries: ["collector", "ingestion", "storage", "query", "alerting", "ui-api"],
        contractChecks: ["trace-contract", "metric-contract", "log-contract", "apm-query-contract", "retention"],
        commandEvidenceRequired: true,
        realBoundaryEvidenceRequired: true,
        noMockEvidenceForReleaseClaims: true
      },
      phaseMapping: {
        alpha: ["source-boundary", "telemetry-runtime", "telemetry-signal-contract", "exception-tracking", "failure-diagnostics"],
        beta: ["test-and-quality", "observability", "telemetry-signal-contract", "exception-tracking", "slo-monitoring"],
        rc: ["observability", "slo-monitoring", "operational-runbooks", "release-governance", "test-and-quality"],
        ga: ["release-governance", "observability", "slo-monitoring", "operational-runbooks", "source-boundary"]
      },
      sourceReferences: [
        referenceSource("OpenTelemetry Specification", "https://github.com/open-telemetry/opentelemetry-specification", "github", "Telemetry signal definitions for traces, metrics, logs, baggage, resources, and context propagation."),
        referenceSource("Apache SkyWalking", "https://github.com/apache/skywalking", "github", "APM-oriented service topology, trace/metric/log analysis, storage, query, and UI operating concerns."),
        referenceSource("Prometheus", "https://github.com/prometheus/prometheus", "github", "Metrics, alerting, query, scrape, and time-series operational model."),
        referenceSource("OpenTelemetry Collector", "https://github.com/open-telemetry/opentelemetry-collector", "github", "Collector receiver, processor, exporter, pipeline, and reliability contracts."),
        referenceSource("Kubernetes monitoring mixin", "https://github.com/kubernetes-monitoring/kubernetes-mixin", "github", "Dashboards, Prometheus alerts, and runbook-oriented operational evidence for Kubernetes platforms."),
        referenceSource("Grafana LGTM practice", "https://grafana.com/events/observabilitycon/2022/lgtm-scale-observability-with-mimir-loki-and-tempo/", "official-doc", "Separate but correlated logs, metrics, traces, and profiles through scalable observability backends.")
      ],
      changelogSummary: "Initial observability and APM harness template.",
      createdAt
    }),
    builtInHarnessTemplate({
      id: "generic-management-software-harness",
      name: "Generic Management Software Harness",
      description: "Platform baseline for enterprise management software: users, roles, workflow, audit, reporting, integrations, imports/exports, operations, and release governance.",
      languageFamily: "generic",
      runtimeCapability: {
        id: "management-runtime",
        name: "Management software runtime harness",
        boundary: "API/UI/backend job/runtime commands are declared, with user workflow, audit, import/export, and report evidence.",
        requiredEvidence: ["api-output", "workflow-proof", "audit-proof", "report-proof", "integration-proof"]
      },
      extraCapabilities: [
        {
          id: "business-workflow-boundary",
          name: "Business workflow boundary",
          boundary: "Core business workflows, RBAC, approval, data import/export, reports, and external integrations are explicit.",
          requiredEvidence: ["workflow-case", "rbac-case", "approval-case", "import-export-case", "integration-case"]
        }
      ],
      runtimePatterns: {
        language: "generic",
        architectureStyles: ["management-software", "workflow-system", "enterprise-admin"],
        defaultCommands: {
          install: ["make install", "npm ci", "uv sync"],
          lint: ["make lint"],
          typecheck: ["make build"],
          unit: ["make test"],
          smoke: ["make smoke"],
          functional: ["make test:functional"]
        },
        businessControls: {
          permissionModel: ["role permission matrix", "record-level rules", "field-level permission", "segregation of duties", "maker-checker"],
          workflowModel: ["state machine", "approval transition", "cancel/amend", "reopen", "delegation"],
          dataMovement: ["import validation", "export authorization", "bulk operation audit", "report reconciliation"],
          auditModel: ["who", "what", "when", "where", "before", "after", "reason", "approvalReference"]
        },
        exceptionTracking: {
          handlers: ["business rule violation", "permission denial", "workflow transition denial", "import row failure", "report reconciliation failure"],
          requiredErrorEnvelope: ["errorCode", "businessObject", "recordId", "actorId", "tenantId", "traceId", "userAction", "supportReference"],
          exceptionAttributes: ["exception.type", "exception.message", "business.workflow.state", "permission.rule", "record.id", "tenant.id"],
          regressionTests: ["RBAC denial", "record rule isolation", "approval transition failure", "import partial failure", "report mismatch"]
        },
        observability: {
          instrumentation: ["structured audit log", "business event log", "OpenTelemetry service telemetry", "report reconciliation metrics"],
          logs: ["tenantId", "workspaceId", "actorId", "role", "businessObject", "recordId", "workflowState", "errorCode"],
          metrics: ["workflow_transition_count", "approval_latency", "import_failure_rate", "report_reconciliation_delta", "permission_denial_count"],
          traces: ["API request", "permission check", "workflow transition", "report query", "import/export job"],
          alerts: ["approval_backlog", "audit_gap_detected", "report_reconciliation_failure", "permission_denial_spike", "import_failure_spike"]
        },
        diagnostics: {
          commands: ["make smoke", "make test:functional", "make audit-check", "make report-reconcile", "make rbac-test"],
          artifacts: ["rbac-matrix", "workflow-state-machine", "audit-event-sample", "report-reconciliation", "import-export-proof"]
        },
        service: {
          healthPath: "/health",
          readinessTimeoutSeconds: 90
        }
      },
      validationBaseline: {
        requiredCommandGroups: ["install", "lint", "typecheck", "unit", "smoke"],
        requiredBoundaries: ["rbac", "workflow", "audit", "reporting", "integration", "data-import-export"],
        contractChecks: ["api-contract", "rbac-matrix", "workflow-state-machine", "audit-trail", "report-reconciliation"],
        commandEvidenceRequired: true,
        realBoundaryEvidenceRequired: true,
        noMockEvidenceForReleaseClaims: true
      },
      phaseMapping: {
        alpha: ["source-boundary", "management-runtime", "business-workflow-boundary", "exception-tracking", "failure-diagnostics"],
        beta: ["test-and-quality", "business-workflow-boundary", "observability", "exception-tracking", "slo-monitoring"],
        rc: ["observability", "slo-monitoring", "operational-runbooks", "release-governance", "test-and-quality"],
        ga: ["release-governance", "observability", "slo-monitoring", "operational-runbooks", "source-boundary"]
      },
      sourceReferences: [
        referenceSource("Enterprise management software practice", undefined, "engineering-practice", "RBAC, approval, workflow, audit, reporting, import/export, integration, and operator diagnostics."),
        referenceSource("Microsoft tactical DDD guidance", "https://learn.microsoft.com/en-us/azure/architecture/microservices/model/tactical-domain-driven-design", "official-doc", "Domain modeling, aggregate boundaries, repositories, and business invariant framing."),
        referenceSource("ERPNext role-based permissions", "https://docs.frappe.io/erpnext/role-based-permissions", "official-doc", "Role, document, field, workflow, and permission-level controls for enterprise management software."),
        referenceSource("Frappe audit trail", "https://docs.frappe.io/framework/user/en/audit-trail", "official-doc", "Document change tracking and audit trail concepts for submitted/amended business records."),
        referenceSource("Odoo access rights", "https://www.odoo.com/documentation/19.0/applications/general/users/access_rights.html", "official-doc", "Access rights and record-rule patterns for role and record-level business permissions."),
        referenceSource("OpenTelemetry Specification", "https://github.com/open-telemetry/opentelemetry-specification", "github", "Logs, metrics, traces, and context fields for operator troubleshooting.")
      ],
      changelogSummary: "Initial generic management software harness template.",
      createdAt
    })
  ];
}

function builtInHarnessTemplate(input: {
  id: string;
  name: string;
  description: string;
  languageFamily: HarnessTemplateProfile["languageFamily"];
  runtimeCapability: HarnessCapabilityDefinition;
  extraCapabilities?: HarnessCapabilityDefinition[];
  runtimePatterns: Record<string, unknown>;
  validationBaseline: Record<string, unknown>;
  phaseMapping: Record<HarnessTemplateMaturityPhase, string[]>;
  sourceReferences: HarnessTemplateSourceReference[];
  changelogSummary: string;
  createdAt: string;
}): Omit<HarnessTemplateProfile, "digest"> & { digest?: string } {
  const capabilities: HarnessCapabilityDefinition[] = [
    {
      id: "source-boundary",
      name: "Source and workspace boundary",
      boundary: "Project source, credentials, tenant, workspace, branch, writeback, and read-only mode are explicit before execution.",
      requiredEvidence: ["project-registration", "source-readiness-preflight", "credential-or-read-only-boundary"]
    },
    input.runtimeCapability,
    ...(input.extraCapabilities ?? []),
    {
      id: "exception-tracking",
      name: "Exception and error tracking",
      boundary: "Runtime exceptions, domain errors, dependency failures, retries, user-facing errors, and incident ownership are classified and correlated with logs, traces, releases, and repair evidence.",
      requiredEvidence: ["error-code-contract", "exception-sample", "trace-link", "owner-next-action", "repair-verification"]
    },
    {
      id: "test-and-quality",
      name: "Test and quality gates",
      boundary: "GoalTargets must prove tests, coverage expectations, interface contracts, and regression scope through command evidence.",
      requiredEvidence: ["test-report", "coverage-or-risk-acceptance", "contract-check"]
    },
    {
      id: "failure-diagnostics",
      name: "Failure diagnostics",
      boundary: "Failures are classified with command, stack trace, logs, suspected root cause, owner, next action, and verification plan.",
      requiredEvidence: ["failure-classification", "root-cause-note", "repair-verification"]
    },
    {
      id: "observability",
      name: "Observability",
      boundary: "Runtime health, readiness, logs, metrics, traces, APM signals, and alert routes are bound before Beta/RC/GA claims.",
      requiredEvidence: ["health-check", "runtime-log", "metric-or-trace-proof", "alert-route"]
    },
    {
      id: "slo-monitoring",
      name: "SLO monitoring and alert routing",
      boundary: "Service-level indicators, error budgets, dashboards, alert thresholds, paging routes, runbooks, and release regression windows are explicit before RC/GA claims.",
      requiredEvidence: ["sli-definition", "slo-dashboard", "alert-rule", "runbook-link", "error-budget-status"]
    },
    {
      id: "operational-runbooks",
      name: "Operational runbooks",
      boundary: "Every critical failure mode has a symptom-first runbook with triage queries, rollback/mitigation options, escalation owner, and verification commands.",
      requiredEvidence: ["runbook", "triage-query", "rollback-or-mitigation", "oncall-owner", "post-repair-verification"]
    },
    {
      id: "release-governance",
      name: "Release governance",
      boundary: "TargetEvidencePackage, PhasePackage, source closure, release evidence, and product-native ReleaseDecision are required before GA.",
      requiredEvidence: ["target-evidence-package", "phase-package", "source-closure", "release-decision"]
    }
  ];
  return {
    schema: "evopilot-harness-template/v1",
    id: input.id,
    version: BUILT_IN_HARNESS_TEMPLATE_VERSION,
    digest: "",
    name: input.name,
    description: input.description,
    scope: "platform",
    languageFamily: input.languageFamily,
    capabilities,
    runtimePatterns: input.runtimePatterns,
    validationBaseline: input.validationBaseline,
    evidenceContract: defaultHarnessEvidenceContract(),
    failureTaxonomy: defaultHarnessFailureTaxonomy(),
    diagnosticsBaseline: defaultHarnessDiagnosticsBaseline(),
    observabilityBaseline: defaultHarnessObservabilityBaseline(),
    governanceRules: defaultHarnessGovernanceRules(),
    phaseMapping: input.phaseMapping,
    llmDraftPolicy: defaultHarnessLlmDraftPolicy(),
    sourceReferences: input.sourceReferences,
    changelog: [
      {
        version: "1.0.0",
        changedAt: input.createdAt,
        changedBy: "evopilot",
        summary: input.changelogSummary,
        changes: [input.changelogSummary]
      },
      {
        version: BUILT_IN_HARNESS_TEMPLATE_VERSION,
        changedAt: BUILT_IN_HARNESS_TEMPLATE_UPDATED_AT,
        changedBy: "evopilot",
        summary: "Upgrade built-in template to the enterprise harness knowledge baseline.",
        changes: [
          "Add structured observability, exception tracking, SLO monitoring, alert routing, and operational runbook baseline.",
          "Add language or software-type specific telemetry, diagnostics, exception envelope, and evidence rules.",
          "Expand source references to mainstream GitHub projects, official specifications, and enterprise engineering practice."
        ]
      }
    ],
    createdAt: input.createdAt,
    updatedAt: BUILT_IN_HARNESS_TEMPLATE_UPDATED_AT
  };
}

function defaultHarnessEvidenceContract(): Record<string, unknown> {
  return {
    format: "json",
    requiredArtifacts: ["target-evidence-package", "phase-package", "goal-completion-report", "incident-or-failure-report", "observability-snapshot"],
    requiredEvidence: [
      "command",
      "exit-code",
      "stdout-or-log",
      "changed-files",
      "ci-status-or-local-proof",
      "api-or-interface-contract",
      "observability-signal",
      "error-code-contract",
      "trace-or-correlation-link",
      "runbook-or-repair-note"
    ],
    artifactSchemas: {
      targetEvidencePackage: ["targetId", "profileId", "profileVersion", "templateRef", "commands", "artifacts", "observability", "decision"],
      phasePackage: ["phase", "targets", "evidence", "releaseRisk", "decision", "approver"],
      failureReport: ["requestId", "traceId", "symptom", "category", "severity", "rootCauseHypothesis", "owner", "nextAction", "verification"],
      observabilitySnapshot: ["health", "readiness", "logs", "metrics", "traces", "alerts", "dashboardUrls", "capturedAt"]
    },
    correlationFields: ["requestId", "traceId", "spanId", "tenantId", "workspaceId", "projectId", "actor", "environment", "release", "commitSha"],
    telemetryEvidence: {
      logs: ["structured log sample", "redaction proof", "error log sample"],
      metrics: ["SLI sample", "dashboard link", "cardinality review"],
      traces: ["trace link", "span hierarchy", "dependency span"],
      alerts: ["alert rule", "runbook link", "routing target", "silence/escalation policy"]
    },
    redaction: {
      secrets: "required",
      pii: "required",
      tokenFields: ["authorization", "cookie", "apiKey", "token", "password", "secret"],
      evidenceMayContainSyntheticDataOnlyForPrivacy: true
    },
    retention: "control-plane",
    aiRepairRequirements: ["machine-readable failure category", "correlation ids", "changed files", "failing command", "verification command"]
  };
}

function defaultHarnessFailureTaxonomy(): Record<string, unknown> {
  return {
    categories: [
      "business",
      "validation",
      "permission",
      "dependency",
      "environment",
      "syntax",
      "type",
      "test",
      "contract",
      "security",
      "performance",
      "deploy",
      "observability",
      "governance",
      "data",
      "database",
      "queue",
      "external-api",
      "concurrency",
      "resource-saturation",
      "unknown"
    ],
    severityLevels: ["debug", "info", "warn", "error", "critical"],
    classificationMatrix: {
      business: { retryable: false, userVisible: true, requiresOwner: true, requiresAudit: true },
      validation: { retryable: false, userVisible: true, requiresErrorCode: true },
      permission: { retryable: false, userVisible: true, requiresSecurityReview: true },
      dependency: { retryable: true, requiresTimeout: true, requiresCircuitBreakerPosition: true },
      performance: { retryable: "conditional", requiresSloImpact: true, requiresRegressionWindow: true },
      deploy: { retryable: "conditional", requiresRollbackOrForwardFix: true, requiresReleaseEvidence: true },
      observability: { retryable: false, requiresTelemetryGap: true, requiresRunbookUpdate: true },
      unknown: { retryable: false, requiresHumanTriage: true, requiresProfileRevisionSuggestion: true }
    },
    exceptionTracking: {
      requiredAttributes: [
        "exception.type",
        "exception.message",
        "exception.stacktrace",
        "errorCode",
        "requestId",
        "traceId",
        "spanId",
        "tenantId",
        "workspaceId",
        "projectId",
        "actor",
        "release",
        "commitSha",
        "retryable"
      ],
      groupingKeys: ["service", "errorCode", "exception.type", "topStackFrame", "release"],
      mustLinkToTrace: true,
      mustLinkToChangedFilesForLoopFailures: true,
      userVisibleErrorsRequireStableCode: true
    },
    requiresOwner: true,
    requiresNextAction: true,
    requiresReproduction: true,
    incidentRecord: {
      requiredFields: ["symptom", "impact", "firstSeenAt", "lastSeenAt", "scope", "owner", "mitigation", "fix", "verification", "followUp"],
      postIncidentLearningRequiredForRepeatedFailures: true
    }
  };
}

function defaultHarnessDiagnosticsBaseline(): Record<string, unknown> {
  return {
    requiredSignals: [
      "failing-command",
      "exit-code",
      "stack-trace-or-log",
      "changed-files",
      "runtime-env",
      "dependency-lock",
      "request-id",
      "trace-id",
      "release-or-commit",
      "recent-deploy",
      "ci-job-url",
      "health-status",
      "alert-name"
    ],
    rootCauseFields: ["symptom", "hypothesis", "evidence", "fix", "verification", "owner", "risk", "rollbackOrMitigation"],
    triageWorkflow: [
      "Collect requestId/traceId and failing command.",
      "Classify failure category, severity, retryability, and ownership.",
      "Compare changed files, dependency locks, deploy timing, and telemetry deltas.",
      "Identify narrowest reproducible command or API call.",
      "Apply repair or route to owner, then run verification commands and attach evidence."
    ],
    correlationQueries: {
      logs: ["requestId", "traceId", "errorCode", "tenantId", "release"],
      metrics: ["error_rate", "latency_p95", "dependency_error_rate", "queue_lag", "saturation"],
      traces: ["root span", "error span", "slowest span", "dependency span"],
      audit: ["actor", "projectId", "goalId", "loopId", "releaseDecision"]
    },
    runbookRequirements: {
      criticalAlertsRequireRunbook: true,
      runbookFields: ["symptoms", "dashboards", "queries", "mitigation", "rollback", "owner", "verification"],
      aiRepairReadable: true
    },
    evidenceForAiRepair: ["errorCode", "stackOrLogExcerpt", "traceLink", "failingCommand", "changedFiles", "dependencyDelta", "verificationCommand"]
  };
}

function defaultHarnessObservabilityBaseline(): Record<string, unknown> {
  return {
    requiredSignals: ["health", "readiness", "logs", "metrics", "traces", "apm", "alerts", "dashboards", "slo", "runbooks"],
    logLevels: ["debug", "info", "warn", "error"],
    structuredLogs: {
      format: "json",
      requiredFields: [
        "timestamp",
        "level",
        "service",
        "environment",
        "requestId",
        "traceId",
        "spanId",
        "tenantId",
        "workspaceId",
        "projectId",
        "actor",
        "event",
        "errorCode",
        "exceptionClass",
        "rootCauseHint",
        "release",
        "commitSha"
      ],
      redactionRequired: true,
      errorLogsMustIncludeNextAction: true
    },
    metrics: {
      red: ["request_rate", "error_rate", "duration_p50_p95_p99"],
      use: ["cpu_utilization", "memory_utilization", "queue_saturation", "db_pool_saturation"],
      dependency: ["dependency_latency", "dependency_error_rate", "timeout_count", "circuit_breaker_state"],
      business: ["workflow_success_count", "workflow_failure_count", "approval_latency", "import_export_failure_rate"],
      cardinalityControls: ["bounded tenant/workspace labels", "no raw user id in high-volume metrics", "attribute allowlist"]
    },
    traces: {
      requiredSpans: ["inbound request", "authorization", "domain/application service", "database query", "external dependency", "queue publish/consume", "background job"],
      requiredAttributes: ["service.name", "http.route", "error.type", "tenant.id", "workspace.id", "release", "commit.sha"],
      samplingPolicyMustBeDeclared: true,
      spanErrorsMustRecordException: true
    },
    dashboards: {
      required: ["service_health", "api_latency", "error_rate", "dependency_health", "queue_or_worker_health", "release_health"],
      mustLinkFromReleaseEvidence: true
    },
    alerts: {
      required: ["high_error_rate", "latency_slo_breach", "dependency_failure", "queue_or_worker_backlog", "deploy_regression", "health_check_failure"],
      everyCriticalAlertRequires: ["runbook", "owner", "severity", "routingTarget", "sloImpact", "verificationQuery"],
      symptomBasedAlertsPreferred: true
    },
    apm: {
      releaseHealthRequired: true,
      errorGroupingRequired: true,
      slowTransactionSamplesRequired: true,
      deploymentMarkerRequired: true
    },
    slo: {
      sliTypes: ["availability", "latency", "error_rate", "freshness", "job_success"],
      errorBudgetStatusRequiredForRcAndGa: true,
      gaRequiresNoUnownedCriticalAlert: true
    },
    productionHealthRequired: true,
    gaRequiresLiveHealthEvidence: true
  };
}

function defaultHarnessGovernanceRules(): Record<string, unknown> {
  return {
    tenantWorkspaceScopeRequired: true,
    targetPlanRequiresApproval: true,
    profileActivationRequiresApproval: true,
    promotionRequiresReleaseDecision: true,
    sourceClosureRequired: true,
    noSilentProfileMutation: true,
    mandatoryGates: [
      "project-harness-profile-active",
      "target-plan-user-confirmed",
      "target-evidence-package",
      "phase-package",
      "observability-evidence",
      "slo-or-risk-acceptance",
      "source-closure",
      "release-decision"
    ],
    cannotWeaken: ["tenantWorkspaceScopeRequired", "targetPlanRequiresApproval", "profileActivationRequiresApproval", "promotionRequiresReleaseDecision", "sourceClosureRequired", "noSilentProfileMutation"],
    releaseRiskControls: {
      rcRequiresTelemetryEvidence: true,
      gaRequiresLiveHealthEvidence: true,
      gaRequiresRunbooksForCriticalAlerts: true,
      gaRequiresErrorBudgetOrExplicitRiskAcceptance: true,
      repeatedFailureRequiresProfileRevisionSuggestion: true
    },
    auditControls: {
      allProfileChangesAudited: true,
      allPlanApprovalsAudited: true,
      sourceClosureAudited: true,
      releaseDecisionAudited: true,
      administratorTemplateChangesAudited: true
    },
    dataProtection: {
      secretsNeverInLogs: true,
      piiRedactionRequired: true,
      evidenceRedactionRequired: true
    }
  };
}

function defaultHarnessLlmDraftPolicy(): Record<string, unknown> {
  return {
    enabled: true,
    generatedStatus: "DRAFT",
    requireUserReview: true,
    activationRequiresAdmin: true,
    reonboardingUsesPreviousActiveProfile: true,
    allowedToSuggestProfileRevision: true,
    allowedToSilentlyModifyActiveProfile: false,
    mustExplainTemplateSelection: true,
    mustPreserveGovernanceGates: true,
    mustPreserveSourceAndCompiledDigests: true,
    mustNotInventEvidence: true,
    mustSuggestHarnessRevisionWhenGoalExposesGap: true
  };
}

function referenceSource(name: string, url: string | undefined, category: HarnessTemplateSourceReference["category"], rationale: string): HarnessTemplateSourceReference {
  return {
    name,
    ...(url ? { url } : {}),
    category,
    rationale
  };
}
