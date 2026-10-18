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
  const logo = <Wordmark className="text-7xl max-[359px]:text-5xl" />;
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
        {children}
        <ThemeToggle />
      </div>
    </header>
  );
}
