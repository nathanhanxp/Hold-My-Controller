"use client";
import { CATALOG, countedNodes, type Graph } from "@forklab/engine";
import { AuthorChip } from "../ui";

/** The same graph as a text list: accessible and a robust fallback for the canvas. */
export function ListView({ graph, onRemove }: { graph: Graph; onRemove?: (id: string) => void }) {
  const counted = countedNodes(graph);
  return (
    <div className="table-scroll" style={{ padding: 12 }}>
      <table className="data">
        <caption className="sr-only">Nodes and connections</caption>
        <thead><tr><th>Node</th><th>Type</th><th>Parameters</th><th>Runs next</th><th>Author</th><th>Counts</th>{onRemove ? <th /> : null}</tr></thead>
        <tbody>
          {graph.nodes.map((n) => {
            const outs = graph.edges.filter((e) => e.from.node === n.id).map((e) => `${e.from.port === "out" ? "" : `${e.from.port}: `}${e.to.node}${e.kind === "data" ? `.${e.to.port}` : ""}`);
            return (
              <tr key={n.id}>
                <td className="mono">{n.id}</td>
                <td>{CATALOG[n.type].label}</td>
                <td className="small mono">{Object.entries(n.params).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}</td>
                <td className="small mono">{outs.join("; ") || "none"}</td>
                <td><AuthorChip handle={n.authorId} link={false} /></td>
                <td>{counted.has(n.id) ? "yes" : <span className="muted">no (not connected)</span>}</td>
                {onRemove ? <td><button className="btn quiet sm" onClick={() => onRemove(n.id)} aria-label={`Remove ${n.id}`}>Remove</button></td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!graph.nodes.length ? <p className="muted small">No nodes yet.</p> : null}
    </div>
  );
}
