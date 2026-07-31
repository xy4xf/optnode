// Protocol link parsers. Each `parseXxx` takes a single share link and returns a
// Proxy, or null if it cannot be parsed. Ported from subconverter's
// src/parser/subparser.cpp explode* functions.

import * as yaml from "js-yaml";

import { createProxy, DEFAULT_GROUPS, Proxy, ProxyType } from "./types";
import {
  base64Decode,
  defaultHost,
  extractRemark,
  getUrlAlpn,
  getUrlAlpnList,
  getUrlArg,
  stripBrackets,
  toInt,
  tribool,
  trim,
  urlDecode,
} from "./utils";

type Link = { value: string };

// ---------------------------------------------------------------------------
// Shadowsocks
// ---------------------------------------------------------------------------
export function parseSS(link: string): Proxy | null {
  const node = createProxy();
  let s = link.slice("ss://".length).replace("/?", "?");
  let ps = "";
  if (s.includes("#")) {
    const i = s.indexOf("#");
    ps = urlDecode(s.slice(i + 1));
    s = s.slice(0, i);
  }
  let addition = "";
  if (s.includes("?")) {
    const i = s.indexOf("?");
    addition = s.slice(i + 1);
    const plugins = urlDecode(getUrlArg(addition, "plugin"));
    const semi = plugins.indexOf(";");
    if (semi === -1) {
      // no plugin opts
    }
    s = s.slice(0, i);
  }
  let method = "";
  let password = "";
  let server = "";
  let port = 0;
  let group = DEFAULT_GROUPS[ProxyType.Shadowsocks];

  if (s.includes("@")) {
    const m = s.match(/^(\S+?)@(\S+):(\d+)$/);
    if (!m) return null;
    const secret = base64Decode(m[1]);
    server = m[2];
    port = toInt(m[3]);
    const sm = secret.match(/^(\S+?):(\S+)$/);
    if (!sm) return null;
    method = sm[1];
    password = sm[2];
  } else {
    const decoded = base64Decode(s);
    const m = decoded.match(/^(\S+?):(\S+)@(\S+):(\d+)$/);
    if (!m) return null;
    method = m[1];
    password = m[2];
    server = m[3];
    port = toInt(m[4]);
  }
  if (port === 0) return null;

  // plugin parsing
  let plugin = "";
  let pluginOption = "";
  if (addition) {
    const plugins = urlDecode(getUrlArg(addition, "plugin"));
    const semi = plugins.indexOf(";");
    if (semi !== -1) {
      plugin = plugins.slice(0, semi);
      pluginOption = plugins.slice(semi + 1);
    } else if (plugins) {
      plugin = plugins;
    }
    const g = getUrlArg(addition, "group");
    if (g) group = base64Decode(g);
  }

  if (!ps) ps = `${server}:${port}`;

  node.type = ProxyType.Shadowsocks;
  node.group = group;
  node.remark = ps;
  node.hostname = server;
  node.port = port;
  node.password = password;
  node.encryptMethod = method;
  node.plugin = plugin;
  node.pluginOption = pluginOption;
  return node;
}

// ---------------------------------------------------------------------------
// VMess
// ---------------------------------------------------------------------------
export function parseVMess(link: string): Proxy | null {
  const node = createProxy();

  // shadowrocket style: vmess://<base64>?...
  if (/^vmess:\/\/[A-Za-z0-9-_]+\?/.test(link)) {
    return parseVMessShadowrocket(link);
  }
  // standard style: vmess://<uuid>:<aid>@<host>:<port>?...  (rare)
  if (/^vmess:\/\/.*@.*/.test(link)) {
    return parseVMessStd(link);
  }

  // v2rayN base64 JSON
  const json = base64Decode(link.replace(/^vmess1?:\/\//, ""));
  let obj: any;
  try {
    obj = JSON.parse(json);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;

  const version = obj.v ? String(obj.v) : "1";
  let ps = obj.ps ? String(obj.ps) : "";
  const add = trim(String(obj.add || ""));
  const port = toInt(String(obj.port ?? "0"));
  if (port === 0) return null;
  const type = obj.type ? String(obj.type) : "";
  const id = obj.id ? String(obj.id) : "";
  const aid = obj.aid != null ? String(obj.aid) : "0";
  const net = obj.net ? String(obj.net) : "tcp";
  const tls = obj.tls ? String(obj.tls) : "";
  let host = obj.host ? String(obj.host) : "";
  const sni = obj.sni ? String(obj.sni) : "";
  let path = "";

  if (version === "1") {
    if (host) {
      const arr = host.split(";");
      if (arr.length === 2) {
        host = arr[0];
        path = arr[1];
      }
    }
  } else {
    path = obj.path ? String(obj.path) : "";
  }

  if (!ps) ps = `${add}:${port}`;

  fillVMess(node, ps, add, port, type, id, aid, net, "auto", path, host, "", tls, sni, []);
  return node;
}

function parseVMessStd(link: string): Proxy | null {
  const node = createProxy();
  const l: Link = { value: link.slice("vmess://".length) };
  const remarks = extractRemark(l);
  const m = l.value.match(/^([a-z]+)(?:\+([a-z]+))?:([\da-f]{4}(?:[\da-f]{4}-){4}[\da-f]{12})-(\d+)@(.+):(\d+)(?:\/?\?(.*))?$/i);
  if (!m) return null;
  const net = m[1];
  const tls = m[2] ?? "";
  const id = m[3];
  const aid = m[4];
  const add = m[5];
  const port = toInt(m[6]);
  const addition = m[7] ?? "";
  if (port === 0) return null;
  let type = "";
  let host = "";
  let path = "";
  switch (net) {
    case "tcp":
    case "kcp":
      type = getUrlArg(addition, "type");
      break;
    case "http":
    case "ws":
      host = getUrlArg(addition, "host");
      path = getUrlArg(addition, "path");
      break;
    case "quic":
      type = getUrlArg(addition, "security");
      host = getUrlArg(addition, "type");
      path = getUrlArg(addition, "key");
      break;
    default:
      return null;
  }
  const remarks2 = remarks || `${add}:${port}`;
  fillVMess(node, remarks2, add, port, type, id, aid, net, "auto", path, host, "", tls, "", getUrlAlpnList(addition));
  return node;
}

function parseVMessShadowrocket(link: string): Proxy | null {
  // vmess://<base64>?<query>  where base64 is the uuid and query carries the rest
  const addition = link.slice(link.indexOf("?") + 1).split("#")[0];
  const id = base64Decode(link.slice("vmess://".length, link.indexOf("?")));
  const add = getUrlArg(addition, "server") || getUrlArg(addition, "add");
  const port = toInt(getUrlArg(addition, "port"));
  if (!add || port === 0) return null;
  const net = getUrlArg(addition, "type") || "tcp";
  const tls = getUrlArg(addition, "tls") === "tls" ? "tls" : "";
  const host = getUrlArg(addition, "host") || getUrlArg(addition, "sni");
  const path = getUrlArg(addition, "path");
  const remarks = getUrlArg(addition, "remarks") || `${add}:${port}`;
  const node = createProxy();
  fillVMess(node, remarks, add, port, "", id, "0", net, "auto", path, host, "", tls, host, getUrlAlpnList(addition));
  return node;
}

function fillVMess(
  node: Proxy,
  remarks: string,
  add: string,
  port: number,
  type: string,
  id: string,
  aid: string,
  net: string,
  cipher: string,
  path: string,
  host: string,
  edge: string,
  tls: string,
  sni: string,
  alpnList: string[],
) {
  node.type = ProxyType.VMess;
  node.group = DEFAULT_GROUPS[ProxyType.VMess];
  node.remark = remarks;
  node.hostname = add;
  node.port = port;
  node.userId = id || "00000000-0000-0000-0000-000000000000";
  node.alterId = toInt(aid);
  node.encryptMethod = cipher;
  node.transferProtocol = net || "tcp";
  node.edge = edge;
  node.serverName = sni;
  node.alpnList = alpnList;
  node.fakeType = type;
  node.tlsSecure = tls === "tls";
  if (net === "quic") {
    // quic security / key stored on host/path conceptually; keep on host/path
    node.host = host;
    node.path = path;
  } else {
    node.host = defaultHost(host, add);
    node.path = path || "/";
  }
}

// ---------------------------------------------------------------------------
// VLESS
// ---------------------------------------------------------------------------
export function parseVLESS(link: string): Proxy | null {
  const node = createProxy();
  const l: Link = { value: link.slice("vless://".length) };
  const remarks = extractRemark(l);
  const m = l.value.match(/^([\da-fA-F]{8}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{12})@\[?([\d\-a-zA-Z:.]+)\]?:(\d+)(?:\/?\?(.*))?$/);
  if (!m) return null;
  const id = m[1];
  const add = m[2];
  const port = toInt(m[3]);
  const addition = m[4] ?? "";
  if (port === 0) return null;

  const tls = getUrlArg(addition, "security");
  const net = getUrlArg(addition, "type");
  const flow = getUrlArg(addition, "flow");
  const pbk = getUrlArg(addition, "pbk");
  const sid = getUrlArg(addition, "sid");
  const encryption = getUrlArg(addition, "encryption");
  const fp = getUrlArg(addition, "fp");
  const packetEncoding = getUrlArg(addition, "packet-encoding");
  const alpnList = getUrlAlpnList(addition);
  let type = "";
  let host = "";
  let path = "";
  let mode = "";

  switch (net) {
    case "tcp":
    case "ws":
    case "h2":
      type = getUrlArg(addition, "headerType");
      host = addition.includes("sni") ? getUrlArg(addition, "sni") : getUrlArg(addition, "host");
      path = getUrlArg(addition, "path");
      break;
    case "grpc":
      host = getUrlArg(addition, "sni");
      path = getUrlArg(addition, "serviceName");
      mode = getUrlArg(addition, "mode");
      break;
    case "quic":
      type = getUrlArg(addition, "headerType");
      host = addition.includes("sni") ? getUrlArg(addition, "sni") : getUrlArg(addition, "quicSecurity");
      path = getUrlArg(addition, "key");
      break;
    case "xhttp":
      type = getUrlArg(addition, "headerType");
      host = addition.includes("sni") ? getUrlArg(addition, "sni") : getUrlArg(addition, "host");
      path = getUrlArg(addition, "path");
      break;
    default:
      return null;
  }

  const sni = getUrlArg(addition, "sni");
  const remark = remarks || `${add}:${port}`;

  node.type = ProxyType.VLESS;
  node.group = DEFAULT_GROUPS[ProxyType.VLESS];
  node.remark = remark;
  node.hostname = add;
  node.port = port;
  node.userId = id || "00000000-0000-0000-0000-000000000000";
  node.alterId = 0;
  node.encryptMethod = "auto";
  node.transferProtocol = net || (type === "http" ? "http" : "tcp");
  node.edge = "";
  node.flow = flow;
  node.encryption = encryption;
  node.fakeType = type;
  node.tlsSecure = tls === "tls" || tls === "xtls" || tls === "reality";
  node.publicKey = pbk;
  node.shortId = sid;
  node.fingerprint = fp;
  node.serverName = sni;
  node.alpnList = alpnList;
  node.packetEncoding = packetEncoding;

  switch (net) {
    case "grpc":
      node.host = host;
      node.grpcMode = mode || "gun";
      node.grpcServiceName = path ? urlDecode(trim(path)) : "/";
      break;
    case "quic":
      node.host = host;
      node.path = path || "/";
      break;
    default:
      node.host = defaultHost(host, add);
      node.path = path ? urlDecode(trim(path)) : "/";
      break;
  }
  return node;
}

// ---------------------------------------------------------------------------
// Trojan
// ---------------------------------------------------------------------------
export function parseTrojan(link: string): Proxy | null {
  const node = createProxy();
  let s = link;
  if (s.startsWith("trojan://")) s = s.slice("trojan://".length);
  else if (s.startsWith("trojan-go://")) s = s.slice("trojan-go://".length);
  else return null;

  const l: Link = { value: s };
  const remark = extractRemark(l);
  let addition = "";
  const q = l.value.indexOf("?");
  if (q !== -1) {
    addition = l.value.slice(q + 1);
    l.value = l.value.slice(0, q);
  }

  const m = l.value.match(/^(.*?)@(.*):(.*)$/);
  if (!m) return null;
  const psk = m[1];
  const server = stripBrackets(m[2]);
  const port = toInt(m[3]);
  if (port === 0) return null;

  let host = getUrlArg(addition, "sni");
  let sni = getUrlArg(addition, "sni");
  host = getUrlArg(addition, "host");
  if (!host) host = sni;
  if (!host) host = getUrlArg(addition, "peer");
  const tfo = tribool(getUrlArg(addition, "tfo"));
  const fp = getUrlArg(addition, "fp");
  const scv = tribool(getUrlArg(addition, "allowInsecure"));
  let group = urlDecode(getUrlArg(addition, "group"));
  if (!group) group = DEFAULT_GROUPS[ProxyType.Trojan];

  let network = "";
  let path = "";
  if (getUrlArg(addition, "ws") === "1") {
    path = getUrlArg(addition, "wspath");
    network = "ws";
  } else if (getUrlArg(addition, "type") === "ws") {
    path = getUrlArg(addition, "path");
    if (path.startsWith("%2F")) path = urlDecode(path);
    network = "ws";
  } else if (getUrlArg(addition, "type") === "grpc") {
    path = getUrlArg(addition, "serviceName");
    network = "grpc";
  }

  const remarks = remark || `${server}:${port}`;
  const alpnList = getUrlAlpnList(addition);

  node.type = ProxyType.Trojan;
  node.group = group;
  node.remark = remarks;
  node.hostname = server;
  node.port = port;
  node.password = psk;
  node.host = host;
  node.tlsSecure = true;
  node.transferProtocol = network || "tcp";
  node.path = path;
  node.fingerprint = fp;
  node.serverName = sni;
  node.alpnList = alpnList;
  node.tcpFastOpen = tfo;
  node.allowInsecure = scv;
  return node;
}

// ---------------------------------------------------------------------------
// Hysteria2
// ---------------------------------------------------------------------------
export function parseHysteria2(link: string): Proxy | null {
  const node = createProxy();
  let s = link.replace(/^(hysteria2|hy2):\/\//, "hysteria2://").slice("hysteria2://".length);
  s = s.replace("/?", "?");
  const l: Link = { value: s };
  const remarks = extractRemark(l);
  let addition = "";
  const q = l.value.lastIndexOf("?");
  if (q !== -1) {
    addition = l.value.slice(q + 1);
    l.value = l.value.slice(0, q);
  }

  let password = "";
  let add = "";
  let port = 0;
  if (l.value.includes("@")) {
    const m = l.value.match(/^(.*?)@(.*)[:](\d+)$/);
    if (!m) return null;
    password = m[1];
    add = stripBrackets(m[2]);
    port = toInt(m[3]);
  } else {
    password = getUrlArg(addition, "password");
    if (!password) return null;
    if (!l.value.includes(":")) return null;
    const m = l.value.match(/^(.*)[:](\d+)$/);
    if (!m) return null;
    add = stripBrackets(m[1]);
    port = toInt(m[2]);
  }
  if (port === 0) return null;

  const scv = tribool(getUrlArg(addition, "insecure"));
  const up = getUrlArg(addition, "up");
  const down = getUrlArg(addition, "down");
  const alpn = getUrlAlpn(addition);
  const obfsParam = getUrlArg(addition, "obfs");
  const obfsPassword = getUrlArg(addition, "obfs-password");
  const sni = getUrlArg(addition, "sni");
  const ports = getUrlArg(addition, "ports");
  const remark = remarks || `${add}:${port}`;

  node.type = ProxyType.Hysteria2;
  node.group = DEFAULT_GROUPS[ProxyType.Hysteria2];
  node.remark = remark;
  node.hostname = add;
  node.port = port;
  node.password = password;
  node.host = defaultHost(sni, add);
  node.upMbps = up;
  node.downMbps = down;
  node.alpn = alpn;
  node.obfsParam = obfsParam;
  node.obfsPassword = obfsPassword;
  node.serverName = sni;
  node.ports = ports;
  node.allowInsecure = scv;
  return node;
}

// ---------------------------------------------------------------------------
// TUIC
// ---------------------------------------------------------------------------
export function parseTUIC(link: string): Proxy | null {
  const node = createProxy();
  let s = link.slice("tuic://".length);
  const l: Link = { value: s };
  const remarks = extractRemark(l);
  let addition = "";
  const q = l.value.lastIndexOf("?");
  if (q !== -1) {
    addition = l.value.slice(q + 1);
    l.value = l.value.slice(0, q);
  }

  let uuid = "";
  let password = "";
  // split userinfo from host
  const at = l.value.lastIndexOf("@");
  let hostport = l.value;
  if (at !== -1) {
    const userinfo = l.value.slice(0, at);
    hostport = l.value.slice(at + 1);
    const colon = userinfo.indexOf(":");
    if (colon !== -1) {
      uuid = userinfo.slice(0, colon);
      password = userinfo.slice(colon + 1);
    } else {
      uuid = userinfo;
    }
  } else {
    // token-style: uuid:password embedded? fallback
    const colon = l.value.indexOf(":");
    if (colon !== -1) {
      uuid = l.value.slice(0, colon);
      hostport = l.value.slice(colon + 1);
    }
  }

  const lastColon = hostport.lastIndexOf(":");
  if (lastColon === -1) return null;
  const add = stripBrackets(hostport.slice(0, lastColon));
  const port = toInt(hostport.slice(lastColon + 1));
  if (port === 0) return null;

  const scv = tribool(getUrlArg(addition, "insecure"));
  const alpn = getUrlAlpn(addition);
  const sni = getUrlArg(addition, "sni");
  const congestionControl = getUrlArg(addition, "congestion_control");
  const remark = remarks || `${add}:${port}`;

  node.type = ProxyType.TUIC;
  node.group = DEFAULT_GROUPS[ProxyType.TUIC];
  node.remark = remark;
  node.hostname = add;
  node.port = port;
  node.password = password;
  node.userId = uuid;
  node.alpn = alpn;
  node.serverName = sni;
  node.congestionControl = congestionControl;
  node.udpRelayMode = "native";
  node.allowInsecure = scv;
  return node;
}

// ---------------------------------------------------------------------------
// AnyTLS
// ---------------------------------------------------------------------------
export function parseAnyTLS(link: string): Proxy | null {
  const node = createProxy();
  let s = link.slice("anytls://".length);
  const l: Link = { value: s };
  const remarks = extractRemark(l);
  let addition = "";
  const q = l.value.lastIndexOf("?");
  if (q !== -1) {
    addition = l.value.slice(q + 1);
    l.value = l.value.slice(0, q);
  }

  let password = "";
  const at = l.value.indexOf("@");
  let hostport = l.value;
  if (at !== -1) {
    password = l.value.slice(0, at);
    hostport = l.value.slice(at + 1);
  }
  const lastColon = hostport.lastIndexOf(":");
  if (lastColon === -1) return null;
  const add = stripBrackets(hostport.slice(0, lastColon));
  const port = toInt(hostport.slice(lastColon + 1));
  if (port === 0) return null;

  let fp = getUrlArg(addition, "fp");
  if (!fp) fp = getUrlArg(addition, "fingerprint");
  if (!fp) fp = urlDecode(getUrlArg(addition, "hpkp"));
  let sni = getUrlArg(addition, "sni");
  if (!sni) sni = getUrlArg(addition, "peer");
  const udp = tribool(getUrlArg(addition, "udp"));
  const tfo = tribool(getUrlArg(addition, "tfo"));
  const scv = tribool(getUrlArg(addition, "insecure"));
  const alpnList = getUrlAlpnList(addition);
  const remark = remarks || `${add}:${port}`;

  node.type = ProxyType.AnyTLS;
  node.group = DEFAULT_GROUPS[ProxyType.AnyTLS];
  node.remark = remark;
  node.hostname = add;
  node.port = port;
  node.password = password;
  node.alpnList = alpnList;
  node.fingerprint = fp;
  node.sni = sni;
  node.udp = udp;
  node.tcpFastOpen = tfo;
  node.allowInsecure = scv;
  return node;
}

// ---------------------------------------------------------------------------
// Dispatch (explode)
// ---------------------------------------------------------------------------
export function explode(link: string): Proxy | null {
  const trimmed = link.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith("ss://")) return parseSS(trimmed);
    if (trimmed.startsWith("vmess://") || trimmed.startsWith("vmess1://")) return parseVMess(trimmed);
    if (trimmed.startsWith("trojan://") || trimmed.startsWith("trojan-go://")) return parseTrojan(trimmed);
    if (trimmed.includes("vless://") || trimmed.includes("vless1://")) return parseVLESS(trimmed);
    if (trimmed.includes("tuic://")) return parseTUIC(trimmed);
    if (trimmed.includes("anytls://")) return parseAnyTLS(trimmed);
    if (trimmed.includes("hysteria2://") || trimmed.includes("hy2://")) return parseHysteria2(trimmed);
    if (trimmed.includes("hysteria://") || trimmed.includes("hy://")) return null; // hysteria v1 not supported
  } catch {
    return null;
  }
  return null;
}

/**
 * Parse a subscription blob: may be base64, a list of share links, a clash YAML
 * config, or a sing-box JSON config. Returns the list of proxies found.
 */
export function parseSubscription(input: string): Proxy[] {
  const text = input.trim();
  if (!text) return [];

  // clash YAML
  if (/["']?(Proxy|proxies)["']?\s*:/.test(text)) {
    const nodes = parseClashInput(text);
    if (nodes.length) return nodes;
  }
  // sing-box JSON
  if (/["']?(inbounds|outbounds)["']?\s*:/.test(text) && text.includes("outbounds")) {
    const nodes = parseSingBoxInput(text);
    if (nodes.length) return nodes;
  }

  // try base64 decode
  let body = text;
  const looksBase64 = !text.includes("://") && isBase64ish(text);
  if (looksBase64) {
    const decoded = base64Decode(text);
    if (decoded.includes("://") || decoded.includes(":")) body = decoded;
  }

  const nodes: Proxy[] = [];
  const delimiter = body.includes("\n") ? "\n" : body.includes("\r") ? "\r" : body.includes(" ") ? " " : "\n";
  for (const raw of body.split(delimiter)) {
    const line = raw.replace(/\r$/, "").trim();
    if (!line) continue;
    const node = explode(line);
    if (node && node.type !== ProxyType.Unknown) nodes.push(node);
  }
  return nodes;
}

function isBase64ish(s: string): boolean {
  const t = s.replace(/\s+/g, "");
  return t.length > 0 && /^[A-Za-z0-9+/_=-]+$/.test(t);
}

function parseClashInput(text: string): Proxy[] {
  const nodes: Proxy[] = [];
  try {
    const doc = yaml.load(text) as any;
    const list = doc?.proxies ?? doc?.Proxy;
    if (!Array.isArray(list)) return nodes;
    for (const p of list) nodes.push(clashProxyToProxy(p));
  } catch {
    // ignore
  }
  return nodes;
}

function parseSingBoxInput(text: string): Proxy[] {
  const nodes: Proxy[] = [];
  try {
    const doc = JSON.parse(text) as any;
    const list = doc?.outbounds;
    if (!Array.isArray(list)) return nodes;
    for (const o of list) {
      const n = singboxOutboundToProxy(o);
      if (n) nodes.push(n);
    }
  } catch {
    // ignore
  }
  return nodes;
}

export function clashProxyToProxy(p: any): Proxy {
  const node = createProxy();
  node.remark = p.name ?? "";
  node.hostname = p.server ?? "";
  node.port = toInt(String(p.port ?? 0));
  switch (p.type) {
    case "ss":
      node.type = ProxyType.Shadowsocks;
      node.encryptMethod = p.cipher ?? "";
      node.password = String(p.password ?? "");
      node.plugin = p.plugin ?? "";
      if (p["plugin-opts"]) node.pluginOption = clashPluginOptsToString(p.plugin, p["plugin-opts"]);
      node.group = DEFAULT_GROUPS[ProxyType.Shadowsocks];
      break;
    case "vmess":
      node.type = ProxyType.VMess;
      node.userId = p.uuid ?? "";
      node.alterId = toInt(String(p.alterId ?? 0));
      node.encryptMethod = p.cipher ?? "auto";
      node.tlsSecure = !!p.tls;
      node.serverName = p.servername ?? "";
      node.alpnList = p.alpn ? [...p.alpn] : [];
      node.transferProtocol = p.network ?? "tcp";
      if (p["ws-opts"]) {
        node.path = p["ws-opts"].path ?? "/";
        node.host = p["ws-opts"].headers?.Host ?? "";
      }
      if (p["grpc-opts"]) node.grpcServiceName = p["grpc-opts"]["grpc-service-name"] ?? "";
      node.group = DEFAULT_GROUPS[ProxyType.VMess];
      break;
    case "vless":
      node.type = ProxyType.VLESS;
      node.userId = p.uuid ?? "";
      node.tlsSecure = !!p.tls;
      node.flow = p.flow ?? "";
      node.serverName = p.servername ?? "";
      node.alpnList = p.alpn ? [...p.alpn] : [];
      node.transferProtocol = p.network ?? "tcp";
      if (p["reality-opts"]) {
        node.publicKey = p["reality-opts"]["public-key"] ?? "";
        node.shortId = p["reality-opts"]["short-id"] ?? "";
      }
      if (p["ws-opts"]) {
        node.path = p["ws-opts"].path ?? "/";
        node.host = p["ws-opts"].headers?.Host ?? "";
      }
      if (p["grpc-opts"]) node.grpcServiceName = p["grpc-opts"]["grpc-service-name"] ?? "";
      node.fingerprint = p["client-fingerprint"] ?? "";
      node.group = DEFAULT_GROUPS[ProxyType.VLESS];
      break;
    case "trojan":
      node.type = ProxyType.Trojan;
      node.password = String(p.password ?? "");
      node.tlsSecure = true;
      node.serverName = p.sni ?? "";
      node.alpnList = p.alpn ? [...p.alpn] : [];
      node.transferProtocol = p.network ?? "tcp";
      if (p["ws-opts"]) {
        node.path = p["ws-opts"].path ?? "/";
        node.host = p["ws-opts"].headers?.Host ?? "";
      }
      if (p["grpc-opts"]) node.grpcServiceName = p["grpc-opts"]["grpc-service-name"] ?? "";
      node.group = DEFAULT_GROUPS[ProxyType.Trojan];
      break;
    case "hysteria2":
      node.type = ProxyType.Hysteria2;
      node.password = String(p.password ?? p.auth ?? "");
      node.serverName = p.sni ?? "";
      node.upMbps = p.up ?? "";
      node.downMbps = p.down ?? "";
      node.alpn = p.alpn ? p.alpn.join(",") : "";
      node.obfsParam = p.obfs ?? "";
      node.obfsPassword = p["obfs-password"] ?? "";
      node.ports = p.ports ?? "";
      node.group = DEFAULT_GROUPS[ProxyType.Hysteria2];
      break;
    case "tuic":
      node.type = ProxyType.TUIC;
      node.password = String(p.password ?? "");
      node.userId = p.uuid ?? "";
      node.serverName = p.sni ?? "";
      node.alpn = p.alpn ? p.alpn.join(",") : "";
      node.congestionControl = p["congestion-controller"] ?? "";
      node.udpRelayMode = p["udp-relay-mode"] ?? "native";
      node.group = DEFAULT_GROUPS[ProxyType.TUIC];
      break;
    case "anytls":
      node.type = ProxyType.AnyTLS;
      node.password = String(p.password ?? "");
      node.sni = p.sni ?? "";
      node.fingerprint = p.fingerprint ?? "";
      node.alpnList = p.alpn ? [...p.alpn] : [];
      node.group = DEFAULT_GROUPS[ProxyType.AnyTLS];
      break;
    default:
      node.type = ProxyType.Unknown;
  }
  if (!node.remark) node.remark = `${node.hostname}:${node.port}`;
  return node;
}

function clashPluginOptsToString(plugin: string, opts: any): string {
  if (plugin === "obfs") {
    return `obfs=${opts.mode};obfs-host=${opts.host ?? ""}`;
  }
  if (plugin === "v2ray-plugin") {
    const parts: string[] = [];
    if (opts.mode) parts.push(`mode=${opts.mode}`);
    if (opts.host) parts.push(`host=${opts.host}`);
    if (opts.path) parts.push(`path=${opts.path}`);
    if (opts.tls) parts.push("tls");
    if (opts.mux) parts.push("mux");
    return parts.join(";");
  }
  return "";
}

export function singboxOutboundToProxy(o: any): Proxy | null {
  if (!o || !o.type) return null;
  const node = createProxy();
  node.remark = o.tag ?? "";
  node.hostname = o.server ?? "";
  node.port = toInt(String(o.server_port ?? 0));
  if (node.port === 0) return null;
  const tls = o.tls ?? {};
  switch (o.type) {
    case "shadowsocks":
      node.type = ProxyType.Shadowsocks;
      node.encryptMethod = o.method ?? "";
      node.password = String(o.password ?? "");
      node.plugin = o.plugin ?? "";
      node.pluginOption = o.plugin_opts ?? "";
      node.group = DEFAULT_GROUPS[ProxyType.Shadowsocks];
      break;
    case "vmess":
      node.type = ProxyType.VMess;
      node.userId = o.uuid ?? "";
      node.alterId = toInt(String(o.alter_id ?? 0));
      node.encryptMethod = o.security ?? "auto";
      if (o.transport) applySingboxTransport(node, o.transport);
      node.tlsSecure = !!tls.enabled;
      node.serverName = tls.server_name ?? "";
      node.group = DEFAULT_GROUPS[ProxyType.VMess];
      break;
    case "vless":
      node.type = ProxyType.VLESS;
      node.userId = o.uuid ?? "";
      node.flow = o.flow ?? "";
      if (o.transport) applySingboxTransport(node, o.transport);
      node.tlsSecure = !!tls.enabled;
      node.serverName = tls.server_name ?? "";
      node.group = DEFAULT_GROUPS[ProxyType.VLESS];
      break;
    case "trojan":
      node.type = ProxyType.Trojan;
      node.password = String(o.password ?? "");
      if (o.transport) applySingboxTransport(node, o.transport);
      node.tlsSecure = !!tls.enabled;
      node.serverName = tls.server_name ?? "";
      node.group = DEFAULT_GROUPS[ProxyType.Trojan];
      break;
    case "hysteria2":
      node.type = ProxyType.Hysteria2;
      node.password = String(o.password ?? "");
      node.serverName = tls.server_name ?? "";
      node.alpn = tls.alpn ? tls.alpn.join(",") : "";
      if (o.up_mbps != null) node.upMbps = String(o.up_mbps);
      if (o.down_mbps != null) node.downMbps = String(o.down_mbps);
      node.group = DEFAULT_GROUPS[ProxyType.Hysteria2];
      break;
    case "tuic":
      node.type = ProxyType.TUIC;
      node.password = String(o.password ?? "");
      node.userId = o.uuid ?? "";
      node.serverName = tls.server_name ?? "";
      node.alpn = tls.alpn ? tls.alpn.join(",") : "";
      node.congestionControl = o.congestion_control ?? "";
      node.udpRelayMode = o.udp_relay_mode ?? "native";
      node.group = DEFAULT_GROUPS[ProxyType.TUIC];
      break;
    case "anytls":
      node.type = ProxyType.AnyTLS;
      node.password = String(o.password ?? "");
      node.sni = tls.server_name ?? "";
      node.alpnList = tls.alpn ? [...tls.alpn] : [];
      node.group = DEFAULT_GROUPS[ProxyType.AnyTLS];
      break;
    default:
      return null;
  }
  if (!node.remark) node.remark = `${node.hostname}:${node.port}`;
  return node;
}

function applySingboxTransport(node: Proxy, t: any) {
  switch (t.type) {
    case "ws":
      node.transferProtocol = "ws";
      node.path = t.path ?? "/";
      node.host = t.headers?.Host ?? "";
      break;
    case "http":
      node.transferProtocol = "http";
      node.path = t.path ?? "/";
      node.host = t.host ?? "";
      break;
    case "grpc":
      node.transferProtocol = "grpc";
      node.grpcServiceName = t.service_name ?? "";
      break;
    case "httpupgrade":
      node.transferProtocol = "h2";
      node.path = t.path ?? "/";
      node.host = t.host ?? "";
      break;
  }
}
