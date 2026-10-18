import { ArrowUpRight, Disc3 } from 'lucide-react';

import type { Game } from '../../../../shared/types';
import { toCoverUrl } from '../../../../shared/cover-url';

interface GameShelfProps {
  games: Game[];
  onSelectGame: (game: Game) => void;
}

export function GameShelf({ games, onSelectGame }: GameShelfProps) {
  return (
    <section className="game-shelf" aria-labelledby="game-shelf-title">
      <div className="game-shelf__heading"><h2 id="game-shelf-title">作品收藏</h2><span>{games.length} 部作品</span></div>
      <div className="game-shelf__list" tabIndex={0} aria-label="作品封面列表，可横向滚动">
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
