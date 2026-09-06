import { useState } from 'react';
import { ArrowRight, FolderOpen, LibraryBig, LoaderCircle, Sparkles } from 'lucide-react';

export interface WelcomeProps {
  defaultPath?: string;
  onSavePath: (path: string) => Promise<void> | void;
  onSelectFolder?: () => Promise<string | null>;
  onImport?: () => Promise<void> | void;
}

const copy = {
  title: '\u7ed9\u4f60\u7684\u6e38\u620f\u97f3\u4e50\u4e00\u4e2a\u5b89\u9759\u7684\u5bb6',
  description: 'NatsumeMusic \u4f1a\u628a\u5bfc\u5165\u7684\u97f3\u9891\u590d\u5236\u5230\u72ec\u7acb\u97f3\u4e50\u5e93\u3002\u65ad\u5f00\u7f51\u7edc\u4e5f\u80fd\u64ad\u653e\uff0c\u6e90\u6587\u4ef6\u79fb\u52a8\u540e\u4e0d\u4f1a\u5f71\u54cd\u8fd9\u91cc\u7684\u526f\u672c\u3002',
  pathLabel: '\u97f3\u4e50\u5e93\u4f4d\u7f6e',
  choose: '\u9009\u62e9\u6587\u4ef6\u5939',
  import: '\u5bfc\u5165\u6e38\u620f\u97f3\u4e50',
  skip: '\u5148\u8fdb\u5165\u7a7a\u97f3\u4e50\u5e93',
};

function messageFor(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function Welcome({
  defaultPath = '%USERPROFILE%\\Music\\NatsumeMusic',
  onSavePath,
  onSelectFolder,
  onImport,
}: WelcomeProps) {
  const [libraryPath, setLibraryPath] = useState(defaultPath);
  const [isPicking, setIsPicking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseFolder = async () => {
    if (!onSelectFolder) return;
    setIsPicking(true);
    setError(null);
    try {
      const selected = await onSelectFolder();
      if (selected) setLibraryPath(selected);
    } catch (pickError) {
      setError(messageFor(pickError, '\u65e0\u6cd5\u9009\u62e9\u6587\u4ef6\u5939\u3002'));
    } finally {
      setIsPicking(false);
    }
  };

  const save = async (): Promise<boolean> => {
    if (!libraryPath.trim()) return false;
    setIsSaving(true);
    setError(null);
    try {
      await onSavePath(libraryPath.trim());
      return true;
    } catch (saveError) {
      setError(messageFor(saveError, '\u65e0\u6cd5\u4fdd\u5b58\u97f3\u4e50\u5e93\u8def\u5f84\u3002'));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const importGame = async () => {
    if (await save()) await onImport?.();
  };

  return (
    <section className="welcome-view" data-testid="welcome" aria-labelledby="welcome-title">
      <div className="welcome-view__inner" data-testid="empty-library">
        <div className="welcome-view__art" aria-hidden="true"><span className="welcome-view__glow" /><span className="welcome-view__ring" /><LibraryBig size={28} strokeWidth={1.4} /><Sparkles className="welcome-view__spark" size={16} /></div>
        <p className="eyebrow">WELCOME TO NATSUMEMUSIC</p>
        <h2 id="welcome-title">{copy.title}</h2>
        <p className="welcome-view__description">{copy.description}</p>
        <div className="welcome-view__path-row">
          <div><span className="welcome-view__path-label">{copy.pathLabel}</span><code title={libraryPath}>{libraryPath}</code></div>
          <button className="button button--ghost" type="button" onClick={() => void chooseFolder()} disabled={isPicking || isSaving}>{isPicking ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <FolderOpen size={14} aria-hidden="true" />}{copy.choose}</button>
        </div>
        {error && <p className="welcome-view__error" role="alert">{error}</p>}
        <div className="welcome-view__actions">
          <button className="button button--primary" type="button" onClick={() => void importGame()} disabled={isSaving || !libraryPath.trim()}>{isSaving ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <ArrowRight size={15} aria-hidden="true" />}{copy.import}</button>
          <button className="welcome-view__skip" type="button" onClick={() => void save()} disabled={isSaving}>{copy.skip}</button>
        </div>
      </div>
    </section>
  );
}
