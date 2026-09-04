# Troubleshooting docs

Explainers for validation issues that need more than a one-line message. When a PR's
validation fails with one of these, the bot comment links here.

Trivial failures aren't documented as they explain themselves in the comment, such as:

- **Metadata not found (404)**: no `hvr-world.json` at the world URL, check the path.
- **Temporary server error (5xx)**: a transient host problem, push again to retry.
- **Invalid filename / missing title / schema errors**: the comment states exactly what to fix.

Issues with a guide:

- [Blocked by bot protection (HTTP 403)](waf-block.md): a WAF or Cloudflare challenge is
  refusing the indexer
