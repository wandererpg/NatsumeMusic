/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ScanProgress } from '../../src/renderer/src/components/scanner/ScanProgress';
import { ScanDialog } from '../../src/renderer/src/components/scanner/ScanDialog';
import { SettingsPanel } from '../../src/renderer/src/components/settings/SettingsPanel';
import { Welcome } from '../../src/renderer/src/components/settings/Welcome';
import { THEMES } from '../../src/renderer/src/theme/themes';

describe('scan and settings surfaces', () => {
  afterEach(() => cleanup());
  it('keeps voice import off by default and submits the explicit option', async () => {
    const startScan = vi.fn().mockResolvedValue('scan-voice');
    window.galMusic = {
      selectFolder: vi.fn().mockResolvedValue('C:/Games/ATRI'),
      getSettings: vi.fn().mockResolvedValue({
        libraryPath: 'C:/Music/GalMusic', volume: 0.8, playMode: 'list-loop',
        lastTrackId: null, voiceThresholdSeconds: 18.5,
      }),
      setSetting: vi.fn().mockResolvedValue(undefined),
      startScan,
      onScanProgress: vi.fn().mockReturnValue(() => undefined),
      onScanResult: vi.fn().mockReturnValue(() => undefined),
    } as unknown as typeof window.galMusic;
    render(<ScanDialog onClose={vi.fn()} />);

    const threshold = await screen.findByRole('spinbutton', { name: /语音时长阈值/ });
    expect(threshold).toHaveValue(18.5);
    fireEvent.change(threshold, { target: { value: '12.5' } });
    const checkbox = await screen.findByRole('checkbox', { name: /导入语音/ });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /开始导入/ }));

    await waitFor(() => expect(startScan).toHaveBeenCalledWith({
      sourcePath: 'C:/Games/ATRI',
      gameName: 'ATRI',
      deepScan: true,
      includeVoice: true,
      voiceThresholdSeconds: 12.5,
    }));
    expect(window.galMusic.setSetting).toHaveBeenCalledWith('voice_threshold_seconds', '12.5');
  });

  it('explains SM2MPX music containers and keeps music-only import defaults', async () => {
    window.galMusic = {
      selectFolder: vi.fn().mockResolvedValue('D:/BaiduNetdiskDownload/h/家族計画 ～追憶～'),
      getSettings: vi.fn().mockResolvedValue({
        libraryPath: 'C:/Music/GalMusic', volume: 0.8, playMode: 'list-loop',
        lastTrackId: null, voiceThresholdSeconds: 25,
      }),
      startScan: vi.fn(),
      onScanProgress: vi.fn().mockReturnValue(() => undefined),
      onScanResult: vi.fn().mockReturnValue(() => undefined),
    } as unknown as typeof window.galMusic;

    render(<ScanDialog onClose={vi.fn()} />);

    expect(await screen.findByText(/SM2MPX.*WMSC/)).toBeInTheDocument();
    expect(await screen.findByRole('checkbox', { name: /导入语音/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /深度扫描归档/ })).toBeChecked();
  });

  it.each(['', '0', '60.1'])('rejects invalid voice threshold %s', async (value) => {
    const startScan = vi.fn();
    const setSetting = vi.fn();
    window.galMusic = {
      selectFolder: vi.fn().mockResolvedValue('C:/Games/ATRI'),
      getSettings: vi.fn().mockResolvedValue({
        libraryPath: '', volume: 0.8, playMode: 'list-loop', lastTrackId: null, voiceThresholdSeconds: 25,
      }),
      setSetting,
      startScan,
      onScanProgress: vi.fn().mockReturnValue(() => undefined),
      onScanResult: vi.fn().mockReturnValue(() => undefined),
    } as unknown as typeof window.galMusic;
    render(<ScanDialog onClose={vi.fn()} />);
    const input = await screen.findByRole('spinbutton', { name: /语音时长阈值/ });
    fireEvent.change(input, { target: { value } });
    expect(screen.getByRole('button', { name: /开始导入/ })).toBeDisabled();
    expect(screen.getByText(/1.*60/)).toBeInTheDocument();
    expect(setSetting).not.toHaveBeenCalled();
    expect(startScan).not.toHaveBeenCalled();
  });

  it('does not start import when saving the welcome path fails', async () => {
    const onImport = vi.fn();
    const onSavePath = vi.fn().mockRejectedValue(new Error('path unavailable'));
    render(<Welcome onSavePath={onSavePath} onImport={onImport} defaultPath="C:/Music/GalMusic" />);

    fireEvent.click(screen.getByRole('button', { name: /导入游戏音乐/i }));
    await waitFor(() => expect(onSavePath).toHaveBeenCalledWith('C:/Music/GalMusic'));
    expect(onImport).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('path unavailable');
  });

  it('renders phase progress with an accessible value', () => {
    render(<ScanProgress progress={{ phase: 'copying', current: 3, total: 4, currentFile: 'C:/source/theme.ogg' }} />);
    expect(screen.getByTestId('scan-progress')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
    expect(screen.getByText(/source\\theme\.ogg|source\/theme\.ogg/)).toBeInTheDocument();
  });

  it.each([
    ['metadata', '正在获取游戏资料'],
    ['cover', '正在下载游戏封面'],
  ] as const)('labels the %s enrichment phase', (phase, label) => {
    render(<ScanProgress progress={{ phase, current: 1, total: 1, currentFile: 'ATRI' }} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('removes explanatory copy from the settings chrome', () => {
    render(<SettingsPanel settings={{
      libraryPath: 'C:/Music/GalMusic', volume: 0.8, playMode: 'list-loop', lastTrackId: null, voiceThresholdSeconds: 25,
      themeId: 'rain-afterglow', background: { imagePath: null, blur: 12, dim: 0.42, scale: 100, positionX: 50, positionY: 50 },
    }} onClose={vi.fn()} onSave={vi.fn()} />);

    expect(screen.queryByText(/导入文件会复制到这里/)).not.toBeInTheDocument();
    expect(screen.queryByText('即时预览')).not.toBeInTheDocument();
  });

  it('persists the settings panel values', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const appearance = {
      themeId: 'rain-afterglow' as const,
      fontColor: null,
      background: { imagePath: null, blur: 12, dim: 0.42, scale: 100, positionX: 50, positionY: 50 },
    };
    render(
      <SettingsPanel
        settings={{ libraryPath: 'C:/Music/GalMusic', volume: 0.8, playMode: 'list-loop', lastTrackId: null, voiceThresholdSeconds: 25, ...appearance }}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByRole('slider', { name: /默认音量/ }), { target: { value: '0.45' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'random' } });
    fireEvent.click(screen.getByRole('button', { name: /保存设置/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ libraryPath: 'C:/Music/GalMusic', volume: 0.45, playMode: 'random', ...appearance }));
  });

  it('previews, resets, and saves one global primary font color', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onAppearancePreview = vi.fn();
    render(
      <SettingsPanel
        settings={{
          libraryPath: 'C:/Music/GalMusic', volume: 0.8, playMode: 'list-loop', lastTrackId: null, voiceThresholdSeconds: 25,
          themeId: 'rain-afterglow', fontColor: null,
          background: { imagePath: null, blur: 12, dim: 0.42, scale: 100, positionX: 50, positionY: 50 },
        }}
        onClose={vi.fn()}
        onSave={onSave}
        onAppearancePreview={onAppearancePreview}
      />,
    );

    fireEvent.change(screen.getByLabelText('主要文字颜色'), { target: { value: '#ff77aa' } });
    expect(onAppearancePreview).toHaveBeenLastCalledWith(expect.objectContaining({ fontColor: '#ff77aa' }));
    fireEvent.click(screen.getByRole('button', { name: '恢复主题颜色' }));
    expect(onAppearancePreview).toHaveBeenLastCalledWith(expect.objectContaining({ fontColor: null }));
    fireEvent.click(screen.getByRole('button', { name: /保存设置/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ fontColor: null })));
  });

  it('previews and saves a theme with one global custom background', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onAppearancePreview = vi.fn();
    const onSelectBackground = vi.fn().mockResolvedValue('D:/Pictures/scene.png');
    render(
      <SettingsPanel
        settings={{
          libraryPath: 'C:/Music/GalMusic', volume: 0.8, playMode: 'list-loop', lastTrackId: null, voiceThresholdSeconds: 25,
          themeId: 'rain-afterglow',
          background: { imagePath: null, blur: 12, dim: 0.42, scale: 100, positionX: 50, positionY: 50 },
        }}
        onClose={vi.fn()}
        onSave={onSave}
        onSelectBackground={onSelectBackground}
        onAppearancePreview={onAppearancePreview}
      />,
    );

    expect(screen.queryByRole('radio', { name: /月白樱纸/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /霓虹终端/ }));
    expect(onAppearancePreview).toHaveBeenLastCalledWith(expect.objectContaining({ themeId: 'neon-terminal' }));

    fireEvent.click(screen.getByRole('button', { name: /导入背景图片/ }));
    await waitFor(() => expect(onSelectBackground).toHaveBeenCalled());
    expect(onAppearancePreview).toHaveBeenLastCalledWith(expect.objectContaining({
      background: expect.objectContaining({ imagePath: 'D:/Pictures/scene.png' }),
    }));

    fireEvent.change(screen.getByRole('slider', { name: /背景模糊度/ }), { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: /保存设置/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      themeId: 'neon-terminal',
      background: { imagePath: 'D:/Pictures/scene.png', blur: 18, dim: 0.42, scale: 100, positionX: 50, positionY: 50 },
    })));
  });

  it('renders immersive theme cards without codes, descriptions, or swatches', () => {
    const { container } = render(
      <SettingsPanel
        settings={{
          libraryPath: 'C:/Music/GalMusic', volume: 0.8, playMode: 'list-loop', lastTrackId: null, voiceThresholdSeconds: 25,
          themeId: 'rain-afterglow',
          background: { imagePath: null, blur: 12, dim: 0.42, scale: 100, positionX: 50, positionY: 50 },
        }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    const grid = screen.getByRole('radiogroup', { name: '软件主题' });

    expect(grid).not.toHaveTextContent('A ·');
    expect(grid).not.toHaveTextContent('雨后青绿玻璃');
    expect(container.querySelector('.theme-card__preview')).not.toBeInTheDocument();
    expect(container.querySelector('.theme-card__swatches')).not.toBeInTheDocument();
    for (const theme of THEMES) {
      const radio = screen.getByRole('radio', { name: theme.name });
      const card = radio.closest('label');
      expect(card).toHaveAttribute('data-card-theme', theme.id);
      expect(card?.querySelectorAll('.theme-card__name')).toHaveLength(1);
      expect(card?.querySelector('.theme-card__name')).toHaveTextContent(theme.name);
      expect(card?.querySelectorAll('.theme-card__check')).toHaveLength(1);
    }
  });

  it('locks close and cancel while an atomic settings save is pending', async () => {
    let finishSave!: () => void;
    const onSave = vi.fn(() => new Promise<void>((resolve) => { finishSave = resolve; }));
    const onClose = vi.fn();
    render(<SettingsPanel settings={{
      libraryPath: 'C:/Music/GalMusic', volume: 0.8, playMode: 'list-loop', lastTrackId: null, voiceThresholdSeconds: 25,
      themeId: 'rain-afterglow', background: { imagePath: null, blur: 12, dim: 0.42, scale: 100, positionX: 50, positionY: 50 },
    }} onClose={onClose} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /保存设置/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: /取消/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /关闭设置/ })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    finishSave();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});
