import { AppShell } from "@/components/app-shell";
import { QueueView } from "@/components/queue-view";

export default function QueuePage() {
  return (
    <AppShell active="queue">
      <QueueView />
    </AppShell>
  );
}
