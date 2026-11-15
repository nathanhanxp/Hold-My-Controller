import { ProfilePage } from "@/components/pages/ProfilePage";
export default async function Page({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <ProfilePage handle={handle} />;
}
