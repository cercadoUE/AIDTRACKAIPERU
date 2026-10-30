import { RankingView } from "./ranking-view";

export default async function RankingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const d = typeof sp.department === "string" && /^\d{2}$/.test(sp.department) ? sp.department : undefined;
  return <RankingView initialDepartment={d} />;
}
