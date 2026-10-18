import { getErrorMessage } from '../../../../shared/errors';
import { ArrowLeft, ExternalLink, ImageOff, LoaderCircle, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { GameMetadataSourceSummary, MetadataCandidate, MetadataSearchResult, MetadataSource } from '../../../../shared/types';

interface MetadataPickerProps {
  source: GameMetadataSourceSummary;
  gameName: string;
  onBack(): void;
  onChoose(candidate: MetadataCandidate, revision: number): void;
  onSearch?(source: MetadataSource, query: string): Promise<MetadataSearchResult>;
  onLookup?(source: MetadataSource, input: string): Promise<MetadataSearchResult>;
  onOpenLink?(source: MetadataSource, id: string): Promise<void>;
}

export function MetadataImage({ url, title }: { url: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return url && !failed ? <img src={url} alt={title} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className="metadata-picker__image-placeholder"><ImageOff size={22} aria-hidden="true" /></span>;
}

export function MetadataPicker({ source, gameName, onBack, onChoose, onSearch, onLookup, onOpenLink }: MetadataPickerProps) {
  const [query, setQuery] = useState(source.queryName || gameName);
  const [input, setInput] = useState('');
  const [candidates, setCandidates] = useState(source.candidates ?? []);
  const [revision, setRevision] = useState(source.revision ?? 0);
  const [chosen, setChosen] = useState<MetadataCandidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);
  const label = source.source === 'vndb' ? 'VNDB' : 'Bangumi';

  const search = async (byId: boolean) => {
    const action = byId ? onLookup : onSearch;
    const text = (byId ? input : query).trim();
    if (!action || !text) return;
    const id = ++request.current;
    setBusy(true); setError(null);
    try {
      const result = await action(source.source, text);
      if (id !== request.current) return;
      setCandidates(result.candidates); setRevision(result.revision); setChosen(null);
      if (result.candidates.length === 0) setError('没有找到作品，请尝试原名、别名或作品链接。');
    } catch (reason) {
      if (id === request.current) setError(getErrorMessage(reason, '获取作品资料失败，请重试。'));
    } finally { if (id === request.current) setBusy(false); }
  };

  const choose = async (candidate: MetadataCandidate) => {
    setChosen(candidate); setError(null);
    if (candidate.summary || !onLookup) return;
    const id = ++request.current;
    setBusy(true);
    try {
      const detail = await onLookup(source.source, candidate.externalId);
      if (id !== request.current) return;
      const full = detail.candidates[0];
      if (full) {
        setRevision(detail.revision); setChosen(full);
        setCandidates(items => items.map(item => item.externalId === full.externalId ? full : item));
      }
    } catch (reason) {
      if (id === request.current) setError(`完整资料暂时不可用，仍可使用缓存候选：${getErrorMessage(reason, '获取作品资料失败，请重试。')}`);
    } finally { if (id === request.current) setBusy(false); }
  };

  return <section className="metadata-picker" aria-label={`选择 ${label} 作品`}>
    <header className="metadata-picker__header">
      <button className="button button--ghost button--small" type="button" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" />返回编辑</button>
      <div><strong>选择作品 · {label}</strong><small>确认所选条目对应本篇、续作或重制版</small></div>
    </header>
    <form className="metadata-picker__search" onSubmit={event => { event.preventDefault(); void search(false); }}>
      <label className="settings-field"><span>搜索名称</span><input value={query} onChange={event => setQuery(event.target.value)} maxLength={500} /></label>
      <button className="button button--ghost" disabled={busy || !query.trim() || !onSearch}><Search size={15} aria-hidden="true" />搜索</button>
    </form>
    <form className="metadata-picker__search" onSubmit={event => { event.preventDefault(); void search(true); }}>
      <label className="settings-field"><span>作品链接或 ID</span><input value={input} onChange={event => setInput(event.target.value)} maxLength={500}
        placeholder={source.source === 'vndb' ? 'https://vndb.org/v12345 或 v12345' : 'https://bgm.tv/subject/12345 或 12345'} /></label>
      <button className="button button--ghost" disabled={busy || !input.trim() || !onLookup}>获取</button>
    </form>
    {busy && <p className="metadata-picker__notice" role="status"><LoaderCircle size={15} className="spin" aria-hidden="true" />正在获取作品资料…</p>}
    {error && <p className="settings-panel__error" role="alert">{error}</p>}
    <div className="metadata-picker__columns">
      <div className="metadata-picker__results" role="radiogroup" aria-label="候选作品">
        <small>{candidates.length ? `${candidates.length} 个候选 · 请选择作品` : '尚无候选，可修改名称搜索或输入链接'}</small>
        {candidates.map(candidate => <label className={`metadata-picker__candidate${chosen?.externalId === candidate.externalId ? ' is-selected' : ''}`} key={candidate.candidateId}>
          <input type="radio" name="metadata-candidate" checked={chosen?.externalId === candidate.externalId} disabled={busy}
            onChange={() => void choose(candidate)} aria-label={`${candidate.titleCn || candidate.title} ${candidate.externalId}`} />
          <span className="metadata-picker__thumbnail"><MetadataImage url={candidate.imageUrl} title={candidate.title} /></span>
          <span className="metadata-picker__candidate-copy"><strong>{candidate.titleCn || candidate.title}</strong>
            {candidate.titleCn && <small>{candidate.title}</small>}
            <small>{[candidate.developer, candidate.released, candidate.externalId].filter(Boolean).join(' · ')}</small></span>
        </label>)}
      </div>
      <aside className="metadata-picker__preview" aria-label="所选作品预览">
        {chosen ? <>
          <div className="metadata-picker__cover"><MetadataImage url={chosen.imageUrl} title={chosen.title} /></div>
          <strong>{chosen.titleCn || chosen.title}</strong>
          {chosen.titleCn && <small>{chosen.title}</small>}
          <small>{label} · {chosen.externalId}</small>
          {chosen.developer && <span>开发商：{chosen.developer}</span>}
          {chosen.released && <span>发售日期：{chosen.released}</span>}
          {chosen.score !== null && <span>{label} 评分：{chosen.score.toFixed(1)} / 10</span>}
          {chosen.rank !== null && <span>{label} 排名：#{chosen.rank}</span>}
          {chosen.aliases.length > 0 && <small>别名：{chosen.aliases.join(' / ')}</small>}
          <p>{chosen.summary || '此条目暂无简介。'}</p>
          {onOpenLink && <button className="button button--ghost button--small" type="button" onClick={() => {
            void onOpenLink(source.source, chosen.externalId).catch(reason => setError(getErrorMessage(reason, '打开作品链接失败，请重试。')));
          }}><ExternalLink size={14} aria-hidden="true" />查看原始条目</button>}
        </> : <p>选择左侧候选，查看作品资料。</p>}
      </aside>
    </div>
    <footer className="metadata-picker__actions"><small>选择后需在编辑器中保存更改</small>
      <button className="button button--ghost" type="button" onClick={onBack}>取消选择</button>
      <button className="button button--primary" type="button" disabled={!chosen || busy} onClick={() => { if (chosen) onChoose(chosen, revision); }}>使用此作品</button>
    </footer>
  </section>;
}
