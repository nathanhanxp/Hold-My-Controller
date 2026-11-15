import { PageHeader } from "@/components/ui";
export const metadata = { title: "Privacy · Hold My Controller" };
export default function Page() {
  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <PageHeader eyebrow="Privacy" title="Privacy" />
      <div className="stack" style={{ marginTop: 18 }}>
        <p>We store your handle, the graphs and assets you publish, your licenses, votes and replays (your key presses with tick numbers). All of this is public.</p>
        <p>If you link a wallet, its address is public, here and on the Solana devnet ledger. We never ask for a private key or seed phrase.</p>
        <p>Your handle and editor draft are kept in this browser&apos;s local storage. Clearing site data removes them.</p>
        <p>When you use the AI assistant, your prompt, an optional image, and a compact version of your graph (node types, parameters, ids and author handles) are sent to Google Gemini or, if it fails, NVIDIA Nemotron. Long free text is dropped first.</p>
      </div>
    </div>
  );
}
