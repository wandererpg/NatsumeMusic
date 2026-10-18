// Builds and installs isolated QA packages. Never publishes or updates the user's app.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { build, Platform } = require('electron-builder');
const yaml = require('js-yaml');
const root = process.cwd();
const officialConfig = yaml.load(await fs.readFile(path.join(root, 'electron-builder.yml'), 'utf8'));
const run = path.join(root, '.packaging-tools', `update-smoke-${Date.now()}`);
const install = path.join(run, 'installed');
const data = path.join(run, 'user-data');
const music = path.join(run, 'music');
const entry = path.join(run, 'update-smoke.cjs');
const guid = randomUUID();
// NSIS derives its process and launch name from productName. Isolate both the
// product and executable names so QA cannot close or relaunch the real app.
const executableName = `NatsumeMusicQA-${guid}`;
await fs.mkdir(music, { recursive: true });
await fs.mkdir(data, { recursive: true });

function execute(file, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(file, args, { stdio: 'inherit', windowsHide: true });
    process.once('error', reject);
    process.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)));
  });
}
async function waitForReport(file) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const failure = await fs.readFile(path.join(run, 'failure.json'), 'utf8').catch(() => null);
    if (failure) throw new Error(failure);
    try { return JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${file}`);
}

// A valid 90-second WAV permits testing restoration of an actual seek position.
const pcmBytes = 8000 * 90 * 2;
const wav = Buffer.alloc(44 + pcmBytes);
wav.write('RIFF'); wav.writeUInt32LE(36 + pcmBytes, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(pcmBytes, 40);
await fs.writeFile(path.join(music, 'qa.wav'), wav);

const nextOutput = path.join(run, '0.1.2');
const server = createServer(async (request, response) => {
  try {
    const name = path.basename(new URL(request.url, 'http://localhost').pathname);
    const bytes = await fs.readFile(path.join(nextOutput, name));
    // No range support: exercise the verified full-download fallback.
    response.writeHead(200, { 'Content-Length': bytes.length }); response.end(bytes);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const feed = `http://127.0.0.1:${server.address().port}`;
const settings = { run, install, data, music, feed };

await fs.writeFile(entry, `
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const Database = require('better-sqlite3');
const cfg = ${JSON.stringify(settings)};
app.setPath('userData', cfg.data);
app.setPath('music', cfg.music);
// Separate even the downloaded-installer cache from the real app's updater.
process.env.LOCALAPPDATA = path.join(cfg.run, 'cache');
app.on('browser-window-created', (_event, window) => window.hide());
const updater = require('electron-updater').autoUpdater;
updater.setFeedURL({ provider: 'generic', url: cfg.feed });
updater.on('error', (error) => fs.appendFileSync(path.join(cfg.run, 'errors.txt'), String(error.stack) + '\\n'));
function report(name, value) { fs.writeFileSync(path.join(cfg.run, name + '.json'), JSON.stringify(value, null, 2)); }
app.on('web-contents-created', (_event, contents) => {
  contents.once('did-finish-load', async () => {
    try {
      if (app.getVersion() === '0.1.1') {
        const db = new Database(path.join(cfg.data, 'galmusic.db'));
        db.prepare('INSERT INTO games (id, name) VALUES (?, ?)').run('qa-game', 'Update QA');
        db.prepare('INSERT INTO tracks (id, game_id, file_path, file_name, custom_name, duration, format, file_size, file_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run('qa-track', 'qa-game', path.join(cfg.music, 'qa.wav'), 'qa.wav', 'QA Playback Track', 90, 'wav', ${wav.length}, '${createHash('md5').update(wav).digest('hex')}');
        db.close();
        await contents.executeJavaScript('window.galMusic.setSetting("library_path",' + JSON.stringify(cfg.music) + ')');
        await contents.executeJavaScript('window.galMusic.setSetting("volume","0.35")');
        await contents.executeJavaScript('window.galMusic.setSetting("play_mode","list-loop")');
        const playlist = await contents.executeJavaScript('window.galMusic.createPlaylist("QA retained playlist")');
        await contents.executeJavaScript('window.galMusic.addTrackToPlaylist(' + JSON.stringify(playlist.id) + ', "qa-track")');
        for (let count = 0; count < 100; count++) {
          const state = await contents.executeJavaScript('window.galMusic.getUpdateState()');
          if (state.status === 'available') break;
          if (state.status === 'error') throw new Error(state.message);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        const downloaded = await contents.executeJavaScript('window.galMusic.downloadUpdate()');
        if (downloaded.status !== 'downloaded') throw new Error('Download failed: ' + JSON.stringify(downloaded));
        report('download', downloaded);
        await contents.executeJavaScript('window.galMusic.installUpdate({trackId:"qa-track",currentTime:42})');
      } else {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const result = await contents.executeJavaScript('({settings: null, tracks: null, playlists: null})');
        result.settings = await contents.executeJavaScript('window.galMusic.getSettings()');
        result.tracks = await contents.executeJavaScript('window.galMusic.getTracks({})');
        result.playlists = await contents.executeJavaScript('window.galMusic.getPlaylists()');
        result.version = app.getVersion(); result.installDirectory = path.dirname(app.getPath('exe'));
        result.body = await contents.executeJavaScript('document.body.innerText');
        result.playButton = await contents.executeJavaScript('!!document.querySelector("button[aria-label=播放]")');
        result.seek = await contents.executeJavaScript('document.querySelector("input[aria-label=播放进度]")?.value ?? null');
        const db = new Database(path.join(cfg.data, 'galmusic.db'));
        result.integrity = db.pragma('integrity_check', { simple: true });
        result.snapshot = db.prepare('SELECT value FROM settings WHERE key = ?').get('update_playback_snapshot');
        result.resumePending = db.prepare('SELECT value FROM settings WHERE key = ?').get('update_resume_pending');
        result.playlistTracks = db.prepare('SELECT * FROM playlist_tracks').all();
        db.close();
        result.backups = fs.readdirSync(path.join(cfg.data, 'backups'));
        report('result', result); app.quit();
      }
    } catch (error) { report('failure', { error: error.stack ?? error }); app.quit(); }
  });
});
require('./out/main/index.js');
`);

const baseConfig = {
  ...officialConfig,
  extends: null,
  productName: executableName,
  artifactName: 'NatsumeMusic-${version}-${arch}.${ext}',
  appId: `com.galmusic.updateqa.${guid}`,
  npmRebuild: false,
  compression: 'store',
  // QA packages need no executable icon/resource editing; official packages do.
  win: { ...officialConfig.win, executableName, signAndEditExecutable: false },
  nsis: { ...officialConfig.nsis, guid, createDesktopShortcut: false, createStartMenuShortcut: false, runAfterFinish: false },
  files: ['out/**/*', 'package.json', 'LICENSE*', 'THIRD-PARTY-NOTICES*.md', 'licenses/**/*', { from: run, to: '.', filter: ['update-smoke.cjs'] }],
  publish: { provider: 'generic', url: feed },
};
let installed = false;
try {
  for (const version of ['0.1.1', '0.1.2']) {
    console.log('Building isolated QA version', version);
    const configFile = path.join(run, `builder-${version}.yml`);
    await fs.writeFile(configFile, yaml.dump({ ...baseConfig, directories: { ...officialConfig.directories, output: path.join(run, version) }, extraMetadata: { main: 'update-smoke.cjs', version, name: `natsumemusic-update-qa-${guid}` } }));
    await build({ targets: Platform.WINDOWS.createTarget('nsis'), publish: 'never',
      config: configFile });
  }
  const installer = path.join(run, '0.1.1', 'NatsumeMusic-0.1.1-x64.exe');
  console.log('Installing isolated QA package at', install);
  await execute(installer, ['/S', `/D=${install}`]); installed = true;
  const process = spawn(path.join(install, `${executableName}.exe`), [], { stdio: 'ignore', windowsHide: true });
  process.on('error', (error) => console.error(error));
  const result = await waitForReport(path.join(run, 'result.json'));
  assert.equal(result.version, '0.1.2');
  assert.equal(path.resolve(result.installDirectory), path.resolve(install));
  assert.equal(result.settings.libraryPath, music);
  assert.equal(result.settings.volume, .35);
  assert.equal(result.settings.lastTrackId, 'qa-track');
  assert.equal(result.tracks[0].id, 'qa-track');
  assert.equal(result.playlists[0].name, 'QA retained playlist');
  assert.equal(result.playlistTracks[0].track_id, 'qa-track');
  assert.equal(result.integrity, 'ok');
  assert.equal(result.resumePending.value, 'false');
  assert.ok(result.body.includes('QA Playback Track'));
  assert.ok(result.playButton, 'playback remains paused');
  assert.ok(result.body.includes('0:42'), 'playback position restored');
  assert.ok(result.backups.length >= 2);
  console.log('Update 0.1.1 -> 0.1.2 passed; evidence:', path.join(run, 'result.json'));
} finally {
  await new Promise((resolve) => server.close(resolve));
  if (installed) {
    // Remove only the isolated app registration, preserving QA evidence and data.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await execute(path.join(install, `Uninstall ${executableName}.exe`), ['/S']);
  }
}
