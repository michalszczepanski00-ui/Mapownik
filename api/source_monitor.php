<?php
declare(strict_types=1);
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/_terrain.php';
require_once __DIR__ . '/_source_semantics.php';

// Read-only diagnostic probes. No client supplied upstream URL, no tile-cache writes.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function monitor_reply(array $value, int $status = 200): never {
    http_response_code($status);
    echo json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
function monitor_get(string $url, string $accept): array {
    // Bound both response size and time. A missing extension is a hosting issue.
    if (!function_exists('curl_init')) return [0, '', '', 'Brak rozszerzenia cURL na hostingu.'];
    $catalogCache = str_contains($url, 'REQUEST=GetCapabilities') ? cache_root() . '/source-monitor/catalog-' . hash('sha256',$url) . '.json' : null;
    if ($catalogCache && is_file($catalogCache)) {
        $cached = json_decode((string)file_get_contents($catalogCache),true);
        if (is_array($cached) && ($cached['expires'] ?? 0) > time()) return [$cached['status'],base64_decode($cached['body'],true) ?: '',$cached['type'],$cached['error']];
    }
    $body = ''; $limit = false;
    $ch = curl_init($url);
    // 19.29.0: usługi integracji GUGiK przekierowują (302) do serwerów powiatów i gmin — kafle portalu za tym idą,
    // więc próba monitora też (wcześniej 12 działających usług wyglądało na „nie działa”).
    $options = [CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_TIMEOUT => 10, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => MAPOWNIK_USER_AGENT . ' diagnostics',
        CURLOPT_HTTPHEADER => ['Accept: ' . $accept], CURLOPT_ENCODING => '',
        CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$body, &$limit): int {
            if (strlen($body) + strlen($chunk) > 4 * 1024 * 1024) { $limit = true; return 0; }
            $body .= $chunk; return strlen($chunk);
        }];
    $ca = mapownik_ca_bundle(); if ($ca !== null) $options[CURLOPT_CAINFO] = $ca;
    curl_setopt_array($ch, $options); curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $type = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $error = $limit ? 'Odpowiedź przekracza limit 4 MiB.' : curl_error($ch);
    curl_close($ch);
    if ($catalogCache) atomic_write($catalogCache, json_encode(['expires'=>time()+($status===200 && $error==='' ? 300 : 60),'status'=>$status,'body'=>base64_encode($body),'type'=>$type,'error'=>$error]));
    return [$status, $body, $type, $error];
}
function monitor_url(string $url, array $params): string {
    return $url . (str_contains($url, '?') ? '&' : '?') . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
}
function monitor_sample(array $source, string $mode, float $x, float $y): array {
    if ($mode === 'image') {
        $version = $source['version'] ?? '1.1.1';
        $span = (float)($source['diagnostic_span'] ?? 300);
        $bbox = $version === '1.3.0' ? [$y-$span/2, $x-$span/2, $y+$span/2, $x+$span/2] : [$x-$span/2, $y-$span/2, $x+$span/2, $y+$span/2];
        $params = ['SERVICE'=>'WMS', 'REQUEST'=>'GetMap', 'VERSION'=>$version, ($version === '1.3.0' ? 'CRS' : 'SRS')=>'EPSG:2180',
            'BBOX'=>implode(',', $bbox), 'WIDTH'=>128, 'HEIGHT'=>128,
            'LAYERS'=>$source['layers'], 'STYLES'=>$source['styles'] ?? '', 'FORMAT'=>'image/png', 'TRANSPARENT'=>'TRUE'];
        if (isset($source['time'])) $params['TIME'] = $source['time'];
        $url = monitor_url($source['url'], $params);
        [$status, $body, $type, $error] = monitor_get($url, 'image/png');
        $valid = $error === '' && $status >= 200 && $status < 300 && (@getimagesizefromstring($body)[0] ?? 0) === 128 && (@getimagesizefromstring($body)[1] ?? 0) === 128;
        $transparent = false;
        if ($valid && function_exists('imagecreatefromstring')) {
            $image = @imagecreatefromstring($body);
            if ($image !== false) {
                $transparent = true;
                for ($row=0; $row<128 && $transparent; $row+=4) for ($col=0; $col<128; $col+=4) {
                    $color = imagecolorsforindex($image, imagecolorat($image, $col, $row));
                    if (($color['alpha'] ?? 0) < 120) { $transparent = false; break; }
                }
                imagedestroy($image);
            }
        }
        return ['state'=>$valid ? ($transparent ? 'partial' : 'ok') : ($status === 0 ? 'unknown' : 'down'), 'http'=>$status, 'bytes'=>strlen($body), 'coverage'=>$transparent ? 'unknown' : 'sample-only', 'issueCode'=>$status === 403 ? 'ACCESS_BLOCKED' : (!$valid ? 'INVALID_IMAGE' : null),
            'message'=>$valid ? ($transparent ? 'Poprawny obraz; próbka bez widocznych obiektów. Nie potwierdza braku danych w terenie.' : 'Poprawny obraz 128 × 128 w wybranej próbce; nie potwierdza kompletności danych.') : ($status === 403 ? 'Dostęp do źródła z tego serwera zablokowany (403); sprawdź dostęp u dostawcy.' : ($error ?: 'HTTP ' . $status . ', ale odpowiedź nie jest poprawnym obrazem 128 × 128. Możliwy błąd HTML/XML.')),
            'scope'=>'Obraz: WMS ' . $version . ' / EPSG:2180, główna konfiguracja; bez fallbacków aplikacji'];
    }
    [$status, $body, $type, $error] = monitor_get(monitor_url($source['url'], ['SERVICE'=>'WMS', 'REQUEST'=>'GetCapabilities', 'VERSION'=>$source['version'] ?? '1.3.0']), 'application/xml,text/xml');
    $valid = $error === '' && $status >= 200 && $status < 300 && preg_match('~<(?:[\w.-]+:)?(?:WMS_Capabilities|WMT_MS_Capabilities)\b~', $body);
    $layers = $valid ? parse_wms_capabilities_layers($body) : [];
    $names = array_column($layers, 'name');
    $expected = array_values(array_filter(explode(',', (string)($source['layers'] ?? ''))));
    $missing = array_values(array_diff($expected, $names));
    $semantic = wms_semantic_issues($source, $layers);
    return ['state'=>!$valid ? ($status === 0 ? 'unknown' : 'down') : (($missing || $semantic) ? 'partial' : 'ok'), 'http'=>$status, 'bytes'=>strlen($body),
        'missingLayers'=>$missing, 'semanticIssues'=>$semantic, 'layerCount'=>count($layers), 'issueCode'=>$status === 403 ? 'ACCESS_BLOCKED' : (!$valid ? 'TRANSPORT_UNAVAILABLE' : ($semantic ? 'SEMANTIC_MISMATCH' : ($missing ? 'LAYER_MISSING' : null))), 'coverage'=>'unknown',
        'message'=>!$valid ? ($status === 403 ? 'Dostęp do źródła z tego serwera zablokowany (403).' : ($error ?: 'HTTP ' . $status . ' lub odpowiedź nie jest WMS Capabilities.')) : ($missing ? 'Usługa odpowiada; nazwy warstw wymagają sprawdzenia: ' . implode(', ', $missing) : ($semantic ? 'Nazwy istnieją, ale znaczenie warstw uległo zmianie — sprawdź Title.' : 'Usługa odpowiada; nazwy i skonfigurowane znaczenie warstw zgodne.')),
        'scope'=>'GetCapabilities; nie potwierdza pokrycia, renderowania, CORS ani GetFeatureInfo'];
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') monitor_reply(['ok'=>false, 'error'=>'Użyj GET.'], 405);
$key = $_GET['source'] ?? '';
$mode = $_GET['mode'] ?? 'service';
if (!is_string($key) || !is_string($mode) || !in_array($mode, ['service','image'], true)) monitor_reply(['ok'=>false,'error'=>'Nieprawidłowe parametry.'],400);
$sources = require __DIR__ . '/_wms_sources.php';
$special = ['osm','wmts_standard','wmts_high','uldk','nmt'];
if (!isset($sources[$key]) && !in_array($key, $special, true)) monitor_reply(['ok'=>false,'error'=>'Nieznane źródło.'],400);
$x = 660123.559; $y = 486518.564;
foreach (['x','y'] as $coord) {
    if (isset($_GET[$coord])) {
        if (!is_string($_GET[$coord]) || !is_numeric($_GET[$coord])) monitor_reply(['ok'=>false,'error'=>'Nieprawidłowy punkt EPSG:2180.'],400);
        $$coord = (float)$_GET[$coord];
    }
}
// 19.23.0: point=ref — próbka obrazu w punkcie wzorcowym, gdzie źródło na pewno ma obiekty (EPSG:2180, x = wschód).
const MONITOR_REFERENCE_POINTS = [
    'bdot10k_buildings' => [567046, 244169],
    'flood_river' => [362484, 361971],
    'gdos_birds' => [605589, 497133],
    'gdos_habitats' => [605589, 497133],
    'gdos_national' => [605589, 497133],
    'natura2000' => [605589, 497133],
    'nmt_hypsometry' => [567046, 244169],
    'nmt_shaded' => [567046, 244169],
    'pgi_deposits' => [501425, 265869],
    'pgi_miningareas' => [501425, 265869],
    'pgi_miningterrains' => [501425, 265869],
    'pog_adopted' => [359245, 506914],
    'pog_draft' => [637371, 486679],
    'pog_zones' => [359245, 506914],
    'prg_boundaries' => [567046, 244169],
    'pse' => [523017, 377642],
    'ru_mpzp_prawniewiazacylubrealizowany' => [637371, 486679],
    'sopo' => [654734, 205523],
    // 19.50.0: nowe źródła
    'nid_immovable' => [477451, 720600],
    'flood_risk' => [490854, 696194],
    'gzwp' => [638534, 489047]
];
$referencePoint = false;
if (((string)($_GET['point'] ?? '')) === 'ref' && isset(MONITOR_REFERENCE_POINTS[$key])) { [$x, $y] = MONITOR_REFERENCE_POINTS[$key]; $referencePoint = true; }
if (!is_finite($x) || !is_finite($y) || $x<100000 || $x>950000 || $y<50000 || $y>1000000) monitor_reply(['ok'=>false,'error'=>'Punkt poza zakresem Polski.'],400);
$identity = isset($sources[$key]) ? $sources[$key] : $key;
$hash = hash('sha256', json_encode([$identity,$mode, $mode==='image' ? [round($x,-1),round($y,-1)] : null]));
$dir = cache_root() . '/source-monitor';
if (!ensure_dir($dir)) monitor_reply(['ok'=>false,'error'=>'Brak zapisu cache diagnostyki.'],503);
// Constant-sized rate record, serialized per client; prevents arbitrary point cache growth.
$rate = @fopen($dir . '/rate-' . hash('sha256',(string)($_SERVER['REMOTE_ADDR'] ?? 'local')) . '.json','c+');
if (!$rate || !flock($rate, LOCK_EX)) monitor_reply(['ok'=>false,'error'=>'Diagnostyka jest zajęta.'],429);
$times = json_decode(stream_get_contents($rate) ?: '[]',true);
$times = is_array($times) ? array_values(array_filter($times, static fn($n)=>is_numeric($n) && (int)$n>time()-60)) : [];
if (count($times)>=100) { flock($rate,LOCK_UN); fclose($rate); monitor_reply(['ok'=>false,'error'=>'Limit 100 prób na minutę. Odczekaj minutę.'],429); }
$times[]=time(); ftruncate($rate,0); rewind($rate); fwrite($rate,json_encode($times)); fflush($rate); flock($rate,LOCK_UN); fclose($rate);
// One result slot per source+mode: bounded storage even when sample point changes.
$slot = hash('sha256', $key . ':' . $mode);
$file = $dir . '/' . $slot . '.json';
$cached = is_file($file) ? json_decode((string)@file_get_contents($file),true) : null;
$ttl = $mode === 'image' ? 60 : 300;
if (is_array($cached) && ($cached['fingerprint'] ?? '')===$hash && time()-(int)($cached['checkedAt'] ?? 0)<$ttl) {
    monitor_reply(['ok'=>true,'cached'=>true,'ageSeconds'=>time()-(int)$cached['checkedAt']] + $cached);
}
$lock = @fopen($dir . '/' . $slot . '.lock','c');
if (!$lock || !flock($lock,LOCK_EX | LOCK_NB)) monitor_reply(['ok'=>false,'error'=>'Próba tego źródła już trwa.'],429);
$started = microtime(true);
try {
    if (isset($sources[$key])) $result = monitor_sample($sources[$key],$mode,$x,$y);
    else {
        $url = match($key) {
            'osm'=>'https://tile.openstreetmap.org/6/35/21.png',
            'wmts_standard'=>'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/StandardResolution?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTOFOTOMAPA&STYLE=default&FORMAT=image/jpeg&TILEMATRIXSET=EPSG:3857&TILEMATRIX=EPSG:3857:14&TILEROW=5480&TILECOL=9120',
            // 19.27.0: WMTS HD nie ma już EPSG:3857 — portal używa WMS HighResolution i to on jest tu sprawdzany.
            'wmts_high'=>'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolution?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=Raster&STYLES=&SRS=EPSG:3857&BBOX=2062859,7161360,2063115,7161616&WIDTH=256&HEIGHT=256&FORMAT=image/jpeg',
            'uldk'=>'https://uldk.gugik.gov.pl/?request=GetParcelById&id=141207_5.0010.804&result=geom_wkt&srid=2180',
            'nmt'=>'https://services.gugik.gov.pl/nmt/?request=GetHByPointList&list=486518.56%20660123.56',
        };
        [$status,$body,$type,$error]=monitor_get($url,'*/*');
        $valid=$status>=200 && $status<300 && $error==='';
        $noData=false;
        if (in_array($key,['osm','wmts_standard','wmts_high'],true)) $valid=$valid && (@getimagesizefromstring($body)[0] ?? 0)>=16;
        elseif ($key==='uldk') $valid=$valid && preg_match('~^0\b~',trim($body)) && preg_match('~(?:MULTIPOLYGON|POLYGON)\s*\(~i',$body);
        else { $points=terrain_parse_response($body); $noData=$valid && count($points)>0 && !array_filter($points,static fn($p)=>$p['status']==='ok'); $valid=$valid && count($points)>0; }
        $result=['state'=>$valid?($noData?'partial':'ok'):($status===0?'unknown':'down'),'http'=>$status,'bytes'=>strlen($body),
            'message'=>$valid?($noData?'Usługa odpowiada; brak wysokości w próbce.':'Poprawna odpowiedź dla stałej próbki kontrolnej.'):($error?:'HTTP '.$status.' lub nieprawidłowy format próbki.'),
            'scope'=>'Połączenie serwera ze źródłem; stała próbka kontrolna, bez cache mapy i bez testu CORS'];
    }
    $result += ['samplePoint'=>[$x,$y],'referencePoint'=>$referencePoint,'source'=>$key,'mode'=>$mode,'checkedAt'=>time(),'durationMs'=>(int)round((microtime(true)-$started)*1000),'fingerprint'=>$hash];
    $saved=atomic_write($file,json_encode($result,JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}');
    flock($lock,LOCK_UN); fclose($lock);
    monitor_reply(['ok'=>true,'cached'=>false,'ageSeconds'=>0,'cacheSaved'=>$saved] + $result);
} catch (Throwable $e) { flock($lock,LOCK_UN); fclose($lock); monitor_reply(['ok'=>false,'error'=>'Błąd próby: '.$e->getMessage()],500); }
