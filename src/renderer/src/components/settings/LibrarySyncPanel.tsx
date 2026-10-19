import { useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, LoaderCircle } from 'lucide-react';
import { getErrorMessage } from '../../../../shared/errors';
import type { SyncPreview, SyncPreference } from '../../../../shared/library-sync';
import { useLibraryStore } from '../../stores/libraryStore';

export function LibrarySyncPanel({ disabled = false, onBusyChange }: { disabled?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [preference, setPreference] = useState<SyncPreference>('local');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const api = window.galMusic;
  if (!api?.exportSyncPackage || !api.previewSyncPackage || !api.applySyncPackage) return null;
  const perform = async (action: () => Promise<void>) => {
    if (running.current || disabled) return;
    running.current = true; setBusy(true); onBusyChange?.(true); setError(null); setMessage('');
    try { await action(); } catch (err) { setError(getErrorMessage(err, '同步失败，请重试。')); }
    finally { running.current = false; setBusy(false); onBusyChange?.(false); }
  };
  const exporting = () => perform(async () => {
    const result = await api.exportSyncPackage!();
    if (result) setMessage(`已导出 ${result.tracks} 首歌曲。请将整个同步文件夹交给另一端：${result.manifestPath}`);
  });
  const selecting = () => perform(async () => {
    const result = await api.previewSyncPackage!();
    if (result) { setPreview(result); setPreference('local'); }
  });
  const merging = () => perform(async () => {
    if (!preview) return;
    const result = await api.applySyncPackage!(preview.token, preference);
    setPreview(null);
    const store = useLibraryStore.getState();
    await Promise.all([store.loadGames(), store.loadPlaylists(), store.loadTracks(store.currentQuery)]);
    setMessage(`合并完成：新增 ${result.games} 个作品、${result.tracks} 首歌曲、${result.playlists} 个播放列表。`);
    if (useLibraryStore.getState().error) setError('数据已合并，列表刷新失败，请关闭设置后重新进入音乐库。');
  });
  return <section className="settings-group sync-panel" aria-labelledby="sync-title" aria-busy={busy}>
    <div className="settings-group__heading"><ArrowDownToLine size={18} aria-hidden="true" /><h3 id="sync-title">两端数据同步</h3></div>
    <p>在另一端导出同步文件夹，再选择其中的 manifest.json 预览并合并。包括歌曲文件、收藏、播放列表和作品资料。</p>
    <p className="sync-panel__hint">合并会保留本地作品名称、手账、设置和已有记录；播放列表合并成员，两端的删除操作不会传播。同步文件夹可能较大，请保留充足空间。</p>
    <div className="sync-panel__actions">
      <button type="button" className="button button--ghost" disabled={busy || disabled} onClick={() => void exporting()}><ArrowUpFromLine size={15} aria-hidden="true" />导出同步文件夹</button>
      <button type="button" className="button button--ghost" disabled={busy || disabled} onClick={() => void selecting()}><ArrowDownToLine size={15} aria-hidden="true" />选择同步包并预览</button>
    </div>
    {busy && <p role="status"><LoaderCircle className="spin" size={16} aria-hidden="true" />正在处理，请稍候…</p>}
    {preview && <div className="sync-panel__preview">
      <strong>来自 {preview.application} 的同步包</strong>
      <p>{preview.games} 个作品 · {preview.tracks} 首歌曲 · {preview.playlists} 个列表 · {(preview.totalBytes / 1024 / 1024).toFixed(1)} MB</p>
      <p>预计新增 {preview.newGames} 个作品、{preview.newTracks} 首歌曲、{preview.newPlaylists} 个列表。</p>
      <p>{preview.conflictCount ? `${preview.conflictCount} 项现有记录存在差异。` : '未发现现有记录冲突。'}</p>
      {preview.conflicts.length > 0 && <details><summary>查看差异（最多显示 100 项）</summary><ul>{preview.conflicts.map((item, index) => <li key={index}>{({ game: '作品封面', track: '歌曲信息或收藏', metadata: '作品资料', playlist: '播放列表' })[item.kind]}：{item.name}</li>)}</ul></details>}
      <label className="settings-field"><span>记录冲突时</span><select aria-label="同步冲突处理" value={preference} disabled={busy || disabled} onChange={event => setPreference(event.target.value as SyncPreference)}><option value="local">保留本地内容</option><option value="incoming">采用同步包内容</option></select></label>
      <div className="sync-panel__actions"><button type="button" className="button button--primary" disabled={busy || disabled} onClick={() => void merging()}>确认合并</button><button type="button" className="button button--ghost" disabled={busy || disabled} onClick={() => setPreview(null)}>取消预览</button></div>
    </div>}
    {message && <p role="status" className="sync-panel__message">{message}</p>}
    {error && <p role="alert" className="settings-panel__error">{error}</p>}
  </section>;
}
