/** Gold laurel wreath for the winning mechanic and rank one. */
export function WinnerBadge({ label = "Winner", size = 44 }: { label?: string; size?: number }) {
  return (
    <span className="row" style={{ gap: 6, color: "#7a5a17", fontWeight: 700 }}>
      <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={label}>
        <g fill="var(--gold)">
          {Array.from({ length: 6 }, (_, i) => {
            const a = (-120 + i * 22) * (Math.PI / 180);
            const x = 24 + Math.cos(a) * 17;
            const y = 26 + Math.sin(a) * 17;
            return <ellipse key={`l${i}`} cx={x} cy={y} rx="6" ry="2.6" transform={`rotate(${(-120 + i * 22) + 70} ${x} ${y})`} />;
          })}
          {Array.from({ length: 6 }, (_, i) => {
            const a = (-60 - i * 22) * (Math.PI / 180);
            const x = 24 + Math.cos(a) * 17;
            const y = 26 + Math.sin(a) * 17;
            return <ellipse key={`r${i}`} cx={x} cy={y} rx="6" ry="2.6" transform={`rotate(${(-60 - i * 22) - 70} ${x} ${y})`} />;
          })}
        </g>
        <path d="M14 40 q10 4 20 0" fill="none" stroke="var(--gold)" strokeWidth="2.4" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
