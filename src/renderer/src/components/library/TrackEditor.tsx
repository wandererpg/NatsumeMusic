import { Save, X } from 'lucide-react';
import { useState } from 'react';

import type { Track } from '../../../../shared/types';

export interface TrackEditorProps {
  track: Track;
  onClose: () => void;
  onSave: (customName: string | null) => Promise<void>;
}

export function TrackEditor({ track, onClose, onSave }: TrackEditorProps) {
  const [name, setName] = useState(track.customName ?? track.displayName.replace(/\.[^.]+$/, ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(name.trim() || null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="track-editor-title" data-testid="track-editor">
        <header className="settings-panel__header">
          <div><p className="eyebrow">SONG TITLE</p><h2 id="track-editor-title">修改歌曲名称</h2></div>
          <button className="icon-button" type="button" aria-label="关闭" onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="settings-panel__body">
          <label className="settings-field">
            <span>歌曲名称</span>
            <input value={name} placeholder={track.fileName} onChange={(event) => setName(event.target.value)} autoFocus />
            <small>优先使用音频标签、CUE 或 M3U 中的原曲名；这里的修改只影响音乐库显示，不改动音频文件。</small>
          </label>
          <div className="track-editor__source"><span>原文件</span><code>{track.fileName}</code></div>
          {error && <p className="settings-panel__error" role="alert">{error}</p>}
        </div>
        <footer className="settings-panel__footer">
          <button className="button button--ghost" type="button" onClick={onClose}>取消</button>
          <button className="button button--primary" type="button" disabled={saving} onClick={() => void save()}><Save size={15} aria-hidden="true" />保存</button>
        </footer>
      </section>
    </div>
  );
}
