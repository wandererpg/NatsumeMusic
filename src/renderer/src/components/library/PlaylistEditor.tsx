import { ListPlus, X } from 'lucide-react';
import { useState } from 'react';

export interface PlaylistEditorProps {
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}

export function PlaylistEditor({ onClose, onSave }: PlaylistEditorProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      setError('播放列表名称不能为空');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(name.trim());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="playlist-editor-title" data-testid="playlist-editor">
        <header className="settings-panel__header">
          <div><p className="eyebrow">PLAYLIST</p><h2 id="playlist-editor-title">新建播放列表</h2></div>
          <button className="icon-button" type="button" aria-label="关闭" onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="settings-panel__body">
          <label className="settings-field">
            <span>列表名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} autoFocus placeholder="例如：深夜氛围" />
          </label>
          {error && <p className="settings-panel__error" role="alert">{error}</p>}
        </div>
        <footer className="settings-panel__footer">
          <button className="button button--ghost" type="button" onClick={onClose}>取消</button>
          <button className="button button--primary" type="button" disabled={saving} onClick={() => void save()}><ListPlus size={15} aria-hidden="true" />{saving ? '创建中…' : '创建列表'}</button>
        </footer>
      </section>
    </div>
  );
}
