import Link from "next/link";
import { TooltipProvider } from "@/components/ui/tooltip";

const NAV = [
  { href: "/", label: "Queue" },
  { href: "/terms", label: "Terms" },
  { href: "/audit", label: "Audit" },
];

export function AppShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active: "queue" | "terms" | "audit" | "column";
}) {
  return (
    <TooltipProvider>
      <div className="flex min-h-full flex-col bg-background">
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                gov_dlp · Sensitive Data Protection
              </p>
              <h1 className="text-lg font-semibold tracking-tight">
                Column classification review
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Profile → propose → drift → human. Tags apply only from an approved
                decision — never from DLP, a name rule, or this stub tagger.
              </p>
            </div>
            <nav className="flex flex-wrap gap-1">
              {NAV.map((item) => {
                const isActive =
                  (active === "queue" || active === "column") && item.href === "/"
                    ? active === "queue"
                    : item.href.replace("/", "") === active;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-lg px-3 py-1.5 text-sm ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      </div>
    </TooltipProvider>
  );
}
