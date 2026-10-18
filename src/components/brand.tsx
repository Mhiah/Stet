/**
 * The Stet logo: the serif "stet" with a leaf growing from the t, over a row of five dots (the
 * proofreader's "let it stand" mark). Drawn from /logo-mask.png as a CSS mask, so it takes
 * currentColor and follows the theme.
 */
const RATIO = 379 / 279;

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Stet"
      className={`inline-block bg-current align-middle ${className}`}
      style={{
        height: "1em",
        width: `${RATIO}em`,
        WebkitMaskImage: "url(/logo-mask.png)",
        maskImage: "url(/logo-mask.png)",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "left center",
        maskPosition: "left center",
      }}
    />
  );
}
