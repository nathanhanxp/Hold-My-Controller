import { Suspense } from "react";
import { MechanicPage } from "@/components/pages/MechanicPage";
import { Loading } from "@/components/ui";
export default async function Page({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  return <Suspense fallback={<div className="wrap" style={{ padding: 40 }}><Loading /></div>}><MechanicPage hash={hash} /></Suspense>;
}
