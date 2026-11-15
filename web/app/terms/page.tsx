import { PageHeader } from "@/components/ui";
export const metadata = { title: "Terms · Hold My Controller" };
export default function Page() {
  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <PageHeader eyebrow="Terms" title="Terms" />
      <div className="stack" style={{ marginTop: 18 }}>
        <p>Hold My Controller runs on Solana devnet only. Devnet SOL has no value. There is no real money, no token and no NFT.</p>
        <p>Everything you publish is public and content-addressed. Free to fork means anyone may copy, change and republish it with your nodes still credited to you.</p>
        <p>Attribution is computed by a published algorithm from the graph you publish. The platform registers the resulting split on-chain and the program enforces it. Adding many trivial nodes can raise a share; the receipt lists every node so buyers can judge.</p>
        <p>Weekly games have no entry fee. Prize pools are deposited by the challenge creator. Votes and replays are checked as described on the Community page; they are not anti-cheat guarantees.</p>
        <p>The Community tab is community-run and is not an official FaZe program.</p>
      </div>
    </div>
  );
}
