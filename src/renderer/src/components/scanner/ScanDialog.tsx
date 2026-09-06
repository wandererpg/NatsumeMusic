import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, FolderOpen, LoaderCircle, X } from 'lucide-react';

import type { GalMusicAPI } from '../../../../shared/ipc';
import type { ScanProgress, ScanResult, ScanResultEvent } from '../../../../shared/types';
import { isValidVoiceThreshold } from '../../../../main/services/track-classification';
import { ScanProgress as ScanProgressView } from './ScanProgress';
import { ScanResult as ScanResultView } from './ScanResult';

type ScanPhase = 'idle' | 'running' | 'completed' | 'error';

export interface ScanDialogProps {
  onClose: () => void;
  onCompleted?: (result: ScanResult) => void | Promise<void>;
  defaultDeepScan?: boolean;
}

function getApi(): Partial<GalMusicAPI> | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { galMusic?: GalMusicAPI }).galMusic;
}

function folderName(input: string): string {
  const normalized = input.replace(/[\\/]+$/, '');
  const pieces = normalized.split(/[\\/]/).filter(Boolean);
  return pieces.at(-1) ?? '';
}

function toScanError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'userMessage' in error) {
    const message = (error as { userMessage?: unknown }).userMessage;
    if (typeof message === 'string') return message;
  }
  return error instanceof Error ? error.message : '导入失败，请稍后重试。';
}

export function ScanDialog({ onClose, onCompleted, defaultDeepScan = true }: ScanDialogProps) {
  const [sourcePath, setSourcePath] = useState('');
  const [gameName, setGameName] = useState('');
  const [deepScan, setDeepScan] = useState(defaultDeepScan);
  const [includeVoice, setIncludeVoice] = useState(false);
  const [voiceThresholdInput, setVoiceThresholdInput] = useState('25');
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const requestIdRef = useRef<string | null>(null);
  const autoPickerRef = useRef(false);
  const voiceThresholdSeconds = Number(voiceThresholdInput);
  const hasValidVoiceThreshold = voiceThresholdInput.trim() !== ''
    && isValidVoiceThreshold(voiceThresholdSeconds);

  const applyFolder = (selectedPath: string | null) => {
    if (!selectedPath) return;
    setSourcePath(selectedPath);
    setGameName((current) => current.trim() ? current : folderName(selectedPath));
    setError(null);
  };

  const pickFolder = async () => {
    const api = getApi();
    if (!api?.selectFolder) return;
    setIsPickingFolder(true);
    try {
      applyFolder(await api.selectFolder());
    } catch (pickError) {
      setError(toScanError(pickError));
    } finally {
      setIsPickingFolder(false);
    }
  };

  useEffect(() => {
    const api = getApi();
    const unsubscribeProgress = api?.onScanProgress?.((nextProgress) => {
      setProgress(nextProgress);
      if (phase !== 'completed') setPhase('running');
    });
    const unsubscribeResult = api?.onScanResult?.((event: ScanResultEvent) => {
      if (requestIdRef.current && event.requestId !== requestIdRef.current) return;
      if (event.error) {
        setError(event.error.userMessage);
        setPhase('error');
        return;
      }
      if (!event.result) return;
      setResult(event.result);
      setPhase('completed');
      void onCompleted?.(event.result);
    });

    void api?.getSettings?.()
      .then((settings) => setVoiceThresholdInput(String(settings.voiceThresholdSeconds)))
      .catch(() => {
        // Keep the safe default when settings cannot be loaded.
      });

    // Import is intentionally a folder-first flow. Opening the dialog starts
    // the native picker once, while the visible button remains available for
    // users who cancel or want to choose another source.
    if (!sourcePath && !autoPickerRef.current) {
      autoPickerRef.current = true;
      void pickFolder();
    }

    return () => {
      unsubscribeProgress?.();
      unsubscribeResult?.();
    };
    // The dialog is mounted for one import session; callbacks are kept stable
    // by the API bridge and should not resubscribe for each progress tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startScan = async () => {
    const api = getApi();
    if (!api?.startScan || !sourcePath || !gameName.trim() || !hasValidVoiceThreshold) return;
    setResult(null);
    setError(null);
    try {
      await api.setSetting?.('voice_threshold_seconds', String(voiceThresholdSeconds));
      setPhase('running');
      setProgress({ phase: 'scanning', current: 0, total: 0, currentFile: sourcePath });
      const started = await api.startScan({
        sourcePath,
        gameName: gameName.trim(),
        deepScan,
        includeVoice,
        voiceThresholdSeconds,
      });
      requestIdRef.current = started;
      // A test/legacy bridge may return the summary directly. Supporting it
      // keeps the dialog useful while an older main process is being upgraded.
      if (typeof started === 'object' && started !== null && 'found' in started) {
        const completed = started as unknown as ScanResult;
        setResult(completed);
        setPhase('completed');
        await onCompleted?.(completed);
      }
    } catch (startError) {
      setError(toScanError(startError));
      setPhase('error');
    }
  };

  const cancelScan = async () => {
    const api = getApi();
    const requestId = requestIdRef.current;
    if (requestId) {
      await api?.cancelScan?.(requestId).catch((cancelError) => setError(toScanError(cancelError)));
    }
    requestIdRef.current = null;
    setPhase('idle');
    setProgress(null);
  };

  const close = () => {
    if (phase === 'running') {
      void cancelScan().finally(onClose);
      return;
    }
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="scan-dialog" role="dialog" aria-modal="true" aria-labelledby="scan-dialog-title" data-testid="scan-dialog">
        <header className="scan-dialog__header">
          <div><p className="eyebrow">LOCAL IMPORT</p><h2 id="scan-dialog-title">导入游戏音乐</h2></div>
          <button className="icon-button" type="button" aria-label="关闭导入窗口" onClick={close}><X size={18} aria-hidden="true" /></button>
        </header>

        {phase === 'completed' && result ? (
          <ScanResultView result={result} onClose={onClose} onRetry={() => { setPhase('idle'); setResult(null); setProgress(null); }} />
        ) : (
          <>
            <div className="scan-dialog__body">
              <div className="scan-dialog__source">
                <div className="scan-dialog__field-heading"><label htmlFor="scan-source">游戏文件夹</label><span>支持嵌套目录、普通归档与无扩展名游戏容器</span></div>
                <div className="scan-dialog__path-field">
                  <FolderOpen size={16} aria-hidden="true" />
                  <input id="scan-source" value={sourcePath} placeholder="选择包含游戏资源的文件夹" readOnly aria-label="游戏文件夹" />
                  <button className="button button--ghost" type="button" onClick={() => void pickFolder()} disabled={isPickingFolder || phase === 'running'}>{isPickingFolder ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <FolderOpen size={14} aria-hidden="true" />}选择文件夹</button>
                </div>
              </div>

              <label className="scan-dialog__field">
                <span className="scan-dialog__field-heading"><span>游戏名称</span><small>会显示在左侧游戏列表</small></span>
                <input value={gameName} onChange={(event) => setGameName(event.target.value)} placeholder="例如：ATRI -My Dear Moments-" disabled={phase === 'running'} />
              </label>

              <label className="scan-dialog__field">
                <span className="scan-dialog__field-heading"><span>语音时长阈值</span><small>支持小数秒</small></span>
                <input
                  aria-label="语音时长阈值"
                  type="number"
                  min="1"
                  max="60"
                  step="0.1"
                  value={voiceThresholdInput}
                  onChange={(event) => setVoiceThresholdInput(event.target.value)}
                  disabled={phase === 'running'}
                  aria-invalid={!hasValidVoiceThreshold}
                />
                {!hasValidVoiceThreshold && <small className="scan-dialog__field-error">请输入 1 至 60 秒之间的数值。</small>}
              </label>

              <label className="scan-dialog__check">
                <input type="checkbox" checked={deepScan} onChange={(event) => setDeepScan(event.target.checked)} disabled={phase === 'running'} />
                <span className="scan-dialog__check-mark"><Check size={12} aria-hidden="true" /></span>
                <span><strong>深度扫描归档</strong><small>自动调用 GARbro 读取 .xp3 / .rpa / .arc / .pak，以及 SM2MPX/WMSC 音乐容器</small></span>
                <ChevronDown size={14} className="scan-dialog__check-chevron" aria-hidden="true" />
              </label>

              <label className="scan-dialog__check">
                <input type="checkbox" checked={includeVoice} onChange={(event) => setIncludeVoice(event.target.checked)} disabled={phase === 'running'} />
                <span className="scan-dialog__check-mark"><Check size={12} aria-hidden="true" /></span>
                <span><strong>导入语音</strong><small>{hasValidVoiceThreshold ? `${voiceThresholdSeconds} 秒` : '阈值'}及以下或无法识别时长的音频会归为语音；VOICE1/VOICE2 默认不导入</small></span>
              </label>

              {phase === 'running' && <ScanProgressView progress={progress} />}
              {error && <div className="scan-dialog__error" role="alert"><AlertCircle size={15} aria-hidden="true" /><span>{error}</span></div>}
            </div>
            <footer className="scan-dialog__footer">
              {phase === 'running' ? (
                <button className="button button--ghost" type="button" onClick={() => void cancelScan()}>取消扫描</button>
              ) : (
                <button className="button button--ghost" type="button" onClick={onClose}>稍后再说</button>
              )}
              <button className="button button--primary" type="button" onClick={() => void startScan()} disabled={!sourcePath || !gameName.trim() || !hasValidVoiceThreshold || phase === 'running'}>{phase === 'error' ? '重新开始' : '开始导入'}<span aria-hidden="true">→</span></button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
