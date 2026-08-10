"use client";

import { useMemo, useState } from "react";
import { convert, parseSubscription } from "@/lib/proxy";

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

interface ShareResult {
  shortUrl: string;
  nodeCount: number;
}

export default function Home() {
  const [input, setInput] = useState(SAMPLES);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // share panel state
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState("");
  const [share, setShare] = useState<ShareResult | null>(null);

  const { output, nodeCount, ok } = useMemo(() => {
    try {
      const nodes = parseSubscription(input);
      const out = convert(input, { fullConfig: true });
      return { output: out, nodeCount: nodes.length, ok: nodes.length > 0 };
    } catch (e: any) {
      return { output: `// error: ${e?.message ?? e}`, nodeCount: 0, ok: false };
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

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setShareError(`${label} copied`);
      setTimeout(() => setShareError(""), 1200);
    } catch {
      setShareError("clipboard unavailable");
    }
  }

  async function createShare() {
    setShareError("");
    if (!ok) {
      setShareError("Nothing valid to share");
      return;
    }
    setShareLoading(true);
    try {
      const res = await fetch("/api/sub/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, fullConfig: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setShare({ shortUrl: data.shortUrl, nodeCount: data.nodeCount });
    } catch (e: any) {
      setShareError(e?.message ?? "Failed to create link");
    } finally {
      setShareLoading(false);
    }
  }

  function openShare() {
    setShare(null);
    setShareError("");
    setShareOpen(true);
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
        <button
          onClick={openShare}
          disabled={!ok}
          className="ml-auto px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          生成订阅链接
        </button>
        <span className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800/60 text-zinc-300 border border-zinc-700">
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
            <span className="text-[11px] text-zinc-600">{nodeCount} nodes</span>
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

      {/* share / subscription link panel */}
      {shareOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-semibold">订阅下载链接</h2>
              <button
                onClick={() => setShareOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              {!share ? (
                <>
                  <p className="text-xs text-zinc-400">
                    把当前输入({nodeCount} 个节点)转换成 mihomo YAML,生成一个持久的订阅链接,可直接导入客户端。
                  </p>

                  <button
                    onClick={createShare}
                    disabled={shareLoading}
                    className="w-full rounded-md px-3 py-2 text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
                  >
                    {shareLoading ? "生成中…" : "生成链接"}
                  </button>
                </>
              ) : (
                <div className="space-y-3">
                  <LinkRow
                    label="订阅链接"
                    value={share.shortUrl}
                    onCopy={() => copyText(share.shortUrl, "链接")}
                    hint="可直接导入客户端 · 持久有效"
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] text-zinc-600">{share.nodeCount} nodes</span>
                  </div>
                </div>
              )}

              {shareError && (
                <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-900 rounded-md px-3 py-2">
                  {shareError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LinkRow({
  label,
  value,
  onCopy,
  hint,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</span>
        <button onClick={onCopy} className="text-xs text-emerald-400 hover:text-emerald-300">
          copy
        </button>
      </div>
      <code className="block break-all rounded-md bg-zinc-950 border border-zinc-800 px-3 py-2 text-[11px] leading-relaxed text-zinc-300">
        {value}
      </code>
      {hint && <p className="mt-1 text-[11px] text-zinc-600">{hint}</p>}
    </div>
  );
}
