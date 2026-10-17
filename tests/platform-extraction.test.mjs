import test from 'node:test';
import assert from 'node:assert/strict';
import backend from '../server.js';

test('Bilibili short share resolves before IDs are parsed and provides an audio-video file', async()=>{
 const calls=[];
 const io={requestUrl:async(url,options)=>{calls.push({url,method:options.method});return {finalUrl:'https://www.bilibili.com/video/BV1f9NJ6vEYs/?p=2'}},fetchJson:async(url)=>{
  calls.push({url});
  if(url.includes('/view?'))return {code:0,data:{title:'考研方向',cid:11,pages:[{page:1,cid:11},{page:2,cid:22}]}};
  assert.match(url,/cid=22/);
  if(url.includes('fnval=0'))return {code:0,data:{quality:32,durl:[{url:'https://cdn.bilivideo.com/full.mp4',size:42}]}};
  return {code:0,data:{dash:{video:[{baseUrl:'https://cdn.bilivideo.com/video.m4s',height:1080,mimeType:'video/mp4'}],audio:[{baseUrl:'https://cdn.bilivideo.com/audio.m4s',mimeType:'audio/mp4'}]}}};
 }};
 const result=await backend.extractBilibili('https://b23.tv/Ql06ish', {name:'哔哩哔哩'}, {},io);
 assert.equal(calls[0].url,'https://b23.tv/Ql06ish');assert.equal(calls[0].method,'HEAD');
 assert.equal(result.sourceDetail.cid,22);assert.equal(result.items[0].mediaMode,'combined');assert.match(result.items[0].label,/含声音/);assert.equal(result.items[0].ext,'mp4');
 assert.ok(result.items.some(i=>i.mediaMode==='video-only'));assert.ok(result.items.some(i=>i.type==='音频'&&i.ext==='m4a'));
});
test('a cover alone is not a successful video extraction',()=>{
 assert.equal(backend.normalizeExtractorResults({thumbnail:'https://example.com/cover.jpg',formats:[]},'https://www.youtube.com/watch?v=id',{name:'YouTube'},{}),null);
});
test('shared fallback keeps the actual platform, title, formats and resource headers',()=>{
 const result=backend.buildSnapAnyResult({site:'bilibili',title:'考研方向',medias:[{media_type:'video',resource_url:'https://cdn.bilivideo.com/full.mp4',headers:{Referer:'https://www.bilibili.com/'},variants:[{video_url:'https://cdn.bilivideo.com/v.m4s',audio_url:'https://cdn.bilivideo.com/a.m4s',quality_label:'1080p',video_ext:'mp4',audio_ext:'m4a'}]}]},'https://b23.tv/Ql06ish',{name:'哔哩哔哩'},{});
 assert.equal(result.platform.name,'哔哩哔哩');assert.equal(result.items[0].headers.Referer,'https://www.bilibili.com/');assert.equal(result.items[0].mediaMode,'combined');assert.equal(result.items.length,4);assert.ok(result.items.some(i=>i.type==='音频'));
});
test('unsupported HLS manifests and cover-only fallback are not advertised as MP4 files',()=>{
 assert.equal(backend.buildSnapAnyResult({medias:[{media_type:'video',resource_url:'https://example.com/master.m3u8'}]},'https://vimeo.com/1',{name:'Vimeo'},{}),null);
});

test('a manifest selected by yt-dlp is not returned as an MP4 file',()=>{
 assert.equal(backend.normalizeExtractorResults({url:'https://example.com/master.m3u8',ext:'mp4',vcodec:'h264',acodec:'aac'},'https://vimeo.com/1',{name:'Vimeo'},{}),null);
});
import publicPlatforms from '../lib/public-platforms.js';
test('public Pinterest API prefers an MP4 instead of its HLS sibling',()=>{
 const result=publicPlatforms.buildPinterestPublic({title:'Public pin',videos:{video_list:{HLS:{url:'https://v.pinimg.com/master.m3u8'},MP4:{url:'https://v.pinimg.com/video.mp4',height:720}}}},'https://www.pinterest.com/pin/1/',{name:'Pinterest'},{});
 assert.equal(result.items.length,1);assert.equal(result.items[0].quality,'720p');
});
test('Twitter unified cards retain their actual MP4 video variants',()=>{
 const result=publicPlatforms.buildTwitterPublic({text:'Public tweet',card:{binding_values:{unified_card:{string_value:JSON.stringify({media_entities:{one:{video_info:{variants:[{content_type:'application/x-mpegURL',url:'https://video.twimg.com/a.m3u8'},{content_type:'video/mp4',url:'https://video.twimg.com/a.mp4',bitrate:832000}]}}}})}}}},'https://x.com/example/status/1',{name:'X / Twitter'},{});
 assert.equal(result.items.length,1);assert.match(result.items[0].url,/\.mp4$/);
});
test('Vimeo HLS-only or DRM stream is not mislabeled as a complete downloadable file',()=>{
 assert.equal(publicPlatforms.buildVimeoPublic({video:{title:'Protected'},request:{files:{hls:{default_cdn:'one',cdns:{one:{url:'https://example.com/drm/master.m3u8'}}}}}},'https://vimeo.com/1',{name:'Vimeo'},{}),null);
});

test('DASH-only video becomes a complete save action without hiding original tracks',()=>{
 const r=backend.normalizeExtractorResults({title:'Two tracks',formats:[{url:'https://cdn.example/v.mp4',ext:'mp4',vcodec:'h264',acodec:'none',height:720},{url:'https://cdn.example/a.m4a',ext:'m4a',vcodec:'none',acodec:'aac'}]},'https://www.instagram.com/reel/test',{name:'Instagram'},{});
 assert.ok(r.items.some(i=>i.mediaMode==='combined'&&i.audioUrl));assert.ok(r.items.some(i=>i.mediaMode==='video-only'));assert.ok(r.items.some(i=>i.mediaMode==='audio-only'));
});

test('every Bilibili extractor receives the expanded canonical URL, preserving the selected part',async()=>{
 const target=await backend.resolvePlatformUrl('https://b23.tv/Ql06ish',{name:'哔哩哔哩'},async()=>({finalUrl:'https://www.bilibili.com/video/BV1f9NJ6vEYs/?p=2&tracking=ignored'}));
 assert.equal(target,'https://www.bilibili.com/video/BV1f9NJ6vEYs/?p=2');
 await assert.rejects(backend.resolvePlatformUrl('https://b23.tv/Ql06ish',{name:'哔哩哔哩'},async()=>({finalUrl:'https://example.com/video/BV1f9NJ6vEYs/'})));
});
