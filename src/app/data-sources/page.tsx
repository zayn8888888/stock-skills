"use client";

import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronRight, Database, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

// ── Types ────────────────────────────────────────────────────────

interface Provider {
  id: string;
  name: string;
  adapterId: string;
  enabled: boolean;
  status: string;
  lastCheckAt: string | null;
  lastError: string | null;
}

interface Capability {
  id: string;
  slug: string;
  category: string;
  displayName: string;
  description: string | null;
  responseSchema: string | null;
}

interface Route {
  id: string;
  providerId: string;
  capabilityId: string;
  markets: string;
  priority: number;
  enabled: number;
}

// ── Labels ───────────────────────────────────────────────────────

const LABELS = {
  en: {
    title: "Data Sources",
    subtitle: "Providers, capabilities, and routing — managed via code manifests",
    providers: "Providers",
    capabilities: "Capabilities",
    matrix: "Routing Matrix",
    enabled: "Enabled",
    status: { healthy: "Healthy", degraded: "Degraded", down: "Down", unknown: "Unknown" },
    noRoute: "—",
    allMarkets: "*",
    fields: "Fields",
    viewSchema: "View JSON Schema",
    p1: "P1 (primary)",
    p2: "P2+ (fallback)",
    disabled: "Disabled",
    addRoute: "Add route",
    refresh: "Refresh",
    toggleProvider: "Toggle provider",
  },
  zh: {
    title: "数据源管理",
    subtitle: "供应商、能力和路由 — 通过代码 manifest 管理",
    providers: "供应商",
    capabilities: "能力",
    matrix: "路由矩阵",
    enabled: "启用",
    status: { healthy: "健康", degraded: "降级", down: "不可用", unknown: "未知" },
    noRoute: "—",
    allMarkets: "*",
    fields: "字段",
    viewSchema: "查看 JSON Schema",
    p1: "P1 (主)",
    p2: "P2+ (备)",
    disabled: "禁用",
    addRoute: "添加路由",
    refresh: "刷新",
    toggleProvider: "切换供应商",
  },
} as const;

// ── Auth fetch ───────────────────────────────────────────────────

let authToken: string | null = null;
async function apiFetch(url: string, init?: RequestInit) {
  if (!authToken) {
    const r = await fetch("/api/auth/token");
    if (r.ok) authToken = (await r.json()).token;
  }
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      "X-Requested-With": "fetch",
      ...init?.headers,
    },
  });
}

// ── Page ─────────────────────────────────────────────────────────

export default function DataSourcesPage() {
  const { language } = useLanguage();
  const labels = LABELS[language];

  const [providers, setProviders] = useState<Provider[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes, rRes] = await Promise.all([
        fetch("/api/data-sources/providers"),
        fetch("/api/data-sources/capabilities"),
        fetch("/api/data-sources/routes"),
      ]);
      if (pRes.ok) setProviders(await pRes.json());
      if (cRes.ok) setCapabilities(await cRes.json());
      if (rRes.ok) setRoutes(await rRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Route lookup
  const routeMap = new Map<string, Route>();
  for (const r of routes) routeMap.set(`${r.providerId}:${r.capabilityId}`, r);
  const getRoute = (provId: string, capId: string) => routeMap.get(`${provId}:${capId}`);

  // Toggle provider enabled
  const toggleProvider = async (id: string, currentEnabled: boolean) => {
    await apiFetch(`/api/data-sources/providers/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: currentEnabled ? 0 : 1 }),
    });
    refresh();
  };

  const statusColor = (s: string) =>
    ({
      healthy: "bg-green-500",
      degraded: "bg-yellow-500",
      down: "bg-red-500",
      unknown: "bg-muted-foreground/30",
    })[s] ?? "bg-muted-foreground/30";

  const marketDisplay = (m: string) => {
    try {
      const a = JSON.parse(m) as string[];
      return a.includes("*") ? labels.allMarkets : a.join(", ");
    } catch {
      return m;
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">{labels.title}</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{labels.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className="h-4 w-4" /> {labels.refresh}
        </button>
      </div>

      {/* Providers — toggle enabled only */}
      <section className="space-y-2">
        <h2 className="text-lg font-medium">{labels.providers}</h2>
        <div className="grid gap-2">
          {providers.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3"
            >
              <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", statusColor(p.status))} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{p.adapterId}</p>
              </div>
              <span className="text-xs text-muted-foreground">
                {labels.status[p.status as keyof typeof labels.status] ?? p.status}
              </span>
              <button
                type="button"
                onClick={() => toggleProvider(p.id, p.enabled)}
                aria-label={`${labels.toggleProvider}: ${p.name}`}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  p.enabled ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg transition-transform",
                    p.enabled ? "translate-x-4" : "translate-x-0",
                  )}
                />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Routing Matrix — read-only */}
      <section className="space-y-2">
        <h2 className="text-lg font-medium">{labels.matrix}</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground sticky left-0 bg-muted/50 z-10">
                  {labels.providers}
                </th>
                {capabilities.map((cap) => (
                  <th
                    key={cap.id}
                    className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground min-w-[100px]"
                    title={cap.description ?? cap.slug}
                  >
                    <div>{cap.displayName}</div>
                    <div className="text-[10px] font-mono opacity-50">{cap.slug}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {providers.map((prov) => (
                <tr
                  key={prov.id}
                  className="border-t border-border hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-2.5 sticky left-0 bg-card z-10">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn("h-2 w-2 rounded-full shrink-0", statusColor(prov.status))}
                      />
                      <span className="font-medium text-sm">{prov.name}</span>
                    </div>
                  </td>
                  {capabilities.map((cap) => {
                    const route = getRoute(prov.id, cap.id);
                    return (
                      <td key={cap.id} className="px-2 py-2.5 text-center">
                        {route ? (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span
                              className={cn(
                                "inline-flex items-center justify-center h-7 w-7 rounded-md",
                                route.enabled
                                  ? route.priority <= 1
                                    ? "bg-green-500/15 text-green-600"
                                    : "bg-yellow-500/15 text-yellow-600"
                                  : "bg-muted text-muted-foreground/40",
                              )}
                            >
                              {route.enabled ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <X className="h-3.5 w-3.5" />
                              )}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              P{route.priority}
                            </span>
                            <span className="text-[9px] text-muted-foreground/50">
                              {marketDisplay(route.markets)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/20 text-xs">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Capabilities — read-only with schema detail */}
      <section className="space-y-2">
        <h2 className="text-lg font-medium">{labels.capabilities}</h2>
        <div className="grid gap-2">
          {capabilities.map((cap) => (
            <CapabilityCard key={cap.id} cap={cap} labels={labels} />
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Capability Card ──────────────────────────────────────────────

function CapabilityCard({
  cap,
  labels,
}: { cap: Capability; labels: (typeof LABELS)["en"] | (typeof LABELS)["zh"] }) {
  const [expanded, setExpanded] = useState(false);

  let fields: Array<{ name: string; type: string; desc: string }> = [];
  if (cap.responseSchema) {
    try {
      const s = JSON.parse(cap.responseSchema) as {
        properties?: Record<string, { type: string; description?: string }>;
      };
      if (s.properties)
        fields = Object.entries(s.properties).map(([n, p]) => ({
          name: n,
          type: p.type,
          desc: p.description ?? "",
        }));
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        <span className="inline-block rounded bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary">
          {cap.category}
        </span>
        <span className="font-medium text-sm">{cap.displayName}</span>
        <span className="text-xs text-muted-foreground font-mono">{cap.slug}</span>
        {cap.description && (
          <span className="text-xs text-muted-foreground ml-auto truncate max-w-md">
            {cap.description}
          </span>
        )}
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {expanded && fields.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <h4 className="text-xs font-medium text-muted-foreground mb-2">{labels.fields}</h4>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Field</th>
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Type</th>
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => (
                  <tr key={f.name} className="border-t border-border/50">
                    <td className="px-3 py-1.5 font-mono text-foreground/80">{f.name}</td>
                    <td className="px-3 py-1.5">
                      <span className="inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary">
                        {f.type}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{f.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cap.responseSchema && (
            <details className="text-xs mt-2">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                {labels.viewSchema}
              </summary>
              <pre className="mt-2 p-3 rounded-md bg-muted/50 overflow-x-auto font-mono text-[11px] text-foreground/70 whitespace-pre-wrap break-all">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(cap.responseSchema), null, 2);
                  } catch {
                    return cap.responseSchema;
                  }
                })()}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
