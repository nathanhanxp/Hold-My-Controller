import { getStore } from "@/lib/runtime";
import { handle } from "@/lib/api";
export const dynamic = "force-dynamic";
export const GET = handle(async () => Response.json({ items: await (await getStore()).listChallenges() }));
