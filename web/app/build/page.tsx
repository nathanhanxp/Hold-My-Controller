import { Suspense } from "react";
import { Editor } from "@/components/editor/Editor";
import { Loading } from "@/components/ui";
export const metadata = { title: "Editor · Hold My Controller" };
export default function Page() {
  return <Suspense fallback={<div className="wrap" style={{ padding: 40 }}><Loading label="Opening the editor" /></div>}><Editor /></Suspense>;
}
