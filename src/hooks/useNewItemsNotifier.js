import { useEffect, useRef } from "react";

/**
 * Observa uma lista; quando aparecem itens com id novo, dispara um CustomEvent.
 * Na primeira montagem apenas “marca vistos” (não notifica histórico).
 */
export default function useNewItemsNotifier(items, getId, eventName){
  const seen = useRef(new Set());
  const mounted = useRef(false);

  useEffect(()=>{
    const arr = Array.isArray(items) ? items : [];
    arr.forEach(it => {
      const id = getId?.(it);
      if (!id) return;
      if (!seen.current.has(id)) {
        if (mounted.current) {
          window.dispatchEvent(new CustomEvent(eventName, { detail: it }));
        }
        seen.current.add(id);
      }
    });
    if (!mounted.current) mounted.current = true;
  },[items, getId, eventName]);
}
