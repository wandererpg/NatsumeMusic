import { useEffect, useState } from 'react';
import type { AppUpdateState } from '../../../../shared/types';
import { usePlayerStore } from '../../stores/playerStore';

function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'userMessage' in error) return String(error.userMessage);
  return error instanceof Error ? error.message : '更新操作失败，请重试。';
}

export function AppUpdatePanel() {
  const [state, setState] = useState<AppUpdateState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const api = window.galMusic;
  useEffect(() => {
    if (!api?.getUpdateState) return;
    let mounted = true;
    let receivedEvent = false;
    const unsubscribe = api.onUpdateState?.((next) => { receivedEvent = true; if (mounted) setState(next); });
    void api.getUpdateState().then((next) => { if (mounted && !receivedEvent) setState(next); })
      .catch((failure) => { if (mounted) setError(errorText(failure)); });
    return () => { mounted = false; unsubscribe?.(); };
  }, [api]);

  if (!api?.getUpdateState) return null;
  const act = async (action: () => Promise<unknown>) => {
    setPending(true); setError(null);
    try { await action(); } catch (failure) { setError(errorText(failure)); }
    finally { setPending(false); }
  };
  const busy = pending || !!state && ['checking', 'downloading', 'preparing'].includes(state.status);
  return (
    <section className="app-update-settings" aria-labelledby="app-update-title">
      <div className="settings-section-heading"><div><h3 id="app-update-title">关于与更新</h3><p>NatsumeMusic {state ? `v${state.currentVersion}` : ''}</p></div></div>
      {state?.availableVersion && <p>可用版本：v{state.availableVersion}</p>}
      {state?.releaseNotes && <pre className="app-update-notes">{state.releaseNotes}</pre>}
      <p role="status">{state?.status === 'checking' ? '正在检查更新…' : state?.status === 'downloading' ? `正在下载：${Math.round(state.progress ?? 0)}%` : state?.message ?? '安装版可在这里检查更新。'}</p>
      {state?.status === 'downloading' && <progress aria-label="更新下载进度" max={100} value={state.progress ?? 0} />}
      <div className="app-update-actions">
        <button type="button" className="button button--ghost" disabled={!state?.supported || busy || state.canInstall} onClick={() => void act(() => api.checkForUpdates!())}>检查更新</button>
        {state?.canDownload && <button type="button" className="button button--primary" disabled={busy} onClick={() => void act(() => api.downloadUpdate!())}>下载更新</button>}
        {state?.canInstall && <button type="button" className="button button--primary" disabled={busy} onClick={() => void act(() => usePlayerStore.getState().installUpdate())}>重启更新</button>}
        <button type="button" className="button button--ghost" disabled={!api.openUpdateDownloads} onClick={() => void act(() => api.openUpdateDownloads!())}>手动下载</button>
      </div>
      <small>下载期间可以继续播放。重启更新前会保存进度并备份音乐库；重启后保持暂停。稍后更新可直接关闭设置。</small>
      {error && <p className="settings-panel__error" role="alert">{error}</p>}
    </section>
  );
}
