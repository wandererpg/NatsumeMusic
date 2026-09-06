import { Disc3, FolderOpen, MoreHorizontal } from 'lucide-react';

import type { Game } from '../../../../shared/types';
import { toCoverUrl } from '../../../../shared/cover-url';

export interface GameListProps {
  games: Game[];
  selectedGameId?: string | null;
  onSelectGame?: (game: Game) => void;
  onGameSelect?: (game: Game) => void;
  onSelect?: (game: Game) => void;
  onEditGame?: (game: Game) => void;
  emptyLabel?: string;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || 'GM';
}

function coverUrl(filePath: string): string {
  if (/^(?:https?:|file:|data:|galmusic-cover:)/i.test(filePath)) {
    return filePath;
  }
  return toCoverUrl(filePath);
}

export function GameList({
  games,
  selectedGameId = null,
  onSelectGame,
  onGameSelect,
  onSelect,
  onEditGame,
  emptyLabel = '还没有导入游戏',
}: GameListProps) {
  const selectGame = onSelectGame ?? onGameSelect ?? onSelect;

  if (games.length === 0) {
    return (
      <div className="game-list game-list--empty" data-testid="game-list">
        <FolderOpen size={18} strokeWidth={1.7} aria-hidden="true" />
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="game-list" data-testid="game-list">
      {games.map((game) => (
        <div className="game-list__item-shell" key={game.id}>
          <button
            className={`game-list__item${game.id === selectedGameId ? ' is-selected' : ''}`}
            type="button"
            data-testid={`game-item-${game.id}`}
            aria-current={game.id === selectedGameId ? 'page' : undefined}
            onClick={() => selectGame?.(game)}
          >
            <span className="game-list__cover" aria-hidden="true">
              {game.coverPath ? (
                <img src={coverUrl(game.coverPath)} alt="" />
              ) : (
                <>
                  <span className="game-list__cover-orb" />
                  <span className="game-list__initials">{initials(game.name)}</span>
                </>
              )}
            </span>
            <span className="game-list__details">
              <span className="game-list__name" title={game.name}>{game.name}</span>
              <span className="game-list__meta">
                <Disc3 size={11} aria-hidden="true" />
                {game.trackCount} 首曲目
              </span>
            </span>
          </button>
          {onEditGame && (
            <button
              className="icon-button icon-button--small game-list__edit"
              type="button"
              data-testid={`edit-game-${game.id}`}
              aria-label={`编辑 ${game.name}`}
              title="编辑游戏文件夹"
              onClick={() => onEditGame(game)}
            >
              <MoreHorizontal size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
