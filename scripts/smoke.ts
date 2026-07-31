import { convert, parseSubscription } from "../lib/proxy";

const samples = [
  "ss://YWVzLTI1Ni1nY206dGVzdA==@example.com:8388#ss-test",
  "ss://aes-256-gcm:password@1.2.3.4:8388/?plugin=obfs-local%3Bobfs%3Dhttp%3Bobfs-host%3Dexample.com#ss-plugin",
  "vmess://eyJ2IjoiMiIsInBzIjoidm1lc3Mtd3MiLCJhZGQiOiJ2bS5leGFtcGxlLmNvbSIsInBvcnQiOiI0NDMiLCJpZCI6IjExMTExMTExLTIyMjItMzMzMy00NDQ0LTU1NTU1NTU1NTU1NSIsImFpZCI6IjAiLCJzY3kiOiJhdXRvIiwibmV0Ijoid3MiLCJ0eXBlIjoibm9uZSIsImhvc3QiOiJ2bS5leGFtcGxlLmNvbSIsInBhdGgiOiIvIiwidGxzIjoidGxzIiwic25pIjoidm0uZXhhbXBsZS5jb20ifQ==",
  "vless://11111111-2222-3333-4444-555555555555@example.com:443?type=ws&security=tls&path=%2Fpath&host=example.com&sni=example.com&alpn=h2,http/1.1#vless-ws",
  "vless://11111111-2222-3333-4444-555555555555@example.com:443?type=grpc&security=reality&pbk=abcdef&sid=01&fp=chrome&sni=example.com&flow=xtls-rprx-vision#vless-reality",
  "trojan://pass@example.com:443?type=ws&path=%2Fws&host=example.com&sni=example.com#trojan-ws",
  "hysteria2://pass@example.com:443?sni=example.com&insecure=1&up=50&down=200&alpn=h3#hy2-test",
  "tuic://11111111-2222-3333-4444-555555555555:pass@example.com:443?sni=example.com&alpn=h3&congestion_control=bbr#tuic-test",
  "anytls://pass@example.com:443?sni=example.com&fp=chrome&alpn=h2#anytls-test",
];

const input = samples.join("\n");
const nodes = parseSubscription(input);
console.log(`Parsed ${nodes.length} nodes:`);
for (const n of nodes) console.log(`  - [${n.type}] ${n.remark}  ${n.hostname}:${n.port}`);

console.log("\n=== MIHOMO (ACL4SSR) ===");
console.log(convert(input, { fullConfig: true }));
