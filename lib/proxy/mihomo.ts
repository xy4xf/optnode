// mihomo / clash config generator. Ported from subconverter's
// proxyToClash (src/generator/config/subexport.cpp). Produces a complete,
// directly-usable mihomo YAML config.

import * as yaml from "js-yaml";

import { getProxyTypeName, Proxy, ProxyType } from "./types";

export interface MihomoOptions {
  /** Include proxy-groups + rules to make a runnable config. Default true. */
  fullConfig?: boolean;
  /** Append the proxy type to the node name, e.g. "[vmess] jp-1". */
  appendType?: boolean;
  /**
   * Full-config template to wrap the proxies in. Default "acl4ssr".
   * - "acl4ssr": the ACL4SSR template (named proxy-groups, rule-providers
   *   pulled from https://github.com/ACL4SSR/ACL4SSR, and a full rule list).
   *   Forces the template defaults `skip-cert-verify: true` and `udp: true`
   *   on every proxy, mirroring subconverter's ACL4SSR config.ini.
   * - "minimal": a bare PROXY/AUTO select + url-test and a single
   *   `MATCH,PROXY` rule.
   */
  template?: "acl4ssr" | "minimal";
}

type Obj = Record<string, any>;

/** Resolve a tribool: an explicit node value wins over the (undefined) default. */
function resolve(outer: boolean | undefined, inner: boolean | undefined): boolean | undefined {
  return inner !== undefined ? inner : outer;
}

function buildClashProxy(x: Proxy, opts: MihomoOptions): Obj | null {
  const type = getProxyTypeName(x.type);
  if (opts.appendType) x.remark = `[${type}] ${x.remark}`;

  const p: Obj = {
    name: x.remark,
    server: x.hostname,
    port: x.port,
  };

  const scv = resolve(undefined, x.allowInsecure);
  const udp = resolve(undefined, x.udp);

  // NOTE: js-yaml auto-quotes strings that look like numbers, so numeric
  // passwords are emitted as quoted scalars (YAML !!str) without extra work.

  switch (x.type) {
    case ProxyType.Shadowsocks: {
      p.type = "ss";
      p.cipher = x.encryptMethod;
      p.password = x.password;
      const pluginOpts = x.pluginOption.replace(/;/g, "&");
      switch (x.plugin) {
        case "simple-obfs":
        case "obfs-local":
          p.plugin = "obfs";
          p["plugin-opts"] = {
            mode: param(pluginOpts, "obfs"),
            host: param(pluginOpts, "obfs-host"),
          };
          break;
        case "v2ray-plugin":
          p.plugin = "v2ray-plugin";
          p["plugin-opts"] = {
            mode: param(pluginOpts, "mode"),
            host: param(pluginOpts, "host"),
            path: param(pluginOpts, "path"),
            tls: pluginOpts.includes("tls"),
            mux: pluginOpts.includes("mux"),
          };
          break;
      }
      break;
    }
    case ProxyType.VMess: {
      p.type = "vmess";
      p.uuid = x.userId;
      p.alterId = x.alterId;
      p.cipher = x.encryptMethod;
      p.tls = x.tlsSecure;
      if (x.alpnList.length) p.alpn = [...x.alpnList];
      else if (x.alpn) p.alpn = [x.alpn];
      if (scv !== undefined) p["skip-cert-verify"] = scv;
      if (x.serverName) p.servername = x.serverName;
      switch (x.transferProtocol) {
        case "tcp":
          break;
        case "ws":
          p.network = x.transferProtocol;
          p["ws-opts"] = { path: x.path };
          if (x.host) p["ws-opts"].headers = { Host: x.host };
          break;
        case "http":
          p.network = x.transferProtocol;
          p["http-opts"] = { method: "GET", path: [x.path] };
          if (x.host) p["http-opts"].headers = { Host: [x.host] };
          break;
        case "h2":
          p.network = x.transferProtocol;
          p["h2-opts"] = { path: x.path };
          if (x.host) p["h2-opts"].host = [x.host];
          break;
        case "grpc":
          p.network = x.transferProtocol;
          p.servername = x.host;
          p["grpc-opts"] = { "grpc-service-name": x.path };
          break;
        default:
          return null;
      }
      break;
    }
    case ProxyType.Trojan: {
      p.type = "trojan";
      p.password = x.password;
      if (x.serverName) p.sni = x.serverName;
      else if (x.host) p.sni = x.host;
      if (x.alpnList.length) p.alpn = [...x.alpnList];
      else if (x.alpn) p.alpn = [x.alpn];
      if (scv !== undefined) p["skip-cert-verify"] = scv;
      switch (x.transferProtocol) {
        case "tcp":
          break;
        case "grpc":
          p.network = x.transferProtocol;
          if (x.path) p["grpc-opts"] = { "grpc-service-name": x.path };
          break;
        case "ws":
          p.network = x.transferProtocol;
          p["ws-opts"] = { path: x.path };
          if (x.host) p["ws-opts"].headers = { Host: x.host };
          break;
      }
      break;
    }
    case ProxyType.Hysteria2: {
      p.type = "hysteria2";
      p.password = x.password;
      p.auth = x.password;
      if (x.serverName) p.sni = x.serverName;
      if (x.upMbps) p.up = x.upMbps;
      if (x.downMbps) p.down = x.downMbps;
      if (scv !== undefined) p["skip-cert-verify"] = scv;
      if (x.alpn) p.alpn = [x.alpn];
      if (x.obfsParam) p.obfs = x.obfsParam;
      if (x.obfsPassword) p["obfs-password"] = x.obfsPassword;
      if (x.ports) p.ports = x.ports;
      break;
    }
    case ProxyType.TUIC: {
      p.type = "tuic";
      if (x.password) p.password = x.password;
      if (x.userId) p.uuid = x.userId;
      if (x.token) p.token = x.token;
      if (x.serverName) p.sni = x.serverName;
      if (scv !== undefined) p["skip-cert-verify"] = scv;
      if (x.alpn) p.alpn = [x.alpn];
      p["disable-sni"] = x.disableSni ?? false;
      p["reduce-rtt"] = x.reduceRtt ?? false;
      p["request-timeout"] = x.requestTimeout;
      if (x.udpRelayMode === "native" || x.udpRelayMode === "quic") p["udp-relay-mode"] = x.udpRelayMode;
      if (x.congestionControl) p["congestion-controller"] = x.congestionControl;
      break;
    }
    case ProxyType.AnyTLS: {
      p.type = "anytls";
      if (x.password) p.password = x.password;
      if (x.fingerprint) p.fingerprint = x.fingerprint;
      if (udp !== undefined) p.udp = udp;
      if (x.sni) p.sni = x.sni;
      if (scv !== undefined) p["skip-cert-verify"] = scv;
      if (x.alpnList.length) p.alpn = [...x.alpnList];
      break;
    }
    case ProxyType.VLESS: {
      p.type = "vless";
      p.uuid = x.userId;
      p.tls = x.tlsSecure;
      if (x.alpnList.length) p.alpn = [...x.alpnList];
      if (x.packetEncoding) p["packet-encoding"] = x.packetEncoding;
      if (x.flow) p.flow = x.flow;
      if (x.encryption && x.encryption !== "none") p.encryption = x.encryption;
      if (scv !== undefined) p["skip-cert-verify"] = scv;
      if (x.publicKey) p["reality-opts"] = { "public-key": x.publicKey };
      if (x.serverName) p.servername = x.serverName;
      if (x.shortId) {
        p["reality-opts"] = p["reality-opts"] ?? {};
        p["reality-opts"]["short-id"] = x.shortId;
      }
      if (x.publicKey || x.flow === "xtls-rprx-vision") p["client-fingerprint"] = "chrome";
      if (x.fingerprint) p["client-fingerprint"] = x.fingerprint;
      switch (x.transferProtocol) {
        case "tcp":
          p.network = x.transferProtocol;
          break;
        case "ws":
          p.network = x.transferProtocol;
          p["ws-opts"] = { path: x.path };
          if (x.host) p["ws-opts"].headers = { Host: x.host };
          break;
        case "http":
          p.network = x.transferProtocol;
          p["http-opts"] = { method: "GET", path: [x.path] };
          if (x.host) p["http-opts"].headers = { Host: [x.host] };
          break;
        case "h2":
          p.network = x.transferProtocol;
          p["h2-opts"] = { path: x.path };
          if (x.host) p["h2-opts"].host = [x.host];
          break;
        case "grpc":
          p.network = x.transferProtocol;
          p["grpc-opts"] = { "grpc-mode": x.grpcMode, "grpc-service-name": x.grpcServiceName };
          break;
        case "xhttp":
          p.network = x.transferProtocol;
          p["xhttp-opts"] = { path: x.path };
          if (x.host) p["xhttp-opts"].host = x.host;
          break;
        default:
          return null;
      }
      break;
    }
    default:
      return null;
  }

  if (udp !== undefined && x.type !== ProxyType.TUIC) p.udp = udp;
  if (x.underlyingProxy) p["dialer-proxy"] = x.underlyingProxy;

  return p;
}

/** Read a key=value from an &-joined option string. */
function param(opts: string, key: string): string {
  for (const part of opts.split("&")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === key) return part.slice(eq + 1);
  }
  return "";
}

export function toMihomo(nodes: Proxy[], opts: MihomoOptions = {}): string {
  const proxies: Obj[] = [];
  const names: string[] = [];
  for (const n of nodes) {
    const p = buildClashProxy({ ...n }, opts);
    if (!p) continue;
    proxies.push(p);
    names.push(p.name as string);
  }

  if (!opts.fullConfig) {
    const doc = { proxies };
    return yaml.dump(doc, { lineWidth: -1, noRefs: true });
  }

  const doc =
    opts.template === "minimal"
      ? buildMinimalConfig(proxies, names)
      : buildAcl4ssrConfig(proxies, names);

  return yaml.dump(doc, { lineWidth: -1, noRefs: true });
}

/** Bare PROXY/AUTO select + url-test and a single MATCH rule. */
function buildMinimalConfig(proxies: Obj[], names: string[]): Obj {
  return {
    "mixed-port": 7890,
    "allow-lan": false,
    mode: "rule",
    "log-level": "info",
    "unified-delay": true,
    proxies,
    "proxy-groups": [
      {
        name: "PROXY",
        type: "select",
        proxies: ["AUTO", ...names, "DIRECT"],
      },
      {
        name: "AUTO",
        type: "url-test",
        url: "http://www.gstatic.com/generate_204",
        interval: 300,
        tolerance: 50,
        proxies: names.length ? names : ["DIRECT"],
      },
    ],
    rules: ["MATCH,PROXY"],
  };
}

const ACL4SSR_BASE = "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/refs/heads/master/Clash";

/** Each entry: [name, subpath under the ACL4SSR repo]. */
const ACL4SSR_RULESETS: [string, string][] = [
  ["LocalAreaNetwork", "LocalAreaNetwork.list"],
  ["BanAD", "BanAD.list"],
  ["BanProgramAD", "BanProgramAD.list"],
  ["GoogleCN", "GoogleCN.list"],
  // SteamCN lives under Clash/Ruleset/, not the Clash/ root.
  ["SteamCN", "Ruleset/SteamCN.list"],
  ["Microsoft", "Microsoft.list"],
  ["Apple", "Apple.list"],
  ["ProxyMedia", "ProxyMedia.list"],
  ["Telegram", "Telegram.list"],
  ["ProxyLite", "ProxyLite.list"],
  ["ChinaDomain", "ChinaDomain.list"],
  ["ChinaCompanyIp", "ChinaCompanyIp.list"],
];

/** rule → [rule-provider name, target proxy-group]. */
const ACL4SSR_RULES: [string, string][] = [
  ["LocalAreaNetwork", "🎯 全球直连"],
  ["BanAD", "🛑 全球拦截"],
  ["BanProgramAD", "🍃 应用净化"],
  ["GoogleCN", "🎯 全球直连"],
  ["SteamCN", "🎯 全球直连"],
  ["Microsoft", "Ⓜ️ 微软服务"],
  ["Apple", "🍎 苹果服务"],
  ["ProxyMedia", "🌍 国外媒体"],
  ["Telegram", "📲 电报信息"],
  ["ProxyLite", "🚀 节点选择"],
  ["ChinaDomain", "🎯 全球直连"],
  ["ChinaCompanyIp", "🎯 全球直连"],
];

const SELECT = "🚀 节点选择";
const AUTO = "♻️ 自动选择";
const DIRECT_G = "🎯 全球直连";
const MEDIA = "🌍 国外媒体";
const TELEGRAM = "📲 电报信息";
const MICROSOFT = "Ⓜ️ 微软服务";
const APPLE = "🍎 苹果服务";
const REJECT_G = "🛑 全球拦截";
const PURIFY = "🍃 应用净化";
const FINAL = "🐟 漏网之鱼";

/**
 * The ACL4SSR template: a complete, directly-runnable mihomo config with
 * DNS, named proxy-groups, rule-providers sourced from the ACL4SSR repo,
 * and a full rule list. Mirrors subconverter's ACL4SSR.ini template.
 */
function buildAcl4ssrConfig(proxies: Obj[], names: string[]): Obj {
  // Template defaults: every node skips cert verify and relays UDP.
  for (const p of proxies) {
    if (p["skip-cert-verify"] === undefined) p["skip-cert-verify"] = true;
    if (p.udp === undefined) p.udp = true;
  }

  const fallback = names.length ? names : ["DIRECT"];

  const ruleProviders: Obj = {};
  for (const [name, subpath] of ACL4SSR_RULESETS) {
    ruleProviders[name] = {
      type: "http",
      behavior: "classical",
      url: `${ACL4SSR_BASE}/${subpath}`,
      path: `./rules/${name}.yaml`,
    };
  }

  const rules: string[] = ACL4SSR_RULES.map(
    ([name, group]) => `RULE-SET,${name},${group}`,
  );
  rules.push("GEOIP,CN,🎯 全球直连", `MATCH,${FINAL}`);

  return {
    "mixed-port": 7890,
    "allow-lan": false,
    mode: "rule",
    "log-level": "info",
    ipv6: false,
    "external-controller": "127.0.0.1:9090",
    dns: {
      enable: true,
      listen: "127.0.0.1:1053",
      ipv6: false,
      "enhanced-mode": "fake-ip",
      "fake-ip-range": "198.18.0.1/16",
      "default-nameserver": ["223.5.5.5", "119.29.29.29"],
      nameserver: ["https://dns.alidns.com/dns-query", "https://doh.pub/dns-query"],
      "proxy-server-nameserver": [
        "https://dns.alidns.com/dns-query",
        "https://doh.pub/dns-query",
      ],
      "nameserver-policy": {
        "geosite:geolocation-!cn": [
          `https://1.1.1.1/dns-query#${SELECT}`,
          `https://8.8.8.8/dns-query#${SELECT}`,
        ],
      },
    },
    proxies,
    "proxy-groups": [
      { name: SELECT, type: "select", proxies: [AUTO, "DIRECT", ...fallback] },
      {
        name: AUTO,
        type: "url-test",
        url: "http://www.gstatic.com/generate_204",
        interval: 300,
        tolerance: 50,
        proxies: fallback,
      },
      { name: MEDIA, type: "select", proxies: [SELECT, AUTO, DIRECT_G, ...fallback] },
      { name: TELEGRAM, type: "select", proxies: [SELECT, DIRECT_G, ...fallback] },
      { name: MICROSOFT, type: "select", proxies: [DIRECT_G, SELECT, ...fallback] },
      { name: APPLE, type: "select", proxies: [SELECT, DIRECT_G, ...fallback] },
      { name: DIRECT_G, type: "select", proxies: ["DIRECT", SELECT, AUTO] },
      { name: REJECT_G, type: "select", proxies: ["REJECT", "DIRECT"] },
      { name: PURIFY, type: "select", proxies: ["REJECT", "DIRECT"] },
      { name: FINAL, type: "select", proxies: [SELECT, DIRECT_G, AUTO, ...fallback] },
    ],
    "rule-providers": ruleProviders,
    rules,
  };
}

/** Just the proxy objects as YAML (no groups/rules). */
export function toMihomoProxies(nodes: Proxy[], opts: MihomoOptions = {}): string {
  return toMihomo(nodes, { ...opts, fullConfig: false });
}
