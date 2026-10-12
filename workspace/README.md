# Workspace templates

This directory contains repository templates only. Real product workspaces belong outside Git/source trees and contain private assets and owning product state; do not place daily data or credentials here.

`templates/workspace.json` illustrates the exact product marker fields with placeholders. Never copy it into a real workspace or preinitialize an example marker. Only product initialization creates and verifies the actual `evopilot-workspace/v1` marker with canonical root and OS uid.

Runtime owns state/runtime and execution/receipts, Harness owns state/harness and its quality assets, and Ontology owns state/ontology and semantic assets. The parent connection owns no business store. Private material stays scoped to its project; public visibility does not authorize upload. Preserve real workspaces and audit on plugin shutdown, recovery and rollback.
