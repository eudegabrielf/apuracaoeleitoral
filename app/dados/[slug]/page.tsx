import { ElectionDetail } from "@/components/application/election/election-detail";

export default async function ElectionDataPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ turn?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const turn = query.turn === "2" ? 2 : 1;
  return <ElectionDetail slug={slug} turn={turn} />;
}
