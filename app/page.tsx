"use client";

import { useMemo, useState } from "react";
import { convert } from "@/lib/proxy";

const SAMPLES = [
  "ss://YWVzLTI1Ni1nY206dGVzdA==@example.com:8388#ss-test",
  "vmess://eyJ2IjoiMiIsInBzIjoidm1lc3Mtd3MiLCJhZGQiOiJ2bS5leGFtcGxlLmNvbSIsInBvcnQiOiI0NDMiLCJpZCI6IjExMTExMTExLTIyMjItMzMzMy00NDQ0LTU1NTU1NTU1NTU1NSIsImFpZCI6IjAiLCJzY3kiOiJhdXRvIiwibmV0Ijoid3MiLCJ0eXBlIjoibm9uZSIsImhvc3QiOiJ2bS5leGFtcGxlLmNvbSIsInBhdGgiOiIvIiwidGxzIjoidGxzIiwic25pIjoidm0uZXhhbXBsZS5jb20ifQ==",
  "vless://11111111-2222-3333-4444-555555555555@example.com:443?type=ws&security=tls&path=%2Fpath&host=example.com&sni=example.com&alpn=h2,http/1.1#vless-ws",
  "trojan://pass@example.com:443?type=ws&path=%2Fws&sni=example.com#trojan-ws",
  "hysteria2://pass@example.com:443?sni=example.com&insecure=1&up=50&down=200&alpn=h3#hy2-test",
  "tuic://11111111-2222-3333-4444-555555555555:pass@example.com:443?sni=example.com&alpn=h3&congestion_control=bbr#tuic-test",
  "anytls://pass@example.com:443?sni=example.com&fp=chrome&alpn=h2#anytls-test",
].join("\n");

// mihomo / clash is the only output format.
const META = { label: "mihomo / clash", ext: "yaml", mime: "text/yaml" };

export default function Home() {
  const [input, setInput] = useState(SAMPLES);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const { output } = useMemo(() => {
    try {
      const out = convert(input, { fullConfig: true });
      return { output: out };
    } catch (e: any) {
      return { output: `// error: ${e?.message ?? e}` };
    }
  }, [input]);

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setError("clipboard unavailable");
    }
  }

  function download() {
    const blob = new Blob([output], { type: META.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `optnode-mihomo.${META.ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <header className="shrink-0 border-b border-zinc-800 px-6 py-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight">optnode</h1>
          <span className="text-xs text-zinc-500">
            proxy config converter → mihomo / clash · vmess / vless / trojan / hysteria2 / tuic / anytls / ss
          </span>
        </div>
        <span className="ml-auto px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          mihomo / clash
        </span>
      </header>

      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-px bg-zinc-800">
        <section className="flex flex-col bg-zinc-950 min-h-0">
          <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">input</span>
            <button
              onClick={() => setInput(SAMPLES)}
              className="ml-auto text-xs text-zinc-400 hover:text-emerald-400"
            >
              load sample
            </button>
            <button onClick={() => setInput("")} className="text-xs text-zinc-400 hover:text-rose-400">
              clear
            </button>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder="Paste share links, base64 subscription, clash YAML, or sing-box JSON…"
            className="flex-1 min-h-0 w-full resize-none overflow-auto bg-transparent p-4 font-mono text-xs leading-relaxed outline-none placeholder:text-zinc-600"
          />
        </section>

        <section className="flex flex-col bg-zinc-950 min-h-0">
          <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              output · {META.label}
            </span>
            <button
              onClick={copyOutput}
              className="ml-auto text-xs text-zinc-400 hover:text-emerald-400"
            >
              {copied ? "copied!" : "copy"}
            </button>
            <button onClick={download} className="text-xs text-zinc-400 hover:text-emerald-400">
              download
            </button>
          </div>
          <pre className="flex-1 min-h-0 overflow-auto p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
            {output}
          </pre>
        </section>
      </main>

      {error && (
        <div className="shrink-0 px-6 py-2 bg-rose-950/40 border-t border-rose-900 text-xs text-rose-300">
          {error}
        </div>
      )}

      <footer className="shrink-0 px-6 py-2 border-t border-zinc-800 text-[11px] text-zinc-600 flex justify-between">
        <span>
          inspired by subconverter · runs fully client-side · API:{" "}
          <code className="text-zinc-500">POST /api/convert</code>
        </span>
      </footer>
    </div>
  );
}
