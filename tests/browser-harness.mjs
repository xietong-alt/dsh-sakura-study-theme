import vm from 'node:vm';

export function browserHarness({ duration = 2, reducedMotion = false, storage = new Map() } = {}) {
  const attrs = new Map(), styles = [], urls = new Map(), revoked = [], events = new Map();
  const mediaQuery = { matches:reducedMotion, addEventListener(_,fn){this.listener=fn;}, removeEventListener(){this.listener=null;} };
  class Element {
    constructor(tag) { this.tagName=tag.toUpperCase(); this.dataset={}; this.attributes=new Map(); this.children=[]; this.duration=duration; this.videoWidth=16; this.videoHeight=16; this.complete=true; this.naturalWidth=16; this.naturalHeight=16; this.paused=true; }
    set src(value) { this._src=value; queueMicrotask(() => {if(this._src) (this.tagName==='VIDEO'?this.onloadedmetadata:this.onload)?.();}); }
    get src(){return this._src;}
    get parentNode(){return this.parent;}
    setAttribute(k,v){this.attributes.set(k,v);}
    getAttribute(k){return this.attributes.has(k)?this.attributes.get(k):null;}
    removeAttribute(k){this.attributes.delete(k);if(k==='src')this._src='';}
    appendChild(child){child.remove();this.children.push(child);child.parent=this;return child;}
    prepend(child){child.remove();this.children.unshift(child);child.parent=this;}
    remove(){if(this.parent){const i=this.parent.children.indexOf(this);if(i>=0)this.parent.children.splice(i,1);this.parent=null;}}
    replaceWith(child){const p=this.parent;this.remove();p?.appendChild(child);}
    play(){this.paused=false;return Promise.resolve();}
    pause(){this.paused=true;}
    load(){}
    getContext(){return {drawImage(){}};}
  }
  const frame=new Element('main');
  const body=new Element('body'); body.attributes=attrs;
  const head=new Element('head'); head.children=styles;
  const doc={body,head,documentElement:{lang:'en'},hidden:false,createElement:tag=>new Element(tag),querySelector:()=>frame,
    addEventListener(name,fn){events.set(name,fn);},removeEventListener(name){events.delete(name);} };
  let closed=0;
  const indexedDB={open(){const request={};queueMicrotask(()=>{request.result={objectStoreNames:{contains:()=>true},close(){closed++;},transaction(){const tx={};const complete=result=>{const r={result};queueMicrotask(()=>tx.oncomplete?.());return r;};tx.objectStore=()=>({get:k=>complete(storage.get(k)),put:(v,k)=>{storage.set(k,v);return complete();},delete:k=>{storage.delete(k);return complete();}});return tx;}};request.onsuccess?.();});return request;}};
  const env={document:doc,navigator:{language:'en'},indexedDB,setTimeout,clearTimeout,matchMedia:()=>mediaQuery,
    MutationObserver:class{observe(){}disconnect(){}},URL:{createObjectURL(blob){const id='blob:test-'+urls.size+'-'+revoked.length;urls.set(id,blob);return id;},revokeObjectURL(id){revoked.push(id);urls.delete(id);}}};
  let cleanup, exports, controls;
  const ctx={effect(fn){cleanup=fn();},slots:{inject(name,fn){if(name!=='shell.overlay')throw new Error('Unexpected slot');return fn();},register(options,component){controls={options,component};return ()=>{controls=null;};}}};
  return {attrs,styles,env,ctx,frame,storage,urls,revoked,mediaQuery,events,get controls(){return controls;},get closed(){return closed;},
    run(source){vm.runInNewContext(source,{...env,window:{__ModuleLoader__:{load(module){exports=module.factory(()=>({createElement(){}}));}}}});if(styles.length)throw new Error('Factory modified the page.');exports.apply(ctx);},
    dispose(){cleanup();},flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
