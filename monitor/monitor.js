import {labels,remember,summarize,requestJson,runLimited,csvCell} from './engine.js';
const $=id=>document.getElementById(id), storageKey='mapownik.source-monitor.v2';
let catalog=[],histories={},current=new Map(),controller=null,timer=null;
const rowElements=new Map();
try{const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))histories=saved;}catch{}
function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(className)e.className=className;return e;}
function save(){try{localStorage.setItem(storageKey,JSON.stringify(histories));}catch{$('progress').textContent='Brak miejsca na historię w przeglądarce. Możesz pobrać raport JSON.';}}
function visibleItems(){const q=$('search').value.trim().toLocaleLowerCase('pl');return catalog.filter(item=>{
    const r=current.get(item.id),state=r?.state||'unknown';
    return `${item.title} ${item.group} ${item.id}`.toLocaleLowerCase('pl').includes(q)
        &&($('filter').value!=='issues'||['partial','down'].includes(state))
        &&($('filter').value!=='unchecked'||!r);
});}
function time(at){return at?new Date(at*1000).toLocaleString('pl-PL'):'—';}
function render(){
    const visible=new Set(visibleItems().map(item=>item.id));
    let ok=0,issues=0,busy=0,unchecked=0;
    for(const item of catalog){
        const r=current.get(item.id);const state=r?.state||'unknown';
        if(state==='ok')ok++;else if(['down','partial'].includes(state))issues++;else if(state==='busy')busy++;else unchecked++;
        let row=rowElements.get(item.id);
        if(!row){row=node('tr');row.dataset.id=item.id;rowElements.set(item.id,row);$('rows').append(row);}
        row.hidden=!visible.has(item.id);
        row.replaceChildren();
        const name=node('td');name.append(node('strong',item.title),node('small',`${item.group} · ${item.kind}`));
        if(item.minZoom)name.append(node('small',`Na mapie od zbliżenia ${item.minZoom}`));
        const stateCell=node('td');stateCell.append(node('span',labels[state]||state,`status ${state}`),node('small',r?.message||'Nie wykonano próby.'));
        if(r?.cached)stateCell.append(node('small',`Wynik serwera z pamięci diagnostyki · wiek ${r.ageSeconds} s`));
        if(r?.scope)stateCell.append(node('small',r.scope));
        if(r?.issueCode)stateCell.append(node('small',`Kod: ${r.issueCode}`));
        if(r?.coverage==='unknown')stateCell.append(node('small','Pokrycie danych w tym miejscu: niepotwierdzone.'));
        if(r?.semanticIssues?.length)stateCell.append(node('small',r.semanticIssues.map(s=>`${s.name}: ${s.actual}`).join(' · ')));
        if(r?.checkedAt&&Date.now()/1000-r.checkedAt>900)stateCell.append(node('small','Wynik starszy niż 15 minut.'));
        const timing=node('td',r?.durationMs!=null?`${r.durationMs} ms`:'—');timing.append(node('small',r?.http!=null?`HTTP ${r.http}`:''));
        const hist=Array.isArray(histories[item.id])?histories[item.id]:[];
        const historyCell=node('td'),bars=node('span',undefined,'history');
        for(const entry of hist.slice(-12)){const bar=node('i',undefined,entry.state);bar.title=`${time(entry.checkedAt)} · ${labels[entry.state]} · ${entry.mode||'service'}`;bars.append(bar);}
        const stats=summarize(hist);historyCell.append(bars,node('small',`${stats.samples} prób · ${stats.issueCount} z ograniczeniem / błędem`));
        const actions=node('td'),buttons=node('div',undefined,'actions');
        for(const [mode,title] of [['service','Sprawdź'],...(item.kind==='wms'?[['image','Obraz']]:[]),['details','Szczegóły']]){
            const button=node('button',title);button.type='button';button.dataset.id=item.id;button.dataset.mode=mode;
            button.disabled=mode!=='details'&&Boolean(controller);buttons.append(button);
        }
        actions.append(buttons);row.append(name,stateCell,timing,node('td',time(r?.checkedAt)),historyCell,actions);
    }
    $('summary').replaceChildren(...[`Źródła: ${catalog.length}`,`Odpowiadają: ${ok}`,`Problemy / ograniczenia: ${issues}`,`Sprawdzanie: ${busy}`,`Brak oceny: ${unchecked}`].map(text=>node('span',text)));
    $('check').disabled=Boolean(controller);$('checkImages').disabled=Boolean(controller);$('stop').disabled=!controller;
    $('clear').disabled=Boolean(controller);
    $('x').disabled=Boolean(controller);$('y').disabled=Boolean(controller);
}
async function probe(item,mode,signal){
    const started=performance.now();
    if(item.sourceKey){
        // 19.23.0: image-ref — próbka obrazu w punkcie wzorcowym źródła (serwer zwraca użyty punkt).
        const params=new URLSearchParams({source:item.sourceKey,mode:mode==='image-ref'?'image':mode,x:$('x').value,y:$('y').value});
        if(mode==='image-ref')params.set('point','ref');
        const {payload}=await requestJson(`./api/source_monitor.php?${params}`,{signal});
        if(!payload.ok||!['ok','partial','down','unknown'].includes(payload.state))throw new Error(payload.error||'Nieprawidłowy wynik diagnostyki.');
        return {...payload,...(mode!=='service'?{mode:'image',samplePoint:payload.samplePoint||[Number($('x').value),Number($('y').value)]}:{})};
    }
    const {payload,response}=await requestJson(item.url,{signal});
    const base={http:response.status,checkedAt:Math.floor(Date.now()/1000),mode:'service',durationMs:Math.round(performance.now()-started),cached:false,scope:'Lokalne API / dane'};
    if(item.id==='server'){
        if(String(payload.app||'').toLowerCase()!=='msportal'||typeof payload.version!=='string')throw new Error('Nieprawidłowy kontrakt health.php.');
        const warnings=[];
        const expected=((document.querySelector('header strong')?.textContent||'').trim())+'-server';if(expected!=='-server'&&payload.version!==expected)warnings.push(`API w wersji ${payload.version}; oczekiwana ${expected}`);
        if(!payload.cache_writable)warnings.push('cache bez prawa zapisu');
        if(!payload.curl)warnings.push('brak cURL');
        if(!payload.gd)warnings.push('brak GD — eksport może być niedostępny');
        if(!payload.ca_bundle)warnings.push('brak lokalnego CA bundle');
        return {...base,state:warnings.length?'partial':'ok',message:warnings.join(' · ')||`PHP ${payload.php}, cache i GD gotowe.`,capabilities:payload};
    }
    if(item.id==='bdot')return {...base,state:payload.ok&&payload.ready?'ok':'partial',message:payload.ready?`${Number(payload.featureCount).toLocaleString('pl')} obiektów · ${payload.storeVersion}`:'API odpowiada, baza BDOT10k nie jest zainstalowana.',scope:'Gotowość lokalnego magazynu; bez testu konkretnego zapytania',capabilities:payload};
    if(item.id==='export')return {...base,state:payload.ok&&payload.gd?'ok':'partial',message:payload.gd?`PNG/JPEG dostępne · ZIP: ${payload.batch?'tak':'nie'}.`:'Brak GD — eksport rastrowy niedostępny.',scope:'Konfiguracja eksportu; bez generowania pliku',capabilities:payload};
    if(item.id==='search'){
        if(!payload.ok||!Array.isArray(payload.items))throw new Error('Wyszukiwarka zwróciła błędny kontrakt.');
        return {...base,state:payload.items.length?'ok':'partial',message:`Wyszukiwanie „Warszawa”: ${payload.items.length} wyników.`};
    }
    if(item.id==='kowr'){
        if(!Array.isArray(payload.records)||!payload.date)throw new Error('Nieprawidłowy plik instalacji KOWR.');
        const valid=payload.records.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).length;
        const age=Math.floor((Date.now()-Date.parse(payload.date))/86400000);
        return {...base,state:age>90||valid===0?'partial':'ok',message:`Dane ${payload.date} · ${valid}/${payload.records.length} lokalizacji · wiek ${age} dni.`,scope:'Kopia rejestru; nie sprawdza aktualnego rejestru KOWR ani dokładności lokalizacji'};
    }
    throw new Error('Nieobsługiwany test.');
}
async function run(items,mode='service'){
    if(controller||!items.length)return;
    if(document.hidden||!navigator.onLine){$('progress').textContent='Kontrola wstrzymana: karta w tle lub brak połączenia.';return;}
    if(!['x','y'].every(id=>$(id).checkValidity())||!['x','y'].every(id=>$(id).value!=='')){$('progress').textContent='Podaj poprawny punkt kontrolny EPSG:2180.';return;}
    controller=new AbortController();const signal=controller.signal;let done=0;render();
    try{await runLimited(items,async item=>{
        const previous=current.get(item.id);current.set(item.id,{state:'busy',message:'Oczekiwanie na odpowiedź…'});render();
        try{
            const result=await probe(item,mode,signal);signal.throwIfAborted();current.set(item.id,result);
            histories[item.id]=remember(Array.isArray(histories[item.id])?histories[item.id]:[],result);
        }catch(error){
            if(signal.aborted){if(previous)current.set(item.id,previous);else current.delete(item.id);}
            else{const result={state:error.name==='TimeoutError'||error instanceof TypeError||error.status===429?'unknown':'down',checkedAt:Math.floor(Date.now()/1000),mode,message:error.message,scope:'Błąd dostępu do diagnostyki; nie przesądza o stanie źródła',http:error.status};current.set(item.id,result);histories[item.id]=remember(Array.isArray(histories[item.id])?histories[item.id]:[],result);}
        }
        done++;$('progress').textContent=`Sprawdzono ${done}/${items.length}${signal.aborted?' · zatrzymano':''}`;render();
    },{signal});}finally{controller=null;save();render();schedule();}
}
function schedule(){clearTimeout(timer);const delay=Number($('interval').value);if(delay&& !document.hidden&&navigator.onLine)timer=setTimeout(()=>run(visibleItems()),delay);}
function showDetails(id){
    const item=catalog.find(item=>item.id===id), r=current.get(id),box=$('detail');box.hidden=false;box.replaceChildren(node('h2',item.title));
    const close=node('button','Zamknij szczegóły');close.type='button';close.onclick=()=>{box.hidden=true;};box.append(close);
    const dl=node('dl');for(const [label,value] of [['Wynik',r?.message||'Brak próby'],['Usługa źródłowa',item.sourceUrl||'—'],['Warstwy techniczne',item.layerNames||'—'],['Data danych źródłowych',item.dataDate||'Nie podano; czas próby nie jest datą aktualizacji danych'],['Weryfikacja konfiguracji',item.configurationCheckedAt||'—'],['Zakres',r?.scope||'—'],['Punkt obrazu',r?.mode==='image'?`${r.samplePoint?.join(', ')||'—'} · EPSG:2180`:'—'],['Ostatnia próba',time(r?.checkedAt)],['Mediana czasu',`${summarize(histories[id]||[]).medianMs??'—'} ms`]])dl.append(node('dt',label),node('dd',value));box.append(dl);
    const history=node('ol');for(const h of (histories[id]||[]).slice().reverse())history.append(node('li',`${time(h.checkedAt)} · ${labels[h.state]} · ${h.mode} · ${h.message}`));box.append(history);box.scrollIntoView({block:'nearest'});
}
function download(name,type,text){const url=URL.createObjectURL(new Blob([text],{type}));const a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('check').onclick=()=>run(visibleItems());
$('checkImages').onclick=()=>run(visibleItems().filter(item=>item.kind==='wms'&&item.sourceKey),'image-ref');$('stop').onclick=()=>controller?.abort(new DOMException('Zatrzymano.','AbortError'));
$('rows').onclick=event=>{const button=event.target.closest('button[data-id]');if(!button)return;if(button.dataset.mode==='details')showDetails(button.dataset.id);else run(catalog.filter(item=>item.id===button.dataset.id),button.dataset.mode);};
$('search').oninput=render;$('filter').onchange=render;$('interval').onchange=schedule;
$('clear').onclick=()=>{if(confirm('Wyczyścić lokalną historię prób źródeł?')){histories={};current.clear();save();render();}};
$('export').onclick=()=>download('MSPortal-monitor-zrodel.json','application/json',JSON.stringify({version:'19.3.1',generatedAt:new Date().toISOString(),point2180:[$('x').value,$('y').value],note:'Historia wybranych prób, nie pomiar dostępności 24/7.',sources:catalog.map(item=>({...item,current:current.get(item.id)||null,history:histories[item.id]||[]}))},null,2));
$('csv').onclick=()=>download('MSPortal-monitor-zrodel.csv','text/csv;charset=utf-8','\ufeff'+[['Źródło','Typ','Stan','HTTP','Czas ms','Ostatnia próba','Wiadomość','Zakres'],...catalog.map(item=>{const r=current.get(item.id)||{};return [item.title,item.kind,labels[r.state]||labels.unknown,r.http,r.durationMs,time(r.checkedAt),r.message,r.scope];})].map(row=>row.map(csvCell).join(';')).join('\r\n'));
for(const event of ['visibilitychange','offline','online'])addEventListener(event,()=>{if(document.hidden||!navigator.onLine){clearTimeout(timer);controller?.abort(new DOMException('Pauza w tle / offline.','AbortError'));$('progress').textContent='Pauza: karta w tle lub brak połączenia.';}else schedule();});
try{
    const {payload}=await requestJson('./monitor/catalog.json');catalog=payload.sources;
    if(!Array.isArray(catalog))throw new Error('Brak katalogu monitorowanych źródeł.');
    const clean={};for(const item of catalog){const history=histories[item.id];if(Array.isArray(history)){clean[item.id]=history.filter(h=>h&&typeof h==='object'&&Number.isFinite(h.checkedAt)&&Object.hasOwn(labels,h.state)).slice(-20);const last=clean[item.id].at(-1);if(last)current.set(item.id,last);}}histories=clean;
    render();
}catch(error){$('progress').textContent=`Nie można uruchomić monitora: ${error.message}. Otwórz go z serwera MSPortalu.`;$('check').disabled=true;$('checkImages').disabled=true;}
