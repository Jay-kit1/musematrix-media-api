const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const run = promisify(execFile);
const jobs = new Map();
const completed = new Map();
const preparations = new Map();
let active = 0;
let binary;
async function ffmpegPath() {
  if (!binary) binary = (async()=>{
    const python=process.env.PYTHON || 'python3';
    const query=['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'];
    try {return (await run(python,query,{timeout:5000})).stdout.trim();}
    catch {
      // Existing Render services can retain an older dashboard build command.
      // Install the pinned media dependency once if that build did not provide it.
      await run(python,['-m','pip','install','--quiet','--disable-pip-version-check','imageio-ffmpeg==0.6.0'],{timeout:90000,maxBuffer:8192});
      return (await run(python,query,{timeout:5000})).stdout.trim();
    }
  })().catch(e=>{binary=null;throw e});
  return binary;
}
function mergeArgs(video, audio, output) {
  return ['-nostdin','-hide_banner','-loglevel','error','-y','-protocol_whitelist','file,pipe','-f','mov','-i',video,'-protocol_whitelist','file,pipe','-f','mov','-i',audio,'-map','0:v:0','-map','1:a:0','-c','copy','-movflags','+faststart','-f','mp4',output];
}
async function mergedFile(videoUrl,audioUrl,download,onStage=()=>{}) {
  const key=videoUrl+'\n'+audioUrl;
  if(jobs.has(key))return jobs.get(key);
  if(active>=2)throw Object.assign(new Error('合并任务繁忙，请稍后重试。'),{status:429});
  if(completed.size>=3){const [old,dir]=completed.entries().next().value;completed.delete(old);jobs.delete(old);fsp.rm(dir,{recursive:true,force:true}).catch(()=>{});}
  active++;
  const task=(async()=>{
    const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'muse-media-'));
    try {
      const video=path.join(dir,'video.mp4'),audio=path.join(dir,'audio.m4a'),output=path.join(dir,'complete.mp4');
      const ffmpegReady=ffmpegPath().then(value=>({value}),error=>({error}));
      // Bound ephemeral disk use; network streams are validated/pinned by the caller.
      const limit=256*1024*1024;
      onStage('正在读取视频轨');
      const videoBytes=await download(videoUrl,video,limit);
      onStage('正在读取音频轨');
      await download(audioUrl,audio,limit-videoBytes);
      for(const file of [video,audio]){
        const handle=await fsp.open(file,'r');const b=Buffer.alloc(12);await handle.read(b,0,12,0);await handle.close();
        if(!['ftyp','styp'].includes(b.toString('ascii',4,8)))throw new Error('媒体轨道不是有效的 MP4/M4A 文件。');
      }
      onStage('正在准备合并组件');
      const ffmpegResult=await ffmpegReady;
      if(ffmpegResult.error)throw ffmpegResult.error;
      const ffmpeg=ffmpegResult.value;
      onStage('正在合并声音和画面');
      await run(ffmpeg,mergeArgs(video,audio,output),{timeout:45000,maxBuffer:8192});
      await Promise.all([fsp.unlink(video),fsp.unlink(audio)]);
      const stat=await fsp.stat(output);if(!stat.size)throw new Error('合并没有产生视频文件。');
      completed.set(key,dir);
      const timer=setTimeout(()=>{completed.delete(key);jobs.delete(key);fsp.rm(dir,{recursive:true,force:true}).catch(()=>{});},5*60*1000);timer.unref();
      return {path:output,size:stat.size};
    } catch(e){jobs.delete(key);await fsp.rm(dir,{recursive:true,force:true});throw e;}
    finally {active--;}
  })();
  jobs.set(key,task);
  return task;
}
function prepareMergedFile(videoUrl,audioUrl,download,retry=false) {
  const key=videoUrl+'\n'+audioUrl;
  if(preparations.get(key)?.status==='ready'&&!jobs.has(key))preparations.delete(key);
  if(retry&&preparations.get(key)?.status==='failed')preparations.delete(key);
  if(!preparations.has(key)){
    if(preparations.size>=50)return {status:'failed',error:'合并任务繁忙，请稍后重试。'};
    const state={status:'preparing',stage:'正在准备完整视频'};
    preparations.set(key,state);
    mergedFile(videoUrl,audioUrl,download,stage=>{state.stage=stage;}).then(()=>{
      state.status='ready';state.stage='完整视频已准备好';
    },error=>{
      state.status='failed';state.stage='完整视频准备失败';
      state.error=/超时|时限|timeout|timed out/i.test(error.message)?'媒体源响应超时，请重新提取后重试。':/轨道|MP4|M4A|大小|过大|繁忙/.test(error.message)?error.message:'音画合并未完成，请重新提取后重试。';
    });
    const timer=setTimeout(()=>preparations.delete(key),5*60*1000);timer.unref();
  }
  return {...preparations.get(key)};
}
module.exports={mergedFile,mergeArgs,prepareMergedFile};
