// Public note-state formats documented by ucmao/media-parser (MIT).
// JSON only: never evaluate a page's JavaScript or alter strings containing undefined.
function readPublicState(html) {
  const match = /window\.__INITIAL_STATE__\s*=\s*/.exec(html);
  if (!match || html[match.index+match[0].length] !== '{') return null;
  let out='', depth=0, quoted=false, escaped=false;
  for(let i=match.index+match[0].length;i<html.length;i++) {
    const c=html[i];
    if(quoted){out+=c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"'){quoted=true;out+=c;continue;}
    if(html.slice(i,i+9)==='undefined'&&!/[\w$]/.test(html[i-1]||'')&&!/[\w$]/.test(html[i+9]||'')){out+='null';i+=8;continue;}
    out+=c;
    if(c==='{')depth++;
    if(c==='}'&&--depth===0){try{return JSON.parse(out);}catch{return null;}}
  }
  return null;
}
function mediaUrl(value) {
  if(typeof value!=='string')return '';
  try{const u=new URL(value.startsWith('//')?'https:'+value:value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return '';u.protocol='https:';return u.href;}catch{return '';}
}
function imageUrl(image) {
  const info=image?.infoList||[];
  return mediaUrl(info.find(x=>x.imageScene==='WB_DFT')?.url||image?.urlDefault||image?.url||info[0]?.url);
}
function buildXiaohongshu(html,cleanUrl,finalUrl,platform,sourceDetail) {
  const state=readPublicState(html);if(!state)return null;
  const id=new URL(finalUrl).pathname.match(/\/(?:explore|discovery\/item)\/([a-f0-9]{24})/i)?.[1];
  if(!id)return null;
  const note=state.note?.noteDetailMap?.[id]?.note||state.noteData?.data?.noteData||state.noteData?.note||state.note?.note;
  if(!note||typeof note!=='object'||(note.noteId&&note.noteId!==id)||(note.id&&note.id!==id))return null;
  const items=[];
  const streams=note.video?.media?.stream||note.video?.stream||{};
  const variants=['h264','h265','av1'].flatMap(codec=>(Array.isArray(streams[codec])?streams[codec]:[]).map(v=>({...v,codec}))).filter(v=>mediaUrl(v.masterUrl)&&! /\.m3u8(?:\?|$)/i.test(v.masterUrl)).sort((a,b)=>(a.codec==='h264'?0:1)-(b.codec==='h264'?0:1)||(b.height||0)-(a.height||0));
  for(const v of variants.slice(0,3))items.push({type:'视频',label:'完整视频 MP4（含声音）',quality:v.height?Math.min(v.width||v.height,v.height)+'p':'MP4',url:mediaUrl(v.masterUrl),ext:'mp4',mediaMode:'combined'});
  if(!items.length){
    const key=note.video?.consumer?.originVideoKey||note.video?.originVideoKey;
    const url=mediaUrl(typeof key==='string'&&key?(/^https?:\/\//.test(key)?key:'https://sns-video-bd.xhscdn.com/'+key.replace(/^\//,'')):'');
    if(url)items.push({type:'视频',label:'完整视频 MP4（含声音）',quality:'Original',url,ext:'mp4',mediaMode:'combined'});
  }
  const images=Array.isArray(note.imageList)?note.imageList:[];
  for(const image of images.slice(0,30)){
    const url=imageUrl(image);if(url)items.push({type:'图片',label:items.some(i=>i.type==='视频')?'封面图片':'图片 '+(items.length+1),quality:'Image',url,ext:/\.webp(?:\?|$)/i.test(url)?'webp':'jpg'});
    if(items.some(i=>i.type==='视频'))break;
  }
  if(!items.length)return null;
  const title=note.title||note.desc||'小红书笔记';
  return {url:cleanUrl,platform,success:true,title:title+' · 媒体已提取',note:'已从公开笔记提取媒体。',sourceDetail:{...sourceDetail,extractor:'xiaohongshu-public-state',title,author:note.user?.nickname||'',noteId:id,finalUrl},items};
}
async function extractXiaohongshu(cleanUrl,platform,sourceDetail,io) {
  for(const ua of ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36','Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1']){
    try{
      const r=await io.requestUrl(cleanUrl,{timeout:6000,limit:2*1024*1024,headers:{'User-Agent':ua,Referer:'https://www.xiaohongshu.com/'}});
      const result=buildXiaohongshu(r.body||'',cleanUrl,r.finalUrl||cleanUrl,platform,sourceDetail);
      if(result)return result;
    }catch{}
  }
  return null;
}
module.exports={readPublicState,buildXiaohongshu,extractXiaohongshu};
