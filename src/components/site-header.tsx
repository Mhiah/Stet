"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "./brand";
import { ThemeToggle } from "./theme-toggle";

/**
 * Logo on the left; theme toggle and any page actions on the right. The logo goes home:
 * a link by default, or `onHome` when the home page needs to reset its own state.
 */
export function SiteHeader({ onHome, homeDisabled = false, children }: { onHome?: () => void; homeDisabled?: boolean; children?: ReactNode }) {
  const logo = <Wordmark className="text-5xl max-[359px]:text-4xl" />;
  return (
    <header className="flex w-full items-center gap-2 px-5 py-4 sm:px-8 print:hidden">
      {onHome ? (
        <button type="button" onClick={onHome} disabled={homeDisabled} className="rounded-md">
          {logo}
        </button>
      ) : (
        <Link href="/" className="rounded-md">
          {logo}
        </Link>
      )}
      <div className="ml-auto flex items-center gap-2">
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/runs" className="rounded-md px-2 py-1.5 text-muted hover:text-foreground">
            Runs
          </Link>
          <Link href="/verify" className="rounded-md px-2 py-1.5 text-muted hover:text-foreground">
            Verify
          </Link>
        </nav>
        {children}
        <ThemeToggle />
      </div>
    </header>
  );
}
