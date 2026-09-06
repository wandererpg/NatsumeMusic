import { ExternalLink, Heart, ListPlus, Pause, Pencil, Play, Trash2, X } from 'lucide-react';

import type { Track } from '../../../../shared/types';

export interface TrackRowProps {
  track: Track;
  index?: number;
  isPlaying?: boolean;
  onPlayTrack?: (track: Track) => void;
  playTrack?: (track: Track) => void;
  onPlay?: (track: Track) => void;
  onRename?: (track: Track) => void;
  onDelete?: (track: Track) => void;
  onOpenFolder?: (track: Track) => void;
  onToggleFavorite?: (track: Track) => void;
  onAddToPlaylist?: (track: Track) => void;
  onRemoveFromPlaylist?: (track: Track) => void;
  selectionEnabled?: boolean;
  isSelected?: boolean;
  onSelect?: (event: React.MouseEvent<HTMLInputElement>) => void;
  selectionDisabled?: boolean;
}

export function formatDuration(duration: number | null | undefined): string {
  if (duration === null || duration === undefined || !Number.isFinite(duration)) {
    return '—';
  }
  const totalSeconds = Math.max(0, Math.round(duration));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function TrackRow({
  track,
  index = track.trackNumber,
  isPlaying = false,
  onPlayTrack,
  playTrack,
  onPlay,
  onRename,
  onDelete,
  onOpenFolder,
  onToggleFavorite,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  selectionEnabled = false,
  isSelected = false,
  onSelect,
  selectionDisabled = false,
}: TrackRowProps) {
  const play = onPlayTrack ?? playTrack ?? onPlay;
  const handlePlay = () => play?.(track);

  return (
    <tr
      className={`track-row${isPlaying ? ' is-playing' : ''}${isSelected ? ' is-selected' : ''}`}
      data-testid={`track-row-${track.id}`}
      tabIndex={0}
      onDoubleClick={handlePlay}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handlePlay();
        }
      }}
    >
      {selectionEnabled && (
        <td className="track-row__selection">
          <input
            className="track-selection-checkbox"
            type="checkbox"
            aria-label={`选择 ${track.displayName}`}
            checked={isSelected}
            disabled={selectionDisabled}
            readOnly
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.(event);
            }}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          />
        </td>
      )}
      <td className="track-row__index">
        <span className="track-row__number">{String(index).padStart(2, '0')}</span>
        <button
          className="track-row__play icon-button icon-button--small"
          type="button"
          aria-label={`${isPlaying ? '暂停' : '播放'} ${track.displayName}`}
          onClick={(event) => {
            event.stopPropagation();
            handlePlay();
          }}
        >
          {isPlaying ? <Pause size={14} fill="currentColor" aria-hidden="true" /> : <Play size={14} fill="currentColor" aria-hidden="true" />}
        </button>
      </td>
      <td className="track-row__title-cell">
        <div className="track-row__title" title={track.displayName}>{track.displayName}</div>
        <div className="track-row__filename" title={track.fileName}>
          {track.gameName && <span className="track-row__work">{track.gameName}</span>}
          <span>{track.fileName}</span>
        </div>
      </td>
      <td className="track-row__format"><span className="format-pill">{track.format.toUpperCase()}</span></td>
      <td className="track-row__duration" data-testid={`track-duration-${track.id}`}>{formatDuration(track.duration)}</td>
      <td className="track-row__size">{formatBytes(track.fileSize)}</td>
      <td className="track-row__actions">
        {onToggleFavorite && (
          <button
            className={`icon-button icon-button--small row-action${track.isFavorite ? ' is-favorite' : ''}`}
            type="button"
            data-testid={`favorite-track-${track.id}`}
            aria-label={track.isFavorite ? `取消收藏 ${track.displayName}` : `收藏 ${track.displayName}`}
            title={track.isFavorite ? '取消收藏' : '收藏'}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite(track);
            }}
          >
            <Heart size={14} fill={track.isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        )}
        {onAddToPlaylist && (
          <button className="icon-button icon-button--small row-action" type="button" data-testid={`playlist-track-${track.id}`} aria-label={`添加 ${track.displayName} 到播放列表`} title="添加到播放列表" onClick={(event) => { event.stopPropagation(); onAddToPlaylist(track); }}>
            <ListPlus size={14} aria-hidden="true" />
          </button>
        )}
        {onRemoveFromPlaylist && (
          <button className="icon-button icon-button--small row-action" type="button" aria-label={`从播放列表移除 ${track.displayName}`} title="从播放列表移除" onClick={(event) => { event.stopPropagation(); onRemoveFromPlaylist(track); }}>
            <X size={14} aria-hidden="true" />
          </button>
        )}
        <button
          className="icon-button icon-button--small row-action"
          type="button"
          aria-label={`打开 ${track.displayName} 所在文件夹`}
          title="打开所在文件夹"
          onClick={(event) => {
            event.stopPropagation();
            onOpenFolder?.(track);
          }}
        >
          <ExternalLink size={14} aria-hidden="true" />
        </button>
        <button
          className="icon-button icon-button--small row-action"
          type="button"
          aria-label={`编辑 ${track.displayName}`}
          data-testid={`rename-track-${track.id}`}
          title="修改歌曲名称"
          onClick={(event) => {
            event.stopPropagation();
            onRename?.(track);
          }}
        >
          <Pencil size={14} aria-hidden="true" />
        </button>
        {onDelete && (
          <button
            className="icon-button icon-button--small row-action row-action--danger"
            type="button"
            aria-label={`从库中删除 ${track.displayName}`}
            title="从库中删除"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(track);
            }}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
      </td>
    </tr>
  );
}
