import { Menu, Minus, Search, Settings2, Square, X } from 'lucide-react';

export interface TitleBarProps {
  searchText?: string;
  onSearchChange?: (value: string) => void;
  onMenuClick?: () => void;
  onSettingsClick?: () => void;
  onMinimize?: () => void;
  onToggleMaximize?: () => void;
  onClose?: () => void;
}

const copy = {
  menu: '\u83dc\u5355',
  settings: '\u8bbe\u7f6e',
  minimize: '\u6700\u5c0f\u5316',
  maximize: '\u6700\u5927\u5316',
  close: '\u5173\u95ed',
  searchLabel: '\u641c\u7d22\u66f2\u76ee\u3001\u6e38\u620f\u6216\u6587\u4ef6\u540d',
  searchPlaceholder: '\u641c\u7d22\u66f2\u76ee\u3001\u6e38\u620f\u6216\u6587\u4ef6\u540d',
};

function windowAction(name: 'minimizeWindow' | 'toggleMaximizeWindow' | 'closeWindow'): void {
  if (typeof window === 'undefined') return;
  const action = (window as unknown as { galMusic?: Record<string, () => Promise<void>> }).galMusic?.[name];
  if (action) void action().catch(() => undefined);
}

/** Frameless-window title bar with a narrow, typed window-control bridge. */
export function TitleBar({
  searchText = '',
  onSearchChange,
  onMenuClick,
  onSettingsClick,
  onMinimize,
  onToggleMaximize,
  onClose,
}: TitleBarProps) {
  return (
    <header className="title-bar" data-testid="title-bar">
      <div className="title-bar__leading">
        <button className="icon-button title-bar__menu" type="button" aria-label={copy.menu} title={copy.menu} onClick={onMenuClick}>
          <Menu size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <div className="brand-mark" aria-hidden="true">
          <span className="brand-mark__ring" />
          <span className="brand-mark__dot" />
        </div>
        <div className="brand-lockup">
            <span className="brand-lockup__name">NatsumeMusic</span>
          <span className="brand-lockup__hint">AFTERGLOW LIBRARY</span>
        </div>
      </div>

      <label className="global-search">
        <Search size={16} strokeWidth={2} aria-hidden="true" />
        <span className="sr-only">{copy.searchLabel}</span>
        <input
          type="search"
          value={searchText}
          placeholder={copy.searchPlaceholder}
          onChange={(event) => onSearchChange?.(event.target.value)}
          aria-label={copy.searchLabel}
        />
        <kbd>Ctrl K</kbd>
      </label>

      <div className="title-bar__actions">
        <button className="icon-button" type="button" aria-label={copy.settings} title={copy.settings} onClick={onSettingsClick}>
          <Settings2 size={17} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <span className="window-control-divider" aria-hidden="true" />
        <button className="window-control" type="button" aria-label={copy.minimize} title={copy.minimize} onClick={onMinimize ?? (() => windowAction('minimizeWindow'))}>
          <Minus size={15} aria-hidden="true" />
        </button>
        <button className="window-control" type="button" aria-label={copy.maximize} title={copy.maximize} onClick={onToggleMaximize ?? (() => windowAction('toggleMaximizeWindow'))}>
          <Square size={13} aria-hidden="true" />
        </button>
        <button className="window-control window-control--close" type="button" aria-label={copy.close} title={copy.close} onClick={onClose ?? (() => windowAction('closeWindow'))}>
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
