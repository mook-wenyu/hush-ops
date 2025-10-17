import { useEffect } from "react";

export function useDesignerHotkeys(actions: { save?: () => void; layout?: () => void; resetView?: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key.toLowerCase() === 's') { e.preventDefault(); actions.save?.(); }
      if (isMod && e.key.toLowerCase() === 'l') { e.preventDefault(); actions.layout?.(); }
      if (isMod && e.key.toLowerCase() === '0') { e.preventDefault(); actions.resetView?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);
}
