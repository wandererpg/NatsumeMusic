import { ListMusic, X } from 'lucide-react';

import type { Playlist, Track } from '../../../../shared/types';

export interface PlaylistPickerProps {
  track: Track;
  playlists: Playlist[];
  onClose: () => void;
  onSelect: (playlist: Playlist) => Promise<void>;
}

export function PlaylistPicker({ track, playlists, onClose, onSelect }: PlaylistPickerProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-panel playlist-picker" role="dialog" aria-modal="true" aria-labelledby="playlist-picker-title" data-testid="playlist-picker">
        <header className="settings-panel__header">
          <div><p className="eyebrow">ADD TO PLAYLIST</p><h2 id="playlist-picker-title">选择播放列表</h2><small>{track.displayName}</small></div>
          <button className="icon-button" type="button" aria-label="关闭" onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="settings-panel__body">
          {playlists.length === 0 ? (
            <p className="playlist-picker__empty">还没有播放列表，请先在侧边栏创建一个。</p>
          ) : (
            <div className="playlist-picker__list">
              {playlists.map((playlist) => (
                <button className="playlist-picker__item" type="button" key={playlist.id} onClick={() => void onSelect(playlist)}>
                  <ListMusic size={17} aria-hidden="true" />
                  <span>{playlist.name}</span>
                  <small>{playlist.trackCount ?? playlist.trackIds.length} 首</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <footer className="settings-panel__footer">
          <button className="button button--ghost" type="button" onClick={onClose}>取消</button>
        </footer>
      </section>
    </div>
  );
}
