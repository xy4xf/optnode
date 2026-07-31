# optnode

A Next.js proxy-config converter inspired by [subconverter](https://github.com/tindy2013/subconverter).
Paste `vmess` / `vless` / `trojan` / `hysteria2` / `tuic` / `anytls` / `ss` share links (or a base64
subscription, clash YAML, or sing-box JSON) and convert them to **mihomo (clash) YAML** — wrapped in
the [ACL4SSR](https://github.com/ACL4SSR/ACL4SSR) template (proxy-groups, rule-providers, rules).
Conversion runs fully client-side; an optional server API mirrors subconverter's `/sub` endpoint for
fetching remote subscriptions.

## Architecture

The conversion core lives in [`lib/proxy`](./lib/proxy) and mirrors subconverter's pipeline:

```
parseSubscription(text) ──► Proxy[] ──► toMihomo()
   (explode per link)        (common)      (generator → mihomo YAML, ACL4SSR template)
```

- `types.ts` — the `Proxy` struct, modeled on subconverter's `src/parser/config/proxy.h`.
- `utils.ts` — base64 (url-safe), URL decode, query-arg parsing, tribools, IPv4/IPv6 helpers.
- `parsers.ts` — one `parseXxx` per protocol + an `explode` dispatcher and a `parseSubscription`
  that accepts share links, base64, clash YAML, or sing-box JSON as input.
- `mihomo.ts` — `proxyToClash` port: emits a complete mihomo config (proxies + ACL4SSR proxy-groups
  + rule-providers + rules + DNS).

Field semantics (transport `type`/`security`/`sni`/`host`/`path`, reality `pbk`/`sid`/`flow`, etc.)
follow subconverter's `explode*` and `*Construct` functions so links round-trip faithfully.

## Usage

### Web UI

```bash
npm install
npm run dev    # http://localhost:3000
```

Paste nodes on the left, read the mihomo YAML on the right. Toggle "full config" for the complete
ACL4SSR-templated config (proxy-groups + rules), or off for a bare `proxies:` list. Optionally paste
a subscription URL and hit **fetch** to pull it server-side into the input box.

### API

**`POST /api/convert`** — convert pasted text to mihomo YAML.

```bash
curl -X POST http://localhost:3000/api/convert \
  -H 'Content-Type: application/json' \
  -d '{"input":"hysteria2://pass@host:443?sni=h#n1","fullConfig":true}'
# => {"output":"<yaml>","count":1}
```

**`GET /api/sub?url=…`** — subconverter-style: fetch a remote subscription and convert to mihomo.

```bash
# plain-text YAML
curl "http://localhost:3000/api/sub?url=https://example.com/sub"
# JSON envelope
curl "http://localhost:3000/api/sub?url=https://example.com/sub&format=json"
# raw passthrough (return the fetched subscription text unchanged)
curl "http://localhost:3000/api/sub?url=https://example.com/sub&raw=1"
```

Query flags: `fullConfig=0` (bare list), `appendType=1` (prefix node names with `[type]`),
`template=minimal` (bare `PROXY`/`AUTO` config instead of ACL4SSR), `raw=1` (no conversion).

### Library

```ts
import { convert, parseSubscription } from "@/lib/proxy";

const nodes = parseSubscription(input);               // Proxy[]
const yaml  = convert(input, { fullConfig: true });   // mihomo config (ACL4SSR template)
```

## Supported protocols

| protocol   | parse | generate (mihomo) |
| ---------- | :---: | :---: |
| ss         |  ✅   |  ✅ |
| vmess      |  ✅   |  ✅ |
| vless      |  ✅   |  ✅ |
| trojan     |  ✅   |  ✅ |
| hysteria2  |  ✅   |  ✅ |
| tuic       |  ✅   |  ✅ |
| anytls     |  ✅   |  ✅ |

## Notes

- Only hysteria **v2** (`hysteria2://` / `hy2://`) is supported, not v1.
- The full config wraps proxies in the ACL4SSR template; pass `template: "minimal"` (or `fullConfig:
  false`) for a bare / minimal config.
- Numeric passwords are emitted as quoted YAML strings (avoids `!!int` coercion).
