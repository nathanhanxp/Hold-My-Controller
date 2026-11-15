import { getStore } from "@/lib/runtime";
import { handle, jsonError, readJson } from "@/lib/api";
export const dynamic = "force-dynamic";
export const GET = handle(async () => Response.json({ items: await (await getStore()).teams() }));
/** Join or create a team of up to 5 (a name and a member list, nothing more). */
export const POST = handle(async (req: Request) => {
  const body = await readJson<{ name: string; handle: string }>(req);
  const name = String(body.name ?? "").trim().slice(0, 32);
  const h = String(body.handle ?? "").toLowerCase();
  if (!name || !/^[a-z0-9_]{1,24}$/.test(h)) return jsonError("BAD_INPUT", "Team name and handle are required.");
  const store = await getStore();
  const teams = await store.teams();
  for (const t of teams) if (t.members.includes(h) && t.name !== name) { t.members = t.members.filter((m) => m !== h); await store.putTeam(t); }
  const t = teams.find((x) => x.name.toLowerCase() === name.toLowerCase()) ?? { _id: `t-${Date.now().toString(36)}`, name, members: [], createdAt: Date.now() };
  if (!t.members.includes(h)) {
    if (t.members.length >= 5) return jsonError("FULL", "Teams have at most 5 members.", 409);
    t.members.push(h);
  }
  await store.putTeam(t);
  return Response.json({ team: t });
});
