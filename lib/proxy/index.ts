// optnode proxy conversion library — public entry point.
//
// Pipeline mirrors subconverter:
//   parseSubscription(text) -> Proxy[]   (input: share links / base64 / clash / sing-box)
//   toMihomo(nodes)                       (output: mihomo/clash YAML, ACL4SSR template)

import { parseSubscription } from "./parsers";
import { toMihomo } from "./mihomo";

export { ProxyType, getProxyTypeName } from "./types";
export type { Proxy, TriBool } from "./types";
export { parseSubscription, explode, clashProxyToProxy, singboxOutboundToProxy } from "./parsers";
export { toMihomo, toMihomoProxies } from "./mihomo";
export type { MihomoOptions } from "./mihomo";

export interface ConvertOptions {
  /** Wrap proxies in a full runnable config (proxy-groups + rules). Default true. */
  fullConfig?: boolean;
  /** Append the proxy type to the node name, e.g. "[vmess] jp-1". */
  appendType?: boolean;
  /** Full-config template. Default "acl4ssr". */
  template?: "acl4ssr" | "minimal";
}

export function convert(input: string, opts: ConvertOptions = {}): string {
  const nodes = parseSubscription(input);
  return toMihomo(nodes, {
    fullConfig: opts.fullConfig ?? true,
    appendType: opts.appendType,
    template: opts.template,
  });
}

export { parseSubscription as parse } from "./parsers";
