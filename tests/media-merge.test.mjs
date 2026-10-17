import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import merge from '../lib/merge-media.js';

test('actual remux produces an MP4 containing both video and audio, sharing duplicate work', async t=>{
 const localPython=fileURLToPath(new URL('../.venv/bin/python',import.meta.url));
 let ffmpeg;
 try {ffmpeg=execFileSync(localPython,['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8'}).trim();}catch{t.skip('Local media verification requires imageio-ffmpeg');return;}
 process.env.PYTHON=localPython;
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'muse-merge-test-'));
 try {
  const v=path.join(dir,'v.mp4'),a=path.join(dir,'a.m4a');
  execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=size=160x90:rate=10','-t','0.5','-an','-c:v','libx264',v]);
  execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=440','-t','0.5','-vn','-c:a','aac',a]);
  let downloads=0;
  const download=async(url,file,limit)=>{downloads++;const src=url.endsWith('v')?v:a;const size=(await fs.stat(src)).size;assert.ok(size<limit);await fs.copyFile(src,file);return size;};
  const url='https://cdn.example/test-'+Date.now();
  const [one,two]=await Promise.all([merge.mergedFile(url+'v',url+'a',download),merge.mergedFile(url+'v',url+'a',download)]);
  assert.equal(downloads,2);assert.equal(one.path,two.path);
  const args=['-hide_banner','-i',one.path,'-t','0.1','-f','null','-'];
  let stderr='';
  try {execFileSync(ffmpeg,args,{stdio:['ignore','pipe','pipe']});}catch(e){assert.fail(String(e.stderr));}
  // Probe without decoding a whole file, checking actual stream declarations.
  try{execFileSync(ffmpeg,['-hide_banner','-i',one.path],{stdio:['ignore','pipe','pipe']});}catch(e){stderr=String(e.stderr);}
  assert.match(stderr,/Video: h264/);assert.match(stderr,/Audio: aac/);
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});
