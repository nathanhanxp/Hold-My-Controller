"use client";
import { useState } from "react";
import { PageHeader, SkeletonPanel, ErrorPanel, StatusLine } from "../ui";
import { Beacon } from "../glyphs";
import { api, useFetch } from "@/lib/client";

type Dep = { name: string; ok: boolean; level: "ok" | "degraded" | "down"; detail: string; checkedAt: number };
type Status = { mode: string; deps: Dep[]; chaosAllowed: boolean; chaosGemini: boolean; uptimeMs: number; testCount: number | null };

export function StatusPage() {
  const { data, error, loading, reload } = useFetch<Status>("/api/status", 15_000);
  const [msg, setMsg] = useState("");
  const toggle = async () => {
    try {
      const r = await api<{ chaosGemini: boolean }>("/api/chaos/gemini", { method: "POST", json: { on: !data?.chaosGemini } });
      setMsg(r.chaosGemini ? "Simulating a Gemini outage. Ask the AI assistant: the badge should read Nemotron, cached or local." : "Gemini outage simulation off.");
      reload();
    } catch (e) { setMsg((e as Error).message); }
  };
  const lit = data?.deps.filter((d) => d.level === "ok").length ?? 0;
  return (
    <div className="wrap">
      <PageHeader eyebrow="Status" title="System status" />
      {loading && !data ? <div style={{ marginTop: 18 }}><SkeletonPanel lines={6} /></div> : null}
      {error ? <div style={{ marginTop: 18 }}><ErrorPanel message="Couldn't reach the server. Retrying." onRetry={reload} /></div> : null}
      {data ? (
        <div className="stack" style={{ marginTop: 18 }}>
          <div className="row" aria-label={`${lit} of ${data.deps.length} beacons lit`}>
            {data.deps.map((d) => <span key={d.name} title={d.name} style={{ color: d.level === "ok" ? "var(--olive)" : d.level === "degraded" ? "var(--gold)" : "var(--clay)" }}><Beacon size={30} lit={d.level !== "down"} /></span>)}
            <span className="small muted">{lit} of {data.deps.length} healthy. Mode: {data.mode}. Up {Math.round(data.uptimeMs / 60000)} min.</span>
          </div>
          <div className="panel table-scroll">
            <table className="data">
              <thead><tr><th>Dependency</th><th>State</th><th>Detail</th><th>Checked</th></tr></thead>
              <tbody>{data.deps.map((d) => (
                <tr key={d.name}>
                  <td style={{ fontWeight: 600 }}>{d.name}</td>
                  <td><span className={`chip ${d.level === "ok" ? "ok" : "warn"}`}>{d.level === "ok" ? "Healthy" : d.level === "degraded" ? "Degraded" : "Down"}</span></td>
                  <td className="small">{d.detail}</td>
                  <td className="small muted">{new Date(d.checkedAt).toLocaleTimeString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {data.chaosAllowed ? (
            <section className="panel stack">
              <h2 style={{ fontSize: "1.3rem" }}>Drills</h2>
              <label className="row"><input type="checkbox" checked={data.chaosGemini} onChange={toggle} /> Simulate Gemini outage</label>
              <StatusLine>{msg}</StatusLine>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
