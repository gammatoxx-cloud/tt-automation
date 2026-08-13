import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCreatorInfo, createTikTokDraft } from './zernio.mjs';

function fakeFetchOk(body) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function fakeFetchFail(status, bodyText) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: false,
      status,
      text: async () => bodyText,
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test('getCreatorInfo hits the right URL with mediaType=photo and returns parsed JSON', async () => {
  const responseBody = {
    creator: { id: 'c1' },
    privacyLevels: [{ value: 'PUBLIC_TO_EVERYONE', label: 'Everyone' }],
    postingLimits: {},
    commercialContentTypes: [],
  };
  const fetchImpl = fakeFetchOk(responseBody);

  const result = await getCreatorInfo({ apiKey: 'key123', accountId: 'acct1', fetchImpl });

  assert.equal(fetchImpl.calls.length, 1);
  const { url, opts } = fetchImpl.calls[0];
  assert.equal(url, 'https://zernio.com/api/v1/accounts/acct1/tiktok/creator-info?mediaType=photo');
  assert.equal(opts.headers.Authorization, 'Bearer key123');
  assert.deepEqual(result, responseBody);
});

test('getCreatorInfo throws on non-2xx including status and body', async () => {
  const fetchImpl = fakeFetchFail(500, 'internal server error');

  await assert.rejects(
    () => getCreatorInfo({ apiKey: 'key123', accountId: 'acct1', fetchImpl }),
    (err) => {
      assert.match(err.message, /500/);
      assert.match(err.message, /internal server error/);
      return true;
    }
  );
});

test('createTikTokDraft builds the exact request body and headers', async () => {
  const responseBody = { id: 'post1' };
  const fetchImpl = fakeFetchOk(responseBody);

  const result = await createTikTokDraft({
    apiKey: 'key123',
    accountId: 'acct1',
    title: 'My Title',
    caption: 'My Caption',
    images: ['https://example.com/1.png', 'https://example.com/2.png'],
    privacyLevel: 'PUBLIC_TO_EVERYONE',
    fetchImpl,
  });

  assert.equal(fetchImpl.calls.length, 1);
  const { url, opts } = fetchImpl.calls[0];
  assert.equal(url, 'https://zernio.com/api/v1/posts');
  assert.equal(opts.method, 'POST');
  assert.equal(opts.headers.Authorization, 'Bearer key123');
  assert.equal(opts.headers['Content-Type'], 'application/json');
  assert.equal(typeof opts.headers['x-request-id'], 'string');
  assert.match(
    opts.headers['x-request-id'],
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  );

  const body = JSON.parse(opts.body);
  assert.deepEqual(body, {
    content: 'My Title',
    mediaItems: [
      { type: 'image', url: 'https://example.com/1.png' },
      { type: 'image', url: 'https://example.com/2.png' },
    ],
    platforms: [{ platform: 'tiktok', accountId: 'acct1' }],
    publishNow: true,
    tiktokSettings: {
      draft: true,
      privacyLevel: 'PUBLIC_TO_EVERYONE',
      mediaType: 'photo',
      description: 'My Caption',
      photoCoverIndex: 0,
    },
  });

  // Explicit critical assertions per brief
  assert.equal(body.publishNow, true);
  assert.equal(body.tiktokSettings.draft, true);
  assert.equal('isDraft' in body, false);
  assert.equal('publish_type' in body, false);
  assert.equal(body.content, 'My Title');
  assert.equal(body.tiktokSettings.description, 'My Caption');

  assert.deepEqual(result, responseBody);
});

test('createTikTokDraft throws on non-2xx including status and body (409 duplicate)', async () => {
  const fetchImpl = fakeFetchFail(409, 'duplicate content within 24h');

  await assert.rejects(
    () =>
      createTikTokDraft({
        apiKey: 'key123',
        accountId: 'acct1',
        title: 'T',
        caption: 'C',
        images: ['https://example.com/1.png'],
        privacyLevel: 'PUBLIC_TO_EVERYONE',
        fetchImpl,
      }),
    (err) => {
      assert.match(err.message, /409/);
      assert.match(err.message, /duplicate content within 24h/);
      return true;
    }
  );
});

test('createTikTokDraft throws on generic non-2xx (500)', async () => {
  const fetchImpl = fakeFetchFail(500, 'server error');

  await assert.rejects(
    () =>
      createTikTokDraft({
        apiKey: 'key123',
        accountId: 'acct1',
        title: 'T',
        caption: 'C',
        images: ['https://example.com/1.png'],
        privacyLevel: 'PUBLIC_TO_EVERYONE',
        fetchImpl,
      }),
    (err) => {
      assert.match(err.message, /500/);
      assert.match(err.message, /server error/);
      return true;
    }
  );
});
