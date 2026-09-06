import {
  Clock3,
  FolderPlus,
  Heart,
  Library,
  ListMusic,
  Plus,
} from 'lucide-react';

import type { Game, LibrarySection, Playlist } from '../../../../shared/types';
import { GameList } from '../library/GameList';

export type SidebarSection = LibrarySection;

export interface SidebarProps {
  games: Game[];
  playlists?: Playlist[];
  selectedGameId?: string | null;
  selectedPlaylistId?: string | null;
  activeSection?: SidebarSection;
  onSelectGame?: (game: Game) => void;
  onEditGame?: (game: Game) => void;
  onSelectPlaylist?: (playlist: Playlist) => void;
  onCreatePlaylist?: () => void;
  onSelectSection?: (section: SidebarSection) => void;
  onImport?: () => void;
}

const sections: Array<{ id: SidebarSection; label: string; Icon: typeof Library }> = [
  { id: 'library', label: '全部音乐', Icon: Library },
  { id: 'recent', label: '最近添加', Icon: Clock3 },
  { id: 'favorites', label: '收藏', Icon: Heart },
  { id: 'playlists', label: '播放列表', Icon: ListMusic },
];

export function Sidebar({
  games,
  playlists = [],
  selectedGameId = null,
  selectedPlaylistId = null,
  activeSection = 'library',
  onSelectGame,
  onEditGame,
  onSelectPlaylist,
  onCreatePlaylist,
  onSelectSection,
  onImport,
}: SidebarProps) {
  return (
    <aside className="sidebar" data-testid="sidebar">
      <div className="sidebar__scroll">
        <nav className="sidebar__nav" aria-label="音乐库导航">
          {sections.map(({ id, label, Icon }) => (
            <button
              className={`sidebar__nav-item${activeSection === id ? ' is-active' : ''}`}
              type="button"
              key={id}
              data-testid={`sidebar-nav-${id}`}
              aria-current={activeSection === id ? 'page' : undefined}
              onClick={() => onSelectSection?.(id)}
            >
              <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
              {id === 'library' && games.length > 0 && <span className="sidebar__count">{games.length}</span>}
              {id === 'playlists' && playlists.length > 0 && <span className="sidebar__count">{playlists.length}</span>}
            </button>
          ))}
        </nav>

        {activeSection === 'playlists' ? (
          <div className="sidebar__collection-panel">
            <div className="sidebar__section-heading">
              <span>我的播放列表</span>
              <span className="sidebar__section-rule" aria-hidden="true" />
              <button className="icon-button icon-button--small" type="button" aria-label="新建播放列表" title="新建播放列表" onClick={onCreatePlaylist}>
                <Plus size={14} aria-hidden="true" />
              </button>
            </div>
            {playlists.length === 0 ? (
              <p className="sidebar__collection-empty">点击加号创建播放列表</p>
            ) : (
              <div className="playlist-list" data-testid="playlist-list">
                {playlists.map((playlist) => (
                  <button
                    className={`playlist-list__item${playlist.id === selectedPlaylistId ? ' is-selected' : ''}`}
                    type="button"
                    key={playlist.id}
                    data-testid={`playlist-item-${playlist.id}`}
                    onClick={() => onSelectPlaylist?.(playlist)}
                  >
                    <ListMusic size={15} aria-hidden="true" />
                    <span>{playlist.name}</span>
                    <small>{playlist.trackCount ?? playlist.trackIds.length}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="sidebar__section-heading">
              <span>我的游戏</span>
              <span className="sidebar__section-rule" aria-hidden="true" />
              <span className="sidebar__game-count">{games.length.toString().padStart(2, '0')}</span>
            </div>
            <GameList games={games} selectedGameId={selectedGameId} onSelectGame={onSelectGame} onEditGame={onEditGame} />
          </>
        )}
      </div>

      <div className="sidebar__footer">
        <button className="import-button" type="button" aria-label="从文件夹导入" onClick={onImport}>
          <span className="import-button__icon"><FolderPlus size={16} strokeWidth={1.8} aria-hidden="true" /></span>
          <span>导入游戏音乐</span>
          <Plus className="import-button__plus" size={15} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
