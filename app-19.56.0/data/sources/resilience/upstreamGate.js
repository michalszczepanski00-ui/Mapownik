// Bounded per-service scheduling. Idle groups and aborted waiters are removed.
const groups = new Map();
export function serviceGroupKey(value) {
    const text = String(value);
    if (/kiut[._]|KrajowaIntegracjaUzbrojeniaTerenu/.test(text)) return 'kiut';
    if (/gdos[._]|natura2000|sdi\.gdos\.gov\.pl/.test(text)) return 'gdos';
    if (/pgi[._](?:deposits|miningareas|miningterrains)|midas_archive_|services\/midas\//.test(text)) return 'midas';
    return text;
}
export function acquireRasterSlot(url, signal) {
    if (signal?.aborted) return Promise.reject(new DOMException('Anulowano', 'AbortError'));
    const key = serviceGroupKey(url);
    const limit = ['kiut','gdos','midas'].includes(key) ? 2 : 4;
    let group = groups.get(key);
    if (!group) { group = {active:0,queue:[]}; groups.set(key,group); }
    return new Promise((resolve,reject) => {
        const item = { start:null, abort:null };
        const clean = () => { if (!group.active && !group.queue.length) groups.delete(key); };
        item.abort = () => { const i=group.queue.indexOf(item); if(i>=0) group.queue.splice(i,1); signal?.removeEventListener('abort',item.abort); clean(); reject(new DOMException('Anulowano','AbortError')); };
        item.start = () => {
            signal?.removeEventListener('abort',item.abort);
            if(signal?.aborted) { item.abort(); return; }
            group.active++; let released=false;
            resolve(() => { if(released)return; released=true; group.active--; while(group.active<limit && group.queue.length) group.queue.shift().start(); clean(); });
        };
        if(group.active<limit)item.start();
        else {group.queue.push(item);signal?.addEventListener('abort',item.abort,{once:true});}
    });
}
export function rasterGateSnapshot() { return [...groups].map(([key,g])=>({key,active:g.active,queued:g.queue.length})); }
