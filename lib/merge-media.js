const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const run = promisify(execFile);
const jobs = new Map();
const completed = new Map();
const failed = new Map();
const maxActive = 2;
const maxCompleted = 3;
const maxFailures = 50;
const retainMs = 5 * 60 * 1000;
let active = 0;
let binary;
async function ffmpegPath() {
  if (!binary) binary = (async()=>{
    const python=process.env.PYTHON || 'python3';
    const query=['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'];
    try {return (await run(python,query,{timeout:5000})).stdout.trim();}
    catch {
      // Existing Render services can retain an older dashboard build command.
      // Install the pinned media dependency once if that build did not provide it.
      await run(python,['-m','pip','install','--quiet','--disable-pip-version-check','imageio-ffmpeg==0.6.0'],{timeout:90000,maxBuffer:8192});
      return (await run(python,query,{timeout:5000})).stdout.trim();
    }
  })().catch(e=>{binary=null;throw e});
  return binary;
}
function mergeArgs(video, audio, output) {
  return ['-nostdin','-hide_banner','-loglevel','error','-y','-protocol_whitelist','file,pipe','-f','mov','-i',video,'-protocol_whitelist','file,pipe','-f','mov','-i',audio,'-map','0:v:0','-map','1:a:0','-c','copy','-movflags','+faststart','-f','mp4',output];
}
function mergeKey(videoUrl, audioUrl) {
  return JSON.stringify([videoUrl, audioUrl]);
}

function evictCompleted(key, entry) {
  if (completed.get(key) !== entry) return;
  clearTimeout(entry.timer);
  completed.delete(key);
  fsp.rm(entry.dir, { recursive: true, force: true }).catch(() => {});
}

function preparationError(error) {
  const message = /超时|时限|timeout|timed out/i.test(error.message)
    ? '媒体源响应超时，请重新提取后重试。'
    : error.status === 429 || /轨道不是有效|大小限制|资源过大|轨道在分段/.test(error.message)
      ? error.message : '音画合并未完成，请重新提取后重试。';
  return { status: 'failed', stage: '完整视频准备失败', error: message };
}

async function makeFile(videoUrl, audioUrl, download, job) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'muse-media-'));
  try {
    const video = path.join(dir, 'video.mp4');
    const audio = path.join(dir, 'audio.m4a');
    const output = path.join(dir, 'complete.mp4');
    const ffmpegReady = ffmpegPath().then(value => ({ value }), error => ({ error }));
    const limit = 256 * 1024 * 1024;
    const deadlineAt = Date.now() + 95000;
    job.stage = '正在读取视频轨';
    const videoBytes = await download(videoUrl, video, limit, deadlineAt);
    job.stage = '正在读取音频轨';
    await download(audioUrl, audio, limit - videoBytes, deadlineAt);

    for (const file of [video, audio]) {
      const handle = await fsp.open(file, 'r');
      const prefix = Buffer.alloc(12);
      try { await handle.read(prefix, 0, prefix.length, 0); }
      finally { await handle.close(); }
      if (!['ftyp', 'styp'].includes(prefix.toString('ascii', 4, 8))) {
        throw new Error('媒体轨道不是有效的 MP4/M4A 文件。');
      }
    }

    job.stage = '正在准备合并组件';
    const ready = await ffmpegReady;
    if (ready.error) throw ready.error;
    job.stage = '正在合并声音和画面';
    await run(ready.value, mergeArgs(video, audio, output), { timeout: 45000, maxBuffer: 8192, killSignal: 'SIGKILL' });
    const stat = await fsp.stat(output);
    if (!stat.size) throw new Error('合并没有产生视频文件。');
    await Promise.all([fsp.unlink(video), fsp.unlink(audio)]);
    return { dir, file: { path: output, size: stat.size } };
  } catch (error) {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function mergedFile(videoUrl, audioUrl, download) {
  const key = mergeKey(videoUrl, audioUrl);
  if (jobs.has(key)) return jobs.get(key).promise;
  if (completed.has(key)) return completed.get(key).file;
  if (active >= maxActive) {
    throw Object.assign(new Error('合并任务繁忙，请稍后重试。'), { status: 429 });
  }

  failed.delete(key);
  active++;
  const job = { stage: '正在准备完整视频' };
  job.promise = makeFile(videoUrl, audioUrl, download, job).then(entry => {
    if (completed.size >= maxCompleted) {
      const [oldKey, oldEntry] = completed.entries().next().value;
      evictCompleted(oldKey, oldEntry);
    }
    completed.set(key, entry);
    entry.timer = setTimeout(() => evictCompleted(key, entry), retainMs);
    entry.timer.unref();
    return entry.file;
  }).catch(error => {
    const state = preparationError(error);
    // Failed preparations are bounded and exist only to answer status queries.
    if (failed.size >= maxFailures) failed.delete(failed.keys().next().value);
    failed.set(key, { state, expiresAt: Date.now() + retainMs });
    throw error;
  }).finally(() => {
    active--;
    jobs.delete(key);
  });
  jobs.set(key, job);
  return job.promise;
}

function getMergedPreparation(videoUrl, audioUrl) {
  const key = mergeKey(videoUrl, audioUrl);
  if (completed.has(key)) return { status: 'ready', stage: '完整视频已准备好' };
  if (jobs.has(key)) return { status: 'preparing', stage: jobs.get(key).stage };
  const entry = failed.get(key);
  if (entry?.expiresAt > Date.now()) return { ...entry.state };
  if (entry) failed.delete(key);
  return { status: 'failed', error: '准备任务不存在或已过期，请重新开始。' };
}

function prepareMergedFile(videoUrl, audioUrl, download, retry = false) {
  const key = mergeKey(videoUrl, audioUrl);
  if (!retry && failed.get(key)?.expiresAt > Date.now()) return getMergedPreparation(videoUrl, audioUrl);
  if (!jobs.has(key) && !completed.has(key)) {
    if (active >= maxActive) {
      return preparationError(Object.assign(new Error('合并任务繁忙，请稍后重试。'), { status: 429 }));
    }
    mergedFile(videoUrl, audioUrl, download).catch(() => {});
  }
  return getMergedPreparation(videoUrl, audioUrl);
}

module.exports = { mergedFile, mergeArgs, prepareMergedFile, getMergedPreparation };
