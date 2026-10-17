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
 assert.equal(result.platform.name,'哔哩哔哩');assert.equal(result.items[0].headers.Referer,'https://www.bilibili.com/');assert.equal(result.items[0].mediaMode,'combined');assert.equal(result.items.length,3);assert.ok(result.items.some(i=>i.type==='音频'));
});
test('unsupported HLS manifests and cover-only fallback are not advertised as MP4 files',()=>{
 assert.equal(backend.buildSnapAnyResult({medias:[{media_type:'video',resource_url:'https://example.com/master.m3u8'}]},'https://vimeo.com/1',{name:'Vimeo'},{}),null);
});
