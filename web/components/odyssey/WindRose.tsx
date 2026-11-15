/** Wind rose legend. Each wind marks one lineage symbol; text labels always accompany the marks. */
export function WindRose({ size = 150, legend = true }: { size?: number; legend?: boolean }) {
  return (
    <figure style={{ margin: 0, display: "flex", gap: 14, alignItems: "center" }}>
      <svg width={size} height={size} viewBox="-60 -60 120 120" role="img" aria-labelledby="wr-t">
        <title id="wr-t">Wind rose legend</title>
        <circle r="44" fill="none" stroke="var(--figure)" strokeWidth="1" />
        <circle r="30" fill="none" stroke="var(--line)" strokeWidth="1" />
        {Array.from({ length: 16 }, (_, i) => <line key={i} x1="0" y1="-44" x2="0" y2={i % 2 ? "-40" : "-36"} stroke="var(--figure)" transform={`rotate(${i * 22.5})`} />)}
        <path d="M0 -50 L7 -7 L50 0 L7 7 L0 50 L-7 7 L-50 0 L-7 -7 Z" fill="var(--panel)" stroke="var(--figure)" strokeWidth="1.2" />
        <path d="M0 -50 L7 -7 L0 0 Z M50 0 L7 7 L0 0 Z M0 50 L-7 7 L0 0 Z M-50 0 L-7 -7 L0 0 Z" fill="var(--figure)" />
        <text y="-53" textAnchor="middle" fontSize="9" fill="var(--ink)">Fork</text>
        <text x="54" y="3" fontSize="9" fill="var(--ink)">Borrowed</text>
        <text y="60" textAnchor="middle" fontSize="9" fill="var(--ink)">Current</text>
        <text x="-54" y="3" textAnchor="end" fontSize="9" fill="var(--ink)">Anchored</text>
      </svg>
      {legend ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6, fontSize: "0.85rem" }}>
          <li className="row"><svg width="34" height="8" aria-hidden="true"><line x1="0" y1="4" x2="34" y2="4" stroke="var(--figure)" strokeWidth="2" strokeDasharray="6 4" /></svg>Fork route</li>
          <li className="row"><svg width="34" height="8" aria-hidden="true"><line x1="0" y1="4" x2="34" y2="4" stroke="var(--clay)" strokeWidth="2" strokeDasharray="1 4" strokeLinecap="round" /></svg>Borrowed nodes</li>
          <li className="row"><svg width="34" height="14" aria-hidden="true"><path d="M8 10h18l-3 3H11z M17 1v9 M17 2l6 7h-6" fill="none" stroke="var(--figure)" strokeWidth="1.6" /></svg>Current mechanic</li>
          <li className="row"><svg width="34" height="12" aria-hidden="true"><circle cx="17" cy="6" r="4" fill="var(--olive)" /></svg>Anchored</li>
        </ul>
      ) : null}
    </figure>
  );
}
