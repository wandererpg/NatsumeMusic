import { useState } from 'react';
import {
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
} from 'lucide-react';

import type { PlayMode, Track } from '../../../../shared/types';
import { formatDuration } from '../library/TrackRow';

export interface PlayerBarState {
  currentTrack: Track | null;
  isPlaying: boolean;
  volume: number;
  progress: number;
  duration: number | null;
  currentTime: number;
  playMode: PlayMode;
}

export interface PlayerBarProps {
  playerState?: Partial<PlayerBarState>;
  currentTrack?: Track | null;
  isPlaying?: boolean;
  volume?: number;
  progress?: number;
  duration?: number | null;
  currentTime?: number;
  playMode?: PlayMode;
  onPlay?: () => void;
  onTogglePlay?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onSeek?: (progress: number) => void;
  onVolumeChange?: (volume: number) => void;
  onPlayModeChange?: (mode: PlayMode) => void;
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || 'GM';
}

const modes: PlayMode[] = ['sequential', 'random', 'single-loop', 'list-loop'];

function modeLabel(mode: PlayMode): string {
  if (mode === 'random') return '随机播放';
  if (mode === 'single-loop') return '单曲循环';
  if (mode === 'list-loop') return '列表循环';
  return '顺序播放';
}

function modeIcon(mode: PlayMode) {
  if (mode === 'random') return Shuffle;
  if (mode === 'single-loop') return Repeat1;
  return Repeat;
}

export function PlayerBar({
  playerState,
  currentTrack: currentTrackProp,
  isPlaying: isPlayingProp = false,
  volume: volumeProp = 0.8,
  progress: progressProp = 0,
  duration: durationProp = null,
  currentTime: currentTimeProp = 0,
  playMode: playModeProp = 'list-loop',
  onPlay,
  onTogglePlay,
  onPrevious,
  onNext,
  onSeek,
  onVolumeChange,
  onPlayModeChange,
}: PlayerBarProps) {
  const currentTrack = playerState?.currentTrack ?? currentTrackProp ?? null;
  const isPlaying = playerState?.isPlaying ?? isPlayingProp;
  const volume = playerState?.volume ?? volumeProp;
  const progress = playerState?.progress ?? progressProp;
  const duration = playerState?.duration ?? durationProp;
  const currentTime = playerState?.currentTime ?? currentTimeProp;
  const playMode = playerState?.playMode ?? playModeProp;
  const ModeIcon = modeIcon(playMode);
  const progressPercent = Number.isFinite(progress)
    ? Math.min(100, Math.max(0, progress <= 1 ? progress * 100 : progress))
    : 0;
  const [isSeeking, setIsSeeking] = useState(false);

  const toggle = onTogglePlay ?? onPlay;
  const nextMode = () => {
    const index = modes.indexOf(playMode);
    onPlayModeChange?.(modes[(index + 1) % modes.length]);
  };
  const seekWithKeyboard = (event: React.KeyboardEvent<HTMLInputElement>) => {
    let next: number | null = null;
    const fiveSeconds = duration && duration > 0 ? (5 / duration) * 100 : 5;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = progressPercent + fiveSeconds;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = progressPercent - fiveSeconds;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = 100;
    if (next === null) return;
    event.preventDefault();
    onSeek?.(Math.min(100, Math.max(0, next)));
  };

  return (
    <footer className="player-bar" data-testid="player-bar">
      <div className="player-bar__track">
        <div className="player-bar__art" aria-hidden="true">
          {currentTrack ? (
            <><span className="player-bar__art-orb" /><span className="player-bar__art-initials">{initials(currentTrack.displayName)}</span></>
          ) : <span className="player-bar__art-empty">♫</span>}
        </div>
        <div className="player-bar__track-copy">
          <span className="player-bar__eyebrow">{currentTrack ? 'NOW PLAYING' : 'READY WHEN YOU ARE'}</span>
          <span className="player-bar__title" title={currentTrack?.displayName ?? undefined}>{currentTrack?.displayName ?? '尚未播放曲目'}</span>
          {currentTrack?.gameName && <span className="player-bar__work" title={currentTrack.gameName}>{currentTrack.gameName}</span>}
          <span className="player-bar__meta">
            {currentTrack ? (
              <>{currentTrack.format.toUpperCase()} · {formatDuration(currentTrack.duration)}</>
            ) : '从列表中选择一首曲目'}
          </span>
        </div>
      </div>

      <div className="player-bar__center">
        <div className="player-bar__controls">
          <button className="icon-button" type="button" aria-label="上一首" title="上一首" onClick={onPrevious}>
            <SkipBack size={17} fill="currentColor" aria-hidden="true" />
          </button>
          <button className="player-bar__play" type="button" aria-label={isPlaying ? '暂停' : '播放'} title={isPlaying ? '暂停' : '播放'} onClick={toggle}>
            {isPlaying ? <Pause size={18} fill="currentColor" aria-hidden="true" /> : <Play size={18} fill="currentColor" aria-hidden="true" />}
          </button>
          <button className="icon-button" type="button" aria-label="下一首" title="下一首" onClick={onNext}>
            <SkipForward size={17} fill="currentColor" aria-hidden="true" />
          </button>
        </div>
        <div className="player-bar__progress">
          <span className="player-bar__time">{formatDuration(currentTime)}</span>
          <div className={`player-bar__progress-track${isSeeking ? ' is-seeking' : ''}`}>
            <div
              className={`player-bar__progress-fill${isPlaying ? ' is-playing' : ''}`}
              data-testid="player-progress-fill"
              style={{ width: `${progressPercent}%` }}
              aria-hidden="true"
            />
            <input
              className="progress-range"
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={progressPercent}
              onPointerDown={() => setIsSeeking(true)}
              onPointerUp={() => setIsSeeking(false)}
              onBlur={() => setIsSeeking(false)}
              onChange={(event) => onSeek?.(Number(event.target.value))}
              onKeyDown={seekWithKeyboard}
              aria-label="播放进度"
              aria-valuetext={`${formatDuration(currentTime)} / ${formatDuration(duration)}`}
            />
          </div>
          <span className="player-bar__time">{formatDuration(duration)}</span>
        </div>
      </div>

      <div className="player-bar__utilities">
        <button className={`icon-button player-bar__mode${playMode !== 'sequential' ? ' is-active' : ''}`} type="button" aria-label={modeLabel(playMode)} title={modeLabel(playMode)} onClick={nextMode}>
          <ModeIcon size={16} strokeWidth={1.9} aria-hidden="true" />
        </button>
        <label className="volume-control">
          <Volume2 size={16} strokeWidth={1.8} aria-hidden="true" />
          <span className="sr-only">音量</span>
          <input
            className="volume-range"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={Math.max(0, Math.min(1, volume))}
            onChange={(event) => onVolumeChange?.(Number(event.target.value))}
            aria-label="音量"
          />
        </label>
      </div>
    </footer>
  );
}
