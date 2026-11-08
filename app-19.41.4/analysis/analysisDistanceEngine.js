import { t } from '../i18n/index.js';
const EPS = 1e-9;

function abortError() {
    try { return new DOMException(t('analysis.operacjaAnulowana'), 'AbortError'); }
    catch { const error = new Error(t('analysis.operacjaAnulowana')); error.name = 'AbortError'; return error; }
}
function assertNotAborted(signal) { if (signal?.aborted) throw abortError(); }
function yieldToBrowser() { return new Promise((resolve) => setTimeout(resolve, 0)); }
function sqr(v) { return v * v; }
function distance(a, b) { return Math.hypot(a[0]-b[0], a[1]-b[1]); }
function samePoint(a, b) { return Math.abs(a[0]-b[0]) <= EPS && Math.abs(a[1]-b[1]) <= EPS; }
function cross(a,b,c) { return (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]); }
function onSegment(p,a,b) {
    if (Math.abs(cross(a,b,p)) > 1e-7) return false;
    return p[0] >= Math.min(a[0],b[0])-EPS && p[0] <= Math.max(a[0],b[0])+EPS && p[1] >= Math.min(a[1],b[1])-EPS && p[1] <= Math.max(a[1],b[1])+EPS;
}
function segmentIntersection(a,b,c,d) {
    const r=[b[0]-a[0],b[1]-a[1]], s=[d[0]-c[0],d[1]-c[1]];
    const den=r[0]*s[1]-r[1]*s[0];
    const q=[c[0]-a[0],c[1]-a[1]];
    if (Math.abs(den) <= EPS) {
        for (const p of [a,b,c,d]) if (onSegment(p,a,b) && onSegment(p,c,d)) return [...p];
        return null;
    }
    const t=(q[0]*s[1]-q[1]*s[0])/den;
    const u=(q[0]*r[1]-q[1]*r[0])/den;
    if (t < -EPS || t > 1+EPS || u < -EPS || u > 1+EPS) return null;
    return [a[0]+t*r[0], a[1]+t*r[1]];
}
function closestPointOnSegment(p,a,b) {
    const dx=b[0]-a[0], dy=b[1]-a[1], denom=dx*dx+dy*dy;
    if (denom <= EPS) return [...a];
    const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/denom));
    return [a[0]+t*dx,a[1]+t*dy];
}
function segmentDistance(a,b,c,d) {
    const inter=segmentIntersection(a,b,c,d);
    if (inter) return { distance:0, aPoint:inter, bPoint:[...inter] };
    const candidates=[];
    let p=closestPointOnSegment(a,c,d); candidates.push({distance:distance(a,p),aPoint:[...a],bPoint:p});
    p=closestPointOnSegment(b,c,d); candidates.push({distance:distance(b,p),aPoint:[...b],bPoint:p});
    p=closestPointOnSegment(c,a,b); candidates.push({distance:distance(c,p),aPoint:p,bPoint:[...c]});
    p=closestPointOnSegment(d,a,b); candidates.push({distance:distance(d,p),aPoint:p,bPoint:[...d]});
    return candidates.reduce((best,item)=>item.distance<best.distance?item:best,candidates[0]);
}
function ringContainsPoint(ring,p) {
    if (!Array.isArray(ring) || ring.length < 3) return false;
    for (let i=0;i<ring.length-1;i++) if (onSegment(p,ring[i],ring[i+1])) return true;
    let inside=false;
    for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
        const xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
        const hit=((yi>p[1])!==(yj>p[1])) && (p[0] < (xj-xi)*(p[1]-yi)/((yj-yi)||EPS)+xi);
        if (hit) inside=!inside;
    }
    return inside;
}
function polygonContainsPoint(rings,p) {
    if (!rings?.length || !ringContainsPoint(rings[0],p)) return false;
    for (let i=1;i<rings.length;i++) if (ringContainsPoint(rings[i],p)) return false;
    return true;
}
function geometryContainsPoint(geometry,p) {
    if (geometry?.type === 'Polygon') return polygonContainsPoint(geometry.coordinates,p);
    if (geometry?.type === 'MultiPolygon') return geometry.coordinates.some((poly)=>polygonContainsPoint(poly,p));
    return false;
}
function geometryPoints(geometry) {
    if (!geometry) return [];
    if (geometry.type==='Point') return [[...geometry.coordinates]];
    if (geometry.type==='LineString') return geometry.coordinates.map((p)=>[...p]);
    if (geometry.type==='Polygon') return geometry.coordinates.flat().map((p)=>[...p]);
    if (geometry.type==='MultiPolygon') return geometry.coordinates.flat(2).map((p)=>[...p]);
    return [];
}
function geometrySegments(geometry) {
    const segments=[];
    const addLine=(line)=>{ for(let i=0;i<line.length-1;i++) if(!samePoint(line[i],line[i+1])) segments.push([[...line[i]],[...line[i+1]]]); };
    if (!geometry) return segments;
    if (geometry.type==='LineString') addLine(geometry.coordinates);
    else if (geometry.type==='Polygon') geometry.coordinates.forEach(addLine);
    else if (geometry.type==='MultiPolygon') geometry.coordinates.forEach((poly)=>poly.forEach(addLine));
    return segments;
}
export function extentToPolygon(extent) {
    const [minX,minY,maxX,maxY]=extent.map(Number);
    return {type:'Polygon',coordinates:[[[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY],[minX,minY]]]};
}
function* nearestGeometrySteps(aGeometry,bGeometry) {
    let operations = 0;
    if (!aGeometry || !bGeometry) throw new Error(t('analysis.brakGeometriiDoAnalizyOdleglosci'));
    const aPoints=geometryPoints(aGeometry), bPoints=geometryPoints(bGeometry);
    const aSegments=geometrySegments(aGeometry), bSegments=geometrySegments(bGeometry);
    for (const [a,b] of aSegments) for (const [c,d] of bSegments) {
        if (++operations % 2048 === 0) yield;
        const p=segmentIntersection(a,b,c,d); if (p) return {distanceMeters:0,targetPoint:p,sourcePoint:[...p]};
    }
    for (const p of bPoints) if (geometryContainsPoint(aGeometry,p)) return {distanceMeters:0,targetPoint:[...p],sourcePoint:[...p]};
    for (const p of aPoints) if (geometryContainsPoint(bGeometry,p)) return {distanceMeters:0,targetPoint:[...p],sourcePoint:[...p]};
    let best={distanceMeters:Infinity,targetPoint:null,sourcePoint:null};
    if (aSegments.length && bSegments.length) {
        for (const [a,b] of aSegments) for (const [c,d] of bSegments) {
        if (++operations % 2048 === 0) yield;
            const item=segmentDistance(a,b,c,d);
            if (item.distance < best.distanceMeters) best={distanceMeters:item.distance,targetPoint:item.aPoint,sourcePoint:item.bPoint};
        }
    } else if (aPoints.length && bSegments.length) {
        for (const ap of aPoints) for (const [c,d] of bSegments) {
            if (++operations % 2048 === 0) yield;
            const bp=closestPointOnSegment(ap,c,d), dist=distance(ap,bp);
            if (dist<best.distanceMeters) best={distanceMeters:dist,targetPoint:[...ap],sourcePoint:bp};
        }
    } else if (bPoints.length && aSegments.length) {
        for (const bp of bPoints) for (const [a,b] of aSegments) {
            if (++operations % 2048 === 0) yield;
            const ap=closestPointOnSegment(bp,a,b), dist=distance(ap,bp);
            if (dist<best.distanceMeters) best={distanceMeters:dist,targetPoint:ap,sourcePoint:[...bp]};
        }
    } else {
        for (const ap of aPoints) for (const bp of bPoints) {
            if (++operations % 2048 === 0) yield;
            const dist=distance(ap,bp); if(dist<best.distanceMeters) best={distanceMeters:dist,targetPoint:[...ap],sourcePoint:[...bp]};
        }
    }
    if (!Number.isFinite(best.distanceMeters)) throw new Error(t('analysis.nieUdaloSieWyznaczycOdleglosci'));
    return best;
}

export function nearestGeometryPoints(aGeometry, bGeometry) {
    const steps = nearestGeometrySteps(aGeometry, bGeometry);
    let step;
    do { step = steps.next(); } while (!step.done);
    return step.value;
}
export async function nearestGeometryPointsAsync(aGeometry, bGeometry, signal) {
    assertNotAborted(signal);
    const steps = nearestGeometrySteps(aGeometry, bGeometry);
    while (true) {
        const step = steps.next();
        if (step.done) return step.value;
        await yieldToBrowser();
        assertNotAborted(signal);
    }
}

export async function analyzeFeatureDistances(targetGeometry, features, options={}) {
    const radiusMeters=Number(options.radiusMeters);
    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > 50000) throw new Error(t('analysis.promienAnalizyMusiMiecWartosc'));
    const signal=options.signal??null, onProgress=typeof options.onProgress==='function'?options.onProgress:null;
    const valid=(Array.isArray(features)?features:[]).filter((f)=>f?.geometry && ['Polygon','MultiPolygon','LineString','Point'].includes(f.geometry.type));
    let nearest=null, inRadiusCount=0;
    const inRadiusIds=[];
    // Odległość każdego obiektu i tak jest liczona, żeby wyłonić najbliższy —
    // wcześniej wynik był po prostu odrzucany. Zachowanie go kosztuje jedną
    // pozycję na obiekt, a pozwala pokazać i posortować pełną kolumnę
    // odległości w tabeli wyników.
    const distances=[];
    const batchSize=50;
    for(let i=0;i<valid.length;i++) {
        assertNotAborted(signal);
        const feature=valid[i];
        let measure;
        try { measure=await nearestGeometryPointsAsync(targetGeometry,feature.geometry,signal); } catch (error) { if (error?.name === 'AbortError') throw error; continue; }
        const id=String(feature.id??feature.properties?.id??'');
        if (!nearest || measure.distanceMeters < nearest.distanceMeters) nearest={...measure,feature};
        if (id) distances.push({id,distanceMeters:measure.distanceMeters});
        if (measure.distanceMeters <= radiusMeters + 1e-7) { inRadiusCount+=1; inRadiusIds.push(id); }
        const completed=i+1;
        onProgress?.({completed,total:valid.length,percent:valid.length?Math.round(completed/valid.length*100):100,phase:'distance'});
        if (completed%batchSize===0 && completed<valid.length) await yieldToBrowser();
    }
    assertNotAborted(signal);
    const nearestWithinRadius = nearest && nearest.distanceMeters <= radiusMeters + 1e-7 ? nearest : null;
    const resultFeatures=[];
    if (nearestWithinRadius && nearestWithinRadius.distanceMeters > 1e-7) {
        resultFeatures.push({
            id:'analysis-distance-nearest',
            geometry:{type:'LineString',coordinates:[nearestWithinRadius.targetPoint,nearestWithinRadius.sourcePoint]},
            properties:{resultType:'distance-line',distanceMeters:nearestWithinRadius.distanceMeters,sourceFeatureId:String(nearestWithinRadius.feature?.id??'')},
        });
    }
    return {
        nearest: nearestWithinRadius,
        inRadiusCount,
        inRadiusIds,
        distances,
        radiusMeters,
        sourceCount:valid.length,
        features:resultFeatures,
    };
}
