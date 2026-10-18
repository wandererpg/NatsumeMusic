import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Disc3 } from 'lucide-react';

import type { Game } from '../../../../shared/types';
import { toCoverUrl } from '../../../../shared/cover-url';

interface GameShelfProps {
  games: Game[];
  onSelectGame: (game: Game) => void;
}

export function GameShelf({ games, onSelectGame }: GameShelfProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [canScroll, setCanScroll] = useState({ previous: false, next: false });

  const updateScroll = () => {
    const list = listRef.current;
    if (!list) return;
    const previous = list.scrollLeft > 2;
    const next = list.scrollWidth - list.clientWidth - list.scrollLeft > 2;
    setCanScroll(current => current.previous === previous && current.next === next ? current : { previous, next });
  };

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    updateScroll();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateScroll);
    observer.observe(list);
    return () => observer.disconnect();
  }, [games]);

  const browse = (direction: number) => {
    const list = listRef.current;
    if (!list) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    list.scrollBy({ left: direction * Math.max(180, list.clientWidth * 0.8), behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  return (
    <section className="game-shelf" aria-labelledby="game-shelf-title">
      <div className="game-shelf__heading">
        <div className="game-shelf__title"><h2 id="game-shelf-title">作品收藏</h2><span>{games.length} 部作品</span></div>
        <div className="game-shelf__controls" role="group" aria-label="浏览作品收藏">
          <button className="icon-button" type="button" aria-label="向前浏览作品" aria-controls={listId} disabled={!canScroll.previous} onClick={() => browse(-1)}><ArrowLeft size={16} aria-hidden="true" /></button>
          <button className="icon-button" type="button" aria-label="向后浏览作品" aria-controls={listId} disabled={!canScroll.next} onClick={() => browse(1)}><ArrowRight size={16} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="game-shelf__list" id={listId} ref={listRef} onScroll={updateScroll} tabIndex={0} aria-label="作品封面列表，可横向滚动">
        {games.map((game) => (
          <button className="album-card" key={game.id} type="button" onClick={() => onSelectGame(game)} aria-label={`浏览 ${game.name} 的曲目`}>
            <span className="album-card__art">
              {game.coverPath ? <img src={toCoverUrl(game.coverPath)} alt="" loading="lazy" /> : (
                <span className="album-card__placeholder"><Disc3 size={54} strokeWidth={1} aria-hidden="true" /><span>{game.name.slice(0, 2)}</span></span>
              )}
              <span className="album-card__open" aria-hidden="true"><ArrowUpRight size={18} /></span>
            </span>
            <span className="album-card__name" title={game.name}>{game.name}</span>
            <span className="album-card__meta">{game.trackCount} 首曲目</span>
          </button>
        ))}
      </div>
    </section>
  );
}
