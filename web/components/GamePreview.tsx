"use client";
import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BUILTIN_PREFABS, InputRecorder, KEYS, viewOf, type Scene, WORLD_H, WORLD_W, compile, composeSim, Sim, type Graph, type PrefabDef, type Theme,
} from "@forklab/engine";

export type RunResult = { score: number; ticks: number; status: "win" | "lose" | "timeout"; inputs: Array<[number, number]>; seed: number };

type Props = {
  graph?: Graph | null;
  level?: Graph | null;
  seed?: number;
  maxTicks?: number;
  prefabs?: Record<string, PrefabDef>;
  theme?: Theme;
  /** Runs without input until the user clicks to play (hover previews). */
  idle?: boolean;
  label?: string;
  onEnd?: (r: RunResult) => void;
  onPlay?: () => void;
  record?: boolean;
  /** Changes when the graph is edited; restarts at tick 0. */
  version?: string | number;
  compact?: boolean;
  actions?: React.ReactNode;
  /** Camera: side-on 2D or third-person 3D. Defaults to the graph's own setting. */
  view?: "2d" | "3d";
  /** Race a recorded run: its inputs replay in lockstep and its player is drawn as a ghost. */
  ghost?: { inputs: Array<[number, number]>; label: string } | null;
  /** Start playing as soon as it mounts (the play dialog, so one click starts the game). */
  autoStart?: boolean;
};

/** How many players are open full screen; background scenes and idle previews pause while any is. */
let openPlayers = 0;
const gameOpen = () => openPlayers > 0;

const DT = 1000 / 60;
const KEY_SET = new Set<string>(KEYS);

type GhostBox = { x: number; y: number; z: number; w: number; h: number; d: number } | null;
type Drawer = { draw(sim: Sim, prev: Map<number, { x: number; y: number }>, alpha: number, ghost?: GhostBox): void; resize(w: number, h: number): void; dispose(loseContext?: boolean): void };

async function threeDrawer(canvas: HTMLCanvasElement, theme: Theme, prefabs: Record<string, PrefabDef>, view: "2d" | "3d", scene: Scene): Promise<Drawer> {
  const { createGame3D } = await import("@/lib/three/game3d");
  return createGame3D(canvas, theme, prefabs, view, "play", scene);
}

const KEY_NAMES: Record<string, string> = { Space: "Space", ArrowLeft: "Left", ArrowRight: "Right", ArrowUp: "Up", ArrowDown: "Down", KeyA: "A", KeyD: "D", KeyW: "W", KeyS: "S" };
const ACTION: Record<string, string> = { Move: "move", Shoot: "fire", Stop: "move", SetVelocity: "move", AddVelocity: "move", Spawn: "spawn" };

/** Read the controls straight from the graph's key events, so the hint is always true for this game. */
export function controlsOf(graphs: Array<Graph | null | undefined>): string {
  const found = new Map<string, string>();
  for (const g of graphs) {
    if (!g) continue;
    for (const n of g.nodes) {
      if (n.type !== "OnKey" || n.params.when === "released") continue;
      const key = String(n.params.key);
      const next = g.edges.find((e) => e.kind === "exec" && e.from.node === n.id);
      let target = next ? g.nodes.find((x) => x.id === next.to.node) : undefined;
      // look through an "if" to the action it guards (Space -> if grounded -> jump)
      for (let hop = 0; target?.type === "Branch" && hop < 3; hop += 1) {
        const inner = g.edges.find((e) => e.kind === "exec" && e.from.node === target!.id && e.from.port === "true");
        target = inner ? g.nodes.find((x) => x.id === inner.to.node) : undefined;
      }
      let verb = target ? ACTION[target.type] ?? "act" : "act";
      const first = next ? g.nodes.find((x) => x.id === next.to.node) : undefined;
      if (first?.type === "Branch") {
        const sides = g.edges.filter((e) => e.kind === "exec" && e.from.node === first.id).map((e) => g.nodes.find((x) => x.id === e.to.node));
        const vx = sides.map((x) => (x?.type === "SetVelocity" ? Number(x.params.vx ?? 0) : 0));
        if (vx.length === 2 && vx[0] * vx[1] < 0) { if (!found.has(key)) found.set(key, "turn around"); continue; }
      }
      if (target?.type === "Move" && target.params.direction === "up") verb = "jump";
      if (target?.type === "SetVelocity" || target?.type === "AddVelocity") verb = Number(target.params.vy ?? 0) > 0 ? "jump" : "move";
      if (!found.has(key)) found.set(key, verb);
    }
  }
  if (!found.size) return "No controls in this game";
  const wasd = ["KeyW", "KeyA", "KeyS", "KeyD"].filter((k) => found.has(k));
  const parts: string[] = [];
  if (wasd.length >= 2) { parts.push(`${wasd.map((k) => KEY_NAMES[k]).join("")} move`); wasd.forEach((k) => found.delete(k)); }
  const arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].filter((k) => found.has(k) && found.get(k) === "move");
  if (arrows.length >= 2) { parts.push("Arrows move"); arrows.forEach((k) => found.delete(k)); }
  for (const [k, v] of found) parts.push(`${KEY_NAMES[k] ?? k} ${v}`);
  return parts.join(" · ");
}

function canvasDrawer(canvas: HTMLCanvasElement, theme: Theme, prefabs: Record<string, PrefabDef>): Drawer {
  const ctx = canvas.getContext("2d")!;
  return {
    draw(sim, prev, alpha) {
      const sx = canvas.width / WORLD_W;
      const sy = canvas.height / WORLD_H;
      ctx.fillStyle = theme.sky;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = theme.ground;
      ctx.fillRect(0, canvas.height - 3, canvas.width, 3);
      for (const e of sim.entities) {
        const p = prev.get(e.id) ?? { x: e.x, y: e.y };
        const x = p.x + (e.x - p.x) * alpha;
        const y = p.y + (e.y - p.y) * alpha;
        ctx.fillStyle = e.tag === "player" ? theme.accent : (prefabs[e.prefab] ?? BUILTIN_PREFABS[e.prefab])?.color ?? "#1B2A33";
        ctx.fillRect(x * sx, canvas.height - (y + e.h) * sy, e.w * sx, e.h * sy);
      }
    },
    resize(w, h) { canvas.width = w; canvas.height = h; },
    dispose() {},
  };
}

/**
 * Plays a graph (or a level plus a mechanic) with the deterministic engine at 60 ticks per second,
 * rendered as a lit 3D scene with three.js, or a 2D canvas if WebGL is unavailable.
 */
/** Who won a race against a ghost: more points wins; on a tie, whoever lasted longer. */
export function raceWinner(me: { score: number; ticks: number }, ghost: { score: number; ticks: number } | null): "me" | "ghost" | "tie" {
  // a ghost still running when your run ended outlasted you
  if (!ghost) return "ghost";
  if (me.score !== ghost.score) return me.score > ghost.score ? "me" : "ghost";
  return me.ticks === ghost.ticks ? "tie" : me.ticks > ghost.ticks ? "me" : "ghost";
}

function RaceResult({ me, ghost, label }: { me: RunResult; ghost: { ticks: number; score: number } | null; label: string }) {
  const w = raceWinner(me, ghost);
  return (
    <p className={`go-race ${w}`}>
      {w === "me" ? `You beat ${label}` : w === "tie" ? `A dead heat with ${label}` : `${label} wins this one`}
      <span>{ghost ? `${label}: ${ghost.score} points, ${(ghost.ticks / 60).toFixed(1)} s` : `${label} was still going`}</span>
    </p>
  );
}

export function GamePreview(props: Props) {
  return <PreviewBoundary><GamePreviewInner {...props} /></PreviewBoundary>;
}

/** A renderer failure stays inside the player instead of taking the page down. */
class PreviewBoundary extends Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) { return { error: e?.message ?? "The game stopped." }; }
  componentDidCatch(e: Error) { console.warn("[forklab] game preview error:", e); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="stage" role="alert">
        <div className="overlay" style={{ cursor: "default", flexDirection: "column", gap: 10 }}>
          <p className="small" style={{ maxWidth: 360 }}>The game stopped: {this.state.error.slice(0, 160)}</p>
          <button className="btn sm" onClick={() => this.setState({ error: null })}>Load it again</button>
        </div>
      </div>
    );
  }
}

function GamePreviewInner({ graph, level, seed = 1, maxTicks = 3600, prefabs = {}, theme, idle = false, label, onEnd, onPlay, record = true, version, compact, actions, view, ghost, autoStart }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"ready" | "playing" | "ended" | "error">("ready");
  const [hud, setHud] = useState({ score: 0, tick: 0, hearts: -1 });
  const [result, setResult] = useState<RunResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const [, setRenderNote] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [best, setBest] = useState<number | null>(null);
  // racing a ghost: when its run ended and how, so the end card can say who won the race
  const [ghostOut, setGhostOut] = useState<{ ticks: number; score: number; status: string } | null>(null);
  const held = useRef(0);
  const playing = state === "playing";
  const th: Theme = theme ?? graph?.theme ?? { sky: "#070A10", ground: "#D27A45", accent: "#5FC3E4" };
  const cam: "2d" | "3d" = view ?? (graph ? viewOf(graph) : level ? viewOf(level) : "3d");
  const controls = useMemo(() => controlsOf([graph, level]), [graph, level]);
  const usedKeys = useMemo(() => {
    const k = new Set<string>();
    for (const g of [graph, level]) for (const n of g?.nodes ?? []) if (n.type === "OnKey") k.add(String(n.params.key));
    return k;
  }, [graph, level]);
  // presentation: the mechanic's scene wins over the level's; the renderer needs the game's own prefabs for colours
  const sceneSpec: Scene = useMemo(() => ({ ...(level?.scene ?? {}), ...(graph?.scene ?? {}) }), [graph, level]);
  const sceneKey = JSON.stringify(sceneSpec);
  const allPrefabs = useMemo(() => ({ ...(level?.prefabs ?? {}), ...(graph?.prefabs ?? {}), ...prefabs }), [graph, level, prefabs]);
  const hudSpec = sceneSpec.hud ?? {};

  // Key on content, not object identity, so a background refetch of the same graph never restarts a run.
  // block positions are layout only: moving a block on the canvas must not restart (and blank) the preview
  const playKey = (g: Graph) => JSON.stringify([g.nodes.map(({ pos, ...n }) => { void pos; return n; }), g.edges, g.prefabs ?? null]);
  const graphKey = useMemo(() => (graph ? playKey(graph) : ""), [graph]);
  const levelKey = useMemo(() => (level ? playKey(level) : ""), [level]);
  useEffect(() => {
    setState("ready");
    setResult(null);
  }, [version, graphKey, levelKey, idle]);

  // simulation + render loop
  useEffect(() => {
    if (!graph || !canvasRef.current || !stageRef.current) return;
    let sim: Sim;
    try {
      sim = level ? composeSim(level, graph, seed, prefabs) : new Sim([compile(graph)], seed, prefabs);
      setProblem(null);
    } catch (e) {
      setProblem((e as Error).message);
      return;
    }
    const active = state === "playing";
    // hearts: the variable named in the HUD, whichever program (level or mechanic) set it
    const heartVar = sceneSpec.hud?.hearts;
    const heartsOf = (x: Sim) => {
      if (!heartVar) return -1;
      for (const [k, v] of x.vars) if (k.endsWith(`.${heartVar}`)) return v;
      return -1;
    };
    const recorder = new InputRecorder();
    // the ghost runs the same game with the recorded inputs, one tick behind nothing: exactly in step
    let ghostSim: Sim | null = null;
    let gi = 0, gMask = 0;
    if (active && ghost) { try { ghostSim = level ? composeSim(level, graph, seed, prefabs) : new Sim([compile(graph)], seed, prefabs); } catch { ghostSim = null; } }
    let drawer: Drawer | null = null;
    let disposed = false;
    let raf = 0;
    let acc = 0;
    let last = performance.now();
    let prev = new Map<number, { x: number; y: number; z: number }>();
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const ro = new ResizeObserver(() => {
      const r = stage.getBoundingClientRect();
      drawer?.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
    });
    const start = (d: Drawer) => {
      if (disposed) { d.dispose(!canvas.isConnected); return; }
      drawer = d;
      const r = stage.getBoundingClientRect();
      d.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
      ro.observe(stage);
      const frame = (now: number) => {
        if (disposed) return;
        if (!active && gameOpen()) { last = now; raf = requestAnimationFrame(frame); return; }
        acc += Math.min(250, now - last);
        last = now;
        // idle previews run the world with no input; the ready state shows tick 0 frozen
        const running = active || idle;
        while (running && acc >= DT && sim.status === "running" && sim.tick < maxTicks) {
          prev = new Map(sim.entities.map((e) => [e.id, { x: e.x, y: e.y, z: e.z }]));
          const mask = active ? held.current : 0;
          if (active && record) recorder.record(sim.tick, mask);
          sim.step(mask);
          if (ghostSim && ghost && ghostSim.status === "running") {
            while (gi < ghost.inputs.length && ghost.inputs[gi][0] <= ghostSim.tick) { gMask = ghost.inputs[gi][1]; gi += 1; }
            ghostSim.step(gMask);
            if (ghostSim.status !== "running") {
              const out = { ticks: ghostSim.tick, score: ghostSim.score, status: ghostSim.status };
              setGhostOut(out);
              setHint(`${ghost.label} is out at ${(out.ticks / 60).toFixed(1)} s with ${out.score}. Keep going.`);
            }
          }
          acc -= DT;
        }
        if (!running && sim.tick === 0) { sim.step(0); prev = new Map(sim.entities.map((e) => [e.id, { x: e.x, y: e.y, z: e.z }])); }
        const gp = ghostSim && ghostSim.status === "running" ? ghostSim.entities.find((e) => e.tag === "player") ?? null : null;
        d.draw(sim, prev, running ? Math.min(1, acc / DT) : 1, gp ? { x: gp.x, y: gp.y, z: gp.z, w: gp.w, h: gp.h, d: gp.d } : null);
        if (active && (sim.tick % 6 === 0 || sim.status !== "running")) setHud({ score: sim.score, tick: sim.tick, hearts: heartsOf(sim) });
        if (active && (sim.status !== "running" || sim.tick >= maxTicks)) {
          const r: RunResult = { score: sim.score, ticks: sim.tick, status: sim.status === "running" ? "timeout" : sim.status, inputs: recorder.inputs, seed };
          setHud({ score: sim.score, tick: sim.tick, hearts: heartsOf(sim) });
          setResult(r);
          setBest((b) => (b === null ? r.score : Math.max(b, r.score)));
          setState("ended");
          onEnd?.(r);
          return;
        }
        if (idle && !active && sim.status !== "running") {
          // restart idle preview loops
          sim = level ? composeSim(level, graph, seed, prefabs) : new Sim([compile(graph)], seed, prefabs);
          prev = new Map();
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };
    const lost = () => { disposed = true; cancelAnimationFrame(raf); setProblem("The graphics card reset. Press Restart to load the game again."); };
    canvas.addEventListener("forklab:lost", lost);
    threeDrawer(canvas, th, allPrefabs, cam, sceneSpec).then(start).catch((err) => {
      console.warn("[forklab] 3D renderer unavailable, using 2D:", err);
      setRenderNote("3D rendering unavailable here: using the 2D renderer.");
      // a canvas that already tried WebGL cannot give a 2D context, so swap in a fresh one
      const fresh = document.createElement("canvas");
      canvas.replaceWith(fresh);
      (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = fresh;
      start(canvasDrawer(fresh, th, prefabs));
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("forklab:lost", lost);
      // a canvas that left the page (the player moved to or from full screen, or the preview unmounted) gives its
      // WebGL context back now instead of at garbage collection, so contexts never pile up
      const d = drawer as Drawer | null;
      d?.dispose(!canvas.isConnected);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphKey, levelKey, seed, maxTicks, state === "playing", run, version, idle, th.sky, th.ground, th.accent, cam, sceneKey, ghost ? ghost.inputs.length : 0]);

  const keyBits = useCallback((code: string) => {
    const i = KEYS.indexOf(code as (typeof KEYS)[number]);
    return i < 0 ? 0 : 1 << i;
  }, []);

  // while playing, keys come from the whole window (no need to keep the game focused); Escape closes
  useEffect(() => {
    if (!playing && state !== "ended") return;
    const el = window;
    const down = (e: KeyboardEvent) => {
      if (e.code === "Escape") { setState("ready"); return; }
      if (state === "ended" && e.code === "Enter") { e.preventDefault(); begin(); return; }
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select")) return;
      if (!KEY_SET.has(e.code)) return;
      e.preventDefault();
      if (!usedKeys.has(e.code) && !e.repeat) setHint(`${KEY_NAMES[e.code] ?? e.code} does nothing in this game. ${controls}.`);
      held.current |= keyBits(e.code);
    };
    const up = (e: KeyboardEvent) => {
      if (!KEY_SET.has(e.code)) return;
      e.preventDefault();
      held.current &= ~keyBits(e.code);
    };
    el.addEventListener("keydown", down);
    el.addEventListener("keyup", up);
    const blur = () => { held.current = 0; };
    el.addEventListener("blur", blur);
    document.body.style.overflow = "hidden";
    openPlayers += 1;
    document.body.classList.add("game-open");
    return () => {
      el.removeEventListener("keydown", down); el.removeEventListener("keyup", up); el.removeEventListener("blur", blur);
      openPlayers = Math.max(0, openPlayers - 1);
      if (!openPlayers) { document.body.style.overflow = ""; document.body.classList.remove("game-open"); }
    };
  }, [playing, state, keyBits, usedKeys, controls]);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 3500);
    return () => clearTimeout(t);
  }, [hint]);

  const begin = () => {
    held.current = 0;
    setGhostOut(null);
    setProblem(null);
    setHint(null);
    setHud({ score: 0, tick: 0, hearts: -1 });
    setResult(null);
    setRun((r) => r + 1);
    setState("playing");
    onPlay?.();
    (document.activeElement as HTMLElement | null)?.blur?.();
    setTimeout(() => stageRef.current?.focus(), 0);
  };

  // the play dialog starts at once: one click from the page to the game
  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || started.current || !graph) return;
    started.current = true;
    begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, graph]);

  // an idle preview with its own play handler (the weekly game card) hands the click to that handler
  // instead of starting a second, unrecorded game of its own
  const press = () => { if (idle && onPlay) onPlay(); else begin(); };

  if (!graph) return <div className="stage" aria-label="Empty preview"><div className="overlay" style={{ cursor: "default" }}><span className="muted">Add nodes to see a preview.</span></div></div>;

  const open = playing || state === "ended";
  // the open player renders straight into <body>: a transformed ancestor would otherwise trap position: fixed
  const shell = (
      <div className={`play-shell${open ? " open" : ""}`} onClick={(e) => { if (open && e.target === e.currentTarget) setState("ready"); }}>
      {open ? (
        <div className="play-bar">
          <span className="play-title">{label ?? "Game"}{ghost ? <span className="ghost-chip">Racing {ghost.label}</span> : null}</span>
          <span className="play-hud">{hudSpec.score === "hidden" ? <>Score {hud.score}<span className="sep" /></> : null}{(hud.tick / 60).toFixed(1)}s</span>
          <span className="row">
            <button className="btn quiet sm" onClick={begin}>Restart</button>
            <button className="btn sm" onClick={() => setState("ready")}>Close</button>
          </span>
        </div>
      ) : null}
      <div ref={stageRef} className="stage" tabIndex={playing ? 0 : -1} aria-label={label ?? "Game preview"} style={compact ? { aspectRatio: "16 / 9" } : undefined}>
        <canvas ref={canvasRef} />
        {open ? (
          <div className="game-hud" aria-live="off">
            {hudSpec.title ? <div className="gh top-center gh-title">{hudSpec.title}</div> : null}
            {hudSpec.score !== "hidden" ? <div className={`gh ${hudSpec.score ?? "top-left"} gh-score`}><span>{hudSpec.scoreLabel ?? "Score"}</span><strong>{hud.score}</strong></div> : null}
            {hudSpec.hearts && hud.hearts >= 0 ? (
              <div className="gh top-center gh-hearts" aria-label={`${hud.hearts} hearts left`} style={hudSpec.title ? { top: 52 } : undefined}>
                {Array.from({ length: Math.max(hudSpec.heartsMax ?? 5, hud.hearts) }, (_, i) => <span key={i} className={i < hud.hearts ? "on" : ""} aria-hidden="true">&#9829;</span>)}
              </div>
            ) : null}
            {hudSpec.timer && hudSpec.timer !== "hidden" ? <div className={`gh ${hudSpec.timer} gh-timer`}><span>Time</span><strong>{(hud.tick / 60).toFixed(1)}s</strong></div> : null}
            {hint ? <div className="gh bottom-center gh-msg gh-hint" role="status">{hint}</div> : hudSpec.message ? <div className="gh bottom-center gh-msg">{hudSpec.message}</div> : null}
          </div>
        ) : null}
        {problem ? <div className="overlay" style={{ cursor: "default" }}><p className="small" style={{ maxWidth: 360, color: "var(--clay)" }}>{problem}</p></div> : null}
        {!problem && state === "ready" ? (
          <button className="overlay" onClick={press} aria-label={`Play ${label ?? "this mechanic"}`} style={idle ? { background: "transparent" } : undefined}>
            <span className="play-orb">Play</span>
          </button>
        ) : null}
        {state === "ended" && result ? (
          <div className="game-over" role="status" aria-live="polite">
            <div className="go-card">
              <p className={`go-head ${result.status}`}>{result.status === "win" ? "You won" : result.status === "lose" ? "You lost" : "Time's up"}</p>
              <p className="go-score"><strong>{result.score}</strong><span>{hudSpec.scoreLabel ?? "points"}</span></p>
              <p className="go-time">{(result.ticks / 60).toFixed(1)} seconds{best !== null ? ` · best ${best}` : ""}</p>
              {ghost ? <RaceResult me={result} ghost={ghostOut} label={ghost.label} /> : null}
              <div className="go-actions">
                <button className="btn" onClick={begin} autoFocus>Play again</button>
                {actions}
                {open ? <button className="btn quiet" onClick={() => setState("ready")}>Close</button> : null}
              </div>
              <p className="go-keys">Enter plays again · Esc closes</p>
            </div>
          </div>
        ) : null}
      </div>
      {open ? <p className="play-keys">{controls} · Esc close</p> : null}
      </div>
  );
  return (
    <div className="stack" style={{ gap: 6 }}>
      {open && typeof document !== "undefined" ? <div className="stage-placeholder" style={compact ? { aspectRatio: "16 / 9" } : undefined} /> : null}
      {open && typeof document !== "undefined" ? createPortal(shell, document.body) : shell}
    </div>
  );
}
