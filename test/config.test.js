import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/config.js';

const ok = {
  botsDir: '/w/prodev/bots',
  projectsDir: '/w/projects',
  uploadsDir: '/d/uploads',
  dataDir: '/d',
};
const always = { exists: () => true, writable: () => true, platform: 'darwin' };

test('경로에 공백이 있으면 키 이름과 함께 거절한다', () => {
  const { errors } = validateConfig({ ...ok, projectsDir: '/w/my projects' }, always);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].key, 'projectsDir');
  assert.match(errors[0].reason, /공백/);
});

test('상대 경로를 거절한다', () => {
  const { errors } = validateConfig({ ...ok, dataDir: 'data' }, always);
  assert.deepEqual(errors.map(e => e.key), ['dataDir']);
  assert.match(errors[0].reason, /절대 경로/);
});

test('윈도우에서 claudePath 가 없으면 거절한다', () => {
  const win = { ...always, platform: 'win32' };
  const paths = { botsDir: 'C:/w/bots', projectsDir: 'C:/w/projects', uploadsDir: 'C:/d/uploads', dataDir: 'C:/d' };
  const { errors } = validateConfig(paths, win);
  assert.deepEqual(errors.map(e => e.key), ['claudePath']);
  assert.equal(validateConfig({ ...paths, claudePath: 'C:/u/claude.exe' }, win).errors.length, 0);
  // 맥에서는 없어도 된다 — SDK 동봉 CLI 를 쓴다
  assert.equal(validateConfig(ok, always).errors.length, 0);
});

test('maxSessions 기본값은 3', () => {
  const { config, errors } = validateConfig(ok, always);
  assert.equal(errors.length, 0);
  assert.equal(config.maxSessions, 3);
  assert.equal(config.approvalTimeoutMin, 10);
  assert.equal(config.host, '127.0.0.1');
});

test('없는 경로와 쓸 수 없는 데이터 폴더를 거절한다', () => {
  const { errors } = validateConfig(ok, { platform: 'darwin', exists: p => p !== '/w/prodev/bots', writable: p => p !== '/d' });
  assert.deepEqual(errors.map(e => e.key).sort(), ['botsDir', 'dataDir']);
});

test('prodevDir 가 없으면 botsDir 의 부모로 본다', () => {
  const { config, errors } = validateConfig(ok, always);
  assert.equal(errors.length, 0);
  assert.equal(config.prodevDir, '/w/prodev');
  assert.equal(config.prodevDirDerived, true);
});

test('botsDir 가 <prodevDir>/bots 가 아니면 키 이름과 함께 거절한다', () => {
  const bad = validateConfig({ ...ok, prodevDir: '/w/other' }, always);
  assert.deepEqual(bad.errors.map(e => e.key), ['botsDir']);
  assert.match(bad.errors[0].reason, /<prodevDir>\/bots/);
  const good = validateConfig({ ...ok, prodevDir: '/w/prodev' }, always);
  assert.equal(good.errors.length, 0);
  assert.equal(good.config.prodevDirDerived, false);
  // prodevDir 도 경로 검사를 받는다
  assert.deepEqual(validateConfig({ ...ok, prodevDir: 'prodev' }, always).errors.map(e => e.key), ['prodevDir']);
});
