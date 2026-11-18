function hasPlayablePrefix({ statusCode, headers, bodyBytes }) {
  if (statusCode !== 200 && statusCode !== 206) return false;
  if (!/^(video\/|audio\/|application\/(mp4|octet-stream)(?:[;\s]|$))/i.test(headers['content-type'] || '')) return false;
  if (!Buffer.isBuffer(bodyBytes) || bodyBytes.length < 12) return false;

  // MP4-family or WebM. A consent page or playlist is never a saved video.
  return ['ftyp', 'styp'].includes(bodyBytes.toString('ascii', 4, 8)) ||
    bodyBytes.readUInt32BE(0) === 0x1a45dfa3;
}

async function validateYouTubeMedia(result, readPrefix) {
  if (!result) return null;
  const video = result.items.filter(item => item.type === '视频');
  const ranked = [
    ...video.filter(item => item.mediaMode === 'combined' && !item.audioUrl),
    ...video.filter(item => item.audioUrl),
    ...video.filter(item => item.mediaMode !== 'combined' && !item.audioUrl)
  ];
  const audio = result.items.find(item => item.type === '音频');
  const checks = new Map();
  function reachable(url) {
    if (!checks.has(url)) {
      checks.set(url, Promise.resolve().then(() => readPrefix(url)).then(hasPlayablePrefix, () => false));
    }
    return checks.get(url);
  }
  const candidates = [...ranked.slice(0, 3), ...(audio ? [audio] : [])];
  const checked = await Promise.all(candidates.map(async item => {
    const tracks = item.audioUrl ? [item.url, item.audioUrl] : [item.url];
    return (await Promise.all(tracks.map(reachable))).every(Boolean) ? item : null;
  }));
  if (!checked.some(item => item?.type === '视频')) return null;
  const available = new Set(checked.filter(Boolean));
  return {
    ...result,
    items: result.items.filter(item => available.has(item) || item.type === '图片')
  };
}

module.exports = { validateYouTubeMedia };
