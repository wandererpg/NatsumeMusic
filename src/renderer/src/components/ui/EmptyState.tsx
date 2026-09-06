import { FolderOpen, LibraryBig, Music2, Upload } from 'lucide-react';

export type EmptyStateTone = 'library' | 'game' | 'tracks' | 'search';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: EmptyStateTone;
  className?: string;
}

const toneIcons = {
  library: LibraryBig,
  game: FolderOpen,
  tracks: Music2,
  search: Music2,
};

export function EmptyState({
  title = '音乐库还是空的',
  description = '把游戏文件夹拖到这里，或从本地导入一批曲目。',
  actionLabel = '导入游戏音乐',
  onAction,
  tone = 'library',
  className = '',
}: EmptyStateProps) {
  const Icon = toneIcons[tone];
  const testId = tone === 'library' ? 'empty-library' : 'empty-state';

  return (
    <section className={`empty-state empty-state--${tone} ${className}`.trim()} data-testid={testId}>
      <div className="empty-state__art" aria-hidden="true">
        <span className="empty-state__halo" />
        <span className="empty-state__orbit empty-state__orbit--one" />
        <span className="empty-state__orbit empty-state__orbit--two" />
        <span className="empty-state__icon"><Icon size={26} strokeWidth={1.5} /></span>
        <span className="empty-state__spark empty-state__spark--one" />
        <span className="empty-state__spark empty-state__spark--two" />
      </div>
      <div className="empty-state__copy">
        <p className="eyebrow">{tone === 'library' ? 'WELCOME TO GALMUSIC' : 'NOTHING HERE YET'}</p>
        <h2>{title}</h2>
        <p className="empty-state__description">{description}</p>
      </div>
      {actionLabel && (
        <button className="button button--primary empty-state__action" type="button" onClick={onAction}>
          <Upload size={16} strokeWidth={1.9} aria-hidden="true" />
          {actionLabel}
        </button>
      )}
    </section>
  );
}

