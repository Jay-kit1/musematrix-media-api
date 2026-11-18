import assert from 'node:assert/strict';
import test from 'node:test';
import youtube from '../lib/youtube-media.js';

const cdn = 'https://example.com/';
const cover = { type: '图片', url: cdn + 'cover.jpg' };
const full = { type: '视频', mediaMode: 'combined', url: cdn + 'full.mp4' };
const split = { type: '视频', mediaMode: 'combined', url: cdn + 'video.mp4', audioUrl: cdn + 'audio.m4a' };
const audio = { type: '音频', url: split.audioUrl };
const mp4 = {
  statusCode: 206,
  headers: { 'content-type': 'video/mp4' },
  bodyBytes: Buffer.from('0000ftypisom')
};

test('YouTube drops a forbidden or HTML video URL and keeps a verified split download', async () => {
  const calls = [];
  const result = await youtube.validateYouTubeMedia({ items: [cover, full, split, audio] }, async url => {
    calls.push(url);
    return url === full.url
      ? { ...mp4, statusCode: 403 }
      : mp4;
  });
  assert.deepEqual(result.items, [cover, split, audio]);
  assert.equal(calls.filter(url => url === audio.url).length, 1);
  const invalid = await youtube.validateYouTubeMedia({ items: [full, cover] }, async () => ({
    ...mp4, statusCode: 200, bodyBytes: Buffer.from('<html>error page</html>')
  }));
  assert.equal(invalid, null);
});

test('a split YouTube download is not offered if the audio track is inaccessible', async () => {
  const result = await youtube.validateYouTubeMedia({ items: [split, cover] }, async url =>
    url === split.audioUrl ? { ...mp4, statusCode: 403 } : mp4);
  assert.equal(result, null);
});
