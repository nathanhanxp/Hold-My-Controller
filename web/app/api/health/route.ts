import { health } from "@/lib/status";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(await health());
}
