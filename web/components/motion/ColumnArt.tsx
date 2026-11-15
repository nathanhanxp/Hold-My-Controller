/** Ionic column in luminous line art: base, fluted shaft with entasis, volute capital. Decorative. */
export function IonicColumn({ height = 300, className }: { height?: number; className?: string }) {
  const w = height * 0.28;
  return (
    <svg className={`column-art ${className ?? ""}`} width={w} height={height} viewBox="0 0 84 300" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
      <path d="M4 22 H80 M8 22 C8 14 14 10 20 12 C26 14 24 22 18 22 M76 22 C76 14 70 10 64 12 C58 14 60 22 66 22" />
      <path d="M14 26 H70 M18 30 H66" />
      <path d="M20 32 C19 120 18 200 20 272 M64 32 C65 120 66 200 64 272" />
      {[27, 34, 42, 50, 57].map((x) => <path key={x} d={`M${x} 34 C${x - 0.5} 120 ${x - 0.5} 200 ${x} 270`} opacity="0.55" />)}
      <path d="M16 274 H68 M12 280 H72 M8 286 H76 M4 294 H80" />
    </svg>
  );
}

/** A small colonnade (three columns under a pediment) used on headers and the loader. */
export function Colonnade({ className }: { className?: string }) {
  return (
    <svg className={`column-art ${className ?? ""}`} viewBox="0 0 900 420" fill="none" stroke="currentColor" strokeWidth="1.2" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <path d="M90 120 L450 30 L810 120 Z M110 116 L450 46 L790 116" />
      <path d="M80 120 H820 M84 132 H816" />
      {[150, 300, 450, 600, 750].map((x) => (
        <g key={x}>
          <path d={`M${x - 34} 142 H${x + 34} M${x - 26} 150 H${x + 26}`} />
          <path d={`M${x - 22} 150 C${x - 24} 260 ${x - 24} 330 ${x - 22} 392 M${x + 22} 150 C${x + 24} 260 ${x + 24} 330 ${x + 22} 392`} />
          <path d={`M${x - 8} 154 V390 M${x + 8} 154 V390`} opacity="0.5" />
          <path d={`M${x - 30} 396 H${x + 30} M${x - 36} 404 H${x + 36}`} />
        </g>
      ))}
      <path d="M40 412 H860" />
    </svg>
  );
}
