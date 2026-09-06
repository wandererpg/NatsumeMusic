import type { Game, Playlist } from '../../../../shared/types';

export interface BulkTargetPickerProps {
  mode: 'game' | 'playlist';
  games: Game[];
  playlists: Playlist[];
  sourceGameId: string;
  busy: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function BulkTargetPicker({ mode, games, playlists, sourceGameId, busy, onSelect, onClose }: BulkTargetPickerProps) {
  const title = mode === 'game' ? '移动到其他音乐文件夹' : '加入播放列表';
  const targets = mode === 'game'
    ? games.filter((game) => game.id !== sourceGameId).map((game) => ({ id: game.id, label: game.name, count: game.trackCount }))
    : playlists.map((playlist) => ({ id: playlist.id, label: playlist.name, count: playlist.trackCount ?? playlist.trackIds.length }));

  return (
    <div className="modal-backdrop bulk-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="bulk-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="bulk-dialog__heading"><div><p className="eyebrow">批量操作</p><h2>{title}</h2></div><button type="button" aria-label="关闭" disabled={busy} onClick={onClose}>×</button></div>
        <div className="bulk-target-list">
          {targets.length === 0 ? <p className="bulk-dialog__empty">没有可选择的目标</p> : targets.map((target) => (
            <button type="button" key={target.id} aria-label={target.label} disabled={busy} onClick={() => onSelect(target.id)}>
              <span>{target.label}</span><small>{target.count} 首</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
