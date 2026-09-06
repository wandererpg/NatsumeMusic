import { Heart, HeartOff, ListPlus, MoveRight, Trash2, X } from 'lucide-react';

export interface BulkTrackToolbarProps {
  count: number;
  busy: boolean;
  onFavorite: () => void;
  onUnfavorite: () => void;
  onMove: () => void;
  onAddToPlaylist: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkTrackToolbar({
  count, busy, onFavorite, onUnfavorite, onMove, onAddToPlaylist, onDelete, onClear,
}: BulkTrackToolbarProps) {
  return (
    <div className="bulk-track-toolbar" role="toolbar" aria-label="批量曲目操作">
      <strong>已选择 {count} 首</strong>
      <span className="bulk-track-toolbar__divider" aria-hidden="true" />
      <button type="button" disabled={busy} aria-label="收藏所选曲目" onClick={onFavorite}><Heart size={15} aria-hidden="true" />收藏</button>
      <button type="button" disabled={busy} aria-label="取消收藏所选曲目" onClick={onUnfavorite}><HeartOff size={15} aria-hidden="true" />取消收藏</button>
      <button type="button" disabled={busy} aria-label="移动所选曲目" onClick={onMove}><MoveRight size={15} aria-hidden="true" />移动到…</button>
      <button type="button" disabled={busy} aria-label="加入播放列表" onClick={onAddToPlaylist}><ListPlus size={15} aria-hidden="true" />加入播放列表…</button>
      <button type="button" disabled={busy} aria-label="删除所选曲目" className="is-danger" onClick={onDelete}><Trash2 size={15} aria-hidden="true" />删除…</button>
      <button type="button" disabled={busy} aria-label="取消选择" className="bulk-track-toolbar__clear" onClick={onClear}><X size={15} aria-hidden="true" />取消选择</button>
    </div>
  );
}
