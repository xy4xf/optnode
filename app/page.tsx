"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  id: string;
  code: string;
  shortUrl: string;
  tokenUrl: string;
  expiresAt: number; // ms epoch
  nodeCount: number;
  protected: boolean;
}

export default function Home() {
  const [input, setInput] = useState(SAMPLES);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // share panel state
  const [shareOpen, setShareOpen] = useState(false);
  const [shareOptsOpen, setShareOptsOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState("");
  const [share, setShare] = useState<ShareResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pwd, setPwd] = useState("");
  const [ttl, setTtl] = useState(15);
  const [maxDl, setMaxDl] = useState("");
  const [expiresHours, setExpiresHours] = useState("");
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { output, nodeCount, ok } = useMemo(() => {
    try {
      const nodes = parseSubscription(input);
      const out = convert(input, { fullConfig: true });
      return { output: out, nodeCount: nodes.length, ok: nodes.length > 0 };
    } catch (e: any) {
      return { output: `// error: ${e?.message ?? e}`, nodeCount: 0, ok: false };
    }
  }, [input]);

  // countdown ticker
  useEffect(() => {
    if (share) {
      intervalRef.current = setInterval(() => setNow(Date.now()), 1000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
      };
    }
  }, [share]);

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
      const body: any = { input, fullConfig: true, ttlMins: ttl || 15 };
      if (pwd) body.password = pwd;
      if (maxDl) body.maxDownloads = Number(maxDl);
      if (expiresHours) body.expiresHours = Number(expiresHours);
      const res = await fetch("/api/sub/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setShare(data);
      setNow(Date.now());
    } catch (e: any) {
      setShareError(e?.message ?? "Failed to create link");
    } finally {
      setShareLoading(false);
    }
  }

  async function refreshToken() {
    if (!share) return;
    setShareError("");
    setRefreshing(true);
    try {
      const body: any = {};
      if (share.protected && pwd) body.password = pwd;
      const res = await fetch("/api/sub/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: share.id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setShare({ ...share, tokenUrl: data.tokenUrl, expiresAt: data.expiresAt });
      setNow(Date.now());
    } catch (e: any) {
      setShareError(e?.message ?? "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }

  function openShare() {
    setShare(null);
    setShareError("");
    setShareOpen(true);
  }

  const remaining = share ? Math.max(0, share.expiresAt - now) : 0;
  const expired = share ? remaining <= 0 : false;
  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);

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
            <button
              onClick={openShare}
              disabled={!ok}
              className="text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              分享
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
                    把当前输入({nodeCount} 个节点)转换成 mihomo YAML 并生成两种链接:
                    <span className="text-zinc-300">短链接</span>(持久,可直接当订阅地址导入)与
                    <span className="text-zinc-300">15 分钟下载链接</span>(临时,到期可续期)。
                  </p>

                  <button
                    onClick={() => setShareOptsOpen((v) => !v)}
                    className="text-xs text-zinc-400 hover:text-emerald-400"
                  >
                    {shareOptsOpen ? "▾" : "▸"} 可选设置(密码 / 有效期 / 下载上限)
                  </button>
                  {shareOptsOpen && (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <label className="col-span-2 flex flex-col gap-1">
                        <span className="text-zinc-500">密码(可选,保护短链接)</span>
                        <input
                          type="text"
                          value={pwd}
                          onChange={(e) => setPwd(e.target.value)}
                          placeholder="留空则无密码"
                          className="rounded-md bg-zinc-950 border border-zinc-700 px-2 py-1.5 outline-none focus:border-emerald-500"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-zinc-500">下载链接有效期(分钟,≤60)</span>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={ttl}
                          onChange={(e) => setTtl(Number(e.target.value))}
                          className="rounded-md bg-zinc-950 border border-zinc-700 px-2 py-1.5 outline-none focus:border-emerald-500"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-zinc-500">最大下载次数(可选)</span>
                        <input
                          type="number"
                          min={1}
                          value={maxDl}
                          onChange={(e) => setMaxDl(e.target.value)}
                          placeholder="不限"
                          className="rounded-md bg-zinc-950 border border-zinc-700 px-2 py-1.5 outline-none focus:border-emerald-500"
                        />
                      </label>
                      <label className="col-span-2 flex flex-col gap-1">
                        <span className="text-zinc-500">短链接存活时长(小时,≤720,可选)</span>
                        <input
                          type="number"
                          min={1}
                          max={720}
                          value={expiresHours}
                          onChange={(e) => setExpiresHours(e.target.value)}
                          placeholder="不限"
                          className="rounded-md bg-zinc-950 border border-zinc-700 px-2 py-1.5 outline-none focus:border-emerald-500"
                        />
                      </label>
                    </div>
                  )}

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
                    label="短链接 · 持久"
                    value={share.shortUrl}
                    onCopy={() => copyText(share.shortUrl, "短链接")}
                    hint={share.protected ? "已加密码保护,需 ?pwd= 或 Basic 认证" : "可直接导入客户端"}
                  />
                  <LinkRow
                    label={
                      expired
                        ? "15 分钟下载链接 · 已过期"
                        : `15 分钟下载链接 · 剩余 ${mm}:${ss.toString().padStart(2, "0")}`
                    }
                    value={share.tokenUrl}
                    onCopy={() => copyText(share.tokenUrl, "下载链接")}
                    expired={expired}
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={refreshToken}
                      disabled={refreshing}
                      className="rounded-md px-3 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {refreshing ? "续期中…" : "续期(重新生成 15 分钟链接)"}
                    </button>
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
  expired,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  hint?: string;
  expired?: boolean;
}) {
  return (
    <div className={expired ? "opacity-50" : ""}>
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
