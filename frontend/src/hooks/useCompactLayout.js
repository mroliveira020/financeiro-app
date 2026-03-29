import { useEffect, useState } from "react";

export function useCompactLayout(maxWidth = 640) {
  const getMatches = () => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= maxWidth;
  };

  const [compact, setCompact] = useState(getMatches);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const listener = (event) => setCompact(event.matches);

    setCompact(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    }

    mediaQuery.addListener(listener);
    return () => mediaQuery.removeListener(listener);
  }, [maxWidth]);

  return compact;
}
