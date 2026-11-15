/** Amphora with banded sections showing the payout split. Numbers are always shown as text beside it. */
export function AmphoraSplit({ bands, poolLabel }: { bands: Array<{ label: string; percent: number; color: string }>; poolLabel: string }) {
  const top = 34;
  const bottom = 188;
  const h = bottom - top;
  let y = top;
  const rects = bands.map((b) => {
    const bh = (h * b.percent) / 100;
    const r = { ...b, y, h: bh };
    y += bh;
    return r;
  });
  const body = "M48 20 h24 v10 c22 12 34 38 34 70 c0 44 -18 80 -30 92 h-32 c-12 -12 -30 -48 -30 -92 c0 -32 12 -58 34 -70 z";
  return (
    <figure style={{ margin: 0, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <svg width="120" height="200" viewBox="0 0 120 200" role="img" aria-label={`Prize split: ${bands.map((b) => `${b.label} ${b.percent} percent`).join(", ")}`}>
        <defs>
          <clipPath id="amph"><path d={body} /></clipPath>
        </defs>
        <g clipPath="url(#amph)">
          <rect x="0" y="0" width="120" height="200" fill="var(--vase-dark)" />
          {rects.map((r) => <rect key={r.label} x="0" y={r.y} width="120" height={r.h} fill={r.color} />)}
          {rects.slice(1).map((r) => <line key={`l${r.label}`} x1="0" x2="120" y1={r.y} y2={r.y} stroke="var(--figure)" strokeWidth="2" />)}
        </g>
        <path d={body} fill="none" stroke="var(--figure)" strokeWidth="3" />
        <path d="M46 34 c-22 0 -28 26 -12 40 M74 34 c22 0 28 26 12 40" fill="none" stroke="var(--figure)" strokeWidth="3" />
        <rect x="44" y="14" width="32" height="7" fill="var(--figure)" />
      </svg>
      <dl style={{ margin: 0, display: "grid", gap: 8 }}>
        <div><dt className="eyebrow">Pool</dt><dd style={{ margin: 0, fontFamily: "var(--font-head)", fontSize: "1.6rem", fontWeight: 600 }}>{poolLabel}</dd></div>
        {bands.map((b) => (
          <div key={b.label} className="row small"><span className="author-dot" style={{ background: b.color }} aria-hidden="true" /><dt style={{ fontWeight: 600 }}>{b.label}</dt><dd style={{ margin: 0 }}>{b.percent} percent</dd></div>
        ))}
      </dl>
    </figure>
  );
}
