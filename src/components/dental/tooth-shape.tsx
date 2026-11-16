import type { ToothColor } from "@/domain/dental/chart";
import type { Jaw, ToothType } from "@/domain/teeth/catalog";

/**
 * Schematic teeth, drawn here (PROJEKT_PROMPT 8.3): one shape per tooth type,
 * with as many roots as the catalogue says. They are our own simple figures;
 * the reference images are not used. Drawn for an upper tooth (roots up,
 * crown down); a lower tooth is the same figure turned over.
 */

const CROWNS: Readonly<Record<ToothType, string>> = {
  incisor: "M12 30 Q20 26 28 30 L27 55 Q20 59 13 55 Z",
  canine: "M9 30 Q20 26 31 30 L22 58 Q20 60 18 58 Z",
  premolar: "M7 30 Q20 26 33 30 L31 51 L26 57 L20 51 L14 57 L9 51 Z",
  molar: "M3 30 Q20 26 37 30 L36 49 L30 57 L25 51 L20 57 L15 51 L10 57 L4 49 Z",
};

/** Horizontal centres of the root tips, by number of roots. */
const ROOT_X: Readonly<Record<1 | 2 | 3, readonly number[]>> = {
  1: [20],
  2: [12, 28],
  3: [8, 20, 32],
};

/** The class that fills the figure, spelled out in full so the stylesheet generator finds it. */
const FILL: Readonly<Record<ToothColor, string>> = {
  red: "fill-tooth-extract",
  blue: "fill-tooth-endo",
  orange: "fill-tooth-inflamed",
  yellow: "fill-tooth-tartar",
  green: "fill-tooth-healthy",
  gray: "fill-transparent",
  none: "fill-card",
};

interface ToothShapeProps {
  type: ToothType;
  roots: 1 | 2 | 3;
  jaw: Jaw;
  color: ToothColor;
  className?: string;
}

export function ToothShape({ type, roots, jaw, color, className }: ToothShapeProps) {
  const missing = color === "gray";
  const stroke = missing ? "stroke-tooth-missing" : "stroke-foreground/60";

  return (
    <svg viewBox="0 0 40 60" aria-hidden="true" focusable="false" className={className}>
      <g transform={jaw === "mandible" ? "translate(0 60) scale(1 -1)" : undefined}>
        {ROOT_X[roots].map((x) => (
          <path
            key={x}
            d={`M${x - 5} 31 L${x} 3 L${x + 5} 31 Z`}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeDasharray={missing ? "3 2" : undefined}
            className={`${FILL[color]} ${stroke}`}
          />
        ))}
        <path
          d={CROWNS[type]}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeDasharray={missing ? "3 2" : undefined}
          className={`${FILL[color]} ${stroke}`}
        />
      </g>
    </svg>
  );
}
