import test from 'node:test';
import assert from 'node:assert/strict';
import backend from '../server.js';
import douyinFeed from '../lib/douyin-feed.cjs';

test('public Douyin feed rejects unrelated recommendations and uses its next node',async()=>{
 const id='7665672488277331209';const calls=[];
 const requested={aweme_id:id,desc:'Requested SCI video',video:{width:2160,height:3840,duration:120740,play_addr:{width:720,height:1280,data_size:16425328,url_list:['https://v.douyinvod.com/requested.mp4']}}};
 const io={fetchJson:async(url)=>{calls.push(url);return {status_code:0,aweme_list:[calls.length===1?{...requested,aweme_id:'1111111111111111111'}:requested]}}};
 const r=await douyinFeed.extractDouyinFeed(id,'https://v.douyin.com/aKNXWqFB5mE/',{name:'抖音 / TikTok'},{},io);
 assert.equal(calls.length,2);assert.equal(r.sourceDetail.extractor,'douyin-public-feed');assert.equal(r.sourceDetail.awemeId,id);assert.equal(r.items[0].quality,'720p');assert.equal(r.items[0].size,16425328);assert.match(r.items[0].label,/720x1280/);
});

test('empty or unavailable Douyin feed never succeeds with another work or a cover',async()=>{
 const id='7665672488277331209';
 for(const data of [{status_code:0,aweme_list:[{aweme_id:'1111111111111111111',video:{play_addr:{url_list:['https://v.douyinvod.com/wrong.mp4']}}}]},{status_code:0,aweme_list:[{aweme_id:id,video:{cover:{url_list:['https://example.com/a.jpg']}}}]},{status_code:9,aweme_list:[]}]){
  assert.equal(await douyinFeed.extractDouyinFeed(id,'https://www.douyin.com/video/'+id,{name:'抖音 / TikTok'},{},{fetchJson:async()=>data}),null);
 }
});

test('public Douyin feed tolerates one failed node with bounded fallback',async()=>{
 let calls=0;const id='7665672488277331209';
 const io={fetchJson:async()=>{calls++;if(calls===1)throw new Error('timeout');return {aweme_list:[{aweme_id:id,video:{play_addr:{url_list:['https://v.douyinvod.com/valid.mp4']}}}]}}};
 const r=await douyinFeed.extractDouyinFeed(id,'https://www.douyin.com/video/'+id,{name:'抖音 / TikTok'},{},io);
 assert.equal(calls,2);assert.equal(r.sourceDetail.extractor,'douyin-public-feed');
});

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

test('Weibo media saves preserve the source Referer required by its CDN',()=>{
 assert.equal(backend.getProxyHeadersForHost('f.video.weibocdn.com').Referer,'https://weibo.com/');
});

test('Bilibili overseas Akamai tracks receive the same required source headers',()=>{
  for (const host of ['upos-hz-mirrorakam.akamaized.net','upos-hz-mirrorakam.akamaized.net/upgcxcode/00/video.m4s']) {
    assert.equal(backend.getProxyHeadersForHost(host).Referer,'https://www.bilibili.com/');
  }
  assert.equal(backend.getProxyHeadersForHost('other.akamaized.net').Referer,undefined);
});

test('Kuaishou public share state yields actual MP4 URLs without executing page scripts',()=>{
 const html='<script>window.INIT_STATE = '+JSON.stringify({opaque:{photo:{caption:'Public travel video',mainMvUrls:[{url:'https://txmov2.a.kwimgs.com/video.mp4'}]}}})+';</script>';
 const d=publicPlatforms.buildKuaishouPublic(html,'https://www.kuaishou.com/short-video/public',{name:'快手'},{});
 assert.equal(d.items[0].mediaMode,'combined');assert.equal(d.sourceDetail.title,'Public travel video');
});

test('Douyin expands a short share to its clean public share page before extraction',async()=>{
 const url=await backend.resolvePlatformUrl('https://v.douyin.com/aKNXWqFB5mE/',{name:'抖音 / TikTok'},async(_url,options)=>{
  assert.equal(options.followRedirects,false);
  return {finalUrl:_url,headers:{location:'https://www.iesdouyin.com/share/video/7665672488277331209/?did=tracking&share_sign=tracking'}};
 });
 assert.equal(url,'https://www.douyin.com/video/7665672488277331209');
 assert.equal(backend.getDouyinShareCandidates('https://v.douyin.com/aKNXWqFB5mE/',{webpage_url:url})[0],'https://www.douyin.com/share/video/7665672488277331209/');
});

test('public share JSON parses across whitespace variants without executing JavaScript',()=>{
 const data={loaderData:{one:{videoInfoRes:{item_list:[{desc:'Public video',video:{duration:12000,play_addr:{url_list:['https://v.douyinvod.com/v.mp4']}}}]}}}};
 for(const separator of ['=',' = ','\n=\n']){
  const item=backend.getDouyinShareItemFromHtml('<script>window._ROUTER_DATA'+separator+JSON.stringify(data)+'</script>');
  const result=backend.buildDouyinShareResult(item,'https://v.douyin.com/aKNXWqFB5mE/','https://www.iesdouyin.com/',{name:'抖音 / TikTok'},{});
  assert.equal(result.items[0].mediaMode,'combined');assert.equal(result.sourceDetail.duration,12);
 }
});
