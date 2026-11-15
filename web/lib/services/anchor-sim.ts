import type { Store } from "../store/types";
import { runtime } from "../runtime";

/**
 * Mock mode stand-in for the chain worker: after a short delay the publish is marked anchored with a Simulated
 * signature. Live mode leaves it pending for chain/anchor-worker.ts.
 */
export function simulateAnchor(store: Store, hash: string, kind: "graph" | "asset" = "graph", delayMs = 1500) {
  setTimeout(async () => {
    const sig = `SIMULATED-${hash.slice(0, 16)}`;
    const anchor = { status: "simulated" as const, sig, note: "Mock mode: no devnet transaction was sent" };
    if (kind === "graph") await store.updateGraph(hash, { anchor });
    else await store.updateAsset(hash, { anchor });
    runtime().lastAnchor = { sig, at: Date.now() };
  }, delayMs);
}
