// Packaged, isolated smoke check: selecting existing songs, playback and restart.
// No real user library, installation or release publication is touched.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { build, Platform } = require('electron-builder');
const yaml = require('js-yaml');
const root = process.cwd();
const config = yaml.load(await fs.readFile(path.join(root, 'electron-builder.yml'), 'utf8'));
const run = path.join(root, '.packaging-tools', `library-smoke-${Date.now()}`);
const directory = path.join(run, 'existing-songs');
const album = path.join(directory, 'ATRI', '音乐');
await fs.mkdir(album, { recursive: true });
await fs.mkdir(path.join(run, 'data'));
await fs.mkdir(path.join(run, 'default-music'));
const wav = Buffer.alloc(44 + 8000 * 30 * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const song = path.join(album, 'theme.wav');
await fs.writeFile(song, wav);
await fs.writeFile(path.join(album, 'game.exe'), 'QA program');
await fs.writeFile(path.join(album, 'save.dat'), 'QA save');
const entry = path.join(run, 'library-smoke.cjs');
await fs.writeFile(entry, `
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const cfg = ${JSON.stringify({ run, directory, song })};
app.setPath('userData', path.join(cfg.run, 'data'));
app.setPath('music', path.join(cfg.run, 'default-music'));
app.on('browser-window-created', (_event, window) => window.hide());
app.on('web-contents-created', (_event, contents) => contents.once('did-finish-load', async () => {
  try {
    const restarted = fs.existsSync(path.join(cfg.run, 'first.json'));
    const evaluate = code => contents.executeJavaScript(code, true);
    if (!restarted) {
      await evaluate('(async()=>{const s=await window.galMusic.getSettings();return window.galMusic.saveSettings({volume:s.volume,playMode:s.playMode,themeId:s.themeId,background:s.background,fontColor:s.fontColor??null,libraryPath:' + JSON.stringify(cfg.directory) + '})})()');
    }
    const tracks = await evaluate('window.galMusic.getTracks({})');
    if (tracks.length !== 1 || tracks[0].filePath !== cfg.song) throw new Error('Incorrect selected library index');
    if (!restarted) {
      await evaluate('window.galMusic.updateTrack(' + JSON.stringify(tracks[0].id) + ',{isFavorite:true})');
      const playlist = await evaluate('window.galMusic.createPlaylist("Retained songs")');
      await evaluate('window.galMusic.addTrackToPlaylist(' + JSON.stringify(playlist.id) + ',' + JSON.stringify(tracks[0].id) + ')');
    }
    const audio = await evaluate('(async()=>{const a=new Audio(' + JSON.stringify('galmusic-audio://local?path=' + encodeURIComponent(cfg.song)) + ');a.volume=0;document.body.append(a);await Promise.race([a.play(),new Promise((_,reject)=>setTimeout(()=>reject(new Error("audio timeout")),10000))]);await new Promise(r=>setTimeout(r,400));const result={duration:a.duration,currentTime:a.currentTime};a.pause();a.remove();return result})()');
    const report = { tracks: await evaluate('window.galMusic.getTracks({})'), games: await evaluate('window.galMusic.getGames()'), playlists: await evaluate('window.galMusic.getPlaylists()'), audio };
    fs.writeFileSync(path.join(cfg.run, restarted ? 'restart.json' : 'first.json'), JSON.stringify(report, null, 2));
    app.quit();
  } catch(error) { fs.writeFileSync(path.join(cfg.run, 'failure.json'), JSON.stringify({error:error.stack??error})); app.quit(); }
}));
require('./out/main/index.js');
`);
const configFile = path.join(run, 'builder.yml');
await fs.writeFile(configFile, yaml.dump({
  ...config, extends: null, appId: `com.galmusic.libraryqa.${randomUUID()}`, npmRebuild: false,
  win: { ...config.win, signAndEditExecutable: false },
  directories: { ...config.directories, output: path.join(run, 'package') },
  files: [...config.files, { from: run, to: '.', filter: ['library-smoke.cjs'] }],
  extraMetadata: { main: 'library-smoke.cjs' },
}));
await build({ targets: Platform.WINDOWS.createTarget('dir'), publish: 'never', config: configFile });
const executable = path.join(run, 'package', 'win-unpacked', 'NatsumeMusic.exe');
async function launch(reportName) {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, [], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: environment });
  child.stdout.on('data', bytes => process.stdout.write(bytes));
  child.stderr.on('data', bytes => process.stderr.write(bytes));
  const closed = new Promise(resolve => { child.once('error', resolve); child.once('exit', resolve); });
  try {
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      const failure = await fs.readFile(path.join(run, 'failure.json'), 'utf8').catch(() => null);
      if (failure) throw new Error(failure);
      const report = await fs.readFile(path.join(run, reportName), 'utf8').catch(() => null);
      if (report) { await closed; return JSON.parse(report); }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    throw new Error('Timed out waiting for packaged library smoke check');
  } finally { if (child.exitCode === null) child.kill(); }
}
const first = await launch('first.json');
const restart = await launch('restart.json');
assert.equal(first.tracks[0].id, restart.tracks[0].id);
assert.equal(restart.tracks[0].isFavorite, true);
assert.equal(restart.games[0].name, 'ATRI');
assert.equal(restart.playlists[0].trackCount, 1);
for (const report of [first, restart]) { assert.equal(report.audio.duration, 30); assert.ok(report.audio.currentTime > 0); }
assert.deepEqual(await fs.readFile(song), wav);
assert.deepEqual((await fs.readdir(album)).sort(), ['game.exe', 'save.dat', 'theme.wav']);
await fs.writeFile(path.join(run, 'verification.json'), JSON.stringify({ verified: true, version: JSON.parse(await fs.readFile('package.json')).version, first, restart }, null, 2));
console.log('Packaged library directory / playback / restart verified:', path.join(run, 'verification.json'));
