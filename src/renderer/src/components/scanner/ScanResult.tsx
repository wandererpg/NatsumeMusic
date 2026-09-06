import { AlertTriangle, CheckCircle2, Copy, FileAudio, FolderArchive, Globe2, ImageDown, SkipForward, X } from 'lucide-react';

import type { GameMetadataSummary, MetadataSource, MetadataStatus, ScanResult as ScanResultState } from '../../../../shared/types';

export interface ScanResultProps {
  result: ScanResultState;
  onClose?: () => void;
  onRetry?: () => void;
}

const sourceLabels: Record<MetadataSource, string> = { vndb: 'VNDB', bangumi: 'Bangumi' };
const statusLabels: Record<MetadataStatus, string> = {
  pending: '未查询',
  matched: '已匹配',
  no_match: '无结果',
  failed: '查询失败',
  ambiguous: '需确认',
};

function queryOutcome(metadata: GameMetadataSummary): string {
  if (metadata.sources.some((source) => source.status === 'failed')) return '部分失败';
  if (metadata.sources.every((source) => source.status !== 'pending')) return '已完成';
  return '未完成';
}

function coverOutcome(metadata: GameMetadataSummary): string {
  if (metadata.coverSource === 'manual') return '已保留手动封面';
  if (metadata.coverSource === 'vndb' || metadata.coverSource === 'bangumi') {
    return `已添加（${sourceLabels[metadata.coverSource]}）`;
  }
  const coverError = metadata.sources.find((source) => source.errorMessage)?.errorMessage;
  if (coverError) return `未添加：${coverError}`;
  if (metadata.sources.some((source) => source.status === 'matched')) return '未添加（匹配成功但没有可用封面）';
  if (metadata.sources.some((source) => source.status === 'ambiguous')) return '未添加（候选不唯一）';
  return '未添加（没有可用资料）';
}

export function ScanResult({ result, onClose, onRetry }: ScanResultProps) {
  return (
    <section className="scan-result" data-testid="scan-result" aria-live="polite">
      <div className="scan-result__hero" aria-hidden="true">
        <span className="scan-result__halo" />
        <CheckCircle2 size={28} strokeWidth={1.5} />
      </div>
      <p className="eyebrow">IMPORT COMPLETE</p>
      <h2>音乐已经在库里了</h2>
      <p className="scan-result__description">文件已复制到独立的游戏目录，源文件可以放心移除。</p>

      <div className="scan-result__stats" aria-label="导入结果统计">
        <div><FileAudio size={15} aria-hidden="true" /><strong>{result.found}</strong><span>发现</span></div>
        <div><FolderArchive size={15} aria-hidden="true" /><strong>{result.extracted}</strong><span>解包</span></div>
        <div><Copy size={15} aria-hidden="true" /><strong>{result.copied}</strong><span>复制</span></div>
        <div><SkipForward size={15} aria-hidden="true" /><strong>{result.skipped}</strong><span>跳过</span></div>
      </div>

      {result.metadata && (
        <section className="scan-result__metadata" data-testid="scan-result-metadata" aria-label="游戏资料查询结果">
          <div className="scan-result__metadata-heading">
            <div><Globe2 size={15} aria-hidden="true" /><strong>游戏资料</strong></div>
            <span>{`资料查询：${queryOutcome(result.metadata)}`}</span>
          </div>
          <div className="scan-result__metadata-sources">
            {result.metadata.sources.map((source) => (
              <span className={`metadata-status metadata-status--${source.status}`} key={source.source}>
                {`${sourceLabels[source.source]}：${statusLabels[source.status]}`}
              </span>
            ))}
          </div>
          <div className="scan-result__cover-outcome"><ImageDown size={14} aria-hidden="true" /><span>{`封面：${coverOutcome(result.metadata)}`}</span></div>
        </section>
      )}

      {result.errors.length > 0 && (
        <details className="scan-result__errors" open>
          <summary><AlertTriangle size={14} aria-hidden="true" />{result.errors.length} 个文件未能导入</summary>
          <ul>
            {result.errors.map((error, index) => <li key={`${error.file}-${index}`} title={error.file}>{error.message}</li>)}
          </ul>
        </details>
      )}

      <div className="scan-dialog__actions">
        {onRetry && <button className="button button--ghost" type="button" onClick={onRetry}><X size={15} aria-hidden="true" />继续导入</button>}
        <button className="button button--primary" type="button" onClick={onClose}>完成</button>
      </div>
    </section>
  );
}
