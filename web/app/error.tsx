"use client";
import { WindRose } from "@/components/odyssey/WindRose";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="wrap" style={{ padding: "64px 20px", display: "grid", placeItems: "center", textAlign: "center", gap: 18 }} role="alert">
      <WindRose size={170} legend={false} />
      <h1>Something went wrong</h1>
      <p className="lede">This page hit an error. Your drafts are safe in this browser.</p>
      <p className="small muted" style={{ maxWidth: 560 }}>{error?.message ? `Details: ${error.message.slice(0, 200)}` : null}{error?.digest ? ` (${error.digest})` : null}</p>
      <button className="btn" onClick={reset}>Retry</button>
    </div>
  );
}
