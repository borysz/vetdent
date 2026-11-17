import type { ToothColor } from "@/domain/dental/chart";
import { CROWN_PATHS, ROOT_X, TOOTH_BOX, rootPath } from "@/domain/dental/tooth-geometry";
import type { Jaw, ToothType } from "@/domain/teeth/catalog";

/**
 * Schematic teeth, drawn here (PROJEKT_PROMPT 8.3): one shape per tooth type,
 * with as many roots as the catalogue says (the figures live in
 * `tooth-geometry.ts`, shared with the PDF). Drawn for an upper tooth; a lower
 * tooth is the same figure turned over.
 */

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
    <svg viewBox={`0 0 ${TOOTH_BOX.width} ${TOOTH_BOX.height}`} aria-hidden="true" focusable="false" className={className}>
      <g transform={jaw === "mandible" ? `translate(0 ${TOOTH_BOX.height}) scale(1 -1)` : undefined}>
        {ROOT_X[roots].map((x) => (
          <path
            key={x}
            d={rootPath(x)}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeDasharray={missing ? "3 2" : undefined}
            className={`${FILL[color]} ${stroke}`}
          />
        ))}
        <path
          d={CROWN_PATHS[type]}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeDasharray={missing ? "3 2" : undefined}
          className={`${FILL[color]} ${stroke}`}
        />
      </g>
    </svg>
  );
}
