"use client";
import { RULES, checkRule, type Graph } from "@forklab/engine";
import { Check, Cross } from "../glyphs";

/** Runs the challenge rule in the browser on every edit. Entry is re-checked on the server. */
export function RuleChecklist({ graph, ruleIds }: { graph: Graph; ruleIds: string[] }) {
  return (
    <section className="panel tight stack" aria-labelledby="rules-h">
      <h2 id="rules-h" style={{ fontSize: "1.2rem" }}>Rule checklist</h2>
      {ruleIds.map((id) => {
        const rule = RULES[id];
        if (!rule) return null;
        const r = checkRule(id, graph);
        return (
          <div key={id} className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
            <span style={{ color: r.ok ? "var(--olive)" : "var(--clay)" }}>{r.ok ? <Check size={18} title="Passes" /> : <Cross size={18} title="Fails" />}</span>
            <div>
              <p className="small" style={{ fontWeight: 600 }}>{rule.title}: {r.ok ? "passes" : "fails"}</p>
              <p className="tiny muted">{rule.rule}</p>
              <p className="tiny">{r.reasons.join(" ")}</p>
            </div>
          </div>
        );
      })}

    </section>
  );
}
