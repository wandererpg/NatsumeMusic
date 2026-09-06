import { ImageDown, ImagePlus, LoaderCircle, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { Game, GameMetadataSourceSummary, GameMetadataSummary, GameUpdate, MetadataSource, MetadataStatus } from '../../../../shared/types';
import { toCoverUrl } from '../../../../shared/cover-url';

export interface GameEditorProps {
  game: Game;
  onClose: () => void;
  onSelectImage: () => Promise<string | null>;
  onSave: (changes: GameUpdate) => Promise<void>;
  metadata?: GameMetadataSummary | null;
  onRefreshMetadata?: () => Promise<GameMetadataSummary | null>;
  onDelete?: () => Promise<void>;
}

function previewUrl(filePath: string): string {
  if (/^(?:https?:|file:|data:|galmusic-cover:)/i.test(filePath)) return filePath;
  return toCoverUrl(filePath);
}

function sourceLabel(source: MetadataSource): string {
  return source === 'vndb' ? 'VNDB' : 'Bangumi';
}

function statusLabel(status: MetadataStatus): string {
  return {
    pending: '未查询',
    matched: '已匹配',
    no_match: '无结果',
    failed: '查询失败',
    ambiguous: '待确认',
  }[status];
}

function hasMatchedSummary(source: GameMetadataSourceSummary): boolean {
  return source.status === 'matched' && Boolean(source.title || source.titleCn || source.developer || source.summary);
}

function coverStatusLabel(metadata: GameMetadataSummary): string {
  if (metadata.coverSource === 'manual') return '已保留手动封面';
  if (metadata.coverSource === 'vndb' || metadata.coverSource === 'bangumi') return `已添加（${sourceLabel(metadata.coverSource)}）`;
  const error = metadata.sources.find((source) => source.errorMessage)?.errorMessage;
  if (error) return `未添加：${error}`;
  if (metadata.sources.some((source) => source.status === 'matched')) return '未添加（匹配成功但没有可用封面）';
  if (metadata.sources.some((source) => source.status === 'ambiguous')) return '未添加（候选不唯一）';
  return '未添加（没有可用资料）';
}

export function GameEditor({ game, onClose, onSelectImage, onSave, metadata, onRefreshMetadata, onDelete }: GameEditorProps) {
  const [name, setName] = useState(game.name);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [clearCover, setClearCover] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [metadataState, setMetadataState] = useState<GameMetadataSummary | null>(metadata ?? null);
  const [isRefreshingMetadata, setIsRefreshingMetadata] = useState(false);

  useEffect(() => {
    setMetadataState(metadata ?? null);
  }, [metadata]);

  const chooseImage = async () => {
    try {
      const imagePath = await onSelectImage();
      if (imagePath) {
        setSelectedImage(imagePath);
        setClearCover(false);
      }
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : String(selectionError));
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
      await onSave(changes);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
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
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
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
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
      setIsDeleting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-panel game-editor" role="dialog" aria-modal="true" aria-labelledby="game-editor-title" data-testid="game-editor">
        <header className="settings-panel__header">
          <div><p className="eyebrow">GAME FOLDER</p><h2 id="game-editor-title">编辑游戏文件夹</h2></div>
          <button className="icon-button" type="button" aria-label="关闭" onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="settings-panel__body">
          <label className="settings-field">
            <span>显示名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
            <small>重命名会同步更新音乐库中的文件夹和曲目路径。</small>
          </label>
          <div className="game-editor__cover-field">
            <span className="settings-field__label">封面图片</span>
            <div className="game-editor__cover-row">
              <div className="game-editor__preview">
                {cover ? <img src={previewUrl(cover)} alt="游戏封面预览" /> : <ImagePlus size={22} aria-hidden="true" />}
              </div>
              <div className="game-editor__cover-actions">
                <button className="button button--ghost" type="button" onClick={() => void chooseImage()}><ImagePlus size={15} aria-hidden="true" />选择图片</button>
                {game.coverPath && <button className="button button--ghost" type="button" onClick={() => { setSelectedImage(null); setClearCover(true); }}>移除封面</button>}
                <small>支持 PNG、JPG、WEBP、GIF</small>
              </div>
            </div>
          </div>
          {onRefreshMetadata && (
            <section className="game-editor__metadata" aria-labelledby="game-editor-metadata-title" data-testid="game-editor-metadata">
              <header className="game-editor__metadata-header">
                <div>
                  <span className="settings-field__label" id="game-editor-metadata-title">网络资料</span>
                  <small>按游戏库缓存 VNDB 与 Bangumi 的匹配结果</small>
                </div>
                <button className="button button--ghost button--small" type="button" aria-label="刷新网络资料" onClick={() => void refreshMetadata()} disabled={isRefreshingMetadata}>
                  {isRefreshingMetadata ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
                  {isRefreshingMetadata ? '刷新中…' : '刷新网络资料'}
                </button>
              </header>
              {metadataState && <p className="game-editor__metadata-cover" data-testid="game-editor-cover-status"><ImageDown size={14} aria-hidden="true" /><span>{`封面：${coverStatusLabel(metadataState)}`}</span></p>}
              <div className="game-editor__metadata-list">
                {(metadataState?.sources ?? []).map((source) => (
                  <article className="game-editor__metadata-source" key={source.source}>
                    <div className="game-editor__metadata-source-heading">
                      <strong>{sourceLabel(source.source)}</strong>
                      <span className={`metadata-status metadata-status--${source.status}`}>{statusLabel(source.status)}</span>
                    </div>
                    {hasMatchedSummary(source) ? (
                      <div className="game-editor__metadata-copy">
                        <strong>{source.titleCn || source.title}</strong>
                        {source.titleCn && source.title && source.titleCn !== source.title && <small>{source.title}</small>}
                        {source.developer && <span>开发商：{source.developer}</span>}
                        {source.score !== null && <span>评分：{source.score.toFixed(1)}{source.rank !== null ? ` · 排名 ${source.rank}` : ''}</span>}
                        {source.summary && <p>{source.summary}</p>}
                      </div>
                    ) : source.errorMessage ? (
                      <p className="game-editor__metadata-empty">{source.errorMessage}</p>
                    ) : (
                      <p className="game-editor__metadata-empty">{source.status === 'pending' ? '尚未查询' : source.status === 'ambiguous' ? '存在多个候选，请刷新或手动确认封面。' : source.status === 'no_match' ? '没有找到对应的游戏条目。' : '暂时无法获取资料，可稍后重试。'}</p>
                    )}
                  </article>
                ))}
                {!metadataState && <p className="game-editor__metadata-empty">正在读取本地资料缓存…</p>}
              </div>
            </section>
          )}
          {onDelete && (
            <div className="game-editor__danger-zone">
              <div><strong>删除音乐文件夹</strong><small>将永久删除这个作品、库内曲目和已复制的音乐文件。</small></div>
              {!confirmDelete ? (
                <button className="button button--danger" type="button" onClick={() => setConfirmDelete(true)}><Trash2 size={15} aria-hidden="true" />删除音乐文件夹</button>
              ) : (
                <div className="game-editor__confirm-delete">
                  <button className="button button--ghost" type="button" onClick={() => setConfirmDelete(false)}>取消删除</button>
                  <button className="button button--danger" type="button" disabled={isDeleting} onClick={() => void removeGame()}>{isDeleting ? '删除中…' : '确认永久删除'}</button>
                </div>
              )}
            </div>
          )}
          {error && <p className="settings-panel__error" role="alert">{error}</p>}
        </div>
        <footer className="settings-panel__footer">
          <button className="button button--ghost" type="button" onClick={onClose}>取消</button>
          <button className="button button--primary" type="button" disabled={isSaving} onClick={() => void save()}><Save size={15} aria-hidden="true" />{isSaving ? '保存中…' : '保存更改'}</button>
        </footer>
      </section>
    </div>
  );
}
