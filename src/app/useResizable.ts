import { useCallback, useEffect, useState } from "react";

interface Options {
  /** localStorage key. Pass null to disable persistence. */
  storageKey: string | null;
  defaultWidth: number;
  min: number;
  max: number;
  /** Which edge of the controlled panel the user grabs. */
  edge: "left" | "right";
}

export function useResizable({ storageKey, defaultWidth, min, max, edge }: Options) {
  const [width, setWidth] = useState<number>(() => {
    if (!storageKey || typeof window === "undefined") return defaultWidth;
    const raw = window.localStorage.getItem(storageKey);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= min && n <= max ? n : defaultWidth;
  });

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, String(width));
  }, [storageKey, width]);

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = width;
      const sign = edge === "left" ? -1 : 1; // dragging the left edge of a right panel shrinks when X grows
      const onMove = (ev: MouseEvent) => {
        const delta = (ev.clientX - startX) * sign;
        const next = Math.max(min, Math.min(max, startW + delta));
        setWidth(next);
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width, min, max, edge],
  );

  return { width, startDrag, setWidth };
}
