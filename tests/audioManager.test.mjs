import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
};

const audioInstances = [];
globalThis.Audio = class FakeAudio {
  constructor(src) {
    this.src = src;
    this.paused = true;
    this.currentTime = 0;
    this.playCount = 0;
    audioInstances.push(this);
  }

  play() {
    this.paused = false;
    this.playCount += 1;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }
};

const { bgmManager } = await import('../src/utils/audioManager.js');

test('same BGM keeps the current audio instance and resumes it when paused', async () => {
  await bgmManager.play('main.mp3');
  const audio = bgmManager.currentBgm;

  assert.equal(audioInstances.length, 1);
  assert.equal(audio.preload, 'auto');
  assert.equal(audio.loop, true);
  assert.equal(audio.playCount, 1);

  await bgmManager.play('main.mp3');
  assert.equal(audioInstances.length, 1);
  assert.equal(audio.playCount, 1);

  audio.pause();
  await bgmManager.play('main.mp3');
  assert.equal(audioInstances.length, 1);
  assert.equal(audio.playCount, 2);

  bgmManager.stop();
});

test('switching BGM stops the previous audio and starts the requested track', async () => {
  await bgmManager.play('main.mp3');
  const previous = bgmManager.currentBgm;

  await bgmManager.play('battle.mp3');

  assert.equal(previous.paused, true);
  assert.equal(bgmManager.currentFileName, 'battle.mp3');
  assert.equal(bgmManager.currentBgm.src, '/audio/battle.mp3');
  assert.equal(bgmManager.currentBgm.paused, false);

  bgmManager.stop();
});
