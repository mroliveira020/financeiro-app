import { useCallback, useEffect, useState } from "react";

export function useCompactLayout(maxWidth = 900) {
  const getMatches = useCallback(() => {
    if (typeof window === "undefined") return false;
    const widthOk = window.innerWidth <= maxWidth;
    const coarsePointer =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(pointer: coarse)").matches
        : false;
    const touchPoints = navigator.maxTouchPoints || 0;
    const userAgent = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent || "");
    return widthOk && (coarsePointer || touchPoints > 0 || userAgent);
  }, [maxWidth]);

  const [compact, setCompact] = useState(getMatches);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const pointerQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(pointer: coarse)")
        : null;
    const listener = () => setCompact(getMatches());

    setCompact(getMatches());

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", listener);
      pointerQuery?.addEventListener?.("change", listener);
      return () => {
        mediaQuery.removeEventListener("change", listener);
        pointerQuery?.removeEventListener?.("change", listener);
      };
    }

    mediaQuery.addListener(listener);
    pointerQuery?.addListener?.(listener);
    return () => {
      mediaQuery.removeListener(listener);
      pointerQuery?.removeListener?.(listener);
    };
  }, [getMatches, maxWidth]);

  return compact;
}
