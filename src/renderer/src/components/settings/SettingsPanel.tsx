import { useEffect, useState } from 'react';
import { FolderOpen, ImagePlus, LoaderCircle, Save, Trash2, X } from 'lucide-react';

import type { AppSettings, BackgroundSettings, PlayMode, ThemeId } from '../../../../shared/types';
import { getTheme, THEMES } from '../../theme/themes';

export interface AppearanceDraft {
  themeId: ThemeId;
  background: BackgroundSettings;
  fontColor: string | null;
}

export interface SettingsChanges extends AppearanceDraft {
  libraryPath: string;
  volume: number;
  playMode: PlayMode;
}

export interface SettingsPanelProps {
  settings: AppSettings;
  onClose: () => void;
  onSelectFolder?: () => Promise<string | null>;
  onSelectBackground?: () => Promise<string | null>;
  onAppearancePreview?: (appearance: AppearanceDraft) => void;
  onCancelAppearancePreview?: () => Promise<void> | void;
  onSave: (changes: SettingsChanges) => Promise<void> | void;
}

const modeOptions: Array<{ value: PlayMode; label: string }> = [
  { value: 'list-loop', label: '列表循环' },
  { value: 'sequential', label: '顺序播放' },
  { value: 'random', label: '随机播放' },
  { value: 'single-loop', label: '单曲循环' },
];

export function SettingsPanel({ settings, onClose, onSelectFolder, onSelectBackground, onAppearancePreview, onCancelAppearancePreview, onSave }: SettingsPanelProps) {
  const [libraryPath, setLibraryPath] = useState(settings.libraryPath);
  const [volume, setVolume] = useState(settings.volume);
  const [playMode, setPlayMode] = useState<PlayMode>(settings.playMode);
  const [themeId, setThemeId] = useState<ThemeId>(settings.themeId);
  const [background, setBackground] = useState<BackgroundSettings>(settings.background);
  const [fontColor, setFontColor] = useState<string | null>(settings.fontColor ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLibraryPath(settings.libraryPath);
    setVolume(settings.volume);
    setPlayMode(settings.playMode);
    setThemeId(settings.themeId);
    setBackground(settings.background);
    setFontColor(settings.fontColor ?? null);
  }, [settings]);

  const previewAppearance = (nextThemeId: ThemeId, nextBackground: BackgroundSettings, nextFontColor = fontColor) => {
    setThemeId(nextThemeId);
    setBackground(nextBackground);
    setFontColor(nextFontColor);
    onAppearancePreview?.({ themeId: nextThemeId, background: nextBackground, fontColor: nextFontColor });
  };

  const chooseBackground = async () => {
    if (!onSelectBackground) return;
    setIsPicking(true);
    setError(null);
    try {
      const selected = await onSelectBackground();
      if (selected) previewAppearance(themeId, { ...background, imagePath: selected });
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : '无法选择背景图片。');
    } finally {
      setIsPicking(false);
    }
  };

  const changeBackground = (key: keyof Omit<BackgroundSettings, 'imagePath'>, value: number) => {
    previewAppearance(themeId, { ...background, [key]: value });
  };

  const cancel = async () => {
    if (isSaving || isCancelling) return;
    setIsCancelling(true);
    try {
      await onCancelAppearancePreview?.();
      onAppearancePreview?.({ themeId: settings.themeId, background: settings.background, fontColor: settings.fontColor ?? null });
      onClose();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : '无法取消外观预览。');
    } finally {
      setIsCancelling(false);
    }
  };

  const chooseFolder = async () => {
    if (!onSelectFolder) return;
    setIsPicking(true);
    try {
      const selected = await onSelectFolder();
      if (selected) setLibraryPath(selected);
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : '无法选择文件夹。');
    } finally {
      setIsPicking(false);
    }
  };

  const save = async () => {
    if (isSaving || isCancelling) return;
    if (!libraryPath.trim()) {
      setError('\u8bf7\u5148\u9009\u62e9\u97f3\u4e50\u5e93\u76ee\u5f55\u3002');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSave({ libraryPath: libraryPath.trim(), volume, playMode, themeId, background, fontColor });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '设置保存失败。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" data-testid="settings-panel">
        <header className="settings-panel__header"><div><p className="eyebrow">PREFERENCES</p><h2 id="settings-title">设置</h2></div><button className="icon-button" type="button" aria-label="关闭设置" onClick={() => void cancel()} disabled={isSaving || isCancelling}><X size={18} aria-hidden="true" /></button></header>
        <div className="settings-panel__body">
          <label className="settings-field"><span>音乐库位置</span><div className="settings-field__path"><input value={libraryPath} onChange={(event) => setLibraryPath(event.target.value)} aria-label="音乐库位置" /><button className="button button--ghost" type="button" onClick={() => void chooseFolder()} disabled={isPicking || isSaving}>{isPicking ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <FolderOpen size={14} aria-hidden="true" />}浏览</button></div></label>
          <label className="settings-field"><span>默认音量 <strong>{Math.round(volume * 100)}%</strong></span><input className="settings-range" type="range" min={0} max={1} step={0.01} value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="默认音量" /></label>
          <label className="settings-field"><span>播放模式</span><select value={playMode} onChange={(event) => setPlayMode(event.target.value as PlayMode)} aria-label="播放模式">{modeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <section className="appearance-settings" aria-labelledby="appearance-title">
            <div className="settings-section-heading"><div><p className="eyebrow">APPEARANCE</p><h3 id="appearance-title">软件外观</h3></div></div>
            <div className="theme-grid" role="radiogroup" aria-label="软件主题">
              {THEMES.map((theme) => (
                <label
                  key={theme.id}
                  className={`theme-card${themeId === theme.id ? ' is-selected' : ''}`}
                  data-card-theme={theme.id}
                >
                  <input className="sr-only" type="radio" name="galmusic-theme" value={theme.id} checked={themeId === theme.id} onChange={() => previewAppearance(theme.id, background, fontColor)} aria-label={theme.name} />
                  <strong className="theme-card__name">{theme.name}</strong>
                  <span className="theme-card__check" aria-hidden="true">✓</span>
                </label>
              ))}
            </div>
            <div className="font-color-settings">
              <label className="font-color-settings__control">
                <span>主要文字颜色</span>
                <input type="color" value={fontColor ?? getTheme(themeId).primaryTextColor} onChange={(event) => previewAppearance(themeId, background, event.target.value)} aria-label="主要文字颜色" />
              </label>
              <button className="button button--ghost" type="button" onClick={() => previewAppearance(themeId, background, null)} disabled={isSaving || isCancelling}>恢复主题颜色</button>
            </div>
            <div className="background-settings">
              <div className="background-settings__heading"><div><strong>全局自定义背景</strong><small>{background.imagePath ?? '当前使用主题自带背景'}</small></div><div><button className="button button--ghost" type="button" onClick={() => void chooseBackground()} disabled={!onSelectBackground || isPicking || isSaving}>{isPicking ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <ImagePlus size={14} aria-hidden="true" />}导入背景图片</button>{background.imagePath && <button className="icon-button" type="button" aria-label="移除背景图片" onClick={() => previewAppearance(themeId, { ...background, imagePath: null })}><Trash2 size={15} aria-hidden="true" /></button>}</div></div>
              <div className="background-sliders">
                <label><span>背景模糊度 <strong>{background.blur}px</strong></span><input type="range" min={0} max={40} step={1} value={background.blur} onChange={(event) => changeBackground('blur', Number(event.target.value))} aria-label="背景模糊度" /></label>
                <label><span>遮罩强度 <strong>{Math.round(background.dim * 100)}%</strong></span><input type="range" min={0} max={0.85} step={0.01} value={background.dim} onChange={(event) => changeBackground('dim', Number(event.target.value))} aria-label="背景遮罩强度" /></label>
                <label><span>图片缩放 <strong>{background.scale}%</strong></span><input type="range" min={100} max={180} step={1} value={background.scale} onChange={(event) => changeBackground('scale', Number(event.target.value))} aria-label="背景图片缩放" /></label>
                <label><span>水平焦点 <strong>{background.positionX}%</strong></span><input type="range" min={0} max={100} step={1} value={background.positionX} onChange={(event) => changeBackground('positionX', Number(event.target.value))} aria-label="背景水平焦点" /></label>
                <label><span>垂直焦点 <strong>{background.positionY}%</strong></span><input type="range" min={0} max={100} step={1} value={background.positionY} onChange={(event) => changeBackground('positionY', Number(event.target.value))} aria-label="背景垂直焦点" /></label>
              </div>
            </div>
          </section>
          {error && <p className="settings-panel__error" role="alert">{error}</p>}
        </div>
        <footer className="settings-panel__footer"><button className="button button--ghost" type="button" onClick={() => void cancel()} disabled={isSaving || isCancelling}>{isCancelling ? '正在取消…' : '取消'}</button><button className="button button--primary" type="button" onClick={() => void save()} disabled={isSaving || isCancelling}>{isSaving ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}保存设置</button></footer>
      </section>
    </div>
  );
}
