import { redirect } from "next/navigation";
import { AssetPage } from "@/components/pages/AssetPage";
export default async function Page({ params }: { params: Promise<{ kind: string; hash: string }> }) {
  const { kind, hash } = await params;
  if (kind === "mechanic" || kind === "level") redirect(`/m/${hash}`);
  return <AssetPage hash={hash} />;
}
