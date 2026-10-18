import type { CSSProperties } from "react";
import { outfit } from "@/lib/fonts";

/**
 * The Crux wordmark: a C drawn from chevrons running clockwise (open on the right), set
 * as the first letter of "CRUX" in Outfit Light. Everything is drawn in currentColor so
 * it follows the theme.
 */

// Chevron positions every 30° clockwise from the top; the three on the right are left out for the C's opening.
const CHEVRONS = [0, 30, 150, 180, 210, 240, 270, 300, 330];
const STROKE = 13;
// The chevrons' measured ink bounds, so the C's box has no empty margin (and nothing is clipped).
const INK = { x: -56.7, y: -56.7, w: 92.2, h: 113.4 };

// Outfit Light metrics (measured): capital height and the space built in to the left of the R.
const CAP_HEIGHT = 0.703;
const R_LEFT_BEARING = 0.078;
// Round letters are drawn slightly taller than flat ones so they look the same height.
const OVERSHOOT = 0.015;
// Visible space left between the C and the R: about the gap between the other letters.
const C_TO_R = 0.04;
// The X's slant, and a nudge so the sheared X keeps the same spacing from the U.
const X_SLANT = 12;
const X_NUDGE = 0.02;

const markHeight = CAP_HEIGHT * (1 + 2 * OVERSHOOT);
const markWidth = (markHeight * INK.w) / INK.h;

export function CruxMark({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox={`${INK.x} ${INK.y} ${INK.w} ${INK.h}`} className={className} style={style} aria-hidden>
      {CHEVRONS.map((deg) => (
        <path
          key={deg}
          d="M -4.5 -7.5 L 3.5 0 L -4.5 7.5"
          transform={`rotate(${deg - 90}) translate(40 0) rotate(90)`}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      ))}
    </svg>
  );
}

/**
 * "CRUX" as one logo: the chevron C sits on the baseline at capital height, then R, U and
 * a slanted X in Outfit Light. Outfit has no italic, so the X is sheared by a fixed angle
 * rather than left to each browser's synthetic italic.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`${outfit.className} inline-flex items-baseline leading-none ${className}`} role="img" aria-label="Crux">
      <CruxMark
        className="shrink-0"
        style={{
          height: `${markHeight}em`,
          width: `${markWidth}em`,
          // Its bottom edge sits on the baseline; nudge it down by the overshoot.
          transform: `translateY(${CAP_HEIGHT * OVERSHOOT}em)`,
        }}
      />
      <span aria-hidden className="font-light" style={{ letterSpacing: "-0.04em", marginLeft: `${C_TO_R - R_LEFT_BEARING}em` }}>
        RU
      </span>
      <span aria-hidden className="inline-block font-light" style={{ letterSpacing: "-0.04em", transform: `skewX(-${X_SLANT}deg)`, marginLeft: `${X_NUDGE}em` }}>
        X
      </span>
    </span>
  );
}
