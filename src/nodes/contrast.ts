/**
 * Pick a readable foreground colour for the given background hex.
 *
 * Light header colours (action orange #f4a261, answering amber, condition
 * yellow, etc.) need dark text — white-on-orange fails WCAG AA at ~1.73:1.
 * Dark colours (menu purple, screening red, recording brown) keep white text
 * for the 4.5:1+ contrast WCAG expects.
 *
 * Pure function — exported separately so it's unit-testable.
 */
export function relativeLuminance(hex: string): number {
  let h = hex.replace("#", "");
  // Expand 3-char shorthand (#fff -> #ffffff).
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Pick whichever of `#fff` or `#11161f` gives the higher WCAG contrast against
 * `hex`. WCAG AA requires 4.5:1 for normal text; this picks the better of the
 * two regardless of which side of the 4.5 line they fall, but in practice the
 * picked colour always meets AA against our vibrant category palette.
 */
export function pickHeaderText(hex: string): "#fff" | "#11161f" {
  const lum = relativeLuminance(hex);
  const lumWhite = 1.0;
  const lumDark = relativeLuminance("#11161f");
  // Contrast ratio = (L1 + 0.05) / (L2 + 0.05) where L1 is the lighter.
  const contrastWhite = (lumWhite + 0.05) / (lum + 0.05);
  const contrastDark = (lum + 0.05) / (lumDark + 0.05);
  return contrastDark > contrastWhite ? "#11161f" : "#fff";
}

/** WCAG contrast ratio between two hexes — useful for the test suite. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
