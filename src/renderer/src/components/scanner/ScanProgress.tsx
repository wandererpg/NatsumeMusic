import { Archive, Copy, FolderSearch, Globe2, ImageDown, LoaderCircle } from 'lucide-react';

import type { ScanProgress as ScanProgressState } from '../../../../shared/types';

export interface ScanProgressProps {
  progress: ScanProgressState | null;
  cancelled?: boolean;
}

const phaseCopy: Record<ScanProgressState['phase'], { label: string; Icon: typeof FolderSearch }> = {
  scanning: { label: '正在扫描音频文件', Icon: FolderSearch },
  extracting: { label: '正在解包游戏资源', Icon: Archive },
  copying: { label: '正在整理到音乐库', Icon: Copy },
  metadata: { label: '正在获取游戏资料', Icon: Globe2 },
  cover: { label: '正在下载游戏封面', Icon: ImageDown },
};

export function ScanProgress({ progress, cancelled = false }: ScanProgressProps) {
  const phase = progress?.phase ?? 'scanning';
  const { label, Icon } = phaseCopy[phase];
  const total = progress?.total ?? 0;
  const current = progress?.current ?? 0;
  const percent = total > 0 ? Math.max(0, Math.min(100, (current / total) * 100)) : 0;

  return (
    <section className="scan-progress" data-testid="scan-progress" aria-live="polite">
      <div className="scan-progress__icon" aria-hidden="true">
        <Icon size={21} strokeWidth={1.6} />
        <LoaderCircle className="scan-progress__spinner" size={11} strokeWidth={2} />
      </div>
      <div className="scan-progress__copy">
        <div className="scan-progress__label"><span>{cancelled ? '已取消导入' : label}</span><strong>{total > 0 ? `${current}/${total}` : '准备中'}</strong></div>
        <div className="scan-progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={total > 0 ? current : 0} aria-label={label}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <p className="scan-progress__file" title={progress?.currentFile}>{progress?.currentFile || '正在准备扫描任务…'}</p>
      </div>
    </section>
  );
}
