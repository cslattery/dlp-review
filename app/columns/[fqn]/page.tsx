import { AppShell } from "@/components/app-shell";
import { ColumnDetailView } from "@/components/column-detail-view";

export default async function ColumnPage({
  params,
  searchParams,
}: {
  params: Promise<{ fqn: string }>;
  searchParams: Promise<{ intent?: string }>;
}) {
  const { fqn } = await params;
  const { intent } = await searchParams;
  return (
    <AppShell active="column">
      <ColumnDetailView fqn={decodeURIComponent(fqn)} intent={intent} />
    </AppShell>
  );
}
