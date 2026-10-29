import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectMedia } from '../scripts/media.mjs';
import { activateTheme } from '../src/runtime.mjs';
import { browserHarness } from './browser-harness.mjs';

function box(name,content){const header=Buffer.alloc(8);header.writeUInt32BE(content.length+8);header.write(name,4);return Buffer.concat([header,content]);}
function mp4(seconds,version=0){const header=Buffer.alloc(version===1?32:20);header[0]=version;if(version===0){header.writeUInt32BE(1000,12);header.writeUInt32BE(seconds*1000,16);}else{header.writeUInt32BE(1000,20);header.writeBigUInt64BE(BigInt(seconds*1000),24);}return Buffer.concat([box('ftyp',Buffer.from('isom0000')),box('moov',box('mvhd',header))]);}
function ebml(id,content){assert.ok(content.length<127);return Buffer.concat([Buffer.from(id,'hex'),Buffer.from([0x80|content.length]),content]);}
function webm(seconds){const duration=Buffer.alloc(8);duration.writeDoubleBE(seconds*1000);return Buffer.concat([ebml('1a45dfa3',Buffer.alloc(0)),ebml('18538067',ebml('1549a966',ebml('4489',duration)))]);}

test('MP4 accepts exactly 4 seconds and rejects 4.001 seconds',()=>{
  assert.equal(inspectMedia(mp4(4)).duration,4);
  assert.throws(()=>inspectMedia(mp4(4.001)),/maximum is 4 seconds/);
});
test('MP4 version 1 uses 64-bit duration fields',()=>{
  assert.equal(inspectMedia(mp4(3,1)).duration,3);
  assert.throws(()=>inspectMedia(mp4(5,1)),/maximum is 4 seconds/);
});
test('WebM accepts 4 seconds and rejects longer or missing metadata',()=>{
  assert.equal(inspectMedia(webm(4)).duration,4);
  assert.throws(()=>inspectMedia(webm(4.01)),/maximum is 4 seconds/);
  assert.throws(()=>inspectMedia(Buffer.from('1a45dfa3801853806780','hex')),/missing duration metadata/);
});
test('invalid, truncated and zero-duration videos are rejected',()=>{
  assert.throws(()=>inspectMedia(mp4(0)),/cannot be verified/);
  assert.throws(()=>inspectMedia(mp4(2).subarray(0,25)),/MP4/);
  assert.throws(()=>inspectMedia(Buffer.from('1a45dfa301','hex')),/WebM/);
});
test('GIF and animated image containers are accepted without transcoding',()=>{
  assert.equal(inspectMedia(Buffer.from('GIF89a1234567890')).mime,'image/gif');
  assert.equal(inspectMedia(Buffer.from('524946460000000057454250','hex')).mime,'image/webp');
});

const defaultMedia={kind:'image',mime:'image/png',uri:'data:image/png;base64,aA=='};
function start(browser){return activateTheme(browser.ctx,{css:'html body[data-sakura-study]{}',media:defaultMedia,maxVideoSeconds:4},{createElement(){}},browser.env);}
test('file picker stores, restores and resets a background locally',async()=>{
  const storage=new Map();const browser=browserHarness({storage});const controller=start(browser);
  const file=new File([mp4(2)],'short.mp4',{type:'video/mp4'});
  await controller.selectFile(file);await browser.flush();
  assert.equal(controller.getSnapshot().kind,'video');
  assert.equal(storage.get('current').name,'short.mp4');
  const video=browser.frame.children[0].children[0];
  assert.equal(video.muted,true);assert.equal(video.volume,0);assert.equal(video.loop,true);assert.equal(video.playsInline,true);assert.equal(video.paused,false);
  controller.pause();assert.equal(video.paused,true);controller.play();await browser.flush();assert.equal(video.paused,false);
  browser.env.document.hidden=true;browser.events.get('visibilitychange')();assert.equal(video.paused,true);
  browser.env.document.hidden=false;browser.events.get('visibilitychange')();await browser.flush();assert.equal(video.paused,false);
  browser.dispose();assert.equal(browser.urls.size,0);assert.equal(browser.controls,null);
  const next=browserHarness({storage});const restored=start(next);await next.flush();await next.flush();
  assert.equal(restored.getSnapshot().name,'short.mp4');
  await restored.reset();assert.equal(storage.has('current'),false);assert.equal(restored.getSnapshot().kind,'image');next.dispose();
});
test('runtime rejects a long video without replacing the active background',async()=>{
  const browser=browserHarness({duration:4.01});const controller=start(browser);
  await controller.selectFile(new File([mp4(4.01)],'long.mp4'));
  assert.match(controller.getSnapshot().error,/exceeds 4 seconds/);
  assert.equal(controller.getSnapshot().kind,'image');assert.equal(browser.storage.size,0);assert.equal(browser.urls.size,0);browser.dispose();
});
test('reduced motion pauses video, while a manual play command remains available',async()=>{
  const browser=browserHarness({reducedMotion:true});const controller=start(browser);
  await controller.selectFile(new File([mp4(2)],'short.mp4'));await browser.flush();
  const video=browser.frame.children[0].children[0];assert.equal(video.paused,true);
  browser.mediaQuery.matches=false;browser.mediaQuery.listener();await browser.flush();assert.equal(video.paused,false);
  browser.dispose();assert.equal(browser.urls.size,0);assert.equal(browser.frame.children.length,0);
});
