// Public feed endpoint reference: ucmao/media-parser (MIT), douyin_parser.py.
// TLS verification stays enabled. No cookies, signatures, or page code execution.
const {buildDouyinShareResult} = require('./douyin-share.cjs');
const feedEndpoints = [
  'https://aweme.snssdk.com/aweme/v1/feed/',
  'https://api5-normal-c-hl.amemv.com/aweme/v1/feed/'
];
const feedUserAgent = 'com.ss.android.ugc.aweme/290101 (Linux; U; Android 10; zh_CN; Pixel 4; Build/QQ3A.200805.001; Cronet/TTNetVersion:5f9037be 2023-01-13 QuicVersion:4668bb42 2022-11-21)';

async function extractDouyinFeed(awemeId, cleanUrl, platform, sourceDetail, io) {
  if (!/^\d{10,}$/.test(String(awemeId || ''))) return null;
  for (const endpoint of feedEndpoints) {
    try {
      const data = await io.fetchJson(`${endpoint}?aweme_id=${awemeId}&aid=1128`, {
        'User-Agent': feedUserAgent,
        Accept: 'application/json,text/plain,*/*'
      });
      // Feed may contain recommendations even when the requested video is absent.
      // Never present a recommendation as the user's requested work.
      if (data.status_code !== undefined && data.status_code !== 0) continue;
      const item = Array.isArray(data.aweme_list) && data.aweme_list.find(item =>
        String(item.aweme_id || item.id || '') === String(awemeId));
      const result = buildDouyinShareResult(item, cleanUrl,
        `https://www.douyin.com/video/${awemeId}`, platform, sourceDetail);
      if (!result) continue;
      result.sourceDetail.extractor = 'douyin-public-feed';
      result.sourceDetail.feedHost = new URL(endpoint).hostname;
      result.note = '已提取抖音视频，声音包含在 MP4 文件中。';
      return result;
    } catch {
      // One bounded attempt per public node, then existing share-page fallback.
    }
  }
  return null;
}
module.exports = {extractDouyinFeed};
