// This function is embedded in client.js; keep all browser helpers inside it.
export function activateTheme(ctx, options, React, env = globalThis) {
  let controller;
  ctx.effect(() => {
    const doc = env.document, body = doc.body;
    const previous = body.getAttribute('data-sakura-study');
    const style = doc.createElement('style');
    style.dataset.plugin = 'dsh-sakura-study-theme'; style.textContent = options.css;
    body.setAttribute('data-sakura-study', 'true'); doc.head.appendChild(style);
    let disposed = false, revision = 0, current = options.media, frame, element, currentURL, db, userPaused = false;
    let snapshot = { name: '', kind: current.kind, duration: current.duration || null, error: '', busy: false, paused: false };
    const listeners = new Set(), pending = new Set(), databases = new Set();
    const reduced = env.matchMedia?.('(prefers-reduced-motion: reduce)');
    const notify = patch => { if (!disposed) { snapshot = { ...snapshot, ...patch }; for (const fn of listeners) fn(); } };
    const host = doc.createElement('div'); host.dataset.sakuraMedia = 'true'; host.setAttribute('aria-hidden','true');

    async function database() {
      if (!env.indexedDB) throw new Error('This browser cannot save backgrounds.');
      if (db) return db;
      const opened = await new Promise((resolve, reject) => {
        const request = env.indexedDB.open('dsh-sakura-study-theme', 1);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('media')) request.result.createObjectStore('media'); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Cannot open background storage.'));
        request.onblocked = () => reject(new Error('Background storage is blocked. Close other Harness windows and retry.'));
      });
      if (disposed) { opened.close(); throw new Error('Theme disposed.'); }
      databases.add(opened);
      db = opened; db.onversionchange = () => { opened.close(); databases.delete(opened); if (db === opened) db = null; };
      return db;
    }
    async function store(action, value) {
      const opened = await database();
      return new Promise((resolve, reject) => {
        const tx = opened.transaction('media', action === 'get' ? 'readonly' : 'readwrite');
        const store = tx.objectStore('media');
        const request = action === 'get' ? store.get('current') : action === 'delete' ? store.delete('current') : store.put(value,'current');
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('Background could not be saved.'));
      });
    }
    function releaseElement() {
      if (element) {
        element.onloadedmetadata = element.ondurationchange = element.ontimeupdate = element.onload = element.onerror = null;
        if (element.tagName === 'VIDEO') { element.pause(); element.removeAttribute('src'); element.load(); }
        element.remove(); element = null;
      }
      if (currentURL) { env.URL.revokeObjectURL(currentURL); currentURL = null; }
    }
    function videoDuration(video) {
      if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Cannot read video duration. Use a file with duration metadata.');
      if (video.duration > options.maxVideoSeconds) throw new Error(`Video exceeds ${options.maxVideoSeconds} seconds (${video.duration.toFixed(3)}s).`);
      if (!video.videoWidth || !video.videoHeight) throw new Error('The file has no decodable video track.');
      return video.duration;
    }
    function validateURL(url, kind) {
      return new Promise((resolve,reject) => {
        const probe = doc.createElement(kind === 'video' ? 'video' : 'img');
        let timer, settled = false;
        const end = (error, duration) => {
          if (settled) return;
          settled = true;
          env.clearTimeout(timer); pending.delete(cancel);
          probe.onload = probe.onerror = probe.onloadedmetadata = null;
          if (kind === 'video') { probe.pause(); probe.removeAttribute('src'); probe.load(); }
          else probe.removeAttribute('src');
          error ? reject(error) : resolve(duration);
        };
        const cancel = () => end(new Error('Theme disposed.'));
        pending.add(cancel);
        probe.onerror = () => end(new Error('This media format or codec cannot be played. Try GIF, H.264 MP4 or VP8/VP9 WebM.'));
        if (kind === 'video') {
          probe.preload = 'metadata'; probe.muted = true; probe.playsInline = true;
          probe.onloadedmetadata = () => { try { end(null,videoDuration(probe)); } catch (error) { end(error); } };
        } else probe.onload = () => end(null,null);
        timer = env.setTimeout(() => end(new Error('Media could not be read within 10 seconds.')), 10000);
        probe.src = url;
      });
    }
    async function play() {
      if (!element || element.tagName !== 'VIDEO') return;
      const video = element;
      try { videoDuration(video); }
      catch (error) { notify({paused:true,error:error.message}); return; }
      userPaused = false;
      try { await video.play(); if (element === video) notify({ paused: false, error: '' }); }
      catch { if (element === video) notify({ paused: true, error: 'Autoplay was blocked. Click Play in this panel.' }); }
    }
    function motion() {
      if (!element) return;
      if (element.tagName === 'VIDEO') {
        if (doc.hidden || reduced?.matches) { element.pause(); notify({ paused:true }); }
        else if (!userPaused) void play();
      } else if (element.tagName === 'IMG' && reduced?.matches && element.complete && element.naturalWidth) {
        const canvas = doc.createElement('canvas');
        const scale = Math.min(1,4096 / Math.max(element.naturalWidth,element.naturalHeight));
        canvas.width = Math.max(1,Math.round(element.naturalWidth*scale)); canvas.height = Math.max(1,Math.round(element.naturalHeight*scale));
        try { canvas.getContext('2d').drawImage(element,0,0,canvas.width,canvas.height); element.replaceWith(canvas); element = canvas; } catch { /* Keep the image if canvas is unavailable. */ }
      }
    }
    function render(media) {
      releaseElement(); current = media; userPaused = false;
      currentURL = media.blob ? env.URL.createObjectURL(media.blob) : null;
      element = doc.createElement(media.kind === 'video' ? 'video' : 'img');
      if (media.kind === 'video') {
        const video = element;
        element.muted = true; element.defaultMuted = true; element.volume = 0;
        element.loop = true; element.autoplay = true; element.playsInline = true; element.preload = 'auto';
        const check = () => {
          if (disposed || element !== video) return false;
          try { videoDuration(video); return true; }
          catch (error) { video.autoplay = false; video.pause(); notify({error:error.message,paused:true}); return false; }
        };
        element.onloadedmetadata = () => {
          if (check()) { motion(); if (!doc.hidden && !reduced?.matches) void play(); }
        };
        element.ondurationchange = () => { if (video.readyState >= 1) check(); };
        element.ontimeupdate = () => { if (video.currentTime > options.maxVideoSeconds) { video.autoplay=false;video.pause();notify({error:'Video playback exceeded the 4 second limit.',paused:true}); } };
        element.onerror = () => notify({ error:'Video could not be decoded. Choose another file or restore the default background.', paused:true });
      } else { element.alt = ''; element.onload = motion; element.onerror = () => notify({error:'Image could not be decoded. Choose another file or restore the default background.'}); }
      element.src = currentURL || media.uri;
      host.appendChild(element);
      notify({ name: media.name || '', kind: media.kind, duration: media.duration || null, paused: !!reduced?.matches });
    }
    async function selectFile(file) {
      const generation = ++revision;
      notify({ busy:true, error:'' });
      let url;
      try {
        if (!file || file.size > 32 * 1024 * 1024) throw new Error('Choose a local file no larger than 32 MiB.');
        const b = new Uint8Array(await file.slice(0,12).arrayBuffer());
        if (disposed || generation !== revision) return;
        let mime, kind = 'image';
        if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) mime = 'image/jpeg';
        else if ([137,80,78,71,13,10,26,10].every((x,i) => b[i] === x)) mime = 'image/png';
        else if (String.fromCharCode(...b.slice(0,6)) === 'GIF89a' || String.fromCharCode(...b.slice(0,6)) === 'GIF87a') mime = 'image/gif';
        else if (String.fromCharCode(...b.slice(0,4)) === 'RIFF' && String.fromCharCode(...b.slice(8,12)) === 'WEBP') mime = 'image/webp';
        else if (String.fromCharCode(...b.slice(4,8)) === 'ftyp') { mime = 'video/mp4'; kind = 'video'; }
        else if ([26,69,223,163].every((x,i) => b[i] === x)) { mime = 'video/webm'; kind = 'video'; }
        else throw new Error('Choose JPEG, PNG/APNG, GIF, WebP, MP4 or WebM.');
        const blob = file.slice(0,file.size,mime);
        url = env.URL.createObjectURL(blob);
        const duration = await validateURL(url,kind);
        if (disposed || generation !== revision) return;
        const media = { blob, mime, kind, name:file.name, duration };
        await store('put',media);
        if (!disposed && generation === revision) render(media);
      } catch (error) { if (generation === revision) notify({ error:error.message }); }
      finally { if (url) env.URL.revokeObjectURL(url); if (generation === revision) notify({ busy:false }); }
    }
    async function reset() {
      const generation = ++revision; notify({ busy:true, error:'' });
      try { await store('delete'); if (!disposed && generation === revision) render(options.media); }
      catch (error) { notify({ error:error.message }); }
      finally { if (generation === revision) notify({ busy:false }); }
    }
    controller = { selectFile, reset, play, getSnapshot: () => snapshot, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      pause() { if (element?.tagName === 'VIDEO') { userPaused = true; element.pause(); notify({paused:true}); } } };
    function attach() {
      if (disposed) return;
      const found = doc.querySelector('.mP3x-q_frame');
      if (found && (found !== frame || host.parentNode !== found)) { frame = found; frame.prepend(host); }
    }
    render(options.media); attach();
    const observer = new env.MutationObserver(attach); observer.observe(body,{childList:true,subtree:true});
    const onVisibility = () => { if (element?.tagName === 'VIDEO') { if (doc.hidden) element.pause(); else if (!reduced?.matches && !userPaused) void play(); } };
    const onMotion = () => { if (!reduced.matches && element?.tagName === 'CANVAS') render(current); else motion(); };
    doc.addEventListener('visibilitychange',onVisibility); reduced?.addEventListener?.('change',onMotion);
    const initialRevision = revision;
    void store('get').then(async saved => {
      if (!saved?.blob || disposed || revision !== initialRevision) return;
      const url = env.URL.createObjectURL(saved.blob);
      try { saved.duration = await validateURL(url,saved.kind); if (!disposed && revision === initialRevision) render(saved); }
      catch (error) { notify({error:error.message}); }
      finally { env.URL.revokeObjectURL(url); }
    }).catch(() => { /* Default background works even if browser storage is unavailable. */ });

    let unregister;
    if (React && ctx.slots) {
      const h = React.createElement;
      const zh = (doc.documentElement.lang || env.navigator?.language || '').toLowerCase().startsWith('zh');
      const t = zh ? { button:'更换背景', title:'背景设置', choose:'选择图片或视频', hint:'GIF / 动态 WebP / APNG，或不超过 4 秒的 MP4 / WebM。文件只保存在本机。', reset:'恢复默认', close:'关闭', play:'播放', pause:'暂停', busy:'正在检查并保存…' } : { button:'Background', title:'Background settings', choose:'Choose image or video', hint:'GIF / animated WebP / APNG, or MP4 / WebM up to 4 seconds. Files stay on this device.', reset:'Restore default', close:'Close', play:'Play', pause:'Pause', busy:'Checking and saving…' };
      function Controls() {
        const state = React.useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
        const [open,setOpen] = React.useState(false);
        const input = React.useRef(null);
        return h('div',{className:'sakura-study-controls'},
          h('button',{type:'button',onClick:() => setOpen(!open),'aria-expanded':open},t.button),
          open && h('section',{className:'sakura-study-panel','aria-label':t.title},
            h('strong',null,t.title), h('p',null,t.hint),
            state.name && h('p',{className:'sakura-study-filename'},state.name + (state.duration ? ` · ${state.duration.toFixed(2)}s` : '')),
            h('input',{ref:input,type:'file',accept:'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm',hidden:true,onChange:event => {const file=event.target.files?.[0];event.target.value='';if(file)void controller.selectFile(file);}}),
            h('button',{type:'button',disabled:state.busy,onClick:() => input.current?.click()},t.choose),
            state.kind === 'video' && h('button',{type:'button',onClick:() => state.paused ? void controller.play() : controller.pause()},state.paused?t.play:t.pause),
            h('button',{type:'button',disabled:state.busy,onClick:() => void controller.reset()},t.reset),
            h('button',{type:'button',onClick:() => setOpen(false)},t.close),
            state.busy && h('p',{role:'status'},t.busy), state.error && h('p',{role:'alert'},state.error)));
      }
      unregister = ctx.slots.inject('shell.overlay',() => ctx.slots.register({name:'shell.overlay',id:'sakura-study-background-controls',order:30},Controls));
    }
    return () => {
      disposed = true; revision++; for (const cancel of [...pending]) cancel();
      observer.disconnect(); doc.removeEventListener('visibilitychange',onVisibility); reduced?.removeEventListener?.('change',onMotion);
      if (typeof unregister === 'function') unregister();
      releaseElement(); host.remove(); style.remove(); for (const opened of databases) opened.close(); databases.clear(); listeners.clear();
      if (previous === null) body.removeAttribute('data-sakura-study'); else body.setAttribute('data-sakura-study',previous);
    };
  },'sakura-study.styles-and-media');
  return controller;
}
