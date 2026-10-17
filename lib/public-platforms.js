// Public embed APIs; no account cookies, login, or protected content are used.
function makeResult(url, platform, sourceDetail, title, items, extra={}) {
  if (!items.some(i=>i.type==='视频')) return null;
  return {url,platform,success:true,title:`${title || platform.name} · 媒体已提取`,note:'已从公开播放信息取得媒体；视频、音频和清晰度分别标注。',
    sourceDetail:{...sourceDetail,extractor:'public-embed-api',title,...extra},items};
}
function video(url, label='完整视频 MP4（含声音）', quality='MP4', extra={}) {
  return {url,label,quality,type:'视频',action:'open',ext:'mp4',mediaMode:'combined',...extra};
}
function buildTwitterPublic(data, cleanUrl, platform, sourceDetail) {
  const media=[...(data.mediaDetails||[]),...(data.quoted_tweet?.mediaDetails||[])];
  try {const card=JSON.parse(data.card?.binding_values?.unified_card?.string_value||'{}');media.push(...Object.values(card.media_entities||{}));} catch{}
  const items=[];
  for(const entry of media){
    const variants=(entry.video_info?.variants||[]).filter(v=>v.content_type==='video/mp4'&&/^https:\/\//.test(v.url||'')).sort((a,b)=>(b.bitrate||0)-(a.bitrate||0));
    for(const v of variants)items.push(video(v.url,'MP4 视频',v.bitrate?`${Math.round(v.bitrate/1000)} kbps`:'MP4'));
  }
  return makeResult(cleanUrl,platform,sourceDetail,data.text,items);
}
function buildPinterestPublic(data, cleanUrl, platform, sourceDetail) {
  const lists=[data.videos?.video_list];
  for(const page of data.story_pin_data?.pages||[])for(const block of page.blocks||[])lists.push(block.video?.video_list);
  const variants=lists.flatMap(l=>Object.values(l||{})).filter(v=>/^https?:\/\//.test(v?.url||'')&&!/\.m3u8(?:\?|$)/.test(v.url)).sort((a,b)=>(b.height||0)-(a.height||0));
  const items=variants.map(v=>video(v.url,'MP4 视频',v.height?`${v.height}p`:'MP4'));
  if(data.images?.orig?.url)items.push({url:data.images.orig.url,label:'封面图片',quality:'Cover',type:'图片',ext:'jpg'});
  return makeResult(cleanUrl,platform,sourceDetail,data.title||data.grid_title,items);
}
function buildVimeoPublic(data, cleanUrl, platform, sourceDetail) {
  const progressive=data.request?.files?.progressive||[];
  const items=progressive.filter(v=>/^https?:\/\//.test(v.url||'')).sort((a,b)=>(b.height||0)-(a.height||0)).map(v=>video(v.url,'完整视频 MP4（含声音）',v.quality||'MP4'));
  // A playlist or DRM-protected stream is not a directly downloadable MP4.
  // Keep it out of the success path unless a permitted file is actually available.
  return makeResult(cleanUrl,platform,sourceDetail,data.video?.title,items,{duration:data.video?.duration||0});
}
async function extractPublicPlatform(cleanUrl, platform, sourceDetail, io) {
  if(platform.name==='X / Twitter'){
    const id=new URL(cleanUrl).pathname.match(/\/(?:status|tweet)\/(\d+)/)?.[1];if(!id)return null;
    const token=((Number(id)/1e15)*Math.PI).toString(36).replace(/(0+|\.)/g,'');
    const data=await io.fetchJson(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token}`,{'User-Agent':'Googlebot'});
    return buildTwitterPublic(data,cleanUrl,platform,sourceDetail);
  }
  if(platform.name==='Pinterest'){
    let resolved=cleanUrl;if(new URL(cleanUrl).hostname==='pin.it')resolved=(await io.requestUrl(cleanUrl,{method:'HEAD'})).finalUrl;
    const id=new URL(resolved).pathname.match(/\/pin\/(\d+)/)?.[1];if(!id)return null;
    const url=new URL('https://www.pinterest.com/resource/PinResource/get/');url.searchParams.set('data',JSON.stringify({options:{id,field_set_key:'detailed'}}));
    const data=await io.fetchJson(url.href,{'X-Pinterest-PWS-Handler':'www/[username].js'});
    return buildPinterestPublic(data.resource_response?.data||{},cleanUrl,platform,sourceDetail);
  }
  if(platform.name==='快手'){
    const page=await io.requestUrl(cleanUrl,{headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',Referer:'https://www.kuaishou.com/'},limit:1024*1024});
    return buildKuaishouPublic(page.body||'',cleanUrl,platform,sourceDetail);
  }
  if(platform.name==='Vimeo'){
    const id=new URL(cleanUrl).pathname.match(/(?:^|\/)(\d+)(?:\/|$)/)?.[1];if(!id)return null;
    const data=await io.fetchJson(`https://player.vimeo.com/video/${id}/config`,{Referer:cleanUrl});
    return buildVimeoPublic(data,cleanUrl,platform,sourceDetail);
  }
  return null;
}
function buildKuaishouPublic(html,cleanUrl,platform,sourceDetail) {
  const assignment=html.match(/window\.INIT_STATE\s*=\s*([\s\S]*?)<\/script>/i);
  if(!assignment)return null;
  let state;try{state=JSON.parse(assignment[1].trim().replace(/;$/,''));}catch{return null;}
  const photo=Object.values(state).find(value=>value&&typeof value==='object'&&value.photo?.mainMvUrls)?.photo;
  if(!photo)return null;
  const urls=(photo.mainMvUrls||[]).map(entry=>entry.url).filter(url=>/^https?:\/\//.test(url||''));
  const items=urls.slice(0,3).map((url,index)=>video(url,index?'完整视频 MP4（备用线路）':'完整视频 MP4（含声音）','MP4'));
  return makeResult(cleanUrl,platform,sourceDetail,photo.caption||'快手视频',items,{duration:Number(photo.duration||0)/1000});
}
module.exports={buildKuaishouPublic,extractPublicPlatform,buildTwitterPublic,buildPinterestPublic,buildVimeoPublic};
