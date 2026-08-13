import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as zernioClient from './zernio.mjs';

const DEFAULT_POSTS_PER_RUN = 2;

/**
 * Send a best-effort alert to ALERT_WEBHOOK (if configured) and always log to console.
 * Errors from the webhook call are swallowed (logged, not thrown).
 */
export async function sendAlert(message, { env = process.env, fetchImpl = fetch } = {}) {
  console.log(message);
  const webhook = env.ALERT_WEBHOOK;
  if (!webhook) {
    return;
  }
  try {
    await fetchImpl(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
  } catch (err) {
    console.log(`sendAlert failed: ${err.message}`);
  }
}

function loadQueue(queuePath) {
  // Throws if missing/unreadable/unparsable, as required.
  const raw = fs.readFileSync(queuePath, 'utf8');
  return JSON.parse(raw);
}

function writeQueue(queuePath, queue) {
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\n', 'utf8');
}

/**
 * Core runner. Takes an injected `zernio` client ({ getCreatorInfo, createTikTokDraft })
 * and an optional `fetchImpl` (used for sendAlert) so it is fully unit-testable without
 * any real network access.
 */
export async function runPostNext({
  queuePath,
  env = process.env,
  zernio = zernioClient,
  fetchImpl = fetch,
}) {
  const apiKey = env.ZERNIO_API_KEY;
  const accountId = env.ZERNIO_TIKTOK_ACCOUNT_ID;
  const postsPerRun = env.POSTS_PER_RUN ? Number(env.POSTS_PER_RUN) : DEFAULT_POSTS_PER_RUN;

  const queue = loadQueue(queuePath);

  const pending = queue.filter((entry) => entry.status === 'pending');

  if (pending.length === 0) {
    const message = 'Queue empty — batch more slideshows';
    await sendAlert(message, { env, fetchImpl });
    return { posted: [], failed: [], emptyQueue: true };
  }

  const toProcess = pending.slice(0, postsPerRun);
  const posted = [];
  const failed = [];

  for (const entry of toProcess) {
    try {
      const info = await zernio.getCreatorInfo({ apiKey, accountId, fetchImpl });
      const allowed = (info.privacyLevels || []).map((p) => p.value);
      if (allowed.length === 0) {
        throw new Error('No allowed TikTok privacy levels returned by creator-info');
      }
      const privacy = allowed.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : allowed[0];

      await zernio.createTikTokDraft({
        apiKey,
        accountId,
        title: entry.title,
        caption: entry.caption,
        images: entry.images,
        privacyLevel: privacy,
        fetchImpl,
      });

      entry.status = 'posted';
      entry.posted_at = new Date().toISOString();
      posted.push(entry.id);
    } catch (err) {
      entry.status = 'failed';
      const message = `Failed to post ${entry.id}: ${err.message}`;
      console.log(message);
      failed.push(entry.id);
      await sendAlert(message, { env, fetchImpl });
    }
  }

  writeQueue(queuePath, queue);

  console.log(`Posted: ${posted.join(', ') || '(none)'}`);
  console.log(`Failed: ${failed.join(', ') || '(none)'}`);

  return { posted, failed, emptyQueue: false };
}

export async function main() {
  const queuePath = path.resolve(process.cwd(), 'queue.json');
  try {
    await runPostNext({ queuePath, env: process.env, zernio: zernioClient, fetchImpl: fetch });
  } catch (err) {
    console.error(`post-next crashed: ${err.message}`);
    process.exit(1);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main();
}
