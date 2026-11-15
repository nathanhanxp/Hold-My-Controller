"use client";
import { LibraryPicker } from "./LibraryPicker";
import { combine, type PrefabPick, type SourceGame } from "./combine";
import { Splitter } from "./Splitter";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { computeShares, countedNodes, earningNodes, viewOf, emptyGraph, parseGraph, shooterGraph, starterGraph, type Graph, type Theme } from "@forklab/engine";
import { AdvicePop, ChangeConfirm, type Advice } from "./Advice";
import { describeChange, type Change } from "./changes";
import { AiEta, useAiEta } from "./ideas";
import { template } from "./templates";
import { useGraphStore } from "./useGraphStore";
import { layoutScripts as layoutGraph } from "../blocks/model";
const needsLayout = (g: Graph) => g.nodes.some((n) => !n.pos) || new Set(g.nodes.filter((n) => n.pos).map((n) => `${n.pos!.x},${n.pos!.y}`)).size < g.nodes.filter((n) => n.pos).length * 0.5;
import { BlockEditor } from "../blocks/Blocks";
import { NodeStudio, type Pos } from "./NodeStudio";
import { StartScreen, DRAFT_KEY, MODE_KEY } from "./StartScreen";
import { type Proposal } from "./AIPanel";
import { PENDING_KEY, useAssistant } from "../assistant/Assistant";
import { RuleChecklist } from "./RuleChecklist";
import { PublishModal } from "./PublishModal";
import { ExportModal } from "../ExportModal";
import { GamePreview, type RunResult } from "../GamePreview";
import { useIdentity } from "../identity";
import { AuthorChip, Loading, StatusLine } from "../ui";
import { api, safeStorage, TOKEN_LAMPORTS, tokenAmount } from "@/lib/client";
import { authorColor, graphColors } from "@/lib/colors";
import { TUTORIALS } from "@/lib/tutorials";

/** /build with nothing to open shows the start screen; anything else opens the editor. */
export function Editor() {
  const sp = useSearchParams();
  const open = ["fork", "template", "tutorial", "new", "draft", "proposal", "challenge"].some((k) => sp.get(k));
  return open ? <EditorWorkspace /> : <StartScreen />;
}

function EditorWorkspace() {
  const sp = useSearchParams();
  const router = useRouter();
  const { handle } = useIdentity();
  const author = handle ?? "guest";
  const { state, dispatch } = useGraphStore(undefined, author);
  const g = state.graph;
  const [loaded, setLoaded] = useState(false);
  const [forkedFrom, setForkedFrom] = useState<{ hash: string; title: string } | null>(null);
  const [mode, setModeState] = useState<"blocks" | "nodes">(() => (safeStorage().get(MODE_KEY) === "nodes" ? "nodes" : "blocks"));
  const setMode = (m: "blocks" | "nodes") => { setModeState(m); safeStorage().set(MODE_KEY, m); };
  const nodePos = useRef(new Map<string, Pos>());
  const [advice, setAdvice] = useState<Advice | null>(null);
  // every connect or disconnect waits for the user's yes, with what it will do spelled out
  const [pending, setPending] = useState<{ next: Graph; change: Change } | null>(null);
  // switching camera: offer to adapt the game itself, since depth-based play doesn't read from the side (and back)
  const [viewAsk, setViewAsk] = useState<"2d" | "3d" | null>(null);
  const [adapting, setAdapting] = useState(false);
  const adaptEta = useAiEta();
  const switchView = (v: "2d" | "3d") => {
    if (viewOf(g) === v) return;
    if (!g.nodes.length) { dispatch({ t: "meta", patch: { view: v } }); return; }
    setViewAsk(v);
  };
  const adaptView = async (v: "2d" | "3d") => {
    setAdapting(true); adaptEta.begin();
    const prompt = v === "2d"
      ? "Convert this game to a 2D side-on game (view 2d). Keep its idea, goal, scoring and the things in it. Controls: A/D and the arrow keys Move left/right with Stop on release, Space jumps (Move up when grounded) or fires sideways the way you face. Remove W/S and any forward/back movement. Spawn everything at depth z 7700. Enemies and hazards that came toward the player along z should come from the right along -x or fall from above instead; give them prefabs with vx instead of vz if needed. Keep gravity on the player."
      : "Convert this game to a 3D third-person arena game (view 3d). Keep its idea, goal, scoring and the things in it. Controls: WASD Move on the ground (left/right/forward/back) with Stop on release, Space jumps or fires the way you face. Spread spawns across x and z with Random nodes; enemies come toward the player along +z. Keep gravity on the player.";
    try {
      const r = await api<Proposal>("/api/ai/graph", { method: "POST", json: { prompt, editor: author, current: g } });
      adaptEta.end(true);
      setProposal({ ...r, graph: { ...r.graph, view: v } });
      setViewAsk(null);
    } catch (e) {
      adaptEta.end(false);
      setAdvice({ action: "connect", title: "Couldn't adapt the game", what: "", problem: (e as Error).message, affected: [], tone: "warn" });
    } finally {
      setAdapting(false);
    }
  };
  const edit = (next: Graph) => {
    const change = describeChange(g, next);
    if (change) { setPending({ next, change }); return; }
    dispatch({ t: "set", graph: next });
  };
  const [colorByAuthor, setColorByAuthor] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  /** Borrowed games, things and a look arrive as a proposal: nothing changes until Apply. */
  const addFromLibrary = (games: SourceGame[], prefabs: PrefabPick[], theme: Theme | null) => {
    const { graph: next, lines } = combine(g, games, prefabs, theme, author);
    setShowLibrary(false);
    setProposal({
      graph: next,
      grafts: games.map((x) => ({ graph: x.hash, title: x.title, author: x.graph.nodes[0]?.authorId ?? "", nodes: next.nodes.filter((n) => n.originFork === x.hash).map((n) => n.id) })),
      explanation: `Adds ${lines.join("; ")}.`,
      provider: "library",
      badge: "From the library",
      attempts: [],
    });
  };
  const [showPublish, setShowPublish] = useState(false);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);
  const [status, setStatus] = useState("");
  const [themeNote, setThemeNote] = useState("");
  const [challengeRules, setChallengeRules] = useState<string[]>([]);
  const tutorial = TUTORIALS.find((t) => t.id === sp.get("tutorial")) ?? null;

  // initial load: fork, template, tutorial, or the autosaved draft
  useEffect(() => {
    (async () => {
      const fork = sp.get("fork");
      const tpl = template(sp.get("template"));
      const fresh = sp.get("new");
      if (fork) {
        try {
          const r = await api<{ draft: Graph; parentTitle: string }>(`/api/mechanics/${fork}/fork`, { method: "POST" });
          dispatch({ t: "set", graph: needsLayout(r.draft) ? layoutGraph(r.draft) : r.draft, history: false });
          setForkedFrom({ hash: fork, title: r.parentTitle });
          setStatus(`Forked ${r.parentTitle}. Authorship is preserved until you change a node's type or wiring.`);
        } catch (e) { setStatus(`Couldn't load that fork: ${(e as Error).message}`); }
      } else if (fresh === "2d" || fresh === "3d") {
        dispatch({ t: "set", graph: layoutGraph(starterGraph(fresh, author)), history: false });
      } else if (tpl) {
        dispatch({ t: "set", graph: layoutGraph(tpl), history: false });
      } else if (tutorial) {
        dispatch({ t: "set", graph: { ...emptyGraph(author), title: tutorial.title }, history: false });
      } else {
        const raw = safeStorage().get(DRAFT_KEY);
        let ok = false;
        if (raw) {
          try {
            const p = parseGraph(JSON.parse(raw));
            if (p.ok) { dispatch({ t: "set", graph: needsLayout(p.graph) ? layoutGraph(p.graph) : p.graph, history: false }); ok = true; }
          } catch { /* ignore a bad draft */ }
        }
        if (!ok) dispatch({ t: "set", graph: layoutGraph(shooterGraph()), history: false });
      }
      if (sp.get("proposal") === "1") {
        try {
          const raw = sessionStorage.getItem(PENDING_KEY);
          if (raw) { setProposal(JSON.parse(raw) as Proposal); sessionStorage.removeItem(PENDING_KEY); setStatus("Proposal from the assistant. Review it on the canvas, then Apply or Discard."); }
        } catch { /* nothing pending */ }
      }
      const ch = sp.get("challenge");
      if (ch) {
        try {
          const r = await api<{ challenge: { ruleId?: string } }>(`/api/challenges/${ch}`);
          if (r.challenge.ruleId) setChallengeRules([r.challenge.ruleId]);
        } catch { /* no checklist */ }
      }
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // autosave (try/catch inside safeStorage)
  useEffect(() => {
    if (loaded) safeStorage().set(DRAFT_KEY, JSON.stringify(g));
  }, [g, loaded]);

  // keyboard: undo / redo
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.closest?.("input, textarea, select, .stage, .play-shell")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); dispatch({ t: e.shiftKey ? "redo" : "undo" }); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") { e.preventDefault(); dispatch({ t: "redo" }); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [dispatch]);

  useEffect(() => { if (proposal) setAdvice(null); }, [proposal]);
  const validity = useMemo(() => parseGraph(g), [g]);
  const shown = useMemo(() => (proposal ? layoutGraph(proposal.graph) : pending ? pending.next : g), [proposal, g, pending]);
  // the preview keeps the last version that runs: mid-drag a graph can be briefly invalid, and dropping the
  // preview then would throw away its 3D canvas and make a new one on every drop (Chrome caps live WebGL
  // contexts and kills the oldest, the page background, which shows as the screen going black)
  const lastGood = useRef<typeof g | null>(null);
  const preview = useMemo(() => {
    const ok = shown === g ? validity.ok : parseGraph(shown).ok;
    if (ok) lastGood.current = shown;
    return lastGood.current;
  }, [shown, g, validity]);
  // what the proposal adds or changes, highlighted in both editors
  const freshIds = useMemo(() => {
    if (!proposal) return undefined;
    const before = new Map(g.nodes.map((n) => [n.id, JSON.stringify([n.type, n.params])]));
    return new Set(proposal.graph.nodes.filter((n) => before.get(n.id) !== JSON.stringify([n.type, n.params])).map((n) => n.id));
  }, [proposal, g]);
  const authors = useMemo(() => [...new Set(g.nodes.map((n) => n.authorId))], [g]);
  const apply = () => {
    if (!proposal) return;
    const pg = { ...layoutGraph(proposal.graph), parent: g.parent, root: g.root, kind: g.kind, license: g.license, theme: proposal.graph.theme ?? g.theme, view: proposal.graph.view ?? g.view };
    dispatch({ t: "set", graph: pg });
    setProposal(null);
    setStatus("Applied. Undo restores your previous graph.");
  };
  const tplLoad = (name: string) => {
    const t = template(name);
    if (t) { nodePos.current.clear(); dispatch({ t: "set", graph: layoutGraph(t) }); }
  };

  // hand the live graph to the floating assistant while the editor is open
  const assistant = useAssistant();
  const { register } = assistant;
  useEffect(() => {
    register({
      graph: g, editor: author, proposal,
      onProposal: setProposal,
      onApply: apply,
      onDiscard: () => { setProposal(null); setStatus("Proposal discarded. Your graph was not changed."); },
      onTheme: (t, src) => { dispatch({ t: "meta", patch: { theme: t } }); setThemeNote(`from image (${src})`); },
      onTemplate: tplLoad,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, proposal, author]);
  useEffect(() => () => register(null), [register]);

  if (!loaded) return <div className="wrap" style={{ padding: 40 }}><Loading label="Opening the editor" /></div>;

  return (
    <div className="studio">
      <div className="studio-bar" role="toolbar" aria-label="Editor">
        <label className="sr-only" htmlFor="title">Title</label>
        <input id="title" className="studio-title" value={g.title} maxLength={80} onChange={(e) => dispatch({ t: "meta", patch: { title: e.target.value } })} />
        {forkedFrom ? <Link className="chip" href={`/m/${forkedFrom.hash}`}>Fork of {forkedFrom.title}</Link> : null}
        <span className="studio-sep" />
        <button className="btn quiet sm" onClick={() => dispatch({ t: "undo" })} disabled={!state.past.length} aria-label="Undo">Undo</button>
        <button className="btn quiet sm" onClick={() => dispatch({ t: "redo" })} disabled={!state.future.length} aria-label="Redo">Redo</button>
        <div className="seg" role="group" aria-label="Editor style">
          <button aria-pressed={mode === "blocks"} onClick={() => setMode("blocks")}>Blocks</button>
          <button aria-pressed={mode === "nodes"} onClick={() => setMode("nodes")}>Nodes</button>
        </div>
        <div className="seg" role="group" aria-label="Camera">
          <button aria-pressed={viewOf(g) === "2d"} onClick={() => switchView("2d")}>2D</button>
          <button aria-pressed={viewOf(g) === "3d"} onClick={() => switchView("3d")}>3D</button>
        </div>
        <button className="chip" aria-pressed={colorByAuthor} onClick={() => setColorByAuthor((v) => !v)}>Who gets paid</button>
        <span style={{ marginLeft: "auto" }} className="row">
          {proposal ? (
            <>
              <button className="btn sm" onClick={apply}>Apply</button>
              <button className="btn quiet sm" onClick={() => setProposal(null)}>Discard</button>
            </>
          ) : null}
          <button className="btn quiet sm" onClick={() => setShowLibrary(true)} disabled={!!proposal || !!pending} title="Combine other free games, things and looks into this one">Add from library</button>
          <button className="btn quiet sm" onClick={() => router.push("/build")}>New</button>
          <button className="btn ghost sm" onClick={() => setShowExport(true)} disabled={!g.nodes.length}>Export</button>
          <button className="btn sm" onClick={() => setShowPublish(true)} disabled={!validity.ok || !g.nodes.length}>Publish</button>
        </span>
      </div>
      <div className="studio-body">
        <div className="studio-main">
          {mode === "blocks" ? (
            <BlockEditor graph={shown} author={author} readOnly={!!proposal || !!pending} colorByAuthor={colorByAuthor} fresh={freshIds} onChange={edit} onTidy={proposal || pending ? undefined : (next) => dispatch({ t: "positions", pos: Object.fromEntries(next.nodes.filter((n) => n.pos).map((n) => [n.id, n.pos!])) })} onIdeaProposal={(p) => setProposal(p)} />
          ) : (
            <NodeStudio graph={pending ? pending.next : g} proposal={proposal} author={author} colorByAuthor={colorByAuthor} positions={nodePos} onChange={edit} onProposal={(p) => setProposal(p)} onAdvice={setAdvice} />
          )}
          {advice ? <AdvicePop advice={advice} onClose={() => setAdvice(null)} /> : null}
          {viewAsk ? (
            <div className="advice confirm info" role="alertdialog" aria-label="Switch camera">
              <div className="advice-head"><strong>Switch to {viewAsk.toUpperCase()}?</strong></div>
              <p>{viewAsk === "2d" ? "Depth and forward or back movement don't show from the side." : "A side-on game only moves left and right; in 3D it can use the whole ground."} Adapting rewrites the controls and movement for {viewAsk.toUpperCase()} as a suggestion you can review.</p>
              {adapting ? <AiEta elapsed={adaptEta.elapsed} estimate={adaptEta.estimate} /> : null}
              <div className="confirm-actions">
                <button className="btn sm" onClick={() => adaptView(viewAsk)} disabled={adapting}>Adapt the game for {viewAsk.toUpperCase()}</button>
                <button className="btn quiet sm" onClick={() => { dispatch({ t: "meta", patch: { view: viewAsk } }); setViewAsk(null); }} disabled={adapting}>Just switch the camera</button>
                <button className="btn ghost sm" onClick={() => setViewAsk(null)} disabled={adapting}>Cancel</button>
              </div>
            </div>
          ) : null}
          {pending ? <ChangeConfirm change={pending.change} onAccept={() => { dispatch({ t: "set", graph: pending.next }); setPending(null); }} onDeny={() => setPending(null)} /> : null}
          {!validity.ok ? <div className="editor-error" role="alert"><strong>This game can&apos;t run yet</strong><span>{validity.errors.slice(0, 2).join(" ")}</span></div> : null}
          {proposal ? (
            <div className="suggest-bar" role="region" aria-label="Suggested change">
              <span className="suggest-dot" aria-hidden="true" />
              <div className="suggest-text">
                <strong>Suggested change</strong>
                <span>{proposal.explanation.replace(/\s*\(\d+ invalid connections? (was|were) removed\.\)/, "") || "Review the highlighted blocks."}</span>
              </div>
              <button className="btn sm" onClick={apply}>Apply</button>
              <button className="btn quiet sm" onClick={() => setProposal(null)}>Discard</button>
            </div>
          ) : null}
        </div>
        <aside className="studio-side" aria-label="Preview">
          <Splitter name="preview" cssVar="--side-w" min={240} max={760} initial={340} side="right" scope=".studio-body" label="Resize the preview" />
          <GamePreview graph={preview} version={preview ? JSON.stringify(preview.nodes.map((n) => [n.id, n.params])) + preview.edges.length : ""} theme={(preview ?? shown).theme} view={viewOf(preview ?? shown)} label={shown.title} onEnd={(r) => setLastRun(r)} idle />
          {lastRun ? <p className="tiny muted">Last run · {lastRun.score} points · {(lastRun.ticks / 60).toFixed(1)}s</p> : null}
          {colorByAuthor ? <SharePanel graph={shown} /> : authors.length > 1 ? <div className="row small">{authors.map((a) => <AuthorChip key={a} handle={a} link={false} />)}</div> : null}
          {tutorial ? <TutorialSteps graph={g} tutorial={tutorial} /> : null}
          {challengeRules.length ? <RuleChecklist graph={g} ruleIds={challengeRules} /> : null}
          {status && /fail|could|not/i.test(status) ? <StatusLine tone="warn">{status}</StatusLine> : null}
        </aside>
      </div>
      {showLibrary ? <LibraryPicker exclude={forkedFrom?.hash ?? null} onClose={() => setShowLibrary(false)} onAdd={addFromLibrary} /> : null}
      {showExport ? <ExportModal graph={g} selection={state.selection} author={handle} onClose={() => setShowExport(false)} /> : null}
      {showPublish ? <PublishModal graph={g} author={handle} onClose={() => setShowPublish(false)} onPublished={() => safeStorage().del(DRAFT_KEY)} /> : null}
    </div>
  );
}

/** Who gets paid when this game is licensed: each author's share of the blocks that run, and the tokens it earns. */
function SharePanel({ graph }: { graph: Graph }) {
  const shares = computeShares(graph);
  const price = graph.license.type === "paid" ? graph.license.priceLamports : 100 * TOKEN_LAMPORTS;
  const counted = countedNodes(graph).size;
  const earning = earningNodes(graph).size;
  const colors = graphColors(graph, shares.map((s) => s.handle));
  return (
    <section className="shares ticks" aria-labelledby="shares-h">
      <div className="shares-head"><h2 id="shares-h">Who gets paid</h2><span>{earning} of {counted} blocks earn</span></div>
      <p className="shares-rule">Controls (moving, jumping, gravity) and creating the player don't earn; they're in every game. Grey blocks don't earn.</p>

      <ul>
        {shares.map((s) => (
          <li key={s.handle}>
            <div className="shares-row"><span className="author-dot" style={{ background: colors.get(s.handle) }} aria-hidden="true" /><strong style={{ color: colors.get(s.handle) }}>@{s.handle}</strong><span className="shares-n">{s.nodeIds.length} block{s.nodeIds.length === 1 ? "" : "s"}</span><span className="shares-pct">{(s.bps / 100).toFixed(1)}%</span></div>
            <div className="shares-bar"><span style={{ width: `${s.bps / 100}%`, background: colors.get(s.handle) }} /></div>
            <p className="shares-tok">{tokenAmount(Math.floor((price * s.bps) / 10000))} tokens per {graph.license.type === "paid" ? "license" : "100 token license"}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TutorialSteps({ graph, tutorial }: { graph: Graph; tutorial: (typeof TUTORIALS)[number] }) {
  const done = tutorial.steps.map((s) => s.check(graph));
  const next = done.indexOf(false);
  return (
    <section className="panel tight stack" aria-labelledby="tut-h">
      <h2 id="tut-h" style={{ fontSize: "1.2rem" }}>Tutorial: {tutorial.title}</h2>
      <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
        {tutorial.steps.map((s, i) => (
          <li key={s.text} className="small" style={{ fontWeight: i === next ? 700 : 400, color: done[i] ? "var(--olive)" : undefined }}>
            {s.text} {done[i] ? "(done)" : i === next ? "(next)" : ""}
          </li>
        ))}
      </ol>
      {next === -1 ? <p className="small" style={{ color: "var(--olive)" }}>All steps done. Press Play in the preview.</p> : null}
    </section>
  );
}
