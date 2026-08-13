import crypto from 'node:crypto';

const BASE_URL = 'https://zernio.com/api/v1';

async function throwForStatus(response, label) {
  const bodyText = await response.text();
  throw new Error(`${label} failed: HTTP ${response.status} - ${bodyText}`);
}

/**
 * Fetch TikTok creator info (privacy levels, posting limits, etc.) for an account.
 */
export async function getCreatorInfo({ apiKey, accountId, fetchImpl = fetch }) {
  const url = `${BASE_URL}/accounts/${accountId}/tiktok/creator-info?mediaType=photo`;
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    await throwForStatus(response, 'getCreatorInfo');
  }

  const text = await response.text();
  return JSON.parse(text);
}

/**
 * Create a TikTok draft post (delivered to the TikTok Creator Inbox as a draft)
 * via the Zernio posts API.
 */
export async function createTikTokDraft({
  apiKey,
  accountId,
  title,
  caption,
  images,
  privacyLevel,
  fetchImpl = fetch,
}) {
  const url = `${BASE_URL}/posts`;
  const body = {
    content: title,
    mediaItems: images.map((imageUrl) => ({ type: 'image', url: imageUrl })),
    platforms: [{ platform: 'tiktok', accountId }],
    publishNow: true,
    tiktokSettings: {
      draft: true,
      privacyLevel,
      mediaType: 'photo',
      description: caption,
      photoCoverIndex: 0,
    },
  };

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'x-request-id': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await throwForStatus(response, 'createTikTokDraft');
  }

  const text = await response.text();
  return JSON.parse(text);
}
