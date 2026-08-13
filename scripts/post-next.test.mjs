import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runPostNext } from './post-next.mjs';

function makeTempQueueFile(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-automation-test-'));
  const queuePath = path.join(dir, 'queue.json');
  fs.writeFileSync(queuePath, JSON.stringify(entries, null, 2) + '\n', 'utf8');
  return queuePath;
}

function readQueue(queuePath) {
  return JSON.parse(fs.readFileSync(queuePath, 'utf8'));
}

function baseEntry(overrides) {
  return {
    id: 'slideshow-000',
    status: 'pending',
    topic: 'topic',
    title: 'title',
    caption: 'caption',
    images: ['https://example.com/1.png'],
    created_at: '2026-08-10',
    posted_at: null,
    ...overrides,
  };
}

function fakeZernio({ privacyLevels, createShouldFail } = {}) {
  const creatorInfoCalls = [];
  const createDraftCalls = [];
  return {
    creatorInfoCalls,
    createDraftCalls,
    getCreatorInfo: async (args) => {
      creatorInfoCalls.push(args);
      return {
        creator: { id: 'c1' },
        privacyLevels: privacyLevels || [
          { value: 'PUBLIC_TO_EVERYONE', label: 'Everyone' },
          { value: 'MUTUAL_FOLLOW_FRIENDS', label: 'Friends' },
        ],
        postingLimits: {},
        commercialContentTypes: [],
      };
    },
    createTikTokDraft: async (args) => {
      createDraftCalls.push(args);
      if (createShouldFail && createShouldFail(args)) {
        throw new Error('simulated failure for ' + args.title);
      }
      return { id: 'posted-' + args.title };
    },
  };
}

test('privacy selection prefers PUBLIC_TO_EVERYONE when present', async () => {
  const queuePath = makeTempQueueFile([baseEntry({ id: 's1' })]);
  const zernio = fakeZernio({
    privacyLevels: [
      { value: 'MUTUAL_FOLLOW_FRIENDS', label: 'Friends' },
      { value: 'PUBLIC_TO_EVERYONE', label: 'Everyone' },
    ],
  });

  await runPostNext({
    queuePath,
    env: { ZERNIO_API_KEY: 'k', ZERNIO_TIKTOK_ACCOUNT_ID: 'a', POSTS_PER_RUN: '2' },
    zernio,
  });

  assert.equal(zernio.createDraftCalls.length, 1);
  assert.equal(zernio.createDraftCalls[0].privacyLevel, 'PUBLIC_TO_EVERYONE');
});

test('privacy selection falls back to first allowed level when PUBLIC_TO_EVERYONE absent', async () => {
  const queuePath = makeTempQueueFile([baseEntry({ id: 's1' })]);
  const zernio = fakeZernio({
    privacyLevels: [
      { value: 'MUTUAL_FOLLOW_FRIENDS', label: 'Friends' },
      { value: 'SELF_ONLY', label: 'Only me' },
    ],
  });

  await runPostNext({
    queuePath,
    env: { ZERNIO_API_KEY: 'k', ZERNIO_TIKTOK_ACCOUNT_ID: 'a', POSTS_PER_RUN: '2' },
    zernio,
  });

  assert.equal(zernio.createDraftCalls.length, 1);
  assert.equal(zernio.createDraftCalls[0].privacyLevel, 'MUTUAL_FOLLOW_FRIENDS');
});

test('posts only the first N pending entries', async () => {
  const queuePath = makeTempQueueFile([
    baseEntry({ id: 's1' }),
    baseEntry({ id: 's2' }),
    baseEntry({ id: 's3' }),
  ]);
  const zernio = fakeZernio();

  await runPostNext({
    queuePath,
    env: { ZERNIO_API_KEY: 'k', ZERNIO_TIKTOK_ACCOUNT_ID: 'a', POSTS_PER_RUN: '2' },
    zernio,
  });

  assert.equal(zernio.createDraftCalls.length, 2);
  const queue = readQueue(queuePath);
  assert.equal(queue[0].status, 'posted');
  assert.equal(queue[1].status, 'posted');
  assert.equal(queue[2].status, 'pending');
});

test('marks posted entries with a posted_at timestamp', async () => {
  const queuePath = makeTempQueueFile([baseEntry({ id: 's1' })]);
  const zernio = fakeZernio();

  await runPostNext({
    queuePath,
    env: { ZERNIO_API_KEY: 'k', ZERNIO_TIKTOK_ACCOUNT_ID: 'a', POSTS_PER_RUN: '2' },
    zernio,
  });

  const queue = readQueue(queuePath);
  assert.equal(queue[0].status, 'posted');
  assert.ok(queue[0].posted_at);
  assert.ok(!Number.isNaN(Date.parse(queue[0].posted_at)));
});

test('a failing entry becomes failed while others still post', async () => {
  const queuePath = makeTempQueueFile([
    baseEntry({ id: 's1', title: 'fail-me' }),
    baseEntry({ id: 's2', title: 'succeed' }),
  ]);
  const zernio = fakeZernio({
    createShouldFail: (args) => args.title === 'fail-me',
  });

  const result = await runPostNext({
    queuePath,
    env: { ZERNIO_API_KEY: 'k', ZERNIO_TIKTOK_ACCOUNT_ID: 'a', POSTS_PER_RUN: '2' },
    zernio,
  });

  const queue = readQueue(queuePath);
  assert.equal(queue[0].status, 'failed');
  assert.equal(queue[0].posted_at, null);
  assert.equal(queue[1].status, 'posted');
  assert.ok(queue[1].posted_at);

  assert.deepEqual(result.posted, ['s2']);
  assert.deepEqual(result.failed, ['s1']);
});

test('empty queue results in no zernio calls and clean return', async () => {
  const queuePath = makeTempQueueFile([baseEntry({ id: 's1', status: 'posted' })]);
  const zernio = fakeZernio();

  const result = await runPostNext({
    queuePath,
    env: { ZERNIO_API_KEY: 'k', ZERNIO_TIKTOK_ACCOUNT_ID: 'a', POSTS_PER_RUN: '2' },
    zernio,
  });

  assert.equal(zernio.creatorInfoCalls.length, 0);
  assert.equal(zernio.createDraftCalls.length, 0);
  assert.deepEqual(result.posted, []);
  assert.deepEqual(result.failed, []);
  assert.equal(result.emptyQueue, true);
});

test('queue.json is written back preserving original order and untouched entries', async () => {
  const queuePath = makeTempQueueFile([
    baseEntry({ id: 's1' }),
    baseEntry({ id: 's2', status: 'posted', posted_at: '2026-08-01T00:00:00.000Z' }),
    baseEntry({ id: 's3' }),
  ]);
  const zernio = fakeZernio();

  await runPostNext({
    queuePath,
    env: { ZERNIO_API_KEY: 'k', ZERNIO_TIKTOK_ACCOUNT_ID: 'a', POSTS_PER_RUN: '5' },
    zernio,
  });

  const queue = readQueue(queuePath);
  assert.equal(queue.length, 3);
  assert.equal(queue[0].id, 's1');
  assert.equal(queue[1].id, 's2');
  assert.equal(queue[2].id, 's3');
  // untouched entry stays exactly as-is
  assert.equal(queue[1].status, 'posted');
  assert.equal(queue[1].posted_at, '2026-08-01T00:00:00.000Z');
  // both pending entries got posted since POSTS_PER_RUN=5
  assert.equal(queue[0].status, 'posted');
  assert.equal(queue[2].status, 'posted');

  // file ends with trailing newline and is pretty-printed (2-space indent)
  const raw = fs.readFileSync(queuePath, 'utf8');
  assert.ok(raw.endsWith('\n'));
  assert.ok(raw.includes('  "id"'));
});

test('POSTS_PER_RUN defaults to 2 when not set', async () => {
  const queuePath = makeTempQueueFile([
    baseEntry({ id: 's1' }),
    baseEntry({ id: 's2' }),
    baseEntry({ id: 's3' }),
  ]);
  const zernio = fakeZernio();

  await runPostNext({
    queuePath,
    env: { ZERNIO_API_KEY: 'k', ZERNIO_TIKTOK_ACCOUNT_ID: 'a' },
    zernio,
  });

  assert.equal(zernio.createDraftCalls.length, 2);
});

test('throws when queue.json is missing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-automation-test-'));
  const queuePath = path.join(dir, 'does-not-exist.json');
  const zernio = fakeZernio();

  await assert.rejects(() =>
    runPostNext({
      queuePath,
      env: { ZERNIO_API_KEY: 'k', ZERNIO_TIKTOK_ACCOUNT_ID: 'a' },
      zernio,
    })
  );
});

test('throws when no privacy levels are allowed, and entry is marked failed', async () => {
  const queuePath = makeTempQueueFile([baseEntry({ id: 's1' })]);
  const zernio = fakeZernio({ privacyLevels: [] });

  const result = await runPostNext({
    queuePath,
    env: { ZERNIO_API_KEY: 'k', ZERNIO_TIKTOK_ACCOUNT_ID: 'a', POSTS_PER_RUN: '2' },
    zernio,
  });

  assert.deepEqual(result.failed, ['s1']);
  const queue = readQueue(queuePath);
  assert.equal(queue[0].status, 'failed');
  assert.equal(zernio.createDraftCalls.length, 0);
});

test('sendAlert posts to ALERT_WEBHOOK when set and swallows errors', async () => {
  const queuePath = makeTempQueueFile([baseEntry({ id: 's1', title: 'fail-me' })]);
  const zernio = fakeZernio({ createShouldFail: () => true });

  const alertCalls = [];
  const fetchImpl = async (url, opts) => {
    alertCalls.push({ url, opts });
    throw new Error('network down'); // should be swallowed
  };

  const result = await runPostNext({
    queuePath,
    env: {
      ZERNIO_API_KEY: 'k',
      ZERNIO_TIKTOK_ACCOUNT_ID: 'a',
      POSTS_PER_RUN: '2',
      ALERT_WEBHOOK: 'https://hooks.example.com/alert',
    },
    zernio,
    fetchImpl,
  });

  assert.equal(alertCalls.length, 1);
  assert.equal(alertCalls[0].url, 'https://hooks.example.com/alert');
  const body = JSON.parse(alertCalls[0].opts.body);
  assert.ok(typeof body.content === 'string' && body.content.length > 0);
  assert.deepEqual(result.failed, ['s1']);
});
