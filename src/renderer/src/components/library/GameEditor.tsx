import { getErrorMessage } from '../../../../shared/errors';
import { ImagePlus, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { Game, GameMetadataSummary, GameUpdate, MetadataSearchResult, MetadataSource } from '../../../../shared/types';
import { toCoverUrl } from '../../../../shared/cover-url';
import { MetadataPanel, type MetadataDrafts } from './MetadataPanel';

export interface GameEditorProps {
  game: Game;
  onClose: () => void;
  onSelectImage: () => Promise<string | null>;
  onSave: (changes: GameUpdate) => Promise<void | string>;
  metadata?: GameMetadataSummary | null;
  onRefreshMetadata?: () => Promise<GameMetadataSummary | null>;
  onSearchMetadata?: (source: MetadataSource, query: string) => Promise<MetadataSearchResult>;
  onLookupMetadata?: (source: MetadataSource, input: string) => Promise<MetadataSearchResult>;
  onOpenMetadataLink?: (source: MetadataSource, externalId: string) => Promise<void>;
  onDelete?: () => Promise<void>;
}

function previewUrl(filePath: string): string {
  if (/^(?:https?:|file:|data:|galmusic-cover:)/i.test(filePath)) return filePath;
  return toCoverUrl(filePath);
}

export function GameEditor({ game, onClose, onSelectImage, onSave, metadata, onRefreshMetadata, onSearchMetadata, onLookupMetadata, onOpenMetadataLink, onDelete }: GameEditorProps) {
  const [name, setName] = useState(game.name);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [clearCover, setClearCover] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [metadataState, setMetadataState] = useState<GameMetadataSummary | null>(metadata ?? null);
  const [isRefreshingMetadata, setIsRefreshingMetadata] = useState(false);
  const [drafts, setDrafts] = useState<MetadataDrafts>({});
  const [coverSelection, setCoverSelection] = useState<MetadataSource | null>(null);
  const [isPicking, setIsPicking] = useState(false);

  useEffect(() => {
    setMetadataState(metadata ?? null);
  }, [metadata]);

  const updateCandidates = (result: MetadataSearchResult, merge: boolean) => {
    setMetadataState(current => current ? { ...current, sources: current.sources.map(source => source.source === result.source
      ? { ...source, queryName: result.queryName, revision: result.revision,
        candidates: merge ? [...result.candidates, ...(source.candidates ?? []).filter(candidate => !result.candidates.some(item => item.externalId === candidate.externalId))].slice(0, 20) : result.candidates }
      : source) } : current);
  };

  const chooseImage = async () => {
    try {
      const imagePath = await onSelectImage();
      if (imagePath) {
        setSelectedImage(imagePath);
        setClearCover(false);
        setCoverSelection(null);
      }
    } catch (selectionError) {
      setError(getErrorMessage(selectionError, '选择封面失败，请重试。'));
    }
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('游戏名称不能为空');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const changes: GameUpdate = { name: trimmedName };
      if (clearCover) changes.coverPath = null;
      else if (selectedImage) changes.coverPath = selectedImage;
      else if (coverSelection) changes.coverSelection = coverSelection;
      const selections = Object.values(drafts).map(draft => draft.selection);
      if (selections.length) changes.metadataSelections = selections;
      const warning = await onSave(changes);
      if (warning) { setError(warning); setDrafts({}); setSelectedImage(null); setClearCover(false); }
    } catch (saveError) {
      setError(getErrorMessage(saveError, '保存资料失败，请重试。'));
    } finally {
      setIsSaving(false);
    }
  };

  const cover = selectedImage ?? (!clearCover ? game.coverPath : null);

  const refreshMetadata = async () => {
    if (!onRefreshMetadata) return;
    setIsRefreshingMetadata(true);
    setError(null);
    try {
      const refreshed = await onRefreshMetadata();
      if (refreshed) setMetadataState(refreshed);
    } catch (refreshError) {
      setError(getErrorMessage(refreshError, '更新关联资料失败，请重试。'));
    } finally {
      setIsRefreshingMetadata(false);
    }
  };

  const removeGame = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, '删除音乐文件夹失败，请重试。'));
      setIsDeleting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-panel game-editor" role="dialog" aria-modal="true" aria-labelledby="game-editor-title" data-testid="game-editor">
        <header className="settings-panel__header">
          <div><p className="eyebrow">GAME FOLDER</p><h2 id="game-editor-title">编辑游戏文件夹</h2></div>
          <button className="icon-button" type="button" aria-label="关闭" disabled={isSaving || isDeleting} onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="settings-panel__body">
          <div className="game-editor__local-fields" hidden={isPicking}>
          <label className="settings-field">
            <span>显示名称</span>
            <input value={name} disabled={isSaving || isDeleting} onChange={(event) => setName(event.target.value)} autoFocus />
            <small>重命名会同步更新音乐库中的文件夹和曲目路径。</small>
          </label>
          <div className="game-editor__cover-field">
            <span className="settings-field__label">封面图片</span>
            <div className="game-editor__cover-row">
              <div className="game-editor__preview">
                {cover ? <img src={previewUrl(cover)} alt="游戏封面预览" /> : <ImagePlus size={22} aria-hidden="true" />}
              </div>
              <div className="game-editor__cover-actions">
                <button className="button button--ghost" type="button" disabled={isSaving || isDeleting} onClick={() => void chooseImage()}><ImagePlus size={15} aria-hidden="true" />选择图片</button>
                {game.coverPath && <button className="button button--ghost" type="button" disabled={isSaving || isDeleting} onClick={() => { setSelectedImage(null); setClearCover(true); setCoverSelection(null); }}>移除封面</button>}
                <small>支持 PNG、JPG、WEBP、GIF</small>
                {(selectedImage || clearCover) && <button className="button button--ghost" type="button" disabled={isSaving} onClick={() => { setSelectedImage(null); setClearCover(false); }}>撤销封面更改</button>}
              </div>
            </div>
          </div>
          </div>
          {(onRefreshMetadata || metadataState) && <MetadataPanel metadata={metadataState} gameName={game.name}
            drafts={drafts} coverSelection={coverSelection} hasLocalCoverDraft={Boolean(selectedImage) || clearCover}
            busy={isRefreshingMetadata || isSaving || isDeleting} onCoverSelection={setCoverSelection} onPickingChange={setIsPicking}
            onChoose={(source, candidate, revision) => setDrafts(current => ({ ...current, [source]: { candidate,
              selection: { source, candidateId: candidate.candidateId, expectedRevision: revision } } }))}
            onUndo={source => { setDrafts(current => { const next = { ...current }; delete next[source]; return next; }); if (coverSelection === source) setCoverSelection(null); }}
            onRefresh={onRefreshMetadata ? () => void refreshMetadata() : undefined} onSearch={onSearchMetadata ? async (source, query) => { const result = await onSearchMetadata(source, query); updateCandidates(result, false); return result; } : undefined}
            onLookup={onLookupMetadata ? async (source, input) => { const result = await onLookupMetadata(source, input); updateCandidates(result, true); return result; } : undefined} onOpenLink={onOpenMetadataLink} />}
          {onDelete && !isPicking && (
            <div className="game-editor__danger-zone">
              <div><strong>删除音乐文件夹</strong><small>将永久删除当前音乐库中这个作品的曲目及对应音频文件。直接扫描的目录会保留其他文件。</small></div>
              {!confirmDelete ? (
                <button className="button button--danger" type="button" onClick={() => setConfirmDelete(true)}><Trash2 size={15} aria-hidden="true" />删除音乐文件夹</button>
              ) : (
                <div className="game-editor__confirm-delete">
                  <button className="button button--ghost" type="button" onClick={() => setConfirmDelete(false)}>取消删除</button>
                  <button className="button button--danger" type="button" disabled={isDeleting || isSaving} onClick={() => void removeGame()}>{isDeleting ? '删除中…' : '确认永久删除'}</button>
                </div>
              )}
            </div>
          )}
          {error && <p className="settings-panel__error" role="alert">{error}</p>}
        </div>
        {!isPicking && <footer className="settings-panel__footer">
          <button className="button button--ghost" type="button" disabled={isSaving || isDeleting} onClick={onClose}>取消</button>
          <button className="button button--primary" type="button" disabled={isSaving} onClick={() => void save()}><Save size={15} aria-hidden="true" />{isSaving ? '保存中…' : '保存更改'}</button>
        </footer>}
      </section>
    </div>
  );
}
