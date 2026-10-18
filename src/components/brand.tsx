import { outfit } from "@/lib/fonts";

/**
 * The Stet wordmark. In proofreading, "stet" means "let it stand", marked with a row of dots
 * under the words that must not be changed; the dots under the name are that mark. Drawn in
 * currentColor so it follows the theme.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`${outfit.className} inline-flex flex-col items-start leading-none ${className}`} role="img" aria-label="Stet">
      <span aria-hidden className="font-light" style={{ letterSpacing: "-0.03em" }}>
        stet
      </span>
      <svg aria-hidden viewBox="0 0 100 8" className="w-full" style={{ height: "0.12em", marginTop: "0.08em" }} preserveAspectRatio="none">
        {[6, 22, 38, 54, 70, 86].map((x) => (
          <circle key={x} cx={x + 4} cy={4} r={3.4} fill="currentColor" />
        ))}
      </svg>
    </span>
  );
}
