"use client";

import Link from "next/link";

/**
 * A small "— HOME" link in the bottom-right corner of result pages, back to the landing page.
 * A link by default, or `onHome` when the home page needs to reset its own state.
 */
export function HomeButton({ onHome }: { onHome?: () => void }) {
  const className =
    "fixed right-4 bottom-4 z-20 flex items-center gap-2 rounded-full bg-background/90 px-3 py-2 text-[11px] font-medium tracking-[0.2em] text-muted backdrop-blur transition hover:text-foreground sm:right-6 sm:bottom-6 print:hidden";
  const content = (
    <>
      <span aria-hidden className="h-px w-4 bg-current" />
      HOME
    </>
  );
  return onHome ? (
    <button type="button" onClick={onHome} className={className} style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      {content}
    </button>
  ) : (
    <Link href="/" className={className} style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      {content}
    </Link>
  );
}
