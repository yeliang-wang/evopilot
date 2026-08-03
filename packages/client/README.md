# @evopilot/client

HTTP client used by EvoPilot CLI and integrations to call EvoPilot control-plane APIs.

The client is a transport adapter. It does not bypass server-side RBAC, tenant/workspace scope, human approvals, source-closure preflight, release policy, deployment gates, or audit records.
