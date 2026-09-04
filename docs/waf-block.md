# Your world was blocked by bot protection (HTTP 403)

When you submit a world, the indexer fetches `hvr-world.json` from your world's host to read
its metadata. If that request comes back as **HTTP 403 Forbidden**, it usually isn't because
the file is missing, it's because a **WAF or bot-protection service in front of your host
challenged the indexer** and refused to serve the file to it.

The most common cause is **Cloudflare Bot Fight Mode**, but any WAF (AWS WAF, Akamai, Fastly,
or ModSecurity on nginx/Apache) can do the same. A Cloudflare block is easy to confirm: the
403 response carries a `cf-ray` header and often `cf-mitigated: challenge`.

## Do I need to do anything?

Only if your world is behind one of these services. Most hosts never touch you:

- **GitHub Pages, Glitch, itch.io, Neocities, Netlify, Vercel, `*.pages.dev`**: these usually don't
  challenge a plain metadata fetch. If you're on one of these and still see a 403, the file
  probably isn't published at the expected path. Check the URL and that `hvr-world.json` sits next to it.
- **A custom domain behind a WAF you configured**: this is the case that needs a rule below.
  If you turned the protection on, you have the access to allow the indexer through.
- **The file is genuinely behind authentication** (a login, an API key, a signed URL): then
  it isn't publicly indexable and can't be added to the index. The rules below only apply when
  the 403 comes from bot/WAF filtering, not a real auth wall. You should host your world somewhere publicly accessible.
  We don't allow indexing of private world data in search.

---

## Excluding the indexer from bot protection

The match is:

- **Request path** ends with / contains `hvr-world.json`, **and**
- **User-Agent** contains `hvr-search-indexer`.

It's fine that a User-Agent can be spoofed as the only thing this exposes is a public metadata
file that exists to be indexed anyway.

(If you want to be stricter, see [Optional: tighten to CI traffic](#optional-tighten-to-ci-traffic), but we don't recommend it unless you have a specific reason.)


## Common WAFs

### Cloudflare

We are in the process of applying for Verified Bot Status via Web Bot Auth, which would allow the indexer to bypass Bot Fight Mode without a custom rule.

However, for now, if your world is behind Cloudflare Bot Fight Mode, you need to either turn it off or add a rule to skip the indexer.

#### Free

On the Free plan, Bot Fight Mode is **all-or-nothing**. It can't be skipped per-path or per
user-agent with a custom rule (only *Super* Bot Fight Mode, on paid plans, can). So you have
two free options.

**Option A - Turn Bot Fight Mode off.** Dashboard → your domain → **Security → Bots** →
toggle **Bot Fight Mode** off.

- *Consequence:* it's disabled for your whole zone, not just `hvr-world.json`. Bot Fight Mode
  is a blunt filter that mostly deters low-effort bots (determined scrapers bypass it anyway),
  and your baseline DDoS protection stays on regardless. For a site serving public world
  metadata this is usually a fine trade. If you want some protection back, add a WAF custom
  rule or a rate-limiting rule scoped to sensitive paths instead of challenging everything.

**Option B - Unproxy the metadata host.** Serve `hvr-world.json` from a hostname orm subdomain whose DNS
record is set to **DNS only** (grey cloud) rather than **Proxied** (orange cloud), e.g. put
it on a subdomain like `static.yourdomain.com` with a grey-clouded record and point your world
URL there. Requests to a grey-clouded record skip Cloudflare's proxy entirely, so Bot Fight
Mode never runs for them.

- *Consequence:* that hostname loses **all** Cloudflare edge features. Bo Bot Fight Mode, but
  also no DDoS mitigation, caching, or WAF, and it **exposes your origin server's IP** for
  that record. Only grey-cloud a host you're comfortable exposing directly. The rest of your
  zone keeps Bot Fight Mode.

Option A is simpler and keeps Cloudflare's other protections. Option B is more specific (only
the metadata host is affected) but exposes that host's origin.

#### Pro, Business, Enterprise

Dashboard → your domain → **Security → Security rules → Create rule → Custom rules**.

Give your rule a name, then scroll to "When incoming requests match..." and select **Edit expression**. Paste the following:

```
(http.request.uri.path wildcard "*/hvr-world.json" and http.user_agent contains "hvr-search-indexer")
```

For "Then take action..." select **Skip** → tick **Bot Fight Mode** / **Super Bot Fight Mode** and any managed challenge → **Deploy**.

### AWS WAF

Add an **Allow** rule to your Web ACL with a **low priority number so it evaluates first** (an
`Allow` match terminates evaluation, so it must sit above your blocking/bot-control rules).
Rule JSON:

```json
{
  "Name": "allow-hvr-search-indexer",
  "Priority": 0,
  "Action": { "Allow": {} },
  "Statement": {
    "AndStatement": {
      "Statements": [
        {
          "ByteMatchStatement": {
            "SearchString": "hvr-search-indexer",
            "FieldToMatch": { "SingleHeader": { "Name": "user-agent" } },
            "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }],
            "PositionalConstraint": "CONTAINS"
          }
        },
        {
          "ByteMatchStatement": {
            "SearchString": "hvr-world.json",
            "FieldToMatch": { "UriPath": {} },
            "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }],
            "PositionalConstraint": "CONTAINS"
          }
        }
      ]
    }
  },
  "VisibilityConfig": {
    "SampledRequestsEnabled": true,
    "CloudWatchMetricsEnabled": true,
    "MetricName": "allow-hvr-search-indexer"
  }
}
```

If you use **AWS Bot Control**, instead scope-down that managed rule group so the same
`And` statement is excluded, or keep this higher-priority `Allow` ahead of it.

### nginx (plain User-Agent blocking)

If you block bots with a `map` + `if`, add an explicit allow branch so the indexer maps to
"not a bot":

```nginx
map $http_user_agent $bad_bot {
    default                 0;
    ~*hvr-search-indexer    0;   # allow the indexer explicitly (before your deny patterns)
    ~*(scrapy|python-requests|semrush)  1;
}

server {
    if ($bad_bot) { return 403; }
    # ...
}
```

If your block isn't User-Agent based, carve out the file instead:

```nginx
location ~* /hvr-world\.json$ {
    # served without the bot checks applied elsewhere
    try_files $uri =404;
}
```

### nginx / Apache with ModSecurity (OWASP CRS)

ModSecurity config is portable between nginx and Apache. Add a **chained rule early (phase
1)** that turns the rule engine off for this file + User-Agent:

```apache
SecRule REQUEST_HEADERS:User-Agent "@contains hvr-search-indexer" \
    "id:1000100,phase:1,t:lowercase,pass,nolog,chain,msg:'allow hvr-search-indexer for world metadata'"
    SecRule REQUEST_URI "@rx /hvr-world\.json$" "t:lowercase,ctl:ruleEngine=Off"
```

Use an `id` that doesn't collide with your existing rules. `ctl:ruleEngine=Off` disables the
remaining CRS checks for just that request.

### Other providers

Same principle - allow path `*/hvr-world.json` + User-Agent containing `hvr-search-indexer`:

- **Akamai (Bot Manager / Kona):** in Property Manager, add a custom bot / exception that
  categorises this User-Agent as an allowed crawler, or a match on the request path + UA that
  bypasses the bot rules.
- **Fastly:** in your WAF/VCL, skip the checks for the match, e.g. in `vcl_recv`:
  ```vcl
  if (req.url.path ~ "/hvr-world\.json$" && req.http.User-Agent ~ "hvr-search-indexer") {
      set req.http.X-Skip-WAF = "1";  // then gate your WAF include on this header
  }
  ```
- **Vercel Firewall:** add a custom rule with **Action: Bypass/Allow** matching the request
  path `*/hvr-world.json` and the `hvr-search-indexer` User-Agent.

---

## Optional: tighten to CI traffic

If you'd rather be sure it's the real indexer and not just a spoofed User-Agent, add a source
condition using [GitHub Actions' published IP ranges](https://api.github.com/meta) (the
`actions` list). Although keep in mind, GitHub may change these at any time, and also that anybody can write a GitHub action anyway!

For Cloudflare:

```
(http.request.uri.path wildcard "*/hvr-world.json" and http.user_agent contains "hvr-search-indexer" and ip.src in { <github actions ranges> })
```

The other providers all have an equivalent IP/CIDR condition. Source IPs can't be spoofed to
the edge over TLS, so this is unforgeable, at the cost that the ranges are broad and change
occasionally, so you'll need to refresh them now and then. Most people don't need this.

---

## Can't configure the WAF at all?

If it's a managed host with no dashboard access, you'll have to move your world to a host that doesn't
challenge fetches, e.g. GitHub Pages, or commit it somewhere served statically.

---

Once the rule is live, push again (or re-run the check) and validation will re-fetch.
