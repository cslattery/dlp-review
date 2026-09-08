import { AppShell } from "@/components/app-shell";
import { AuditView } from "@/components/audit-view";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ fqn?: string }>;
}) {
  const { fqn } = await searchParams;
  return (
    <AppShell active="audit">
      <AuditView initialFqn={fqn ?? ""} />
    </AppShell>
  );
}
