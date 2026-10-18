"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Wordmark } from "./brand";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/", label: "New run", icon: PlusIcon },
  { href: "/runs", label: "Runs", icon: ListIcon },
  { href: "/verify", label: "Verify", icon: ShieldIcon },
];

/**
 * The app frame: a forest-green sidebar on desktop (logo, navigation, network), a compact bar on
 * phones. `onHome` lets the home page reset its own state when "New run" is chosen there.
 */
export function AppShell({ children, onHome, actions }: { children: ReactNode; onHome?: () => void; actions?: ReactNode }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href)) || (href === "/runs" && path.startsWith("/research"));

  const navItem = (item: (typeof NAV)[number], compact = false) => {
    const active = isActive(item.href);
    const cls = compact
      ? `flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm ${active ? "bg-white/10 text-brand-ink" : "text-brand-muted hover:text-brand-ink"}`
      : `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${active ? "bg-white/10 font-medium text-brand-ink" : "text-brand-muted hover:bg-white/5 hover:text-brand-ink"}`;
    const content = (
      <>
        <item.icon />
        <span className={compact ? "max-[420px]:sr-only" : ""}>{item.label}</span>
      </>
    );
    if (item.href === "/" && onHome) {
      return (
        <button key={item.href} type="button" onClick={onHome} className={cls}>
          {content}
        </button>
      );
    }
    return (
      <Link key={item.href} href={item.href} className={cls}>
        {content}
      </Link>
    );
  };

  return (
    <div className="flex min-h-dvh w-full flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-brand px-4 py-6 text-brand-ink lg:flex print:hidden">
        <Link href="/" className="px-3 text-mint" aria-label="Stet home" onClick={onHome}>
          <Wordmark className="text-4xl" />
        </Link>
        <nav className="mt-10 flex flex-col gap-1">{NAV.map((n) => navItem(n))}</nav>
        <div className="mt-auto space-y-3 px-3">
          <div className="rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-brand-muted">
            <p className="flex items-center gap-2 font-medium text-brand-ink">
              <span className="h-2 w-2 rounded-full bg-mint" aria-hidden />
              Recorded on Arkiv
            </p>
            <p className="mt-1">Tiramisu testnet · chain 7738577</p>
          </div>
          <ThemeToggle className="text-brand-muted hover:bg-white/10 hover:text-brand-ink" />
        </div>
      </aside>

      {/* Phone and tablet bar */}
      <header className="sticky top-0 z-30 flex items-center gap-2 bg-brand px-4 py-3 text-brand-ink lg:hidden print:hidden">
        <Link href="/" className="text-mint" aria-label="Stet home" onClick={onHome}>
          <Wordmark className="text-2xl" />
        </Link>
        <nav className="ml-auto flex items-center gap-0.5">{NAV.map((n) => navItem(n, true))}</nav>
        <ThemeToggle className="text-brand-muted hover:bg-white/10 hover:text-brand-ink" />
      </header>

      <div className="flex min-w-0 flex-1 flex-col">
        {actions && <div className="flex justify-end gap-2 px-5 pt-5 sm:px-10 print:hidden">{actions}</div>}
        {children}
      </div>
    </div>
  );
}

/** Small uppercase label in mint-on-forest or sage, used above headings. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-md bg-mint-soft px-2 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-good">
      {children}
    </p>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
