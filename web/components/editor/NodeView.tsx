"use client";
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CATALOG, type GraphNode } from "@forklab/engine";
import { authorColor } from "@/lib/colors";

export type NodeData = {
  node: GraphNode;
  colorByAuthor: boolean;
  dead: boolean;
  ghost?: boolean;
  readOnly?: boolean;
  error?: string;
  onParam?: (id: string, key: string, value: number | string) => void;
};

const ROW = 20;
const HEAD = 30;

function NodeViewInner({ data, selected }: NodeProps & { data: NodeData }) {
  const { node, colorByAuthor, dead, ghost, readOnly, onParam, error } = data;
  const def = CATALOG[node.type];
  const color = authorColor(node.authorId);
  const ports = Math.max(def.inputs.length, def.outputs.length);
  return (
    <div
      className={`fl-node${ghost ? " ghost" : ""}${dead ? " dead" : ""}${selected ? " selected" : ""}`}
      style={colorByAuthor ? { boxShadow: `0 0 0 1px ${color}66, 0 0 26px -8px ${color}`, background: `linear-gradient(160deg, ${color}26, rgba(22,17,24,0.94) 60%)` } : undefined}
      title={dead ? "Not connected to an event: this node does not run and does not count." : undefined}
    >
      <svg className="fl-meander" width="100%" height="5" aria-hidden="true" style={{ display: "block", background: colorByAuthor ? color : "var(--vase-dark)" }} />
      <div className="fl-head" style={{ height: HEAD - 5 }}>
        <span>{def.label}</span>
        <span className="tiny" style={{ color: colorByAuthor ? color : "var(--muted)", fontWeight: 600 }}>@{node.authorId}</span>
      </div>
      <div style={{ position: "relative", height: ports * ROW }}>
        {def.inputs.map((p, i) => (
          <div key={`i${p.name}`} className="fl-port" style={{ position: "absolute", left: 10, top: i * ROW + 2 }}>
            {p.name === "in" ? "run" : p.name}
          </div>
        ))}
        {def.outputs.map((p, i) => (
          <div key={`o${p.name}`} className="fl-port" style={{ position: "absolute", right: 10, top: i * ROW + 2 }}>
            {p.name === "out" ? (p.kind === "exec" ? "then" : "value") : p.name}
          </div>
        ))}
      </div>
      {def.inputs.map((p, i) => (
        <Handle key={`hi${p.name}`} id={p.name} type="target" position={Position.Left} className={p.kind === "exec" ? "exec" : "number"} style={{ top: HEAD + i * ROW + 10 }} isConnectable={!readOnly} />
      ))}
      {def.outputs.map((p, i) => (
        <Handle key={`ho${p.name}`} id={p.name} type="source" position={Position.Right} className={p.kind === "exec" ? "exec" : "number"} style={{ top: HEAD + i * ROW + 10 }} isConnectable={!readOnly} />
      ))}
      {def.params.length ? (
        <div className="fl-body nodrag" style={{ background: "rgba(0,0,0,0.14)" }}>
          {def.params.map((p) => {
            const v = node.params[p.name] ?? p.default;
            const id = `${node.id}-${p.name}`;
            return (
              <label key={p.name} className="fl-param" htmlFor={id}>
                <span className="tiny muted">{p.name}</span>
                {readOnly ? (
                  <span className="tiny mono">{String(v)}</span>
                ) : p.options ? (
                  <select id={id} value={String(v)} onChange={(e) => onParam?.(node.id, p.name, e.target.value)}>
                    {p.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : p.kind === "int" ? (
                  <input id={id} type="number" step={1} value={Number(v)} onChange={(e) => onParam?.(node.id, p.name, Math.trunc(Number(e.target.value) || 0))} />
                ) : (
                  <input id={id} type="text" maxLength={40} value={String(v)} onChange={(e) => onParam?.(node.id, p.name, e.target.value.replace(/[^\x20-\x7e]/g, ""))} />
                )}
              </label>
            );
          })}
        </div>
      ) : null}
      {error ? <div className="tiny" style={{ color: "var(--clay)", padding: "2px 8px" }}>{error}</div> : null}
    </div>
  );
}

export const NodeView = memo(NodeViewInner);
