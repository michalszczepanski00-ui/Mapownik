/**
 * Legacy helper retained for compatibility. Production basemaps use same-origin PHP proxy/cache endpoints.
 */
export const MAP_PROXY_PREFIX = '/mapproxy';
export function mapProxyWmtsCapabilitiesUrl() {
    return `${MAP_PROXY_PREFIX}/service?SERVICE=WMTS&REQUEST=GetCapabilities`;
}
