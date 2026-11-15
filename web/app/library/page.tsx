import { Suspense } from "react";
import { Library } from "@/components/pages/Library";
import { Loading } from "@/components/ui";
export const metadata = { title: "Library · Hold My Controller" };
export default function Page() { return <Suspense fallback={<div className="wrap" style={{ padding: 40 }}><Loading /></div>}><Library /></Suspense>; }
