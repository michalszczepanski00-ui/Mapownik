import { createElement as h, Fragment, useCallback, useEffect, useRef, useState } from 'react';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import CircleStyle from 'ol/style/Circle.js';
import { usePanel } from '../hooks/useDockGeometry.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { useAppSelector } from '../../store/index.js';
import { PanelHeaderActions } from './PanelHeaderActions.js';
import { PanelIcon } from './PanelIcon.js';
import { Button, Message, PanelMinimized, PanelShell } from '../ui/index.js';
import { reportDialog } from './reportDialogStore.js';

// 19.8.0: hosting bez VPS — trasy dawnej usługi Python obsługuje api/vps.php (PHP + SQLite).
// 19.23.0: moduł cen RCN usunięty; BDOT10k pokazywany tylko, gdy baza ma rekordy BDOT.
const API_BASE='./api/vps.php?route=';
const api=(route,params)=>API_BASE+route+(params?'&'+params:'');
const number=new Intl.NumberFormat('pl-PL',{maximumFractionDigits:0});
const distance=(v)=>v===null || v===undefined ? '—' : `${number.format(v)} m`;
const resultStyle=()=>new Style({
  stroke:new Stroke({color:'#0e8ba2',width:2}),
  fill:new Fill({color:'rgba(14,139,162,.13)'}),
  image:new CircleStyle({radius:5,fill:new Fill({color:'#0e8ba2'}),stroke:new Stroke({color:'#fff',width:1.4})})
});
const option=(value,label)=>({value,label});
/** 19.8.5: informacje o bazie i imporcie tylko dla administratora (?admin=1 albo localStorage msportal.admin=1). */
const adminMode=(()=>{try{return /[?&]admin=1(?:&|$)/.test(window.location.search)||window.localStorage?.getItem('msportal.admin')==='1';}catch{return false;}})();
const field=(title,value,set,options)=>h('label',{className:'vps-input'},
  h('span',null,title),h('select',{'aria-label':title,value,onChange:e=>set(e.target.value)},options.map(o=>h('option',{key:o.value,value:o.value},o.label))));
// Polska odmiana liczebników: 1 obiekt, 2–4 obiekty, 5+ obiektów (ale 12–14 obiektów, 22 obiekty).
const NO_IDENTIFY=Object.freeze({open:false});
const plural=(n,one,few,many)=>n===1?one:(n%10>=2&&n%10<=4&&!(n%100>=12&&n%100<=14))?few:many;
const statsField=(label,value)=>h('div',{className:'vps-stat',key:label},h('span',null,label),h('strong',null,value));

/** Network requests only on button press; stable rendering even on very small clients. */
export function VpsDataPanel(){
  const panel=usePanel('vpsData');
  const controller=useService('mapController');
  const view=useAppSelector(s=>s.mapView);
  const dataset='bdot';
  // 19.8.5: domyślnie analiza działki — działa bez bazy BDOT (audyt UX B11).
  const [task,setTask]=useState('parcel');
  const [radius,setRadius]=useState('1');
  const [kind,setKind]=useState('all');
  const [classes,setClasses]=useState([]);
  const [status,setStatus]=useState(null);
  const [sync,setSync]=useState(null);
  const [quality,setQuality]=useState(null);
  const [payload,setPayload]=useState(null);
  const [nearby,setNearby]=useState(null);
  const [screening,setScreening]=useState(null);
  // Separate lifecycle from BDOT point screening.
  const [parcelId,setParcelId]=useState('');
  // 19.12.0: identyfikator z karty Działka (ostatni wynik „Sprawdź”) — bez przepisywania.
  // Wpisany ręcznie identyfikator nie jest nadpisywany.
  const identifySnapshot=useServiceSnapshot('identify',NO_IDENTIFY);
  const identified=identifySnapshot.parcel?.id||'';
  const autoParcel=useRef('');
  useEffect(()=>{
    if(!identified)return;
    setParcelId(current=>(current===''||current===autoParcel.current)?identified:current);
    autoParcel.current=identified;
  },[identified]);
  const [parcelRadius,setParcelRadius]=useState('500');
  const [parcelReport,setParcelReport]=useState(null);
  const [parcelError,setParcelError]=useState('');
  const [parcelPending,setParcelPending]=useState(false);
  // 19.28.0: po wyniku formularz zwija się do jednego wiersza („Działka … · 500 m · Zmień”).
  const [parcelFormOpen,setParcelFormOpen]=useState(true);
  const [showParcel,setShowParcel]=useState(true);
  const parcelAbort=useRef(null),parcelLayer=useRef(null);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [showMap,setShowMap]=useState(true);
  const [statusTick,setStatusTick]=useState(0);
  const layer=useRef(null),abort=useRef(null),seq=useRef(0);

  const clearLayer=useCallback(()=>{if(layer.current && controller)controller.removeLayer(layer.current);layer.current=null;},[controller]);
  const clearParcelLayer=useCallback(()=>{
    if(parcelLayer.current && controller)controller.removeLayer(parcelLayer.current);
    parcelLayer.current=null;
  },[controller]);
  useEffect(()=>()=>{abort.current?.abort();parcelAbort.current?.abort();clearLayer();clearParcelLayer();},[clearLayer,clearParcelLayer]);
  useEffect(()=>{
    clearParcelLayer();
    if(!showParcel||!parcelReport?.parcel?.geometry||!controller)return;
    try{
      const feature={type:'Feature',properties:{id:parcelReport.parcel.id||'Działka EGiB'},geometry:parcelReport.parcel.geometry};
      const features=new GeoJSON().readFeatures({type:'FeatureCollection',features:[feature]},
        {dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'});
      const layerObj=new VectorLayer({source:new VectorSource({features}),style:new Style({
        stroke:new Stroke({color:'#16a34a',width:3}),fill:new Fill({color:'rgba(22,163,74,.17)'})
      }),zIndex:970,properties:{title:'MSportal — działka EGiB'}});
      controller.addLayer(layerObj);parcelLayer.current=layerObj;
      if(features[0]?.getGeometry())controller.fitExtent(features[0].getGeometry().getExtent(),
        {maxZoom:18,duration:220,padding:[70,70,70,70]});
    }catch(e){setParcelError('Nie można narysować działki: '+e.message);}
    return clearParcelLayer;
  },[parcelReport,showParcel,controller,clearParcelLayer]);
  useEffect(()=>{
    if(!panel.open)return;
    const a=new AbortController();
    fetch(api('health'),{signal:a.signal,cache:'no-store'}).then(r=>r.ok?r.json():null).then(v=>{if(!a.signal.aborted)setStatus(v);}).catch(()=>{if(!a.signal.aborted)setStatus(null);});
    fetch(api('bdot/classes'),{signal:a.signal}).then(r=>r.ok?r.json():{}).then(v=>{if(!a.signal.aborted)setClasses(v.classes||[]);}).catch(()=>{});
    fetch(api('sources/status'),{signal:a.signal,cache:'no-store'}).then(r=>r.ok?r.json():null).then(v=>{if(!a.signal.aborted)setSync(v);}).catch(()=>{});
    fetch(api('quality'),{signal:a.signal,cache:'no-store'}).then(r=>r.ok?r.json():null).then(v=>{if(!a.signal.aborted)setQuality(v);}).catch(()=>{});
    return()=>a.abort();
  },[panel.open,statusTick]);
  useEffect(()=>{
    clearLayer();
    if(!showMap || !payload?.features?.length || !controller)return;
    try{
      const features=new GeoJSON().readFeatures(payload,{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'});
      const item=new VectorLayer({source:new VectorSource({features}),style:resultStyle(),zIndex:950,
        properties:{title:'MSportal — BDOT'}});
      controller.addLayer(item);layer.current=item;
    }catch(e){setError('Nie można narysować wyników: '+e.message);}
    return clearLayer;
  },[payload,showMap,controller,clearLayer]);

  const run=async()=>{
    if(!view.ready || !Array.isArray(view.centerLonLat)){setError('Mapa nie jest gotowa.');return;}
    abort.current?.abort();const a=new AbortController();abort.current=a;
    const ticket=++seq.current;
    setError('');setPending(true);setPayload(null);setNearby(null);setScreening(null);
    const km=Math.max(.5,Math.min(3,Number(radius)||1));
    const [lon,lat]=view.centerLonLat;
    const dy=km/111.32,dx=km/(111.32*Math.max(.25,Math.cos(lat*Math.PI/180)));
    const bbox=[lon-dx,lat-dy,lon+dx,lat+dy].map(n=>n.toFixed(6)).join(',');
    const q=new URLSearchParams({bbox,limit:'200'});
    if(kind!=='all')q.set('class_name',kind);
    try{
      const res=await fetch(api('bdot/search',q),{signal:a.signal});
      const data=await res.json().catch(()=>null);
      if(!res.ok || !data?.ok)throw Error(data?.detail||data?.error||`Zapytanie: HTTP ${res.status}`);
      if(a.signal.aborted||ticket!==seq.current)return;
      setPayload(data);
      const n=new URLSearchParams({lon:String(lon),lat:String(lat),radius_m:String(Math.round(km*1000))});
      const r=await fetch(api('bdot/nearby',n),{signal:a.signal});
      const v=await r.json().catch(()=>null);
      if(r.ok && v?.ok && !a.signal.aborted && ticket===seq.current)setNearby(v);
      else if(!r.ok && !a.signal.aborted)setError(v?.detail||v?.error||'Nie można wykonać analizy odległości.');
    }catch(e){if(!a.signal.aborted)setError(e.message||'Nieznany błąd serwera.');}
    finally{if(!a.signal.aborted)setPending(false);}
  };

  const runScreening=async()=>{
    if(!view.ready||!Array.isArray(view.centerLonLat)){setError('Mapa nie jest gotowa.');return;}
    const [lon,lat]=view.centerLonLat;
    setPending(true);setScreening(null);setError('');
    abort.current?.abort();const a=new AbortController();abort.current=a;
    try{
      const params=new URLSearchParams({lon:String(lon),lat:String(lat),radius_m:'500'});
      const response=await fetch(api('site/screening',params),{signal:a.signal});
      const data=await response.json();
      if(!response.ok||!data.ok)throw Error(data?.detail||'Nie udało się wykonać screeningu');
      if(!a.signal.aborted)setScreening(data);
    }catch(e){if(!a.signal.aborted)setError(e.message);}
    finally{if(!a.signal.aborted)setPending(false);}
  };

  const runParcel=async()=>{
    const id=parcelId.trim();
    if(!id && (!view.ready||!Array.isArray(view.centerLonLat))){setParcelError('Ustaw środek mapy lub wpisz identyfikator działki.');return;}
    parcelAbort.current?.abort();const a=new AbortController();parcelAbort.current=a;
    setParcelError('');setParcelReport(null);setParcelPending(true);
    const [lon,lat]=view.centerLonLat||[];
    const req={radius_m:Number(parcelRadius),include_prg:true,...(id?{parcel_id:id}:{lon,lat})};
    try{
      const response=await fetch(api('parcel/analyze'),{method:'POST',signal:a.signal,
        headers:{'Content-Type':'application/json'},body:JSON.stringify(req)});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw Error(typeof data?.detail==='string'?data.detail:'Analiza działki nie powiodła się (HTTP '+response.status+').');
      if(!a.signal.aborted){setParcelReport(data);setParcelFormOpen(false);}
    }catch(e){if(!a.signal.aborted)setParcelError(e.message||'Błąd analizy działki');}
    finally{if(!a.signal.aborted)setParcelPending(false);}
  };

  const exportCsv=()=>{
    if(!payload?.features?.length)return;
    const data=[['id','klasa','funkcja_budynku']];
    for(const f of payload.features){const v=f.properties||{};data.push([f.id,v.bdot_class||v.class||'',v.building_use||'']);}
    // 19.5.0: liczby bez cudzysłowu i z przecinkiem dziesiętnym — inaczej Excel w polskiej
    // lokalizacji czyta „13617.58" jako tekst albo datę.
    const cell=(v)=>{
      if(typeof v==='number'&&Number.isFinite(v))return String(v).replace('.',',');
      return '"'+String(v??'').replaceAll('"','""')+'"';
    };
    const output=data.map(arr=>arr.map(cell).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+output],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`mapownik-bdot-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  };

  if(!panel.open)return null;
  const title='Analiza działki (serwer)';
  if(panel.collapsed&&!panel.docked)return h(PanelMinimized,{title,icon:h(PanelIcon,{name:'analysis'}),style:panel.style,onRestore:panel.restore});
  const isReady=Boolean(status?.ok && status?.ready);
  // 19.23.0: funkcje BDOT widoczne dopiero, gdy baza na serwerze ma rekordy BDOT.
  const bdotReady=isReady&&status?.datasets?.bdot>0;
  const activeTask=bdotReady?task:'parcel';
  const sources=status?.sources??[];
  const sourceList=sync?.sources?.filter(x=>x.dataset===dataset)??[];
  return h(PanelShell,{
    className:'vps-data-panel',title,subtitle:'Plan, granice i otoczenie działki',label:title,
    docked:panel.docked,style:panel.style,icon:h(PanelIcon,{name:'parcel-report',size:16}),actions:h(PanelHeaderActions,{id:'vpsData'}),
    onDragStart:panel.onDragStart,onResizeWidth:panel.onResizeStart,onResizeHeight:panel.onResizeHeightStart,
  },h('div',{className:'vps-body'},
    // 19.28.0: stan serwera tylko, gdy coś nie działa (albo dla administratora) — bez szumu w zwykłej pracy.
    (!isReady||adminMode)&&h('div',{className:'vps-connection'},h('span',{className:'vps-indicator '+(isReady?'ok':'warn')}),
      isReady?(bdotReady?'Analiza działki i dane BDOT10k dostępne':(adminMode?'Serwer działa · baza BDOT pusta':'Analiza działki dostępna')):(status?.problem||'Serwer analiz niedostępny lub w trakcie konfiguracji'),
      !isReady&&h(Button,{variant:'ghost',size:'sm',onClick:()=>setStatusTick(v=>v+1)},'Sprawdź ponownie')),
    adminMode&&quality&&h('div',{className:'vps-source-list'},
      h('strong',null,'Jakość bazy danych'),
      h('small',null,`Źródła w indeksie: ${quality.sources?.length||0}. ` +
        (quality.complete && quality.sources?.length?'Każde źródło posiada rekordy.':'Uwaga: wykryto źródło bez rekordów lub brak bazy.') +
        ' Pełne sprawdzanie spójności wykonuje administrator narzędziem importu.'),
      (quality.sources||[]).some(v=>v.ageDays!==null && v.ageDays>90)&&h(Message,{tone:'warning'},
        'Co najmniej jedno źródło było importowane ponad 90 dni temu. Zweryfikuj aktualność danych.')),
    bdotReady&&field('Co chcesz sprawdzić?',task,v=>{abort.current?.abort();parcelAbort.current?.abort();seq.current++;setPending(false);setParcelPending(false);setTask(v);setPayload(null);setNearby(null);setScreening(null);setError('');setParcelError('');setRadius('1');},[
      option('parcel','Analiza działki: plan, granice, otoczenie'),
      option('bdot','Budynki i drogi w otoczeniu')]),
    activeTask==='bdot'&&h('section',{className:'vps-task-inputs'},
    h('div',{className:'vps-metric'},h('span',null,'Zaimportowane rekordy'),h('strong',null,
      number.format(status.datasets?.bdot??0))),
    h('div',{className:'vps-form-group'},
      h('p',{className:'vps-hint'},'Budynki OT_BUBD_A i drogi OT_SKDR_L: liczba obiektów oraz odległość do ich rzeczywistych geometrii.'),
      field('Warstwa na mapie',kind,setKind,[option('all','Wszystkie dostępne'),...classes.map(v=>option(v.class_name,`${v.class_name} (${number.format(v.count)})`))])
    ),
    field('Obszar wokół środka mapy',radius,setRadius,[.5,1,2,3].map(v=>option(String(v),`${v*1000} m`))),
    h(Button,{variant:'primary',disabled:pending||!isReady||!view.ready,onClick:()=>void run()},
      pending?'Analizowanie…':'Analizuj budynki i drogi')),
    activeTask==='bdot'&&h('section',{className:'vps-source-list'},
      h('strong',null,'Wstępny screening lokalizacji'),
      h('small',null,'Obszar 500 m od środka mapy. To nie jest analiza granic działki ani pełny raport planistyczny.'),
      h(Button,{variant:'secondary',disabled:pending||!isReady||!view.ready,onClick:()=>void runScreening()},
        pending?'Obliczanie…':'Sprawdź otoczenie 500 m'),
      screening&&h('div',{className:'vps-stats'},
        statsField('Budynki',screening.bdot?number.format(screening.bdot.groups.buildings.count):'brak danych BDOT'),
        statsField('Najbliższy budynek',screening.bdot?distance(screening.bdot.groups.buildings.nearestM):'brak danych'),
        statsField('Najbliższa droga',screening.bdot?distance(screening.bdot.groups.roads.nearestM):'brak danych'),
        screening.bdot?.candidateCapReached&&h(Message,{tone:'warning'},'BDOT: limit kandydatów — wynik niepełny.'),
        h(Message,{tone:'warning'},'Nie zintegrowano tu jeszcze danych EGiB, MPZP, planów ogólnych, NMT, GESUT i ochrony środowiska. Brak wpisu nie oznacza braku kolizji.')),
    ),
    activeTask==='parcel'&&h('section',{className:'vps-source-list'},
      h('strong',null,'Raport działki — granice, plan i otoczenie'),
      // 19.39.0: wydruk PDF jest osobnym oknem — skrót tutaj, żeby dwa „raporty” nie myliły się ze sobą.
      identifySnapshot?.parcel?.wkt&&h('div',{className:'vps-pdf-shortcut'},
        h(Button,{variant:'secondary',size:'sm',className:'vps-pdf-wide',title:`Raport PDF działki ${identifySnapshot.parcel.parcel} do wydruku: mapy, plan ogólny, ceny, budowy, uzbrojenie — szablony do wyboru`,onClick:()=>reportDialog.open(identifySnapshot.parcel)},`Raport PDF działki ${identifySnapshot.parcel.parcel}…`)),
      parcelReport&&!parcelFormOpen
        ?h('div',{className:'vps-form-summary'},
          h('span',null,`Działka ${parcelReport.parcel.id||parcelId||'pod środkiem mapy'} · ${parcelRadius} m`),
          h(Button,{variant:'ghost',size:'sm',onClick:()=>setParcelFormOpen(true)},'Zmień'))
        :h(Fragment,null,
          h('small',{className:'vps-hint'},parcelId.trim()?'Raport dla działki z karty albo wpisanej poniżej.':'Wpisz identyfikator albo raport obejmie działkę pod środkiem mapy.'),
          h('label',{className:'vps-input'},h('span',null,'Identyfikator działki'),
            h('input',{type:'text',maxLength:90,value:parcelId,onChange:e=>setParcelId(e.target.value),
              placeholder:'np. 141201_1.0001.6509',autoComplete:'off'})),
          field('Promień otoczenia',parcelRadius,setParcelRadius,[option('100','100 m'),option('300','300 m'),
            option('500','500 m'),option('1000','1000 m'),option('2000','2000 m')]),
          h(Button,{variant:'primary',disabled:parcelPending||!isReady||(!parcelId.trim()&&!view.ready),
            onClick:()=>void runParcel()},parcelPending?'Tworzenie raportu…':'Utwórz raport działki')),
      // 19.53.0: ceny wokół działki są w doku Analizy → Ceny („Wokół działki”) — nazwa widoku odpowiada zawartości.
      parcelError&&h(Message,{tone:'danger'},parcelError),
      parcelReport&&h('div',{className:'vps-parcel-report'},
        h('div',{className:'vps-stats'},
          statsField('Identyfikator',parcelReport.parcel.id||'niepotwierdzony'),
          // 19.28.0: jedna pozycja powierzchni (m² i ha) — krótsze etykiety mieszczą się w karcie.
          statsField('Powierzchnia',number.format(parcelReport.parcel.areaM2)+' m² ('+((parcelReport.parcel.areaM2||0)/10000).toLocaleString('pl-PL',{maximumFractionDigits:4})+' ha)'),
          parcelReport.bdot&&statsField('Najbliższy budynek',distance(parcelReport.bdot.groups.buildings.nearestM)),
          parcelReport.bdot&&statsField('Najbliższa droga',distance(parcelReport.bdot.groups.roads.nearestM))),
        h('label',{className:'vps-toggle'},h('input',{type:'checkbox',checked:showParcel,onChange:e=>setShowParcel(e.target.checked)}),
          'Pokaż granice działki na mapie'),
        h('strong',null,'Jednostki administracyjne'),
        ...[['GranicaGminy','Gmina'],['GranicaPowiatu','Powiat']].map(([id,name])=>
          h('div',{className:'vps-sync-item',key:id},h('span',null,name),
            h('small',null,parcelReport.prg?.[id]?.status==='matched'?
              (parcelReport.prg[id].name||'Geometria potwierdzona'):'Dane niepotwierdzone'))),
        h('strong',null,'Planowanie i warstwy przecinające działkę'),
        ...[['pog','Plan ogólny (POG)'],['mpzp','MPZP'],['soil','Klasy gruntów'],['protected','Ochrona przyrody'],
          ['utilities','Infrastruktura / GESUT']].map(([id,name])=>{
            const layer=parcelReport.layers?.[id];
            const online=layer?.online;
            const summary=layer?.status==='unavailable'?(online?.status==='unavailable'?online.note:'Brak zaimportowanej warstwy wektorowej'):
              !layer?.matches?.length?(online?(id==='pog'?'Brak planu ogólnego w Rejestrze Urbanistycznym dla tej działki':
                id==='mpzp'?'Brak MPZP w Rejestrze Urbanistycznym — rejestr nie obejmuje jeszcze wszystkich planów':'Brak przecięć'):
                'Brak zarejestrowanych przecięć — pokrycie danych niepotwierdzone'):
              `${layer.matches.length} ${plural(layer.matches.length,'obiekt','obiekty','obiektów')}`+(online?' · '+(online.source||'Rejestr Urbanistyczny'):'');
            return h('div',{className:'vps-parcel-category',key:id},
              h('strong',null,name),
              h('small',null,summary),
              ...(layer?.matches||[]).slice(0,8).map((it,i)=>{
                const a=it.attributes||{};
                // 19.8.3: parametry strefy POG z Rejestru Urbanistycznego.
                const params=[['Maksymalna wysokość zabudowy','wys.'],['Maksymalna nadziemna intensywność zabudowy','intensywność'],
                  ['Maksymalny udział powierzchni zabudowy','zabudowa'],['Minimalny udział powierzchni biologicznie czynnej','PBC']]
                  .filter(([k])=>a[k]&&!['','-','None','null'].includes(String(a[k]).trim())).map(([k,l])=>`${l} ${a[k]}`).join(' · ');
                return h('div',{className:'vps-sync-item vps-parcel-match',key:i},
                  h('span',null,(it.kind==='strefa'?'Strefa ':'')+(it.label||'Obiekt '+(i+1))),
                  it.kind==='strefa'&&a['Nazwa']&&h('small',null,a['Nazwa'].toLowerCase()),
                  h('small',null,it.partPct!=null?`${it.approximate?'≈ ':''}${it.partPct.toLocaleString('pl-PL')}% działki · ${it.approximate?'≈ ':''}${number.format(it.areaM2)} m²`+
                    (it.status&&it.kind!=='strefa'?` · ${it.status}`:''):(it.kind==='plan'?'Stwierdzono w punkcie wewnątrz działki':'Przecięcie punktowe / liniowe')),
                  a['Opis']&&h('small',{className:'vps-hint'},String(a['Opis']).split('\n').slice(0,6).join(' · ').slice(0,320)),
                  a['Uwaga']&&h('small',{className:'vps-hint'},a['Uwaga']),
                  params&&h('small',null,params),
                  it.link&&h('a',{href:it.link,target:'_blank',rel:'noopener noreferrer',className:'vps-link'},(it.linkLabel||'Karta w Rejestrze Urbanistycznym')+' ↗'));
              }),
              online?.status==='partial'&&h(Message,{tone:'warning'},layer?.matches?.length?'Rejestr Urbanistyczny nie odpowiedział dla części działki — wynik może być niepełny. Ponów analizę.':
                'Rejestr Urbanistyczny nie odpowiada, a krajowa integracja nie ma tu planu — brak wyniku NIE oznacza braku planu. Ponów analizę później.'),
              online?.approximate&&layer?.matches?.length>0&&h('small',{className:'vps-hint'},`Udziały szacowane z ${online.samples} punktów w działce — usługa GUGiK nie udostępnia geometrii stref.`),
              online?.draft&&h('small',{className:'vps-hint'},`Projekt: ${online.draft.title||'plan ogólny'} — ${online.draft.status}.`),
              online&&id==='pog'&&layer?.matches?.length>0&&online.coveragePct!=null&&online.coveragePct<99.5&&
                h('small',{className:'vps-hint'},`Strefy rozpoznane dla ${online.coveragePct.toLocaleString('pl-PL')}% powierzchni działki.`),
              layer?.resultTruncated&&online?.status!=='partial'&&h(Message,{tone:'warning'},'Wyniki ograniczono limitem — analiza niepełna.'));
          }),
        parcelReport.bdot?.candidateCapReached&&h(Message,{tone:'warning'},'Analiza BDOT osiągnęła limit obiektów; wyniki mogą być niepełne.'),
        ...(parcelReport.warnings||[]).map((w,i)=>h('small',{key:i,className:'vps-hint'},w)),
        h('small',{className:'vps-hint'},'Powierzchnia wyliczona z geometrii ULDK, nie zastępuje powierzchni ewidencyjnej. ' +
          'Plan ogólny i MPZP pobierane na bieżąco z Rejestru Urbanistycznego; gleby, ochrona przyrody i GESUT — po zaimportowaniu wektorów do bazy. ' +
          'Wynik ma charakter informacyjny — wiążący jest tekst i rysunek aktu.'))
    ),
    error&&h(Message,{tone:'danger'},error),
    adminMode&&isReady&&!bdotReady&&h(Message,{tone:'info'},
      'Funkcje BDOT10k są ukryte, bo baza nie zawiera rekordów BDOT. Wgraj data/msportal/msportal.sqlite3 przez FTP — opcje pojawią się automatycznie.'),
    payload&&h('section',{className:'vps-results'},
      h('div',{className:'vps-section-head'},h('strong',null,'Wyniki na mapie'),h('strong',null,number.format(payload.meta?.count??0))),
      payload.meta?.truncated&&h(Message,{tone:'warning'},'Lista zawiera maks. 200 rekordów. Zmniejsz obszar lub zastosuj filtry.'),
      nearby&&h('div',{className:'vps-stats'},
        statsField('Budynki w promieniu',number.format(nearby.groups.buildings.count)),
        statsField('Najbliższy budynek',distance(nearby.groups.buildings.nearestM)),
        statsField('Drogi w promieniu',number.format(nearby.groups.roads.count)),
        statsField('Najbliższa droga',distance(nearby.groups.roads.nearestM)),
        (!nearby.dataAvailable.buildings||!nearby.dataAvailable.roads)&&h(Message,{tone:'warning'},
          'Nie wszystkie wymagane klasy BDOT są zaimportowane. Brak wyniku nie oznacza braku obiektu.'),
        nearby.candidateCapReached&&h(Message,{tone:'warning'},'Limit obiektów analizy: wynik niepełny. Zmniejsz promień.')),
      h('label',{className:'vps-toggle'},h('input',{type:'checkbox',checked:showMap,onChange:e=>setShowMap(e.target.checked)}),'Pokaż wyniki na mapie'),
      h(Button,{variant:'secondary',disabled:!payload.features?.length,onClick:exportCsv},'Eksport wyników CSV'),
      h('div',{className:'vps-items'},(payload.features||[]).slice(0,35).map(r=>h('article',{key:r.id,className:'vps-record'},
        h('strong',null,r.properties?.bdot_class||r.properties?.class||'Obiekt'),
        h('span',null,r.properties?.building_use||`ID ${r.id}`)))),
      h('small',{className:'vps-hint'},'Dane tylko z zaimportowanych źródeł. Wyszukiwanie mapowe bazuje na przecięciu ramki geometrii (bbox). '+
        'BDOT10k nie zastępuje danych uzbrojenia GESUT.')),
    adminMode&&h('details',{className:'vps-source-list'},
      h('summary',null,'Źródła i aktualność danych'),
      sync?.lastRun&&h('small',null,'Ostatnia kontrola: '+new Date(sync.lastRun).toLocaleString('pl-PL')),
      ...sourceList.map(v=>h('div',{key:v.id,className:'vps-sync-item'},
        h('span',null,v.id),h('small',null,v.enabled?({'updated':'Zaktualizowano','unchanged':'Bez zmian','error':'Błąd aktualizacji'}[v.status]||v.status):'Wyłączone'),
        v.lastSuccess&&h('small',null,'Import: '+new Date(v.lastSuccess).toLocaleString('pl-PL')))),
      !sourceList.length&&h('small',null,sync?.message||'Brak zaimportowanych źródeł w bazie.'),
      h(Button,{variant:'secondary',onClick:()=>fetch(api('sources/status'),{cache:'no-store'}).then(r=>r.json()).then(setSync).catch(()=>{})},'Odśwież źródła')),
    adminMode&&h('details',{className:'vps-source-list'},h('summary',null,'Zaimportowane zbiory'),
      ...sources.filter(v=>v.dataset===dataset).map(v=>h('div',{key:v.source},`${v.source}: ${number.format(v.count)} rekordów`)),
      !sources.some(v=>v.dataset===dataset)&&h('small',null,'Brak zaimportowanych danych.')),
    adminMode&&h('small',{className:'vps-hint'},'Aktualizacja danych BDOT10k: podmień plik data/msportal/msportal.sqlite3 przez FTP.')
  ));
}

