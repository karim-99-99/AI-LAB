"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Studio" },
  { href: "/n8n", label: "n8n Workflows" },
  { href: "/approve", label: "Approvals" },
  { href: "/admin", label: "Ops" },
] as const;

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--lab-border)] bg-[color-mix(in_srgb,var(--background)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="text-xl font-semibold tracking-tight text-[var(--lab-accent)] transition group-hover:opacity-90">
            AI Lab
          </span>
          <span className="hidden text-xs text-[var(--lab-ink-muted)] sm:inline">
            Applied AI automation
          </span>
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-1">
          {LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--lab-accent)] text-white"
                    : "text-[var(--lab-ink-muted)] hover:bg-[var(--lab-accent-soft)] hover:text-[var(--foreground)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
