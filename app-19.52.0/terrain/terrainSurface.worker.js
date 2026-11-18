import { buildSurface } from './terrainSurface.js';
import { buildContours } from './terrainContours.js';
self.onmessage = ({ data }) => {
    try {
        if (data.action === 'contours') { self.postMessage(buildContours(data.tiles, data.interval)); return; }
        const tiles = buildSurface(data);
        self.postMessage({ tiles }, tiles.flatMap((tile) => [tile.values.buffer, tile.shade.buffer, tile.slopes.buffer]));
    } catch (error) { self.postMessage({ error: String(error?.message || error) }); }
};
