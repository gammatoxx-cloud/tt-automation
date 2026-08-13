import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promote } from './promote.mjs';

function makeTempRepo() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-automation-promote-test-'));
  return cwd;
}

function writeConfig(cwd, overrides) {
  const config = { repo: 'gammatoxx-cloud/tt-automation', ...overrides };
  fs.writeFileSync(path.join(cwd, 'batch.config.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
}

function writeStaging(cwd, id, { draft, images } = {}) {
  const dir = path.join(cwd, 'staging', id);
  fs.mkdirSync(dir, { recursive: true });
  if (draft !== null) {
    fs.writeFileSync(
      path.join(dir, 'draft.json'),
      JSON.stringify(draft || { title: 'Title', caption: 'Caption', topic: 'Topic' }, null, 2) + '\n',
      'utf8'
    );
  }
  for (const name of images || []) {
    fs.writeFileSync(path.join(dir, name), `fake image data for ${name}`, 'utf8');
  }
  return dir;
}

function readQueue(cwd) {
  return JSON.parse(fs.readFileSync(path.join(cwd, 'queue.json'), 'utf8'));
}

function fakeGit({ pushShouldFail, hasUpstream = true } = {}) {
  const calls = [];
  return {
    calls,
    add: async (args) => {
      calls.push({ op: 'add', args });
    },
    commit: async (args) => {
      calls.push({ op: 'commit', args });
    },
    hasUpstream: async () => hasUpstream,
    push: async () => {
      calls.push({ op: 'push' });
      if (pushShouldFail) {
        throw new Error('simulated push failure');
      }
    },
  };
}

test('happy path: promotes staging with draft.json + 3 images', async () => {
  const cwd = makeTempRepo();
  writeConfig(cwd);
  writeStaging(cwd, 'slideshow-042', {
    draft: { title: 'My Title', caption: 'My Caption', topic: 'My Topic' },
    images: ['1.png', '2.png', '3.png'],
  });
  const git = fakeGit();

  const result = await promote('slideshow-042', { cwd, git });

  // slides dir created with clean sequence
  const slidesDir = path.join(cwd, 'slides', 'slideshow-042');
  assert.ok(fs.existsSync(path.join(slidesDir, '1.png')));
  assert.ok(fs.existsSync(path.join(slidesDir, '2.png')));
  assert.ok(fs.existsSync(path.join(slidesDir, '3.png')));

  // queue.json entry shape
  const queue = readQueue(cwd);
  assert.equal(queue.length, 1);
  const entry = queue[0];
  assert.equal(entry.id, 'slideshow-042');
  assert.equal(entry.status, 'pending');
  assert.equal(entry.topic, 'My Topic');
  assert.equal(entry.title, 'My Title');
  assert.equal(entry.caption, 'My Caption');
  assert.deepEqual(entry.images, [
    'https://raw.githubusercontent.com/gammatoxx-cloud/tt-automation/main/slides/slideshow-042/1.png',
    'https://raw.githubusercontent.com/gammatoxx-cloud/tt-automation/main/slides/slideshow-042/2.png',
    'https://raw.githubusercontent.com/gammatoxx-cloud/tt-automation/main/slides/slideshow-042/3.png',
  ]);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(entry.created_at));
  assert.equal(entry.posted_at, null);

  // staging dir removed
  assert.ok(!fs.existsSync(path.join(cwd, 'staging', 'slideshow-042')));

  // git add/commit called
  const addCall = git.calls.find((c) => c.op === 'add');
  const commitCall = git.calls.find((c) => c.op === 'commit');
  assert.ok(addCall);
  assert.ok(commitCall);
  assert.equal(commitCall.args.message, 'Add slideshow-042 to queue');

  assert.equal(result.pushed, true);
});

test('natural sort: images 1,2,10 map to URLs in numeric order', async () => {
  const cwd = makeTempRepo();
  writeConfig(cwd);
  writeStaging(cwd, 'slideshow-nat', {
    images: ['10.png', '1.png', '2.png'],
  });
  const git = fakeGit();

  await promote('slideshow-nat', { cwd, git });

  const queue = readQueue(cwd);
  const entry = queue[0];
  assert.deepEqual(entry.images, [
    'https://raw.githubusercontent.com/gammatoxx-cloud/tt-automation/main/slides/slideshow-nat/1.png',
    'https://raw.githubusercontent.com/gammatoxx-cloud/tt-automation/main/slides/slideshow-nat/2.png',
    'https://raw.githubusercontent.com/gammatoxx-cloud/tt-automation/main/slides/slideshow-nat/3.png',
  ]);

  const slidesDir = path.join(cwd, 'slides', 'slideshow-nat');
  // renamed 10.png -> 3.png (last in numeric order), preserving original content mapping
  const contents3 = fs.readFileSync(path.join(slidesDir, '3.png'), 'utf8');
  assert.equal(contents3, 'fake image data for 10.png');
});

test('rejects fewer than 2 images with a clear error', async () => {
  const cwd = makeTempRepo();
  writeConfig(cwd);
  writeStaging(cwd, 'slideshow-one', { images: ['1.png'] });
  const git = fakeGit();

  await assert.rejects(
    () => promote('slideshow-one', { cwd, git }),
    (err) => {
      assert.match(err.message, /2.{0,20}10|between 2 and 10|image/i);
      return true;
    }
  );
});

test('rejects more than 10 images with a clear error', async () => {
  const cwd = makeTempRepo();
  writeConfig(cwd);
  const images = Array.from({ length: 11 }, (_, i) => `${i + 1}.png`);
  writeStaging(cwd, 'slideshow-many', { images });
  const git = fakeGit();

  await assert.rejects(() => promote('slideshow-many', { cwd, git }));
});

test('rejects duplicate id already in queue.json', async () => {
  const cwd = makeTempRepo();
  writeConfig(cwd);
  writeStaging(cwd, 'slideshow-dup', { images: ['1.png', '2.png'] });
  fs.writeFileSync(
    path.join(cwd, 'queue.json'),
    JSON.stringify(
      [
        {
          id: 'slideshow-dup',
          status: 'pending',
          topic: 't',
          title: 'x',
          caption: 'c',
          images: [],
          created_at: '2026-01-01',
          posted_at: null,
        },
      ],
      null,
      2
    ) + '\n',
    'utf8'
  );
  const git = fakeGit();

  await assert.rejects(
    () => promote('slideshow-dup', { cwd, git }),
    (err) => {
      assert.match(err.message, /already|duplicate|exists/i);
      return true;
    }
  );
});

test('missing draft.json produces a clear error', async () => {
  const cwd = makeTempRepo();
  writeConfig(cwd);
  writeStaging(cwd, 'slideshow-nodraft', { draft: null, images: ['1.png', '2.png'] });
  const git = fakeGit();

  await assert.rejects(
    () => promote('slideshow-nodraft', { cwd, git }),
    (err) => {
      assert.match(err.message, /draft\.json/i);
      return true;
    }
  );
});

test('missing staging dir produces a clear error', async () => {
  const cwd = makeTempRepo();
  writeConfig(cwd);
  const git = fakeGit();

  await assert.rejects(
    () => promote('slideshow-missing', { cwd, git }),
    (err) => {
      assert.match(err.message, /staging/i);
      return true;
    }
  );
});

test('missing batch.config.json produces a clear error', async () => {
  const cwd = makeTempRepo();
  writeStaging(cwd, 'slideshow-noconfig', { images: ['1.png', '2.png'] });
  const git = fakeGit();

  await assert.rejects(
    () => promote('slideshow-noconfig', { cwd, git }),
    (err) => {
      assert.match(err.message, /batch\.config\.json|repo/i);
      return true;
    }
  );
});

test('empty/placeholder repo in config produces a clear error', async () => {
  const cwd = makeTempRepo();
  writeConfig(cwd, { repo: '' });
  writeStaging(cwd, 'slideshow-placeholder', { images: ['1.png', '2.png'] });
  const git = fakeGit();

  await assert.rejects(
    () => promote('slideshow-placeholder', { cwd, git }),
    (err) => {
      assert.match(err.message, /repo/i);
      return true;
    }
  );
});

test('push failure is swallowed (no throw) when injected git push rejects', async () => {
  const cwd = makeTempRepo();
  writeConfig(cwd);
  writeStaging(cwd, 'slideshow-pushfail', { images: ['1.png', '2.png'] });
  const git = fakeGit({ pushShouldFail: true });

  const result = await promote('slideshow-pushfail', { cwd, git });
  assert.equal(result.pushed, false);

  // commit still happened, staging still cleaned up
  assert.ok(!fs.existsSync(path.join(cwd, 'staging', 'slideshow-pushfail')));
  const queue = readQueue(cwd);
  assert.equal(queue.length, 1);
});

test('push is skipped (no throw) when no upstream exists', async () => {
  const cwd = makeTempRepo();
  writeConfig(cwd);
  writeStaging(cwd, 'slideshow-noupstream', { images: ['1.png', '2.png'] });
  const git = fakeGit({ hasUpstream: false });

  const result = await promote('slideshow-noupstream', { cwd, git });
  assert.equal(result.pushed, false);
  assert.ok(!git.calls.some((c) => c.op === 'push'));
});

test('appends to existing queue.json preserving prior entries and order', async () => {
  const cwd = makeTempRepo();
  writeConfig(cwd);
  writeStaging(cwd, 'slideshow-new', { images: ['1.png', '2.png'] });
  const existing = [
    {
      id: 'slideshow-old',
      status: 'posted',
      topic: 't',
      title: 'x',
      caption: 'c',
      images: ['https://example.com/1.png'],
      created_at: '2026-01-01',
      posted_at: '2026-01-02T00:00:00.000Z',
    },
  ];
  fs.writeFileSync(path.join(cwd, 'queue.json'), JSON.stringify(existing, null, 2) + '\n', 'utf8');
  const git = fakeGit();

  await promote('slideshow-new', { cwd, git });

  const queue = readQueue(cwd);
  assert.equal(queue.length, 2);
  assert.equal(queue[0].id, 'slideshow-old');
  assert.equal(queue[1].id, 'slideshow-new');

  const raw = fs.readFileSync(path.join(cwd, 'queue.json'), 'utf8');
  assert.ok(raw.endsWith('\n'));
  assert.ok(raw.includes('  "id"'));
});

test('accepts jpg/jpeg/webp extensions, preserving each', async () => {
  const cwd = makeTempRepo();
  writeConfig(cwd);
  writeStaging(cwd, 'slideshow-mixed', { images: ['1.jpg', '2.jpeg', '3.webp'] });
  const git = fakeGit();

  await promote('slideshow-mixed', { cwd, git });

  const slidesDir = path.join(cwd, 'slides', 'slideshow-mixed');
  assert.ok(fs.existsSync(path.join(slidesDir, '1.jpg')));
  assert.ok(fs.existsSync(path.join(slidesDir, '2.jpeg')));
  assert.ok(fs.existsSync(path.join(slidesDir, '3.webp')));

  const queue = readQueue(cwd);
  assert.deepEqual(queue[0].images, [
    'https://raw.githubusercontent.com/gammatoxx-cloud/tt-automation/main/slides/slideshow-mixed/1.jpg',
    'https://raw.githubusercontent.com/gammatoxx-cloud/tt-automation/main/slides/slideshow-mixed/2.jpeg',
    'https://raw.githubusercontent.com/gammatoxx-cloud/tt-automation/main/slides/slideshow-mixed/3.webp',
  ]);
});

test('creates queue.json as [] then appends when missing', async () => {
  const cwd = makeTempRepo();
  writeConfig(cwd);
  writeStaging(cwd, 'slideshow-freshqueue', { images: ['1.png', '2.png'] });
  const git = fakeGit();

  assert.ok(!fs.existsSync(path.join(cwd, 'queue.json')));
  await promote('slideshow-freshqueue', { cwd, git });

  const queue = readQueue(cwd);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].id, 'slideshow-freshqueue');
});
