import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
if (!process.argv[2]) throw new Error('Usage: node prepare-audio.mjs /path/to/audio-directory');
const directory = path.resolve(process.argv[2]);
const destination = new URL('./local-audio/', import.meta.url);
fs.mkdirSync(destination,{recursive:true});
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const manifest=[];
for(const name of ['A','B','C','D']){
 const original=path.join(directory,name+'.mp3'),wav=new URL(name+'.wav',destination);
 try {
  execFileSync('/usr/bin/afconvert',[original,wav.pathname,'-f','WAVE','-d','LEF32@48000','-c','2']);
  const bytes=fs.readFileSync(wav);let offset=12,data;
  if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw Error('Expected RIFF/WAVE');
  while(offset+8<=bytes.length){const tag=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4);if(tag==='fmt '&&(bytes.readUInt16LE(offset+10)!==2||bytes.readUInt32LE(offset+12)!==48000||bytes.readUInt16LE(offset+22)!==32))throw Error('Expected stereo float32 / 48 kHz');if(tag==='data'){data=bytes.subarray(offset+8,offset+8+Math.min(size,48000*30*8));break;}offset+=8+size+(size%2);}
  if(!data||data.length%8)throw Error('Invalid PCM payload');
  fs.writeFileSync(new URL(name+'.f32',destination),data);
  manifest.push({name,originalSha256:hash(fs.readFileSync(original)),pcmSha256:hash(data),rate:48000,channels:2,seconds:data.length/(48000*8),decode:'macOS afconvert LEF32; first30s'});
 }finally{fs.rmSync(wav,{force:true});}
}
fs.writeFileSync(new URL('./results/audio-manifest.json',import.meta.url),JSON.stringify(manifest,null,2));
console.log('Prepared four local recordings; audio is excluded from Git.');
