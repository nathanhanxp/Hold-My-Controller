import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { TUTORIALS } from "@/lib/tutorials";
export const metadata = { title: "Tutorials · Hold My Controller" };
export default function Page() {
  return (
    <div className="wrap">
      <PageHeader eyebrow="Tutorials" title="Learn by building" />
      <svg viewBox="0 0 900 140" role="img" aria-label="Route across three landings" style={{ width: "100%", height: 140, marginTop: 18, background: "rgba(10,20,30,0.6)", border: "1px solid var(--line)", borderRadius: 6 }}>
        <path d="M80 90 C 250 20, 380 130, 450 70 S 700 30, 820 80" fill="none" stroke="var(--figure)" strokeWidth="2" strokeDasharray="7 5" />
        {[[80, 90], [450, 70], [820, 80]].map(([x, y], i) => (
          <g key={i}><ellipse cx={x} cy={y} rx="46" ry="22" fill="rgba(236,230,216,0.06)" stroke="var(--vase)" strokeWidth="2.5" /><text x={x} y={y + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--ink)">{i + 1}</text></g>
        ))}
      </svg>
      <ol className="cards" style={{ listStyle: "none", padding: 0, marginTop: 18 }}>
        {TUTORIALS.map((t, i) => (
          <li key={t.id} className="panel stack">
            <p className="eyebrow">Landing {i + 1}</p>
            <h2 style={{ fontSize: "1.4rem" }}>{t.title}</h2>
            <p className="small">{t.intro}</p>
            <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>{t.steps.map((s) => <li key={s.text}>{s.text}</li>)}</ol>
            <Link className="btn" href={`/build?tutorial=${t.id}`}>Start</Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
