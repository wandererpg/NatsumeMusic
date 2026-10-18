/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GameEditor } from '../../src/renderer/src/components/library/GameEditor';
import type { Game, GameMetadataSummary, MetadataCandidate } from '../../src/shared/types';
afterEach(cleanup);

const game: Game = {
  id: 'game-delete', name: 'Delete Me', coverPath: null, coverSource: null, folderPath: 'C:/Music/Delete Me', trackCount: 3,
  createdAt: '', updatedAt: '',
};

describe('GameEditor deletion', () => {
  it('shows IPC errors when searching for a linked work', async () => {
    const metadata: GameMetadataSummary = {
      gameId: game.id, coverSource: null,
      sources: [{ source: 'vndb', status: 'pending', queryName: game.name,
        externalId: null, title: null, titleCn: null, developer: null, summary: null,
        score: null, rank: null, fetchedAt: null, errorMessage: null, candidates: [], revision: 0 }],
    };
    render(<GameEditor game={game} metadata={metadata} onSave={vi.fn()} onClose={vi.fn()}
      onSelectImage={vi.fn()} onSearchMetadata={vi.fn().mockRejectedValue({
        code: 'DB_ERROR', userMessage: '正在切换并扫描音乐库，请稍候。',
      })} />);
    fireEvent.click(screen.getByRole('button', { name: '选择 VNDB 作品' }));
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('正在切换并扫描音乐库，请稍候。');
  });
  it('shows the IPC error message when updating linked metadata fails', async () => {
    render(<GameEditor game={game} onSave={vi.fn()} onClose={vi.fn()} onSelectImage={vi.fn()}
      onRefreshMetadata={vi.fn().mockRejectedValue({ code: 'DB_ERROR', userMessage: '资料请求超时，请稍后重试。' })} />);
    fireEvent.click(screen.getByRole('button', { name: '刷新网络资料' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('资料请求超时，请稍后重试。'));
    expect(screen.getByRole('alert')).not.toHaveTextContent('[object Object]');
  });
  it('keeps new search candidates when the user cancels and reopens the picker', async () => {
    const candidate: MetadataCandidate = { candidateId: 'a'.repeat(64), externalId: 'v3', title: 'Search result', titleCn: null, aliases: [], developer: null, summary: 'Details', score: null, rank: null, imageUrl: null };
    const metadata: GameMetadataSummary = { gameId: game.id, coverSource: null, sources: [{ source: 'vndb', status: 'ambiguous', queryName: game.name, externalId: null, title: null, titleCn: null, developer: null, summary: null, score: null, rank: null, fetchedAt: null, errorMessage: null, candidates: [], revision: 1 }] };
    const onSave = vi.fn();
    render(<GameEditor game={game} metadata={metadata} onSave={onSave} onClose={vi.fn()} onSelectImage={vi.fn()} onSearchMetadata={vi.fn().mockResolvedValue({ source: 'vndb', queryName: 'New search', revision: 1, candidates: [candidate] })} />);
    fireEvent.click(screen.getByRole('button', { name: '选择 VNDB 作品' }));
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    await screen.findByRole('radio', { name: 'Search result v3' });
    fireEvent.click(screen.getByRole('radio', { name: 'Search result v3' }));
    fireEvent.click(screen.getByRole('button', { name: '取消选择' }));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '选择 VNDB 作品' }));
    expect(screen.getByRole('radio', { name: 'Search result v3' })).not.toBeChecked();
  });
  it('lets the user choose a cached ambiguous candidate and commits it only on Save', async () => {
    const candidates: MetadataCandidate[] = ['v1', 'v2'].map((externalId, index) => ({
      candidateId: String(index + 1).repeat(64), externalId, title: `作品 ${index + 1}`, titleCn: null,
      aliases: [], developer: null, summary: '候选简介', score: null, rank: null, imageUrl: null,
    }));
    const metadata: GameMetadataSummary = { gameId: game.id, coverSource: null, sources: [{
      source: 'vndb', status: 'ambiguous', queryName: game.name, externalId: null, title: null,
      titleCn: null, developer: null, summary: null, score: null, rank: null, fetchedAt: null,
      errorMessage: null, candidates, revision: 3,
    }] };
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<GameEditor game={game} metadata={metadata} onRefreshMetadata={vi.fn()}
      onSearchMetadata={vi.fn()} onLookupMetadata={vi.fn()} onClose={vi.fn()}
      onSelectImage={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: '选择 VNDB 作品' }));
    expect(screen.getByRole('button', { name: '使用此作品' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /作品 2/ }));
    fireEvent.click(screen.getByRole('button', { name: '使用此作品' }));
    expect(screen.getByText('已选择，尚未保存')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '保存更改' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: game.name,
      metadataSelections: [{ source: 'vndb', candidateId: candidates[1].candidateId, expectedRevision: 3 }] }));
  });

  it('does not save a selected candidate when the editor is cancelled', async () => {
    const onSave = vi.fn(); const onClose = vi.fn();
    render(<GameEditor game={game} onSave={onSave} onClose={onClose} onSelectImage={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
  it('requires an explicit confirmation before deleting the music folder', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <GameEditor
        game={game}
        onClose={vi.fn()}
        onSelectImage={vi.fn().mockResolvedValue(null)}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '删除音乐文件夹' }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认永久删除' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });

  it('shows sanitized VNDB/Bangumi summaries and supports refresh', async () => {
    const metadata: GameMetadataSummary = {
      gameId: game.id,
      coverSource: 'vndb',
      sources: [
        {
          source: 'vndb',
          status: 'matched',
          queryName: 'Delete Me',
          externalId: 'v17',
          title: 'ATRI',
          titleCn: 'ATRI -My Dear Moments-',
          developer: 'Frontwing',
          summary: 'A locally cached summary.',
          score: 8.5,
          rank: 17,
          fetchedAt: '2026-08-24T00:00:00.000Z',
          errorMessage: null,
        },
        {
          source: 'bangumi',
          status: 'no_match',
          queryName: 'Delete Me',
          externalId: null,
          title: null,
          titleCn: null,
          developer: null,
          summary: null,
          score: null,
          rank: null,
          fetchedAt: '2026-08-24T00:00:00.000Z',
          errorMessage: null,
        },
      ],
    };
    const onRefreshMetadata = vi.fn().mockResolvedValue(metadata);
    render(
      <GameEditor
        game={game}
        metadata={metadata}
        onRefreshMetadata={onRefreshMetadata}
        onClose={vi.fn()}
        onSelectImage={vi.fn().mockResolvedValue(null)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText('网络资料')).toBeInTheDocument();
    expect(screen.getByText('封面：已添加（VNDB）')).toBeInTheDocument();
    expect(screen.getByText('开发商：Frontwing')).toBeInTheDocument();
    expect(screen.getByText('已匹配')).toBeInTheDocument();
    expect(screen.getByText('无结果')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '刷新网络资料' }));
    await waitFor(() => expect(onRefreshMetadata).toHaveBeenCalledTimes(1));
  });
});
