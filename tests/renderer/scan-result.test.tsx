/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ScanResult } from '../../src/renderer/src/components/scanner/ScanResult';
import type { ScanResult as ScanResultState } from '../../src/shared/types';

describe('ScanResult metadata feedback', () => {
  it('shows source query status and the local cover result after import', () => {
    const result = {
      found: 3,
      extracted: 0,
      copied: 3,
      skipped: 0,
      errors: [],
      metadata: {
        gameId: 'g1',
        coverSource: 'vndb',
        sources: [
          { source: 'vndb', status: 'matched', queryName: 'ATRI', externalId: 'v17', title: 'ATRI', titleCn: null, developer: 'Frontwing', summary: null, score: 8.5, rank: 17, fetchedAt: '2026-08-24T00:00:00.000Z', errorMessage: null },
          { source: 'bangumi', status: 'failed', queryName: 'ATRI', externalId: null, title: null, titleCn: null, developer: null, summary: null, score: null, rank: null, fetchedAt: '2026-08-24T00:00:00.000Z', errorMessage: '请求超时' },
        ],
      },
    } as unknown as ScanResultState;

    render(<ScanResult result={result} />);

    expect(screen.getByTestId('scan-result-metadata')).toBeInTheDocument();
    expect(screen.getByText('资料查询：部分失败')).toBeInTheDocument();
    expect(screen.getByText('VNDB：已匹配')).toBeInTheDocument();
    expect(screen.getByText('Bangumi：查询失败')).toBeInTheDocument();
    expect(screen.getByText('封面：已添加（VNDB）')).toBeInTheDocument();
  });
});
