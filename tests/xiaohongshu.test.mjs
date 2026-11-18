import test from 'node:test';
import assert from 'node:assert/strict';
import xhs from '../lib/xiaohongshu.cjs';
import backend from '../server.js';
const id='6a74a4da000000003302c695',url='https://www.xiaohongshu.com/discovery/item/'+id;
test('Xiaohongshu public JSON preserves undefined in strings and never executes scripts',()=>{
 const html='<script>window.__INITIAL_STATE__ = {"missing":undefined,"note":{"noteDetailMap":{"'+id+'":{"note":{"noteId":"'+id+'","title":"undefined is a word","video":{"media":{"stream":{"h264":[{"masterUrl":"https://sns-video-bd.xhscdn.com/v.mp4","width":720,"height":1280}]}}}}}}}};</script>';
 const r=xhs.buildXiaohongshu(html,url,url,{name:'小红书'},{});
 assert.equal(r.sourceDetail.title,'undefined is a word');assert.equal(r.items[0].quality,'720p');
 assert.equal(xhs.readPublicState('<script>window.__INITIAL_STATE__ = {"x":(()=>{throw 1})()}</script>'),null);
});
test('Xiaohongshu public note rejects another note and supports image posts',()=>{
 const state={noteData:{data:{noteData:{noteId:'other',imageList:[{urlDefault:'https://sns-webpic.xhscdn.com/image.jpg'}]}}}};
 const html=()=>'<script>window.__INITIAL_STATE__='+JSON.stringify(state)+'</script>';
 assert.equal(xhs.buildXiaohongshu(html(),url,url,{name:'小红书'},{}),null);
 state.noteData.data.noteData.noteId=id;
 const r=xhs.buildXiaohongshu(html(),url,url,{name:'小红书'},{});assert.equal(r.items[0].type,'图片');
});
test('the .cn short link is recognized and a 200 error page is reported as inaccessible', async () => {
  const short = 'https://xhslink.cn/o/AxnRePgIokn';
  assert.equal(backend.detectPlatform(short).name, '小红书');
  const issues = [];
  const result = await xhs.extractXiaohongshu(short, { name: '小红书' }, {}, {
    requestUrl: async () => ({ statusCode: 200, finalUrl: 'https://www.xiaohongshu.com/404', body: '<title>404</title>' }),
    reportAccessIssue: issue => issues.push(issue)
  });
  assert.equal(result, null);
  assert.match(issues[0], /重新复制完整链接/);
});
