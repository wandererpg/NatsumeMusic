import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/** Measure buttons so the selection follows text size and window resizing. */
export function useSelectionIndicator(selection: string | null) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ opacity: 0 });
  useLayoutEffect(() => {
    const group = ref.current;
    if (!group) return;
    const measure = () => {
      const selected = group.querySelector<HTMLElement>('button.is-active');
      setStyle(previous => selected ? {
        opacity: 1,
        width: selected.offsetWidth,
        height: selected.offsetHeight,
        transform: `translate(${selected.offsetLeft}px, ${selected.offsetTop}px)`,
      } : { ...previous, opacity: 0 });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(group);
    group.querySelectorAll('button').forEach(button => observer?.observe(button));
    return () => observer?.disconnect();
  }, [selection]);
  return { ref, style };
}
