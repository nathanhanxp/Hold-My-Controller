import { Suspense } from "react";
import { Discover } from "@/components/pages/Discover";
import { Loading } from "@/components/ui";
export default function Page() {
  return <Suspense fallback={<div className="wrap" style={{ padding: 40 }}><Loading /></div>}><Discover /></Suspense>;
}
