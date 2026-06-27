import { useCallback, useEffect, useState } from "react";

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

/**
 * A draggable panel width, persisted to localStorage. `edge` is the side the
 * drag handle sits on: a handle on the panel's right grows it as the pointer
 * moves right; a handle on its left grows it as the pointer moves left.
 */
export function useResizable(
  storageKey: string,
  initial: number,
  min: number,
  max: number,
  edge: "left" | "right",
) {
  const [width, setWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem(storageKey));
    return stored >= min && stored <= max ? stored : initial;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, String(width));
  }, [storageKey, width]);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        setWidth(clamp(startWidth + (edge === "right" ? dx : -dx), min, max));
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

  return { width, onDragStart };
}
