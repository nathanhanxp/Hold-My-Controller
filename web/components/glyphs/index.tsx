import type { SVGProps } from "react";

// Original glyph set on a 24 px grid, 2 px stroke, currentColor. Decorative unless a title is given.
type P = SVGProps<SVGSVGElement> & { title?: string; size?: number };

function G({ title, size = 24, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} {...rest}>
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const Ship = (p: P) => (
  <G {...p}>
    <path d="M3 16h18l-2.5 4h-13z" />
    <path d="M12 3v13" />
    <path d="M12 4l6 9h-6" />
    <path d="M12 6l-5 7h5" />
  </G>
);
export const Wave = (p: P) => (
  <G {...p}>
    <path d="M2 14c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3" />
    <path d="M2 19c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3" />
  </G>
);
export const Meander = (p: P) => (
  <G {...p}>
    <path d="M3 19V5h12v10H9V9h3" />
    <path d="M15 19h6V5" />
  </G>
);
export const Laurel = (p: P) => (
  <G {...p}>
    <path d="M7 20c-3-3-4-8-1-13" />
    <path d="M17 20c3-3 4-8 1-13" />
    <path d="M5 15l-2-1M5.5 11.5L3.5 10M7 8L5.5 6" />
    <path d="M19 15l2-1M18.5 11.5l2-1.5M17 8l1.5-2" />
    <path d="M9 21h6" />
  </G>
);
export const Amphora = (p: P) => (
  <G {...p}>
    <path d="M9 3h6M10 3v3c-3 2-4 5-4 8 0 3 2 5 4 6h4c2-1 4-3 4-6 0-3-1-6-4-8V3" />
    <path d="M10 7c-3 0-4 2-3 4M14 7c3 0 4 2 3 4" />
    <path d="M7 13h10" />
  </G>
);
export const Column = (p: P) => (
  <G {...p}>
    <path d="M4 5h16M5 5c0-1.5 2-2 2-2h10s2 .5 2 2" />
    <path d="M7 7v11M10 7v11M14 7v11M17 7v11" />
    <path d="M5 20h14M6 18h12" />
  </G>
);
export const WindRoseGlyph = (p: P) => (
  <G {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 2l2 8 8 2-8 2-2 8-2-8-8-2 8-2z" />
  </G>
);
export const Loom = (p: P) => (
  <G {...p}>
    <path d="M4 3v18M20 3v18M4 5h16M4 19h16" />
    <path d="M8 5v14M12 5v14M16 5v14" />
  </G>
);
export const Tripod = (p: P) => (
  <G {...p}>
    <path d="M5 8h14c0 4-3 6-7 6s-7-2-7-6z" />
    <path d="M8 6l1-3M16 6l-1-3" />
    <path d="M8 13l-3 8M16 13l3 8M12 14v7" />
  </G>
);
export const Shuttle = (p: P) => (
  <G {...p}>
    <path d="M2 12c4-4 16-4 20 0-4 4-16 4-20 0z" />
    <path d="M9 12h6" />
  </G>
);
export const Olive = (p: P) => (
  <G {...p}>
    <path d="M4 20C9 15 14 10 20 4" />
    <path d="M9 15c-2-1-3-3-2-5 2 0 3 2 2 5zM13 11c0-2 1-4 3-4 0 2-1 4-3 4zM16 8c2 0 4 1 4 3-2 0-3-1-4-3z" />
  </G>
);
export const Eye = (p: P) => (
  <G {...p}>
    <path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </G>
);
export const SunDisc = (p: P) => (
  <G {...p}>
    <circle cx="12" cy="12" r="5" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
  </G>
);
export const Beacon = ({ lit = true, ...p }: P & { lit?: boolean }) => (
  <G {...p}>
    <path d="M8 21h8M9 21l1-9h4l1 9" />
    <path d="M7 12h10" />
    {lit ? <path d="M12 3c2 2 3 3.5 3 5a3 3 0 01-6 0c0-1.5 1-3 3-5z" fill="currentColor" /> : <path d="M10 9h4" />}
  </G>
);
export const Check = (p: P) => (<G {...p}><path d="M4 12l5 5L20 6" /></G>);
export const Cross = (p: P) => (<G {...p}><path d="M6 6l12 12M18 6L6 18" /></G>);

export const GLYPHS = { Ship, Wave, Meander, Laurel, Amphora, Column, WindRoseGlyph, Loom, Tripod, Shuttle, Olive, Eye, SunDisc, Beacon } as const;
