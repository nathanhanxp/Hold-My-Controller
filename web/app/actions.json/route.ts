import { createActionHeaders, type ActionsJson } from "@solana/actions";
export const dynamic = "force-dynamic";
const headers = () => createActionHeaders({ chainId: "devnet", actionVersion: "2.1" });
/** Blink rules: a mechanic page /m/<hash> maps to its action API (BlinkBounties pattern). */
export async function GET() {
  const payload: ActionsJson = { rules: [{ pathPattern: "/m/*", apiPath: "/api/actions/mechanic/*" }] };
  return Response.json(payload, { headers: headers() });
}
export async function OPTIONS() {
  return new Response(null, { headers: headers() });
}
