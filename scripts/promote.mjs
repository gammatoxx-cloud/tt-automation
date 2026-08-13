import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MIN_IMAGES = 2;
const MAX_IMAGES = 10;

/**
 * Real git operations, shelled out via execFile (no shell interpolation).
 * Injected as the default `git` for the CLI entrypoint; tests supply a fake.
 */
export const realGit = {
  async add(args) {
    await execFileAsync('git', ['add', ...args.paths], { cwd: args.cwd });
  },
  async commit(args) {
    await execFileAsync('git', ['commit', '-m', args.message], { cwd: args.cwd });
  },
  async hasUpstream({ cwd }) {
    try {
      await execFileAsync('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { cwd });
      return true;
    } catch {
      return false;
    }
  },
  async push({ cwd }) {
    await execFileAsync('git', ['push'], { cwd });
  },
};

function readConfig(cwd) {
  const configPath = path.join(cwd, 'batch.config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `batch.config.json not found at ${configPath}. Create it with a "repo" field (e.g. "owner/repo") before promoting.`
    );
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    throw new Error(`batch.config.json is not valid JSON: ${err.message}`);
  }
  const repo = config.repo;
  if (!repo || typeof repo !== 'string' || repo.trim() === '' || /^<.*>$/.test(repo.trim())) {
    throw new Error(
      'batch.config.json is missing a valid "repo" value. Set config.repo to your GitHub slug (e.g. "owner/repo") before promoting.'
    );
  }
  return config;
}

function readDraft(cwd, id, stagingDir) {
  if (!fs.existsSync(stagingDir)) {
    throw new Error(`Staging directory not found: staging/${id}. Nothing to promote.`);
  }
  const draftPath = path.join(stagingDir, 'draft.json');
  if (!fs.existsSync(draftPath)) {
    throw new Error(`staging/${id}/draft.json not found. Cannot promote without a draft.`);
  }
  let draft;
  try {
    draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
  } catch (err) {
    throw new Error(`staging/${id}/draft.json is not valid JSON: ${err.message}`);
  }
  return draft;
}

function collectStagedImages(cwd, id, stagingDir) {
  const files = fs.readdirSync(stagingDir).filter((name) => {
    const ext = path.extname(name).toLowerCase();
    return IMAGE_EXTENSIONS.has(ext);
  });

  const sorted = naturalSort(files);

  if (sorted.length < MIN_IMAGES || sorted.length > MAX_IMAGES) {
    throw new Error(
      `staging/${id} has ${sorted.length} image(s); TikTok carousels require between ${MIN_IMAGES} and ${MAX_IMAGES} images.`
    );
  }

  return sorted;
}

/**
 * Natural numeric sort for filenames like "1.png", "2.png", "10.png" so that
 * "10.png" sorts after "2.png" rather than before it lexically.
 */
function naturalSort(names) {
  return [...names].sort((a, b) => {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) {
      return numA - numB;
    }
    return a.localeCompare(b);
  });
}

function loadQueue(queuePath) {
  if (!fs.existsSync(queuePath)) {
    return [];
  }
  const raw = fs.readFileSync(queuePath, 'utf8');
  return JSON.parse(raw);
}

function writeQueue(queuePath, queue) {
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\n', 'utf8');
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Promote a staged slideshow `<id>` into queue.json and slides/<id>/.
 *
 * `git` operations ({ add, commit, hasUpstream, push }) are injected so this
 * is fully unit-testable without touching real git or the network.
 */
export async function promote(id, { cwd = process.cwd(), git = realGit } = {}) {
  const config = readConfig(cwd);

  const stagingDir = path.join(cwd, 'staging', id);
  const draft = readDraft(cwd, id, stagingDir);
  const stagedImages = collectStagedImages(cwd, id, stagingDir);

  const queuePath = path.join(cwd, 'queue.json');
  const queue = loadQueue(queuePath);
  if (queue.some((entry) => entry.id === id)) {
    throw new Error(`queue.json already has an entry with id "${id}". Refusing to add a duplicate.`);
  }

  const slidesDir = path.join(cwd, 'slides', id);
  fs.mkdirSync(slidesDir, { recursive: true });

  const images = [];
  stagedImages.forEach((filename, index) => {
    const ext = path.extname(filename).toLowerCase();
    const destName = `${index + 1}${ext}`;
    fs.copyFileSync(path.join(stagingDir, filename), path.join(slidesDir, destName));
    images.push(
      `https://raw.githubusercontent.com/${config.repo}/main/slides/${id}/${destName}`
    );
  });

  const entry = {
    id,
    status: 'pending',
    topic: draft.topic,
    title: draft.title,
    caption: draft.caption,
    images,
    created_at: todayISODate(),
    posted_at: null,
  };
  queue.push(entry);
  writeQueue(queuePath, queue);

  await git.add({ cwd, paths: [path.join('slides', id), 'queue.json'] });
  await git.commit({ cwd, message: `Add ${id} to queue` });

  let pushed = false;
  try {
    const hasUpstream = await git.hasUpstream({ cwd });
    if (hasUpstream) {
      await git.push({ cwd });
      pushed = true;
    } else {
      console.log(`Skipping push for ${id}: no upstream configured yet.`);
    }
  } catch (err) {
    console.log(`Warning: git push failed for ${id}: ${err.message}`);
  }

  fs.rmSync(stagingDir, { recursive: true, force: true });

  console.log(
    `Promoted ${id}: ${images.length} image(s), committed to queue.json${pushed ? ', pushed' : ' (not pushed)'}.`
  );

  return { id, imageCount: images.length, committed: true, pushed };
}

export async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: node scripts/promote.mjs <id>');
    process.exit(1);
  }
  try {
    await promote(id, { cwd: process.cwd(), git: realGit });
  } catch (err) {
    console.error(`promote failed: ${err.message}`);
    process.exit(1);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main();
}
