export const HISTORY_LIMIT = 20;
export const labels = {ok:'Odpowiada',partial:'Ograniczenie',down:'Błąd próby',unknown:'Niesprawdzone / brak oceny',cancelled:'Przerwano',busy:'Sprawdzanie'};
export function remember(history, result) {
    // Cached server snapshots must not become fabricated repeated measurements.
    const id = `${result.mode || 'service'}:${result.checkedAt}:${result.fingerprint || ''}`;
    return [...history.filter(item => item.measurementId !== id), {...result,measurementId:id}].slice(-HISTORY_LIMIT);
}
export function summarize(history) {
    const measured=history.filter(item=>['ok','partial','down'].includes(item.state));
    const times=measured.map(item=>item.durationMs).filter(Number.isFinite).sort((a,b)=>a-b);
    return {samples:measured.length,ok:measured.filter(item=>item.state==='ok').length,
        medianMs:times.length?times[Math.floor(times.length/2)]:null,
        // Not uptime: manually selected, mixed sample types and no 24/7 observations.
        issueCount:measured.filter(item=>item.state!=='ok').length};
}
export async function requestJson(url,{signal,timeoutMs=15000,fetchImpl=fetch,options={}}={}) {
    const controller=new AbortController();
    const abort=()=>controller.abort(signal?.reason);
    if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>controller.abort(new DOMException('Limit czasu próby.','TimeoutError')),timeoutMs);
    try {
        const response=await fetchImpl(url,{...options,signal:controller.signal,cache:'no-store'});
        let payload;
        try{payload=await response.json();}catch(error){if(controller.signal.aborted)throw controller.signal.reason;throw new Error('Odpowiedź nie jest JSON. Sprawdź PHP i adres wdrożenia.');}
        if(!response.ok)throw Object.assign(new Error(payload?.error||`HTTP ${response.status}`),{status:response.status});
        return {payload,response};
    }catch(error){if(controller.signal.aborted)throw controller.signal.reason;throw error;}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function runLimited(items,task,{signal,concurrency=2}={}) {
    let next=0;const results=[];
    async function worker(){while(next<items.length&&!signal?.aborted){const i=next++;try{results[i]=await task(items[i],i);}catch(error){results[i]={error:String(error?.message||error)};}}}
    await Promise.all(Array.from({length:Math.min(concurrency,items.length)},worker));return results;
}
export function csvCell(value) {
    let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
}
