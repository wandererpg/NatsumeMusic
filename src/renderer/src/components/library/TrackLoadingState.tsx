import { useEffect, useState } from 'react';

/** Keep fast reads free of spinner flashes; never delay displaying results. */
export function TrackLoadingState() {
  const [showFeedback, setShowFeedback] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowFeedback(true), 140);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="loading-state loading-state--tracks" role="status" aria-label="正在读取曲目" aria-live="polite" aria-busy="true">
      {showFeedback && <span className="loading-state__feedback">
        <span className="loading-state__spinner" aria-hidden="true" />正在读取曲目…
      </span>}
    </section>
  );
}
