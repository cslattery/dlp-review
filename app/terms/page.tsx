import { AppShell } from "@/components/app-shell";
import { TermsView } from "@/components/terms-view";

export default function TermsPage() {
  return (
    <AppShell active="terms">
      <TermsView />
    </AppShell>
  );
}
