"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { parseGraph, platformerGraph, shooterGraph, viewOf, type Graph } from "@forklab/engine";
import { graphShot } from "@/lib/three/shots";
import { safeStorage } from "@/lib/client";
import { template } from "./templates";

export const DRAFT_KEY = "forklab.draft";
export const MODE_KEY = "forklab.editorMode";

const TEMPLATES: Array<{ id: string; blurb: string }> = [
  { id: "trickshot", blurb: "Walk the court and lob the ball into the hoop. Distance is everything." },
  { id: "shooter", blurb: "Move with WASD, fire with Space, hold off raiders." },
  { id: "siege", blurb: "The arena shooter, but the raiders throw fireballs back." },
  { id: "ledges", blurb: "Run and jump across ledges, grab coins, dodge enemies." },
  { id: "grove", blurb: "Collect olives across the grove while rocks fall." },
  { id: "hurdle", blurb: "Hurdles charge down the lanes. Jump or sidestep." },
  { id: "jump", blurb: "One key. Jump the enemies running in from the right." },
  { id: "dodge", blurb: "Rocks fall from the sky. Jump out of the way." },
  { id: "collect", blurb: "Dodge rocks and pick up coins for points." },
];

/** A frame of the game rendered off screen, faded in when ready. */
export function Shot({ graph, cacheKey, alt }: { graph: Graph; cacheKey: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    graphShot(graph, { key: cacheKey, w: 800, h: 450 }).then((c) => { if (live && c) setSrc(c.toDataURL("image/jpeg", 0.82)); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);
  return <div className={`shot${src ? " ready" : ""}`}>{src ? <img src={src} alt={alt} /> : null}</div>;
}

export function StartScreen() {
  const [draft, setDraft] = useState<Graph | null>(null);
  useEffect(() => {
    const raw = safeStorage().get(DRAFT_KEY);
    if (!raw) return;
    try { const p = parseGraph(JSON.parse(raw)); if (p.ok && p.graph.nodes.length) setDraft(p.graph); } catch { /* no draft */ }
  }, []);
  const three = shooterGraph();
  const two = platformerGraph();
  return (
    <div className="start wrap">
      <header className="start-head">
        <p className="eyebrow">Editor</p>
        <h1>What are you making?</h1>
      </header>
      <div className="start-choices">
        <Link href="/build?new=3d" className="choice">
          <Shot graph={three} cacheKey="start:3d" alt="" />
          <div className="choice-body">
            <span className="choice-tag">3D</span>
            <h2>New 3D game</h2>
            <p>Third-person camera. Move on the ground with WASD.</p>
          </div>
        </Link>
        <Link href="/build?new=2d" className="choice">
          <Shot graph={two} cacheKey="start:2d" alt="" />
          <div className="choice-body">
            <span className="choice-tag">2D</span>
            <h2>New 2D game</h2>
            <p>Side-on camera. Run, jump and land on ledges.</p>
          </div>
        </Link>
        {draft ? (
          <Link href="/build?draft=1" className="choice continue">
            <Shot graph={draft} cacheKey={`draft:${JSON.stringify(draft.nodes.map((n) => [n.id, n.type, n.params])).length}:${draft.title}:${draft.view}`} alt="" />
            <div className="choice-body">
              <span className="choice-tag">{viewOf(draft).toUpperCase()}</span>
              <h2>Continue {draft.title}</h2>
              <p>{draft.nodes.length} blocks, saved on this device.</p>
            </div>
          </Link>
        ) : null}
      </div>
      <section className="start-templates" aria-labelledby="tpl-h">
        <h2 id="tpl-h">Start from a template</h2>
        <div className="tpl-grid">
          {TEMPLATES.map((t) => {
            const g = template(t.id)!;
            return (
              <Link key={t.id} href={`/build?template=${t.id}`} className="tpl">
                <Shot graph={g} cacheKey={`tpl:${t.id}`} alt="" />
                <div className="tpl-body">
                  <div className="row" style={{ justifyContent: "space-between" }}><h3>{g.title}</h3><span className="choice-tag">{viewOf(g).toUpperCase()}</span></div>
                  <p>{t.blurb}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
