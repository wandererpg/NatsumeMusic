import { getErrorMessage } from '../../../../shared/errors';
import { ImageDown, LoaderCircle, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { GameMetadataSummary, MetadataCandidate, MetadataSearchResult, MetadataSelection, MetadataSource, MetadataStatus } from '../../../../shared/types';
import { MetadataPicker } from './MetadataPicker';

export interface MetadataDraft {
  candidate: MetadataCandidate;
  selection: MetadataSelection;
}
export type MetadataDrafts = Partial<Record<MetadataSource, MetadataDraft>>;
interface MetadataPanelProps {
  metadata: GameMetadataSummary | null;
  gameName: string;
  drafts: MetadataDrafts;
  coverSelection: MetadataSource | null;
  hasLocalCoverDraft: boolean;
  busy: boolean;
  onCoverSelection(source: MetadataSource | null): void;
  onChoose(source: MetadataSource, candidate: MetadataCandidate, revision: number): void;
  onUndo(source: MetadataSource): void;
  onPickingChange(picking: boolean): void;
  onRefresh?(): void;
  onSearch?(source: MetadataSource, query: string): Promise<MetadataSearchResult>;
  onLookup?(source: MetadataSource, input: string): Promise<MetadataSearchResult>;
  onOpenLink?(source: MetadataSource, id: string): Promise<void>;
}
const labels: Record<MetadataSource, string> = { vndb: 'VNDB', bangumi: 'Bangumi' };
const statuses: Record<MetadataStatus, string> = { pending: '未查询', matched: '已匹配', no_match: '无结果', failed: '查询失败', ambiguous: '待确认' };

function coverStatus(metadata: GameMetadataSummary): string {
  if (metadata.coverSource === 'manual') return '已保留手动封面';
  if (metadata.coverSource) return `已添加（${labels[metadata.coverSource]}）`;
  const error = metadata.sources.find(source => source.errorMessage)?.errorMessage;
  if (error) return `未添加：${error}`;
  if (metadata.sources.some(source => source.status === 'matched')) return '未添加（匹配成功但没有可用封面）';
  if (metadata.sources.some(source => source.status === 'ambiguous')) return '未添加（候选不唯一）';
  return '未添加（没有可用资料）';
}

export function MetadataPanel(props: MetadataPanelProps) {
  const { metadata, gameName, drafts, coverSelection, hasLocalCoverDraft, busy, onChoose, onUndo, onPickingChange, onRefresh, onSearch, onLookup, onOpenLink } = props;
  const [linkError, setLinkError] = useState<string | null>(null);
  const [active, setActive] = useState<MetadataSource | null>(null);
  const open = (source: MetadataSource | null) => { setActive(source); onPickingChange(source !== null); };
  const source = metadata?.sources.find(item => item.source === active);
  if (source) return <MetadataPicker key={source.source} source={source} gameName={gameName} onBack={() => open(null)}
    onChoose={(candidate, revision) => { onChoose(source.source, candidate, revision); open(null); }}
    onSearch={onSearch} onLookup={onLookup} onOpenLink={onOpenLink} />;
  return <section className="game-editor__metadata" aria-labelledby="game-editor-metadata-title" data-testid="game-editor-metadata">
    {linkError && <p className="settings-panel__error" role="alert">{linkError}</p>}
    <header className="game-editor__metadata-header"><div>
      <span className="settings-field__label" id="game-editor-metadata-title">网络资料</span>
      <small>分别选择来源作品，保存后确认关联</small>
    </div>{onRefresh && <button className="button button--ghost button--small" type="button" aria-label="刷新网络资料"
      onClick={onRefresh} disabled={busy || Object.keys(drafts).length > 0}>
      {busy ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
      {busy ? '更新中…' : '更新已关联资料'}</button>}</header>
    {metadata && <p className="game-editor__metadata-cover" data-testid="game-editor-cover-status"><ImageDown size={14} aria-hidden="true" /><span>封面：{coverStatus(metadata)}</span></p>}
    <div className="game-editor__metadata-list">{(metadata?.sources ?? []).map(item => {
      const draft = drafts[item.source];
      const details = draft?.candidate ?? (item.externalId ? item : null);
      return <article className="game-editor__metadata-source" key={item.source}>
        <div className="game-editor__metadata-source-heading"><strong>{labels[item.source]}</strong>
          <span className={`metadata-status metadata-status--${item.status}`}>{draft ? '已选择，尚未保存' : item.matchMethod === 'manual' ? '已手动确认' : statuses[item.status]}</span></div>
        {details ? <div className="game-editor__metadata-copy">
          <strong>{details.titleCn || details.title}</strong>
          {details.titleCn && details.titleCn !== details.title && <small>{details.title}</small>}
          <small>{details.externalId}</small>
          {details.developer && <span>开发商：{details.developer}</span>}
          {details.score !== null && <span>{labels[item.source]} 评分：{details.score.toFixed(1)} / 10{details.rank !== null ? ` · 排名 ${details.rank}` : ''}</span>}
          {details.summary && <p>{details.summary}</p>}
        </div> : <p className="game-editor__metadata-empty">{item.status === 'ambiguous'
          ? `${item.candidates?.length ?? 0} 个候选，请选择对应的作品。` : item.status === 'no_match'
            ? '没有找到对应条目，可修改名称或输入作品链接。' : item.status === 'pending' ? '尚未查询，可搜索作品。' : '暂时无法获取资料，可稍后重试。'}</p>}
        {(item.errorMessage || item.searchError) && <p className="settings-panel__error" role="status">{item.searchError || item.errorMessage}</p>}
        <div className="game-editor__source-actions"><button className="button button--ghost button--small" type="button"
          aria-label={`选择 ${labels[item.source]} 作品`} disabled={busy} onClick={() => open(item.source)}>
          {draft || item.externalId ? '更换匹配' : '选择作品'}</button>
          {draft && <button className="button button--ghost button--small" type="button" onClick={() => onUndo(item.source)}>撤销选择</button>}
          {!draft && item.externalId && onOpenLink && <button className="button button--ghost button--small" type="button"
            onClick={() => { setLinkError(null); void onOpenLink(item.source, item.externalId!).catch(reason => setLinkError(getErrorMessage(reason, '打开作品链接失败，请重试。'))); }}>查看原始条目</button>}
        </div>
      </article>;
    })}</div>
    {!metadata && <p className="game-editor__metadata-empty">正在读取本地资料缓存…</p>}
    {metadata && <label className="settings-field metadata-cover-choice"><span>保存时的封面</span>
      <select value={coverSelection ?? 'keep'} disabled={hasLocalCoverDraft || busy} onChange={event => props.onCoverSelection(event.target.value === 'keep' ? null : event.target.value as MetadataSource)}>
        <option value="keep">保留当前封面</option>
        {metadata.sources.filter(item => Boolean(drafts[item.source] ? drafts[item.source]!.candidate.imageUrl : item.imageUrl)).map(item =>
          <option key={item.source} value={item.source}>使用 {labels[item.source]} 封面</option>)}
      </select><small>{hasLocalCoverDraft ? '本次本地封面编辑优先；保存后可再次更换。' : '网络封面仅在明确选择后替换；作品显示名称保持不变。'}</small>
    </label>}
  </section>;
}
