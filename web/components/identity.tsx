"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { safeStorage } from "@/lib/client";

type Identity = { handle: string | null; setHandle: (h: string | null) => void; ready: boolean };
const Ctx = createContext<Identity>({ handle: null, setHandle: () => undefined, ready: false });

/** Hackathon identity: a handle stored in this browser. Wallets are linked to handles with a signed message. */
export function IdentityProvider({ children }: { children: ReactNode }) {
  const [handle, setH] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setH(safeStorage().get("forklab.handle"));
    setReady(true);
  }, []);
  const setHandle = (h: string | null) => {
    setH(h);
    if (h) safeStorage().set("forklab.handle", h);
    else safeStorage().del("forklab.handle");
  };
  return <Ctx.Provider value={{ handle, setHandle, ready }}>{children}</Ctx.Provider>;
}
export const useIdentity = () => useContext(Ctx);
