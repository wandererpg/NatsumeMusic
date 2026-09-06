import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ChevronRight, Disc3, FolderOpen, Import, LibraryBig } from 'lucide-react';

import type { AppSettings, BulkTrackOperation, Game, GameMetadataSummary, GameUpdate, LibrarySection, PlayMode, Playlist, ScanResult, Track, TrackKind } from '../../shared/types';
import { toCoverUrl } from '../../shared/cover-url';
import { TrackTable } from './components/library/TrackTable';
import { GameEditor } from './components/library/GameEditor';
import { PlaylistEditor } from './components/library/PlaylistEditor';
import { PlaylistPicker } from './components/library/PlaylistPicker';
import { TrackEditor } from './components/library/TrackEditor';
import { BulkDeleteDialog } from './components/library/BulkDeleteDialog';
import { BulkTargetPicker } from './components/library/BulkTargetPicker';
import { BulkTrackToolbar } from './components/library/BulkTrackToolbar';
import { PlayerBar, type PlayerBarProps, type PlayerBarState } from './components/layout/PlayerBar';
import { Sidebar } from './components/layout/Sidebar';
import { TitleBar } from './components/layout/TitleBar';
import { ScanDialog } from './components/scanner/ScanDialog';
import { SettingsPanel, type AppearanceDraft, type SettingsChanges } from './components/settings/SettingsPanel';
import { Welcome } from './components/settings/Welcome';
import { EmptyState } from './components/ui/EmptyState';
import { useLibraryStore } from './stores/libraryStore';
import { usePlayerStore } from './stores/playerStore';
import { useUiStore } from './stores/uiStore';
import { toAppearanceStyle } from './theme/appearance';

export interface AppProps {
  onPlayTrack?: (track: Track) => void;
  playTrack?: (track: Track) => void;
  playerState?: Partial<PlayerBarState>;
  playerActions?: Pick<PlayerBarProps, 'onPrevious' | 'onNext' | 'onSeek' | 'onVolumeChange' | 'onPlayModeChange' | 'onTogglePlay'>;
  onImport?: () => void;
}

function gameInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : name.slice(0, 2)).toUpperCase() || 'GM';
}

function getGalMusicApi() {
  if (typeof window === 'undefined') return undefined;
  return window.galMusic;
}

const defaultSettings: AppSettings = {
  libraryPath: '%USERPROFILE%\\Music\\NatsumeMusic',
  volume: 0.8,
  playMode: 'list-loop',
  lastTrackId: null,
  voiceThresholdSeconds: 25,
  themeId: 'rain-afterglow',
  fontColor: null,
  background: { imagePath: null, blur: 12, dim: 0.42, scale: 100, positionX: 50, positionY: 50 },
};

function withAppearanceDefaults(settings: Partial<AppSettings> | undefined): AppSettings {
  return {
    ...defaultSettings,
    ...settings,
    fontColor: settings?.fontColor ?? defaultSettings.fontColor,
    background: { ...defaultSettings.background, ...settings?.background },
  };
}

const sectionCopy: Record<LibrarySection, { label: string; title: string; description: string }> = {
  library: { label: '全部音乐', title: '全部音乐', description: '所有游戏中的曲目' },
  recent: { label: '最近添加', title: '最近添加', description: '按导入时间排列' },
  favorites: { label: '收藏', title: '我的收藏', description: '你标记过的曲目' },
  playlists: { label: '播放列表', title: '播放列表', description: '按自己的顺序播放' },
};

interface BulkResultNotice {
  succeededCount: number;
  failures: Array<{ trackId: string; trackLabel: string; userMessage: string }>;
  warning?: string;
}

export default function App({ onPlayTrack, playTrack: playTrackProp, playerState, playerActions, onImport }: AppProps) {
  const games = useLibraryStore((state) => state.games);
  const tracks = useLibraryStore((state) => state.tracks);
  const playlists = useLibraryStore((state) => state.playlists);
  const isLoadingGames = useLibraryStore((state) => state.isLoadingGames);
  const isLoadingTracks = useLibraryStore((state) => state.isLoadingTracks);
  const error = useLibraryStore((state) => state.error);
  const loadGames = useLibraryStore((state) => state.loadGames);
  const loadTracks = useLibraryStore((state) => state.loadTracks);
  const loadPlaylists = useLibraryStore((state) => state.loadPlaylists);
  const createPlaylist = useLibraryStore((state) => state.createPlaylist);
  const addTrackToPlaylist = useLibraryStore((state) => state.addTrackToPlaylist);
  const removeTrackFromPlaylist = useLibraryStore((state) => state.removeTrackFromPlaylist);
  const renameTrack = useLibraryStore((state) => state.renameTrack);
  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
  const deleteTrack = useLibraryStore((state) => state.deleteTrack);
  const updateGame = useLibraryStore((state) => state.updateGame);
  const deleteGame = useLibraryStore((state) => state.deleteGame);
  const bulkUpdateTracks = useLibraryStore((state) => state.bulkUpdateTracks);

  const selectedGameId = useUiStore((state) => state.selectedGameId);
  const selectedPlaylistId = useUiStore((state) => state.selectedPlaylistId);
  const activeSection = useUiStore((state) => state.activeSection);
  const searchText = useUiStore((state) => state.searchText);
  const setSelectedGame = useUiStore((state) => state.setSelectedGame);
  const setSelectedPlaylist = useUiStore((state) => state.setSelectedPlaylist);
  const setActiveSection = useUiStore((state) => state.setActiveSection);
  const setSearchText = useUiStore((state) => state.setSearchText);
  const setScanDialogOpen = useUiStore((state) => state.setScanDialogOpen);
  const setCurrentModal = useUiStore((state) => state.setCurrentModal);
  const scanDialogOpen = useUiStore((state) => state.scanDialogOpen);
  const currentModal = useUiStore((state) => state.currentModal);

  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [appearancePreview, setAppearancePreview] = useState<AppearanceDraft | null>(null);
  const authorizedBackgroundRef = useRef<string | null>(defaultSettings.background.imagePath);
  const mainContentRef = useRef<HTMLElement>(null);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [editingGameMetadata, setEditingGameMetadata] = useState<GameMetadataSummary | null>(null);
  const metadataRequestRef = useRef(0);
  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const welcomeDismissedRef = useRef(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [trackKindFilter, setTrackKindFilter] = useState<TrackKind | null>(null);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [bulkDialog, setBulkDialog] = useState<'move' | 'playlist' | 'delete' | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResultNotice, setBulkResultNotice] = useState<BulkResultNotice | null>(null);
  const bulkContextKey = `${activeSection}\u0000${selectedGameId ?? ''}\u0000${searchText}\u0000${trackKindFilter ?? ''}`;
  const bulkContextKeyRef = useRef(bulkContextKey);
  const bulkContextGenerationRef = useRef(0);
  if (bulkContextKeyRef.current !== bulkContextKey) {
    bulkContextKeyRef.current = bulkContextKey;
    bulkContextGenerationRef.current += 1;
  }

  const playerCurrentTrack = usePlayerStore((state) => state.currentTrack);
  const playerIsPlaying = usePlayerStore((state) => state.isPlaying);
  const playerVolume = usePlayerStore((state) => state.volume);
  const playerProgress = usePlayerStore((state) => state.progress);
  const playerDuration = usePlayerStore((state) => state.duration);
  const playerCurrentTime = usePlayerStore((state) => state.currentTime);
  const playerPlayMode = usePlayerStore((state) => state.playMode);
  const initializePlayer = usePlayerStore((state) => state.initialize);
  const storePlayTrack = usePlayerStore((state) => state.playTrack);
  const storeToggle = usePlayerStore((state) => state.toggle);
  const storePrevious = usePlayerStore((state) => state.previous);
  const storeNext = usePlayerStore((state) => state.next);
  const storeSeek = usePlayerStore((state) => state.seek);
  const storeSetVolume = usePlayerStore((state) => state.setVolume);
  const storeSetPlayMode = usePlayerStore((state) => state.setPlayMode);
  const reconcileLibraryTracks = usePlayerStore((state) => state.reconcileLibraryTracks);

  useEffect(() => {
    let active = true;
    const loadInitialState = async () => {
      const api = getGalMusicApi();
      let loadedSettings = defaultSettings;
      try {
        loadedSettings = withAppearanceDefaults(await api?.getSettings?.());
      } catch {
        // Renderer-only previews can run without the Electron bridge.
      }
      if (!active) return;
      setSettings(loadedSettings);
      authorizedBackgroundRef.current = loadedSettings.background.imagePath;
      const loadedGames = await loadGames();
      await loadPlaylists();
      if (active && !welcomeDismissedRef.current && loadedGames.length === 0) {
        setWelcomeVisible(true);
      }
    };
    void loadInitialState();
    return () => { active = false; };
  }, [loadGames, loadPlaylists]);

  useEffect(() => {
    void initializePlayer().catch(() => undefined);
  }, [initializePlayer]);

  useEffect(() => {
    if (selectedGameId && !games.some((game) => game.id === selectedGameId)) {
      setSelectedGame(null);
    }
  }, [games, selectedGameId, setSelectedGame]);

  useEffect(() => {
    setTrackKindFilter(null);
  }, [selectedGameId]);

  useEffect(() => {
    setSelectedTrackIds(new Set());
    setBulkDialog(null);
    setBulkResultNotice(null);
  }, [selectedGameId, searchText, trackKindFilter, activeSection]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTracks({
        section: activeSection,
        gameId: activeSection === 'library' ? selectedGameId : null,
        playlistId: activeSection === 'playlists' ? selectedPlaylistId : null,
        search: searchText,
        kind: activeSection === 'library' && selectedGameId ? trackKindFilter : null,
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [activeSection, loadTracks, searchText, selectedGameId, selectedPlaylistId, trackKindFilter]);

  const selectedGame = useMemo<Game | null>(
    () => games.find((game) => game.id === selectedGameId) ?? null,
    [games, selectedGameId],
  );
  const selectedPlaylist = useMemo<Playlist | null>(
    () => playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null,
    [playlists, selectedPlaylistId],
  );
  const copy = sectionCopy[activeSection];
  const selectionEnabled = activeSection === 'library' && Boolean(selectedGameId);

  const runBulk = async (operation: BulkTrackOperation) => {
    if (bulkBusy || !selectedGameId || selectedTrackIds.size === 0) return;
    const trackIds = tracks.filter((track) => selectedTrackIds.has(track.id)).map((track) => track.id);
    if (trackIds.length === 0) return;
    const trackLabels = new Map(tracks.map((track) => [track.id, track.displayName]));
    const requestContextGeneration = bulkContextGenerationRef.current;
    setBulkBusy(true);
    setBulkResultNotice(null);
    try {
      const result = await bulkUpdateTracks({ sourceGameId: selectedGameId, trackIds, operation });
      if (!result) return;
      let playbackWarning: string | undefined;
      if (result.succeededIds.length > 0) {
        let refreshedTracks = useLibraryStore.getState().tracks;
        let removedIds = operation.type === 'delete'
          ? new Set(result.succeededIds)
          : new Set<string>();
        if (operation.type === 'move') {
          try {
            const movedTracks = await getGalMusicApi()?.getTracks({
              section: 'library',
              gameId: operation.targetGameId,
              playlistId: null,
              search: '',
              kind: null,
            }) ?? [];
            refreshedTracks = [...refreshedTracks, ...movedTracks];
          } catch {
            // The move is already committed. Remove every successfully moved
            // id from the local queue so Howler cannot retain its old path.
            removedIds = new Set(result.succeededIds);
            playbackWarning = '移动已完成，但播放器刷新失败';
          }
        }
        reconcileLibraryTracks(refreshedTracks, removedIds);
      }
      if (bulkContextGenerationRef.current !== requestContextGeneration) return;
      setSelectedTrackIds(new Set(result.failures.map((failure) => failure.trackId)));
      setBulkDialog(null);
      setBulkResultNotice({
        succeededCount: result.succeededIds.length,
        warning: playbackWarning,
        failures: result.failures.map((failure) => ({
          ...failure,
          trackLabel: trackLabels.get(failure.trackId) ?? failure.trackId,
        })),
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const playTrack = (track: Track) => {
    const mediaRuntimeAvailable = typeof navigator === 'undefined' || !/jsdom/i.test(navigator.userAgent);
    if (mediaRuntimeAvailable) {
      try {
        storePlayTrack(track, tracks);
      } catch {
        // Keep renderer-only previews usable without a media runtime.
      }
    }
    (onPlayTrack ?? playTrackProp)?.(track);
  };

  const handleImport = () => {
    onImport?.();
    if (!onImport) setScanDialogOpen(true);
  };

  const selectSection = (section: LibrarySection) => {
    setActiveSection(section);
    setSearchText('');
    if (section !== 'library') setSelectedGame(null);
    if (section !== 'playlists') setSelectedPlaylist(null);
  };

  const selectGame = (game: Game) => {
    setActiveSection('library');
    setSelectedPlaylist(null);
    setSelectedGame(game.id);
    setSearchText('');
  };

  const selectPlaylist = (playlist: Playlist) => {
    setActiveSection('playlists');
    setSelectedGame(null);
    setSelectedPlaylist(playlist.id);
    setSearchText('');
  };

  const openGameEditor = async (game: Game) => {
    const requestId = ++metadataRequestRef.current;
    setEditingGame(game);
    setEditingGameMetadata(null);
    setCurrentModal('game-edit');
    try {
      const metadata = await getGalMusicApi()?.getGameMetadata?.(game.id);
      if (requestId === metadataRequestRef.current && metadata) {
        // Metadata enrichment may have downloaded a cover and updated the
        // authoritative game row. Refresh the editor input and library card
        // together so the new cover is visible without a manual reload.
        const refreshedGames = await loadGames();
        if (requestId === metadataRequestRef.current) {
          setEditingGame(refreshedGames.find((item) => item.id === game.id) ?? game);
          setEditingGameMetadata(metadata);
        }
      }
    } catch {
      // The editor remains usable when an older bridge or a temporary database
      // read failure cannot provide the optional metadata summary.
    }
  };

  const refreshEditingGameMetadata = async (): Promise<GameMetadataSummary | null> => {
    if (!editingGame) return null;
    const refreshed = await getGalMusicApi()?.refreshGameMetadata?.(editingGame.id);
    if (!refreshed) return null;
    setEditingGameMetadata(refreshed);
    await loadGames();
    return refreshed;
  };

  const saveSettings = async (changes: SettingsChanges) => {
    const api = getGalMusicApi();
    if (api?.saveSettings) await api.saveSettings(changes);
    else if (api) throw new Error('当前程序桥接版本不支持保存外观设置，请重启应用。');
    storeSetVolume(changes.volume);
    storeSetPlayMode(changes.playMode);
    setSettings((current) => ({ ...current, ...changes }));
    authorizedBackgroundRef.current = changes.background.imagePath;
    setAppearancePreview(null);
  };

  const previewAppearance = (appearance: AppearanceDraft) => {
    setAppearancePreview(appearance);
  };

  const selectBackgroundImage = async () => {
    const api = getGalMusicApi();
    const selected = await api?.selectImage?.() ?? null;
    if (selected) authorizedBackgroundRef.current = selected;
    return selected;
  };

  const saveWelcomePath = async (libraryPath: string) => {
    const api = getGalMusicApi();
    if (api?.setSetting) await api.setSetting('library_path', libraryPath);
    setSettings((current) => ({ ...current, libraryPath }));
    welcomeDismissedRef.current = true;
    setWelcomeVisible(false);
    await loadGames();
  };

  const selectLibraryFolder = async () => getGalMusicApi()?.selectFolder?.() ?? null;

  const handleWelcomeImport = async () => {
    if (!settings.libraryPath) await saveWelcomePath(defaultSettings.libraryPath);
    else {
      welcomeDismissedRef.current = true;
      setWelcomeVisible(false);
    }
    setScanDialogOpen(true);
  };

  const handleScanCompleted = async (_result: ScanResult) => {
    welcomeDismissedRef.current = true;
    setWelcomeVisible(false);
    await loadGames();
    await loadPlaylists();
  };

  const handleOpenFolder = async (track: Track) => {
    await getGalMusicApi()?.openExplorer(track.filePath);
  };

  const currentTrack = playerState?.currentTrack ?? playerCurrentTrack;
  const isPlaying = playerState?.isPlaying ?? playerIsPlaying;
  const volume = playerState?.volume ?? playerVolume;
  // PlayerEngine stores progress as a 0..1 ratio. PlayerBar owns the single
  // conversion to a display percentage so values below 1% are not multiplied
  // twice (0.004 must render as 0.4%, not 40%).
  const progress = playerState?.progress ?? playerProgress;
  const duration = playerState?.duration ?? playerDuration ?? currentTrack?.duration ?? null;
  const currentTime = playerState?.currentTime ?? playerCurrentTime;
  const playMode = playerState?.playMode ?? playerPlayMode;

  const handleSeek = (displayProgress: number) => {
    const nextTime = duration && duration > 0 ? (duration * displayProgress) / 100 : 0;
    if (playerActions?.onSeek) playerActions.onSeek(displayProgress);
    else storeSeek(nextTime);
  };

  const headerTitle = activeSection === 'library' && selectedGame ? selectedGame.name : activeSection === 'playlists' && selectedPlaylist ? selectedPlaylist.name : copy.title;
  const headerDescription = activeSection === 'library' && selectedGame ? `${tracks.length} 首曲目` : copy.description;
  const gameCountLabel = `${games.length} 个游戏`;
  const trackCountLabel = `${tracks.length} 首曲目`;
  const effectiveAppearance = appearancePreview ?? { themeId: settings.themeId, background: settings.background, fontColor: settings.fontColor ?? null };

  return (
    <div className={`app-shell${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`} data-testid="app-shell" data-theme={effectiveAppearance.themeId} style={toAppearanceStyle(effectiveAppearance)}>
      <svg className="liquid-glass-defs" aria-hidden="true" data-testid="liquid-glass-defs">
        <defs>
          <filter id="natsume-liquid-refraction" x="-15%" y="-30%" width="130%" height="160%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.08" numOctaves="1" seed="11" result="liquidNoise" />
            <feDisplacementMap in="SourceGraphic" in2="liquidNoise" scale="5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      <div className="app-shell__user-background" aria-hidden="true" />
      <div className="app-shell__background-shade" aria-hidden="true" />
      <div className="app-shell__backdrop" aria-hidden="true"><span /><span /><span /></div>
      <TitleBar
        searchText={searchText}
        onSearchChange={setSearchText}
        onMenuClick={() => setSidebarCollapsed((value) => !value)}
        onSettingsClick={() => setCurrentModal('settings')}
      />
      <div className="app-shell__body">
        <Sidebar
          games={games}
          playlists={playlists}
          selectedGameId={selectedGameId}
          selectedPlaylistId={selectedPlaylistId}
          activeSection={activeSection}
          onSelectSection={selectSection}
          onSelectGame={selectGame}
          onEditGame={(game) => { void openGameEditor(game); }}
          onSelectPlaylist={selectPlaylist}
          onCreatePlaylist={() => setCurrentModal('playlist-edit')}
          onImport={handleImport}
        />

        <main
          ref={mainContentRef}
          className="main-content"
          id="main-content"
          data-testid="main-content"
          data-scroll-surface="library"
        >
          {error && <div className="inline-alert" role="alert"><AlertCircle size={16} aria-hidden="true" /><span>{error}</span></div>}

          {(welcomeVisible || games.length === 0) ? (
            <Welcome defaultPath={settings.libraryPath || defaultSettings.libraryPath} onSelectFolder={selectLibraryFolder} onSavePath={saveWelcomePath} onImport={handleWelcomeImport} />
          ) : isLoadingGames && games.length === 0 ? (
            <section className="loading-state" aria-live="polite"><span className="loading-state__spinner" />正在加载音乐库…</section>
          ) : (
            <>
              <section className="library-heading">
                <div className="library-heading__crumbs">
                  <span>我的音乐库</span>
                  <ChevronRight size={13} aria-hidden="true" />
                  <span className="library-heading__crumb-current">{copy.label}</span>
                </div>
                <div className="library-heading__main">
                  <div className="game-hero-cover" aria-hidden="true">
                    {selectedGame?.coverPath && activeSection === 'library' ? (
                      <img src={toCoverUrl(selectedGame.coverPath)} alt="" />
                    ) : <><span className="game-hero-cover__orb" /><span>{selectedGame && activeSection === 'library' ? gameInitials(selectedGame.name) : 'GM'}</span></>}
                  </div>
                  <div>
                    <p className="eyebrow">{copy.label.toUpperCase()}</p>
                    <h1>{headerTitle}</h1>
                    <div className="library-heading__stats"><span><Disc3 size={13} aria-hidden="true" />{headerDescription}</span><span className="stats-divider" /><span><LibraryBig size={13} aria-hidden="true" />{activeSection === 'library' && selectedGame ? trackCountLabel : gameCountLabel}</span></div>
                  </div>
                  {activeSection === 'library' && selectedGame && <button className="button button--ghost library-heading__import" type="button" onClick={() => { void openGameEditor(selectedGame); }}>编辑游戏</button>}
                  {activeSection !== 'library' && <button className="button button--ghost library-heading__import" type="button" onClick={handleImport}><Import size={15} aria-hidden="true" />导入曲目</button>}
                </div>
              </section>

              {activeSection === 'library' && selectedGame && (
                <div className="track-kind-filter" role="group" aria-label="曲目分类">
                  {([
                    [null, '全部'],
                    ['music', '音乐'],
                    ['voice', '语音'],
                  ] as const).map(([kind, label]) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={trackKindFilter === kind}
                      className={trackKindFilter === kind ? 'is-active' : ''}
                      onClick={() => setTrackKindFilter(kind)}
                    >{label}</button>
                  ))}
                </div>
              )}

              {bulkResultNotice && (
                <div className="bulk-result-summary" role="status">
                  <strong>成功 {bulkResultNotice.succeededCount} 首，失败 {bulkResultNotice.failures.length} 首</strong>
                  {bulkResultNotice.warning && <small>{bulkResultNotice.warning}</small>}
                  {bulkResultNotice.failures.length > 0 && (
                    <>
                      <ul>
                        {bulkResultNotice.failures.slice(0, 3).map((failure) => (
                          <li key={failure.trackId}>{failure.trackLabel}：{failure.userMessage}</li>
                        ))}
                      </ul>
                      {bulkResultNotice.failures.length > 3 && <small>另有 {bulkResultNotice.failures.length - 3} 首失败曲目</small>}
                    </>
                  )}
                </div>
              )}

              {isLoadingTracks ? (
                <section className="loading-state loading-state--tracks" aria-live="polite"><span className="loading-state__spinner" />正在读取曲目…</section>
              ) : tracks.length === 0 ? (
                <EmptyState
                  tone="tracks"
                  title={searchText ? '没有匹配的曲目' : `${copy.title}暂无曲目`}
                  description={searchText ? '换个关键词试试，或清空搜索返回当前列表。' : '导入音乐后，曲目会按照当前分类显示在这里。'}
                  actionLabel={searchText ? '清空搜索' : '导入曲目'}
                  onAction={() => searchText ? setSearchText('') : handleImport()}
                />
              ) : (
                <section className="track-section" aria-labelledby="track-section-title">
                  <div className="track-section__heading">
                    <div><h2 id="track-section-title">{copy.title}</h2><span>{tracks.length} 首曲目</span></div>
                    <div className="track-section__tools"><button className="icon-button icon-button--small" type="button" aria-label="打开曲目文件夹" title="打开曲目文件夹" onClick={() => currentTrack && void handleOpenFolder(currentTrack)}><FolderOpen size={15} aria-hidden="true" /></button></div>
                  </div>
                  {selectionEnabled && selectedTrackIds.size > 0 && (
                    <BulkTrackToolbar
                      count={selectedTrackIds.size}
                      busy={bulkBusy}
                      onFavorite={() => { void runBulk({ type: 'favorite', isFavorite: true }); }}
                      onUnfavorite={() => { void runBulk({ type: 'favorite', isFavorite: false }); }}
                      onMove={() => setBulkDialog('move')}
                      onAddToPlaylist={() => setBulkDialog('playlist')}
                      onDelete={() => setBulkDialog('delete')}
                      onClear={() => setSelectedTrackIds(new Set())}
                    />
                  )}
                  <TrackTable
                    tracks={tracks}
                    playingTrackId={currentTrack?.id}
                    onPlayTrack={playTrack}
                    onRename={(track) => { setEditingTrack(track); setCurrentModal('track-edit'); }}
                    onToggleFavorite={(track) => { void toggleFavorite(track); }}
                    onAddToPlaylist={activeSection === 'playlists' ? undefined : (track) => { setPlaylistTrack(track); setCurrentModal('playlist-add'); }}
                    onRemoveFromPlaylist={activeSection === 'playlists' && selectedPlaylistId ? (track) => { void removeTrackFromPlaylist(selectedPlaylistId, track.id); } : undefined}
                    onDelete={activeSection === 'playlists' ? undefined : (track) => void deleteTrack(track.id)}
                    onOpenFolder={handleOpenFolder}
                    selectionEnabled={selectionEnabled}
                    selectedTrackIds={selectedTrackIds}
                    onSelectionChange={setSelectedTrackIds}
                    selectionDisabled={bulkBusy}
                    scrollContainerRef={mainContentRef}
                  />
                </section>
              )}
            </>
          )}
        </main>
      </div>

      <PlayerBar
        playerState={{ currentTrack, isPlaying, volume, progress, duration, currentTime, playMode }}
        onTogglePlay={playerActions?.onTogglePlay ?? storeToggle}
        onPrevious={playerActions?.onPrevious ?? (() => { void storePrevious(); })}
        onNext={playerActions?.onNext ?? (() => { void storeNext(); })}
        onSeek={handleSeek}
        onVolumeChange={playerActions?.onVolumeChange ?? storeSetVolume}
        onPlayModeChange={playerActions?.onPlayModeChange ?? storeSetPlayMode}
      />
      {scanDialogOpen && <ScanDialog onClose={() => setScanDialogOpen(false)} onCompleted={handleScanCompleted} />}
      {currentModal === 'settings' && <SettingsPanel settings={settings} onClose={() => { setAppearancePreview(null); setCurrentModal(null); }} onSelectFolder={selectLibraryFolder} onSelectBackground={selectBackgroundImage} onAppearancePreview={previewAppearance} onCancelAppearancePreview={async () => { await getGalMusicApi()?.cancelAppearancePreview?.(); authorizedBackgroundRef.current = settings.background.imagePath; }} onSave={saveSettings} />}
      {currentModal === 'game-edit' && editingGame && (
        <GameEditor
          game={editingGame}
          metadata={editingGameMetadata}
          onRefreshMetadata={refreshEditingGameMetadata}
          onClose={() => { metadataRequestRef.current += 1; setCurrentModal(null); setEditingGame(null); setEditingGameMetadata(null); }}
          onSelectImage={() => getGalMusicApi()?.selectImage?.() ?? Promise.resolve(null)}
          onSave={async (changes: GameUpdate) => {
            const updated = await updateGame(editingGame.id, changes);
            if (updated) {
              setCurrentModal(null);
              setEditingGame(null);
              setEditingGameMetadata(null);
              await loadGames();
            }
          }}
          onDelete={async () => {
            const deleted = await deleteGame(editingGame.id);
            if (!deleted) throw new Error('删除音乐文件夹失败');
            setCurrentModal(null);
            setEditingGame(null);
            setEditingGameMetadata(null);
            setSelectedGame(null);
            await loadGames();
            await loadTracks({ section: 'library', gameId: null, playlistId: null, search: '' });
          }}
        />
      )}
      {currentModal === 'track-edit' && editingTrack && (
        <TrackEditor
          track={editingTrack}
          onClose={() => { setCurrentModal(null); setEditingTrack(null); }}
          onSave={async (customName) => {
            const updated = await renameTrack(editingTrack.id, customName);
            if (updated) {
              setCurrentModal(null);
              setEditingTrack(null);
            }
          }}
        />
      )}
      {currentModal === 'playlist-edit' && (
        <PlaylistEditor
          onClose={() => setCurrentModal(null)}
          onSave={async (name) => {
            const created = await createPlaylist(name);
            if (created) {
              setCurrentModal(null);
              selectPlaylist(created);
            }
          }}
        />
      )}
      {currentModal === 'playlist-add' && playlistTrack && (
        <PlaylistPicker
          track={playlistTrack}
          playlists={playlists}
          onClose={() => { setCurrentModal(null); setPlaylistTrack(null); }}
          onSelect={async (playlist) => {
            await addTrackToPlaylist(playlist.id, playlistTrack.id);
            setCurrentModal(null);
            setPlaylistTrack(null);
          }}
        />
      )}
      {(bulkDialog === 'move' || bulkDialog === 'playlist') && selectedGameId && (
        <BulkTargetPicker
          mode={bulkDialog === 'move' ? 'game' : 'playlist'}
          games={games}
          playlists={playlists}
          sourceGameId={selectedGameId}
          busy={bulkBusy}
          onClose={() => setBulkDialog(null)}
          onSelect={(targetId) => {
            void runBulk(bulkDialog === 'move'
              ? { type: 'move', targetGameId: targetId }
              : { type: 'playlist-add', playlistId: targetId });
          }}
        />
      )}
      {bulkDialog === 'delete' && (
        <BulkDeleteDialog
          count={selectedTrackIds.size}
          busy={bulkBusy}
          onClose={() => setBulkDialog(null)}
          onConfirm={(deleteFiles) => { void runBulk({ type: 'delete', deleteFiles }); }}
        />
      )}
    </div>
  );
}
