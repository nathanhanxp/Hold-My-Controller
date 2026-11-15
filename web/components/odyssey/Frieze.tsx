import { useId } from "react";

export type FriezeVariant = "ships" | "waves" | "olive" | "eye" | "sun" | "wind";

/** Running-dog wave scroll, the band's lower border. */
function Scroll({ y }: { y: number }) {
  const d = Array.from({ length: 6 }, (_, i) => {
    const x = i * 40;
    return `M${x} ${y + 8} c 8 0 12 -10 22 -10 c 6 0 9 4 9 8 c 0 3 -2 5 -5 5 c -3 0 -4 -2 -4 -4`;
  }).join(" ");
  return <path d={d} fill="none" stroke="currentColor" strokeWidth={2.2} />;
}

function ShipFigure({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <path d="M0 30 h70 l-8 8 h-56 z" fill="currentColor" />
      <path d="M70 30 q8 -6 10 -14" fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M34 30 V6" stroke="currentColor" strokeWidth={2} />
      <path d="M18 9 h34 v15 h-34 z" fill="currentColor" />
      <path d="M22 12 v9 M28 12 v9 M34 12 v9 M40 12 v9 M46 12 v9" stroke="var(--vase-dark)" strokeWidth={1.2} />
      {[8, 18, 28, 38, 48, 58].map((o) => <path key={o} d={`M${o} 36 l-6 8`} stroke="currentColor" strokeWidth={1.6} />)}
      <circle cx="-4" cy="31" r="3" fill="currentColor" />
    </g>
  );
}

function OliveFigure({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 4)`} fill="currentColor">
      <path d="M0 22 C 20 18, 40 18, 60 22" fill="none" stroke="currentColor" strokeWidth={2} />
      {[6, 18, 30, 42, 54].map((o, i) => (
        <g key={o}>
          <ellipse cx={o} cy={i % 2 ? 14 : 30} rx="6" ry="2.6" transform={`rotate(${i % 2 ? -25 : 25} ${o} ${i % 2 ? 14 : 30})`} />
        </g>
      ))}
      <circle cx="24" cy="26" r="2.2" /><circle cx="48" cy="17" r="2.2" />
    </g>
  );
}

function Motif({ v, x }: { v: FriezeVariant; x: number }) {
  if (v === "eye")
    return (
      <g transform={`translate(${x} 4)`}>
        <path d="M0 18 q30 -22 60 0 q-30 22 -60 0z" fill="currentColor" />
        <circle cx="30" cy="18" r="8" fill="var(--vase-dark)" />
        <circle cx="30" cy="18" r="4" fill="currentColor" />
      </g>
    );
  if (v === "sun")
    return (
      <g transform={`translate(${x + 30} 22)`} fill="currentColor">
        <circle r="10" />
        {Array.from({ length: 12 }, (_, i) => <rect key={i} x="-1.5" y="-19" width="3" height="6" transform={`rotate(${i * 30})`} />)}
      </g>
    );
  if (v === "wind")
    return (
      <g transform={`translate(${x} 6)`} fill="none" stroke="currentColor" strokeWidth={2.4}>
        <path d="M0 10 h40 c8 0 8 -9 2 -9" />
        <path d="M6 20 h50 c8 0 8 9 1 9" />
        <path d="M0 30 h30 c6 0 6 -6 1 -6" />
      </g>
    );
  if (v === "olive") return <OliveFigure x={x} />;
  if (v === "waves") return <g transform={`translate(${x} -12)`}><Scroll y={30} /></g>;
  return <ShipFigure x={x} />;
}

/**
 * Black-figure frieze: a 48 px terracotta band with black silhouettes, drawn by us as flat two-color SVG.
 * Decorative (aria-hidden). Drifts slowly when motion is allowed.
 */
export function Frieze({ variant = "ships", drift = true }: { variant?: FriezeVariant; drift?: boolean }) {
  const id = useId().replace(/:/g, "");
  const second: FriezeVariant = variant === "ships" ? "olive" : variant;
  return (
    <svg className="frieze" viewBox="0 0 1200 48" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={`fz-${id}`} width="240" height="48" patternUnits="userSpaceOnUse">
          <rect width="240" height="48" fill="var(--vase-dark)" />
          <Motif v={variant} x={20} />
          <Motif v={second} x={150} />
        </pattern>
      </defs>
      <rect width="1200" height="48" fill="var(--vase-dark)" />
      <g className={drift ? "frieze-drift" : undefined}>
        <rect x="0" y="3" width="1440" height="42" fill={`url(#fz-${id})`} />
      </g>
      <rect width="1200" height="2" fill="var(--gold)" opacity="0.7" />
      <rect y="46" width="1200" height="2" fill="var(--gold)" opacity="0.7" />
    </svg>
  );
}

/** 8 px Greek key strip under page headers. */
export function MeanderRule({ color = "var(--vase)" }: { color?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="meander" viewBox="0 0 1200 8" preserveAspectRatio="none" aria-hidden="true" focusable="false" style={{ color }}>
      <defs>
        <pattern id={`mr-${id}`} width="16" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 7.5 H12 V0.5 H4 V4.5 H8" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M12 7.5 H16" stroke="currentColor" strokeWidth="1.3" />
        </pattern>
      </defs>
      <rect width="1200" height="8" fill={`url(#mr-${id})`} />
    </svg>
  );
}

export function MeanderEdge() {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="meander-edge" width="100%" height="8" aria-hidden="true" preserveAspectRatio="none" style={{ display: "block", color: "var(--vase)", background: "var(--vase-dark)" }}>
      <defs>
        <pattern id={`me-${id}`} width="12" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 7 H9 V1 H3 V4 H6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M9 7 H12" stroke="currentColor" strokeWidth="1.2" />
        </pattern>
      </defs>
      <rect width="100%" height="8" fill={`url(#me-${id})`} />
    </svg>
  );
}

/** Wave divider, used only under the home hero. */
export function WaveDivider() {
  return (
    <svg viewBox="0 0 1200 24" preserveAspectRatio="none" aria-hidden="true" style={{ display: "block", width: "100%", height: 24, color: "var(--aegean)" }}>
      <path d={Array.from({ length: 31 }, (_, i) => `${i === 0 ? "M" : ""}${i * 40} 12 q10 -10 20 0 t20 0`).join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
