# Security

EvoPilot Preview uses a trusted local single-user model. The parent daemon binds numeric loopback and authenticates requests against installation/workspace identity. Products own scoped state and receipts. This is not remote multi-tenant authentication, a hostile-host sandbox or managed SRE support.

Keep credentials, private assets, connection tokens and live configuration out of public source, packages, logs and issues. Public visibility does not authorize upload. Trusted executors and callbacks are host code; request JSON cannot grant that trust. Preserve data during recovery and inspect uncertain receipts before retrying.

Start a minimal redacted [issue](https://github.com/yeliang-wang/evopilot/issues) asking maintainers to establish a private contact channel. Include no secret details, private assets or credentials. Private advisory reporting has not been verified as enabled; no such route or response SLA is promised. Share sensitive details only after an appropriate channel is established.

See [recovery](docs/recovery.md) and [capabilities](docs/capabilities.md).
