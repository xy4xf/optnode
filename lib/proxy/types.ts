// Common proxy node representation, modeled after subconverter's `Proxy` struct
// (src/parser/config/proxy.h). All protocol parsers produce this object, and all
// generators (mihomo/clash, sing-box) consume it.

export enum ProxyType {
  Unknown = "Unknown",
  Shadowsocks = "Shadowsocks",
  ShadowsocksR = "ShadowsocksR",
  VMess = "VMess",
  Trojan = "Trojan",
  HTTP = "HTTP",
  HTTPS = "HTTPS",
  SOCKS5 = "SOCKS5",
  VLESS = "VLESS",
  Hysteria = "Hysteria",
  Hysteria2 = "Hysteria2",
  TUIC = "TUIC",
  AnyTLS = "AnyTLS",
}

/** Tri-state boolean: undefined = inherit default, true/false = explicit. */
export type TriBool = boolean | undefined;

export interface Proxy {
  type: ProxyType;
  group: string;
  remark: string;
  hostname: string;
  port: number;

  // auth
  username: string;
  password: string;
  userId: string; // uuid for vmess/vless/tuic
  alterId: number;
  encryptMethod: string;

  // ss plugin / ssr
  plugin: string;
  pluginOption: string;
  protocol: string;
  protocolParam: string;
  obfs: string;
  obfsParam: string;

  // transport
  transferProtocol: string; // tcp/ws/grpc/h2/http/quic/xhttp
  fakeType: string; // header type / quic security
  host: string; // ws/http host header
  path: string; // ws/grpc path / service name
  edge: string;
  grpcMode: string;
  grpcServiceName: string;

  // tls
  tlsSecure: boolean;
  serverName: string; // sni
  sni: string; // raw sni field used by anytls/hysteria2
  alpn: string; // comma-joined
  alpnList: string[];
  fingerprint: string; // client fingerprint (fp)
  allowInsecure: TriBool; // skip-cert-verify

  // reality (vless)
  publicKey: string;
  shortId: string;
  flow: string;
  encryption: string;
  packetEncoding: string;

  // hysteria / hysteria2
  auth: string;
  authStr: string;
  upMbps: string;
  downMbps: string;
  obfsPassword: string;
  insecure: string;
  ports: string;

  // tuic
  congestionControl: string;
  udpRelayMode: string;
  token: string;
  reduceRtt: TriBool;
  disableSni: TriBool;
  requestTimeout: number;

  // common toggles
  udp: TriBool;
  tcpFastOpen: TriBool;
  tls13: TriBool;

  // chaining
  underlyingProxy: string;
}

export function createProxy(): Proxy {
  return {
    type: ProxyType.Unknown,
    group: "",
    remark: "",
    hostname: "",
    port: 0,
    username: "",
    password: "",
    userId: "",
    alterId: 0,
    encryptMethod: "",
    plugin: "",
    pluginOption: "",
    protocol: "",
    protocolParam: "",
    obfs: "",
    obfsParam: "",
    transferProtocol: "",
    fakeType: "",
    host: "",
    path: "",
    edge: "",
    grpcMode: "",
    grpcServiceName: "",
    tlsSecure: false,
    serverName: "",
    sni: "",
    alpn: "",
    alpnList: [],
    fingerprint: "",
    allowInsecure: undefined,
    publicKey: "",
    shortId: "",
    flow: "",
    encryption: "",
    packetEncoding: "",
    auth: "",
    authStr: "",
    upMbps: "",
    downMbps: "",
    obfsPassword: "",
    insecure: "",
    ports: "",
    congestionControl: "",
    udpRelayMode: "native",
    token: "",
    reduceRtt: undefined,
    disableSni: undefined,
    requestTimeout: 15000,
    udp: undefined,
    tcpFastOpen: undefined,
    tls13: undefined,
    underlyingProxy: "",
  };
}

export function getProxyTypeName(type: ProxyType): string {
  switch (type) {
    case ProxyType.Shadowsocks:
      return "ss";
    case ProxyType.ShadowsocksR:
      return "ssr";
    case ProxyType.VMess:
      return "vmess";
    case ProxyType.Trojan:
      return "trojan";
    case ProxyType.HTTP:
      return "http";
    case ProxyType.HTTPS:
      return "http";
    case ProxyType.SOCKS5:
      return "socks5";
    case ProxyType.VLESS:
      return "vless";
    case ProxyType.Hysteria:
      return "hysteria";
    case ProxyType.Hysteria2:
      return "hysteria2";
    case ProxyType.TUIC:
      return "tuic";
    case ProxyType.AnyTLS:
      return "anytls";
    default:
      return "unknown";
  }
}

export const DEFAULT_GROUPS: Record<ProxyType, string> = {
  [ProxyType.Shadowsocks]: "SSProvider",
  [ProxyType.ShadowsocksR]: "SSRProvider",
  [ProxyType.VMess]: "V2RayProvider",
  [ProxyType.SOCKS5]: "SocksProvider",
  [ProxyType.HTTP]: "HTTPProvider",
  [ProxyType.HTTPS]: "HTTPProvider",
  [ProxyType.Trojan]: "TrojanProvider",
  [ProxyType.VLESS]: "XRayProvider",
  [ProxyType.Hysteria]: "HysteriaProvider",
  [ProxyType.Hysteria2]: "Hysteria2Provider",
  [ProxyType.TUIC]: "TuicProvider",
  [ProxyType.AnyTLS]: "AnyTLSProvider",
  [ProxyType.Unknown]: "UnknownProvider",
};
