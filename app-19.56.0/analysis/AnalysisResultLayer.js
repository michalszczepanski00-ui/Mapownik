import Feature from 'ol/Feature.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import { toViewGeometry } from '../objects/geometryConversion.js';

const MAX_RENDERED_RESULTS = 2500;
const BUFFER_STYLE = new Style({
    fill: new Fill({ color: 'rgba(194,65,12,0.12)' }),
    stroke: new Stroke({ color: '#c2410c', width: 2 }),
});
const DISTANCE_STYLE = new Style({ stroke: new Stroke({ color: '#dc2626', width: 2.5, lineDash: [9, 6] }) });

function sampleFeatures(features, limit = MAX_RENDERED_RESULTS) {
    if (features.length <= limit) return features;
    const out=[]; const step=features.length/limit; let previous=-1;
    for (let i=0;i<limit;i+=1) {
        const index=Math.min(features.length-1,Math.floor(i*step));
        if(index!==previous){out.push(features[index]);previous=index;}
    }
    return out;
}

/** Robocza warstwa wyników. Pełne dane pozostają dostępne do zapisu/analizy. */
export class AnalysisResultLayer {
    constructor(host) {
        this.host = host;
        this.source = new VectorSource({ wrapX: false });
        this.layer = new VectorLayer({
            source: this.source,
            zIndex: 9550,
            updateWhileAnimating: false,
            updateWhileInteracting: false,
            style: (feature) => feature.getGeometry()?.getType() === 'LineString' ? DISTANCE_STYLE : BUFFER_STYLE,
            properties: { mapownikRole: 'analysis-result', catalogId: 'runtime.analysis-result' },
        });
        this.rawFeatures = [];
        this.renderStats={sourceCount:0,renderedCount:0,limited:false};
        this.host.addLayer(this.layer);
    }
    replace(features) {
        this.clear();
        this.rawFeatures = Array.isArray(features) ? features : [];
        const preview=sampleFeatures(this.rawFeatures);
        const rendered=[];
        preview.forEach((raw,index)=>{
            const geometry=raw?.geometry;
            if(!geometry||!['Polygon','MultiPolygon','LineString'].includes(geometry.type))return;
            let viewGeometry;
            try{viewGeometry=toViewGeometry(geometry);}catch{return;}
            const feature=new Feature({geometry:viewGeometry});
            feature.setId(String(raw.id??`analysis-result-${index+1}`));
            rendered.push(feature);
        });
        if(rendered.length)this.source.addFeatures(rendered);
        this.renderStats={sourceCount:this.rawFeatures.length,renderedCount:rendered.length,limited:rendered.length<this.rawFeatures.length};
        this.layer.setVisible(true);
        return rendered.length;
    }
    clear() {
        this.source.clear(true);
        this.rawFeatures=[];
        this.renderStats={sourceCount:0,renderedCount:0,limited:false};
    }
    setVisible(visible){this.layer.setVisible(Boolean(visible));}
    isVisible(){return this.layer.getVisible();}
    getCount(){return this.source.getFeatures().length;}
    getRawFeatures(){return this.rawFeatures.map((item)=>structuredClone(item));}
    getRenderStats(){return {...this.renderStats};}
    focus(){
        if(!this.source.getFeatures().length)return;
        const extent=this.source.getExtent();
        if(!extent||extent.some((value)=>!Number.isFinite(value)))return;
        this.host.fitExtent(extent,{maxZoom:19,duration:240,padding:[88,88,88,88]});
    }
    dispose(){this.clear();this.host.removeLayer(this.layer);this.layer.dispose?.();}
}
