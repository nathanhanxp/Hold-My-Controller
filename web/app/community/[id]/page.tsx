import { ChallengePage } from "@/components/community/ChallengePage";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChallengePage id={id} />;
}
