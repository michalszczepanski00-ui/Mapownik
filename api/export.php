<?php
declare(strict_types=1);
require __DIR__ . '/_common.php';
require_once __DIR__ . '/_orthophoto.php';
$wmsSources = require __DIR__ . '/_wms_sources.php';

header('X-Content-Type-Options: nosniff');

function json_fail(string $message, int $status = 400, array $extra = []): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['ok' => false, 'error' => $message] + $extra, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function parse_memory_limit_bytes(): int {
    $raw = trim((string)ini_get('memory_limit'));
    if ($raw === '' || $raw === '-1') return 1024 * 1024 * 1024;
    if (!preg_match('/^(\d+(?:\.\d+)?)\s*([KMG])?$/i', $raw, $m)) return 256 * 1024 * 1024;
    $value = (float)$m[1]; $unit = strtoupper($m[2] ?? '');
    $mult = $unit === 'G' ? 1073741824 : ($unit === 'M' ? 1048576 : ($unit === 'K' ? 1024 : 1));
    return (int)floor($value * $mult);
}
function export_capabilities(): array {
    $memory = parse_memory_limit_bytes();
    $gd = function_exists('imagecreatetruecolor') && function_exists('imagecreatefromstring');
    $safePixels = $gd ? (int)max(4_000_000, min(80_000_000, floor($memory * 0.34 / 7.0))) : 0;
    // Batch uses the same memory model as single export, but reserves an
    // additional 30% for decoded WMS chunks, PNG/JPEG encoding and ZipArchive.
    $batchSafePixels = $gd ? (int)max(1_048_576, floor($safePixels * 0.70)) : 0;
    $batchTilePx = 0;
    if ($batchSafePixels > 0) {
        $batchTilePx = (int)(floor(sqrt($batchSafePixels) / 256) * 256);
        $batchTilePx = max(1024, min(4096, $batchTilePx));
        while (($batchTilePx * $batchTilePx) > $batchSafePixels && $batchTilePx > 1024) $batchTilePx -= 256;
    }
    return [
        'ok' => true,
        'version' => '19.41.4-export',
        'gd' => $gd,
        'zip' => class_exists('ZipArchive'),
        'imagick' => class_exists('Imagick'),
        'memory_limit_bytes' => $memory,
        'safe_single_pixels' => $safePixels,
        'max_batch_tile_pixels' => $batchSafePixels,
        'batch_tile_px' => $batchTilePx,
        'max_client_archive_bytes' => 268435456,
        'max_dimension' => 30000,
        'chunk_px' => 1536,
        'formats' => ['png', 'jpeg'],
        'batch' => class_exists('ZipArchive') && $gd,
        'georef' => true,
        'project_layout' => $gd,
        'completeness_gate' => true,
    ];
}
if (($_GET['action'] ?? '') === 'capabilities') {
    header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
    echo json_encode(export_capabilities(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_fail('Eksport wymaga metody POST.', 405);
if (!function_exists('imagecreatetruecolor') || !function_exists('imagecreatefromstring')) json_fail('Hosting nie ma rozszerzenia GD wymaganego do eksportu rastrowego.', 501);

$rawBody = (string)file_get_contents('php://input');
if (strlen($rawBody) > 5 * 1024 * 1024) json_fail('Dane eksportu przekraczają limit 5 MB.', 413);
$payload = json_decode($rawBody, true);
if (!is_array($payload)) json_fail('Nieprawidłowe dane eksportu.');


function enforce_export_rate_limit(string $mode): void {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'local');
    $dir = cache_root() . '/export-rate';
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    $file = $dir . '/' . hash('sha256', $ip . '|' . $mode) . '.json';
    $window = $mode === 'batch' ? 3600 : 600;
    $limit = $mode === 'batch' ? 4 : 20;
    $now = time(); $times = [];
    $fh = @fopen($file, 'c+'); if (!$fh) return;
    if (flock($fh, LOCK_EX)) {
        $content = stream_get_contents($fh); $decoded = json_decode($content ?: '[]', true);
        if (is_array($decoded)) $times = array_values(array_filter($decoded, fn($t) => is_numeric($t) && ((int)$t) > $now - $window));
        if (count($times) >= $limit) { flock($fh, LOCK_UN); fclose($fh); json_fail('Zbyt wiele eksportów z tego adresu. Spróbuj ponownie później.', 429); }
        flock($fh, LOCK_UN);
    }
    fclose($fh);
}
// 18.18.0: do limitu liczą się tylko eksporty, które się udały. Wcześniej każde
// „Ponów” po niekompletnym eksporcie (409) zjadało jeden z 4 pakietów na godzinę.
function record_export_success(string $mode): void {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'local');
    $file = cache_root() . '/export-rate/' . hash('sha256', $ip . '|' . $mode) . '.json';
    $window = $mode === 'batch' ? 3600 : 600;
    $now = time();
    $fh = @fopen($file, 'c+'); if (!$fh) return;
    if (flock($fh, LOCK_EX)) {
        $decoded = json_decode(stream_get_contents($fh) ?: '[]', true);
        $times = is_array($decoded) ? array_values(array_filter($decoded, fn($t) => is_numeric($t) && ((int)$t) > $now - $window)) : [];
        $times[] = $now; ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($times)); fflush($fh); flock($fh, LOCK_UN);
    }
    fclose($fh);
}

function finite_num($value): bool { return is_int($value) || is_float($value) || (is_string($value) && is_numeric($value)); }
function normalize_bbox($bbox): array {
    if (!is_array($bbox) || count($bbox) !== 4 || array_filter($bbox, fn($v) => !finite_num($v))) json_fail('Nieprawidłowy BBOX eksportu.');
    $b = array_map('floatval', array_values($bbox));
    if ($b[2] <= $b[0] || $b[3] <= $b[1]) json_fail('BBOX eksportu ma zerowy lub ujemny rozmiar.');
    if ($b[0] < 100000 || $b[2] > 900000 || $b[1] < 100000 || $b[3] > 950000) json_fail('Obszar eksportu wykracza poza bezpieczny zakres EPSG:2180.');
    return $b;
}
function sanitize_dimension($value, string $name): int {
    $v = filter_var($value, FILTER_VALIDATE_INT);
    if (!$v || $v < 128 || $v > 30000) json_fail("Nieprawidłowy wymiar {$name}.");
    return $v;
}
function sanitize_source_key($key, array $catalog): ?string {
    if ($key === null || $key === '' || $key === 'none') return null;
    $key = (string)$key;
    if (!isset($catalog[$key])) json_fail('Nieobsługiwane źródło eksportu: ' . $key);
    return $key;
}
function safe_text($value, int $max = 120): string {
    $text = trim((string)$value);
    $text = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $text) ?? '';
    return function_exists('mb_substr') ? mb_substr($text, 0, $max, 'UTF-8') : substr($text, 0, $max);
}

$mode = in_array(($payload['mode'] ?? 'single'), ['single','batch'], true) ? ($payload['mode'] ?? 'single') : 'single';
$bbox = normalize_bbox($payload['bbox'] ?? null);
$width = sanitize_dimension($payload['width'] ?? null, 'WIDTH');
$height = sanitize_dimension($payload['height'] ?? null, 'HEIGHT');
$format = ($payload['format'] ?? 'png') === 'jpeg' ? 'jpeg' : 'png';
$quality = max(40, min(100, (int)($payload['quality'] ?? 90)));
$basemap = sanitize_source_key($payload['basemap'] ?? null, $wmsSources);
$basemapOptions = is_array($payload['basemapOptions'] ?? null) ? $payload['basemapOptions'] : [];
if ($basemap === 'orthophoto_archive') {
    $month = $basemapOptions['archiveMonth'] ?? '';
    $time = is_string($month) ? orthophoto_time($month . '-01') : null;
    if ($time === null) json_fail('Nieprawidłowy miesiąc archiwalnej ortofotomapy.');
    $wmsSources[$basemap]['variants'] = [['fixed_params' => ['TIME' => $time]]];
}
if (in_array($basemap, ['orthophoto', 'orthophoto_high', 'orthophoto_archive', 'orthophoto_true'], true)) {
    $opacity = $basemapOptions['photoOpacity'] ?? 1;
    if (!finite_num($opacity) || (float)$opacity < 0.1 || (float)$opacity > 1) json_fail('Nieprawidłowe krycie ortofotomapy.');
    $wmsSources[$basemap]['opacity'] = (float)$opacity;
}
$overlayInput = is_array($payload['overlays'] ?? null) ? $payload['overlays'] : [];
if (count($overlayInput) > 20) json_fail('Eksport może zawierać maksymalnie 20 nakładek.', 413);
$overlayKeys = [];
foreach ($overlayInput as $key) { $normalized = sanitize_source_key($key, $wmsSources); if ($normalized && $normalized !== $basemap && !in_array($normalized, $overlayKeys, true)) $overlayKeys[] = $normalized; }
$objects = is_array($payload['objects'] ?? null) ? $payload['objects'] : [];
if (count($objects) > 5000) json_fail('Eksport może zawierać maksymalnie 5000 obiektów.', 413);
$layout = ($payload['layout'] ?? 'plain') === 'project' ? 'project' : 'plain';
$title = safe_text($payload['title'] ?? 'Mapa projektowa');
$legend = array_values(array_filter(array_map(fn($v) => safe_text($v, 80), is_array($payload['legend'] ?? null) ? $payload['legend'] : [])));
$georef = !empty($payload['georef']) && $layout === 'plain';
$allowGaps = !empty($payload['allow_gaps']);
$caps = export_capabilities();
$pixels = $width * $height;
if ($mode === 'single' && $pixels > $caps['safe_single_pixels']) json_fail('Eksport przekracza bezpieczny limit pamięci dla pojedynczego obrazu. Użyj trybu pakietu kafli.', 413, ['safe_single_pixels'=>$caps['safe_single_pixels'],'requested_pixels'=>$pixels]);
if ($mode === 'batch' && !$caps['batch']) json_fail('Pakiet kafli wymaga GD i ZipArchive na hostingu.', 501);
enforce_export_rate_limit($mode);
// 18.18.0: limit czasu z budżetem — przed jego końcem nie pobieramy już nowych
// fragmentów, tylko zwracamy 409 z listą braków (zamiast błędu 500 bez pliku).
$exportTimeLimit = $mode === 'batch' ? 300 : 120;
@set_time_limit($exportTimeLimit);
$GLOBALS['EXPORT_DEADLINE'] = microtime(true) + $exportTimeLimit - 20;
$GLOBALS['EXPORT_TEMP_FILES'] = [];
register_shutdown_function(static function (): void {
    foreach ($GLOBALS['EXPORT_TEMP_FILES'] ?? [] as $file) if (is_string($file) && is_file($file)) @unlink($file);
});

function wms_fetch_image(string $key, array $source, array $bbox, int $width, int $height) {
    $variants = $source['variants'] ?? [[ 'url'=>$source['url'], 'layers'=>$source['layers'], 'version'=>$source['version'] ?? '1.1.1' ]];
    $resolvedLayers = resolve_wms_layers_from_capabilities($source);
    if ($resolvedLayers !== null && $resolvedLayers !== '') {
        array_unshift($variants, [
            'url' => $source['url'],
            'layers' => $resolvedLayers,
            'version' => $source['version'] ?? '1.1.1',
        ]);
    }
    $expectedType = (string)($source['format'] ?? 'image/png');
    $bboxString = implode(',', array_map(fn($v) => rtrim(rtrim(sprintf('%.4F',$v),'0'),'.'), $bbox));
    $errors = [];
    // 18.18.0: pobrane fragmenty zostają na dobę — „Ponów” po niekompletnym
    // eksporcie pobiera już tylko brakujące części.
    $chunkKey = hash('sha256', json_encode([$key, $bboxString, $width, $height, $variants], JSON_UNESCAPED_SLASHES) ?: ($key . $bboxString));
    $chunkFile = cache_root() . '/export-chunks/' . substr($chunkKey, 0, 2) . '/' . $chunkKey . '.img';
    if (is_file($chunkFile) && (time() - (int)@filemtime($chunkFile)) < 86400) {
        $img = @imagecreatefromstring((string)@file_get_contents($chunkFile));
        if ($img !== false) return $img;
    }
    if (microtime(true) > ($GLOBALS['EXPORT_DEADLINE'] ?? INF)) throw new RuntimeException('Przekroczono czas eksportu.');
    // 19.8.6: tryb „merge: fill” (plany ogólne) — jak w wms.php: po jednym obrazie z każdego
    // hosta, puste piksele pierwszego uzupełnione kolejnymi.
    $mergeMode = (string)($source['merge'] ?? '') === 'fill';
    $merged = [];
    foreach ($variants as $variant) {
        if ($mergeMode && isset($variant['max_scale']) && ($bbox[2] - $bbox[0]) / $width / 0.00028 > (float)$variant['max_scale']) continue;
        $variantHost = strtolower((string)parse_url((string)($variant['url'] ?? $source['url']), PHP_URL_HOST));
        if ($mergeMode && isset($merged[$variantHost])) continue;
        $version = (string)($variant['version'] ?? $source['version'] ?? '1.1.1');
        $layers = (string)($variant['layers'] ?? $source['layers']);
        $url = (string)($variant['url'] ?? $source['url']);
        $upBbox = $bboxString;
        if ($version === '1.3.0') { $p = explode(',', $bboxString); if (count($p) === 4) $upBbox = implode(',', [$p[1],$p[0],$p[3],$p[2]]); }
        $params = [
            'SERVICE'=>'WMS','VERSION'=>$version,'REQUEST'=>'GetMap','LAYERS'=>$layers,
            'STYLES'=>(string)($variant['styles'] ?? ''),'FORMAT'=>$expectedType,
            'TRANSPARENT'=>!empty($source['transparent']) ? 'TRUE':'FALSE','BBOX'=>$upBbox,
            'WIDTH'=>(string)$width,'HEIGHT'=>(string)$height,
            'EXCEPTIONS'=>$version === '1.3.0' ? 'XML' : 'application/vnd.ogc.se_xml',
        ];
        if (!empty($variant['fixed_params']) && is_array($variant['fixed_params'])) foreach ($variant['fixed_params'] as $k=>$v) $params[$k]=(string)$v;
        $params[$version === '1.3.0' ? 'CRS':'SRS'] = 'EPSG:2180';
        $requestUrl = $url . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
        [$status,$body,$type,$error] = official_gis_remote_get($requestUrl, 'image/png,image/jpeg,image/*;q=0.9,*/*;q=0.1', 12, 'wms:' . $key . '@' . $variantHost);
        if ($status >= 200 && $status < 300 && strlen($body) > 20 && str_contains(strtolower($type), 'image/')) {
            $img = @imagecreatefromstring($body);
            if ($img !== false && $mergeMode) { imagedestroy($img); $merged[$variantHost] = $body; continue; }
            if ($img !== false) { @mkdir(dirname($chunkFile), 0775, true); atomic_write($chunkFile, $body); return $img; }
        }
        $errors[] = $status . ($error ? ' '.$error : '');
    }
    if ($merged) {
        $body = count($merged) > 1 ? (wms_merge_fill(array_values($merged)) ?? reset($merged)) : reset($merged);
        $img = @imagecreatefromstring($body);
        if ($img !== false) {
            // Fragment bez jednego ze źródeł nie trafia do pamięci — „Ponów” spróbuje ponownie.
            if (!$errors) { @mkdir(dirname($chunkFile), 0775, true); atomic_write($chunkFile, $body); }
            return $img;
        }
    }
    throw new RuntimeException("Źródło {$key} nie zwróciło obrazu WMS (" . implode(' | ', $errors) . ').');
}
function alpha_copy($dst, $src, int $x=0, int $y=0, float $opacity=1): void {
    imagealphablending($dst, true); imagesavealpha($dst, true);
    if ($opacity < 1) {
        $flat = imagecreatetruecolor(imagesx($src), imagesy($src));
        $white = imagecolorallocate($flat, 255, 255, 255); imagefill($flat, 0, 0, $white);
        imagealphablending($flat, true); imagecopy($flat, $src, 0, 0, 0, 0, imagesx($src), imagesy($src));
        imagecopymerge($dst, $flat, $x, $y, 0, 0, imagesx($src), imagesy($src), (int)round($opacity * 100));
        imagedestroy($flat); return;
    }
    imagecopy($dst, $src, $x, $y, 0, 0, imagesx($src), imagesy($src));
}
function render_sources($canvas, array $bbox, int $width, int $height, ?string $basemap, array $overlays, array $catalog): array {
    $chunk = 1536; $mapW = $bbox[2]-$bbox[0]; $mapH=$bbox[3]-$bbox[1]; $failures=[];
    $keys = array_values(array_filter(array_merge([$basemap], $overlays)));
    if (!$keys) { $white=imagecolorallocate($canvas,255,255,255); imagefilledrectangle($canvas,0,0,$width,$height,$white); return []; }
    foreach ($keys as $layerIndex=>$key) {
        $source=$catalog[$key];
        for ($y=0;$y<$height;$y+=$chunk) {
            $h=min($chunk,$height-$y); $maxY=$bbox[3]-($y/$height)*$mapH; $minY=$bbox[3]-(($y+$h)/$height)*$mapH;
            for ($x=0;$x<$width;$x+=$chunk) {
                $w=min($chunk,$width-$x); $minX=$bbox[0]+($x/$width)*$mapW; $maxX=$bbox[0]+(($x+$w)/$width)*$mapW; $chunkBbox=[$minX,$minY,$maxX,$maxY];
                try { $img=wms_fetch_image($key,$source,$chunkBbox,$w,$h); alpha_copy($canvas,$img,$x,$y,(float)($source['opacity'] ?? 1)); imagedestroy($img); }
                catch (Throwable $e) {
                    $failures[]=['source'=>$key,'x'=>$x,'y'=>$y,'width'=>$w,'height'=>$h,'bbox'=>$chunkBbox,'error'=>safe_text($e->getMessage(),220)];
                    if ($layerIndex===0) { $bg=imagecolorallocate($canvas,236,239,241); imagefilledrectangle($canvas,$x,$y,$x+$w,$y+$h,$bg); }
                }
            }
        }
    }
    return $failures;
}
function hex_rgb(string $hex): array { if (preg_match('/^#([0-9a-f]{6})$/i',$hex,$m)) return [hexdec(substr($m[1],0,2)),hexdec(substr($m[1],2,2)),hexdec(substr($m[1],4,2))]; return [37,99,235]; }
function px_point(array $p, array $bbox, int $w, int $h): array { return [($p[0]-$bbox[0])/($bbox[2]-$bbox[0])*$w, ($bbox[3]-$p[1])/($bbox[3]-$bbox[1])*$h]; }
function same_xy(array $a, array $b, float $eps = 1e-9): bool { return abs((float)$a[0]-(float)$b[0]) <= $eps && abs((float)$a[1]-(float)$b[1]) <= $eps; }
function normalize_ring_coords(array $ring): array {
    $out=[];
    foreach($ring as $p){
        if(!is_array($p)||count($p)<2||!finite_num($p[0])||!finite_num($p[1])) continue;
        $point=[(float)$p[0],(float)$p[1]];
        if(!$out||!same_xy($out[count($out)-1],$point)) $out[]=$point;
    }
    if(count($out)<3) return [];
    if(!same_xy($out[0],$out[count($out)-1])) $out[]=$out[0];
    return count($out)>=4?$out:[];
}
function ring_pixel_points(array $ring,array $bbox,int $w,int $h,int $offsetX=0,int $offsetY=0): array {
    $ring=normalize_ring_coords($ring); if(!$ring)return [];
    if(count($ring)>1&&same_xy($ring[0],$ring[count($ring)-1])) array_pop($ring);
    $pts=[];foreach($ring as $p){[$x,$y]=px_point($p,$bbox,$w,$h);$pts[]=(int)round($x)-$offsetX;$pts[]=(int)round($y)-$offsetY;}return $pts;
}
function draw_line_geom($img,array $coords,array $bbox,int $w,int $h,int $color,int $thickness): void { imagesetthickness($img,max(1,$thickness)); for($i=1;$i<count($coords);$i++){[$x1,$y1]=px_point($coords[$i-1],$bbox,$w,$h);[$x2,$y2]=px_point($coords[$i],$bbox,$w,$h);imageline($img,(int)$x1,(int)$y1,(int)$x2,(int)$y2,$color);} }
function draw_polygon_geom($img,array $rings,array $bbox,int $w,int $h,int $stroke,int $fill,int $thickness): void {
    $normalized=[];
    foreach($rings as $ring){$r=normalize_ring_coords(is_array($ring)?$ring:[]);if($r)$normalized[]=$r;}
    if(!$normalized)return;

    // 17.8.3: draw the shell directly on the map image, but keep an exact
    // snapshot of the underlay. Interior rings are restored pixel-for-pixel
    // from that snapshot through a binary mask. This avoids GD true-colour
    // transparency quirks which converted fully transparent overlay pixels to
    // opaque white during imagecopy() on some PHP/GD builds.
    $outer=ring_pixel_points($normalized[0],$bbox,$w,$h,0,0);
    if(count($outer)<6)return;
    $outerPairs=[];for($i=0;$i<count($outer);$i+=2)$outerPairs[]=[$outer[$i],$outer[$i+1]];
    $xs=array_column($outerPairs,0);$ys=array_column($outerPairs,1);$pad=max(2,$thickness+2);
    $minX=max(0,min($w-1,min($xs)-$pad));$maxX=min($w-1,max($xs)+$pad);
    $minY=max(0,min($h-1,min($ys)-$pad));$maxY=min($h-1,max($ys)+$pad);
    $mw=$maxX-$minX+1;$mh=$maxY-$minY+1;if($mw<=0||$mh<=0)return;

    $under=imagecreatetruecolor($mw,$mh);
    imagealphablending($under,false);imagesavealpha($under,true);
    imagecopy($under,$img,0,0,$minX,$minY,$mw,$mh);

    imagealphablending($img,true);
    imagefilledpolygon($img,$outer,(int)(count($outer)/2),$fill);

    // Restore only pixels belonging to holes. The mask is palette-based and
    // therefore deterministic across GD versions; no alpha compositing is used.
    for($ri=1;$ri<count($normalized);$ri++){
        $holeLocal=ring_pixel_points($normalized[$ri],$bbox,$w,$h,$minX,$minY);
        if(count($holeLocal)<6)continue;
        $mask=imagecreate($mw,$mh);$black=imagecolorallocate($mask,0,0,0);$white=imagecolorallocate($mask,255,255,255);
        imagefill($mask,0,0,$black);imagefilledpolygon($mask,$holeLocal,(int)(count($holeLocal)/2),$white);
        $hx=[];$hy=[];for($i=0;$i<count($holeLocal);$i+=2){$hx[]=$holeLocal[$i];$hy[]=$holeLocal[$i+1];}
        $x0=max(0,min($hx));$x1=min($mw-1,max($hx));$y0=max(0,min($hy));$y1=min($mh-1,max($hy));
        for($yy=$y0;$yy<=$y1;$yy++)for($xx=$x0;$xx<=$x1;$xx++){
            if(imagecolorat($mask,$xx,$yy)===$white){imagesetpixel($img,$minX+$xx,$minY+$yy,imagecolorat($under,$xx,$yy));}
        }
        imagedestroy($mask);
    }

    imagesetthickness($img,max(1,$thickness));
    foreach($normalized as $ring){$pts=ring_pixel_points($ring,$bbox,$w,$h,0,0);if(count($pts)>=6)imagepolygon($img,$pts,(int)(count($pts)/2),$stroke);}
    imagedestroy($under);
}
function measurement_label(array $obj): string {
    $g=is_array($obj['geometry']??null)?$obj['geometry']:[];$type=$g['type']??'';$c=$g['coordinates']??[];
    if($type==='LineString'&&is_array($c)){ $sum=0.0; for($i=1;$i<count($c);$i++){ $dx=(float)$c[$i][0]-(float)$c[$i-1][0];$dy=(float)$c[$i][1]-(float)$c[$i-1][1];$sum+=sqrt($dx*$dx+$dy*$dy);} return number_format(round($sum),0,'.',' ').' m'; }
    if($type==='Polygon'&&is_array($c)&&count($c)){ $ringArea=function($ring){$ring=normalize_ring_coords(is_array($ring)?$ring:[]);if(count($ring)<4)return 0.0;$sum=0.0;for($i=0;$i<count($ring)-1;$i++){$sum+=(float)$ring[$i][0]*(float)$ring[$i+1][1]-(float)$ring[$i+1][0]*(float)$ring[$i][1];}return abs($sum)/2;};$area=$ringArea($c[0]);for($j=1;$j<count($c);$j++)$area-=$ringArea($c[$j]);return number_format(round(max(0,$area)),0,'.',' ').' m2'; }
    return '';
}
function measurement_anchor(array $g,array $bbox,int $w,int $h): ?array {
    $type=$g['type']??'';$c=$g['coordinates']??[];$pts=[];
    if($type==='LineString')$pts=$c; elseif($type==='Polygon'&&isset($c[0]))$pts=$c[0];
    if(!$pts)return null;$sx=0.0;$sy=0.0;$n=0;foreach($pts as $p){if(is_array($p)&&count($p)>=2){$sx+=(float)$p[0];$sy+=(float)$p[1];$n++;}}if(!$n)return null;return px_point([$sx/$n,$sy/$n],$bbox,$w,$h);
}
function render_objects($img,array $objects,array $bbox,int $w,int $h): void {
    imagealphablending($img,true);
    foreach($objects as $obj){ if(!is_array($obj)||empty($obj['visible'])||!is_array($obj['geometry']??null))continue; $g=$obj['geometry'];$style=is_array($obj['style']??null)?$obj['style']:[];[$r,$gg,$b]=hex_rgb((string)($style['strokeColor']??'#2563eb'));$stroke=imagecolorallocatealpha($img,$r,$gg,$b,0);[$fr,$fg,$fb]=hex_rgb((string)($style['fillColor']??'#93c5fd'));$fo=max(0,min(1,(float)($style['fillOpacity']??0.18)));$fill=imagecolorallocatealpha($img,$fr,$fg,$fb,(int)round(127*(1-$fo)));$th=(int)max(1,min(12,(float)($style['strokeWidth']??2)));
        $type=$g['type']??'';$c=$g['coordinates']??[];
        if($type==='LineString') draw_line_geom($img,$c,$bbox,$w,$h,$stroke,$th);
        elseif($type==='Polygon') draw_polygon_geom($img,$c,$bbox,$w,$h,$stroke,$fill,$th);
        elseif($type==='MultiPolygon') foreach($c as $poly) draw_polygon_geom($img,$poly,$bbox,$w,$h,$stroke,$fill,$th);
        elseif($type==='Point'&&count($c)>=2){[$x,$y]=px_point($c,$bbox,$w,$h);if(($obj['kind']??'')==='text'){ $props=is_array($obj['properties']??null)?$obj['properties']:[]; $label=gd_label((string)($props['text']??$obj['name']??'')); if($label!=='') imagestring($img,3,(int)$x+5,(int)$y-7,substr($label,0,90),$stroke); } else { imagefilledellipse($img,(int)$x,(int)$y,10,10,$fill);imageellipse($img,(int)$x,(int)$y,10,10,$stroke); }}
        if(($obj['kind']??'')==='measurement'){ $label=gd_label(measurement_label($obj));$anchor=measurement_anchor($g,$bbox,$w,$h);if($label!==''&&$anchor){[$lx,$ly]=$anchor;imagestring($img,3,(int)$lx+5,(int)$ly-15,substr($label,0,90),$stroke);} }
    }
}
function nice_scale(float $target): float { if($target<=0)return 1; $pow=pow(10,floor(log10($target)));$n=$target/$pow; $m=$n>=5?5:($n>=2?2:1); return $m*$pow; }
function gd_label(string $text): string { $converted = function_exists('iconv') ? @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text) : false; return is_string($converted) && $converted !== '' ? $converted : preg_replace('/[^ -~]/', '?', $text); }
function compose_project_layout($mapImg,int $mapW,int $mapH,string $title,array $legend,array $bbox){$top=82;$bottom=72;$side=18;$out=imagecreatetruecolor($mapW+$side*2,$mapH+$top+$bottom);$white=imagecolorallocate($out,255,255,255);$ink=imagecolorallocate($out,24,31,42);$muted=imagecolorallocate($out,90,100,112);imagefill($out,0,0,$white);imagecopy($out,$mapImg,$side,$top,0,0,$mapW,$mapH);imagestring($out,5,$side,20,gd_label($title?:'Mapa projektowa'),$ink);imagestring($out,2,$side,44,'MSPortal 19.41.4  |  EPSG:2180',$muted);$nx=$side+$mapW-42;$ny=22;imageline($out,$nx,$ny+35,$nx,$ny,$ink);imageline($out,$nx,$ny,$nx-6,$ny+10,$ink);imageline($out,$nx,$ny,$nx+6,$ny+10,$ink);imagestring($out,3,$nx-4,$ny+38,'N',$ink);$mapMeters=$bbox[2]-$bbox[0];$scale=nice_scale($mapMeters/5);$barPx=(int)round($scale/$mapMeters*$mapW);$sx=$side+16;$sy=$top+$mapH+26;imagesetthickness($out,3);imageline($out,$sx,$sy,$sx+$barPx,$sy,$ink);imageline($out,$sx,$sy-5,$sx,$sy+5,$ink);imageline($out,$sx+$barPx,$sy-5,$sx+$barPx,$sy+5,$ink);$label=$scale>=1000?number_format($scale/1000,($scale%1000)?1:0,'.','').' km':number_format($scale,0,'.','').' m';imagestring($out,2,$sx,$sy+9,$label,$ink);$lx=$side+$mapW-240;$ly=$top+$mapH+12;foreach(array_slice($legend,0,5) as $i=>$line){imagestring($out,2,$lx,$ly+$i*12,gd_label('- '.$line),$muted);}return $out;}
function world_file(array $bbox,int $w,int $h): string { $px=($bbox[2]-$bbox[0])/$w;$py=($bbox[3]-$bbox[1])/$h;$x=$bbox[0]+$px/2;$y=$bbox[3]-$py/2;return sprintf("%.12F\n0.000000000000\n0.000000000000\n-%.12F\n%.12F\n%.12F\n",$px,$py,$x,$y); }
function emit_image($img,string $format,int $quality,string $filename,?string $world=null): never { header('Cache-Control: no-store');header('Content-Disposition: attachment; filename="'.$filename.'"');if($world!==null)header('X-MSPortal-World-File: '.base64_encode($world));if($format==='jpeg'){header('Content-Type: image/jpeg');imagejpeg($img,null,$quality);}else{header('Content-Type: image/png');imagepng($img,null,6);}imagedestroy($img);exit; }
function build_map(array $bbox,int $w,int $h,?string $basemap,array $overlays,array $objects,array $catalog,array &$missing=[]){$img=imagecreatetruecolor($w,$h);imagealphablending($img,true);imagesavealpha($img,true);$bg=imagecolorallocate($img,245,247,250);imagefill($img,0,0,$bg);$missing=render_sources($img,$bbox,$w,$h,$basemap,$overlays,$catalog);render_objects($img,$objects,$bbox,$w,$h);return $img;}

if ($mode === 'single') {
    $missing=[];
    $map = build_map($bbox,$width,$height,$basemap,$overlayKeys,$objects,$wmsSources,$missing);
    if ($missing && !$allowGaps) {
        imagedestroy($map);
        $bySource=[]; foreach($missing as $failure){$key=(string)($failure['source']??'unknown');$bySource[$key]=($bySource[$key]??0)+1;}
        json_fail('Eksport nie jest kompletny — część fragmentów źródeł mapowych nie została pobrana.',409,[
            'code'=>'EXPORT_INCOMPLETE',
            'missing_count'=>count($missing),
            'missing_by_source'=>$bySource,
            'missing'=>array_slice($missing,0,40),
        ]);
    }
    $final=$map;
    if($layout==='project'){ $final=compose_project_layout($map,$width,$height,$title,$legend,$bbox); imagedestroy($map); }
    $ext=$format==='jpeg'?'jpg':'png'; $world=$georef?world_file($bbox,$width,$height):null;
    record_export_success($mode);
    emit_image($final,$format,$quality,'mapownik-export-'.$width.'x'.$height.'.'.$ext,$world);
}

// 15.5: large export as ZIP of georeferenced tiles, processed sequentially.
$tilePx=(int)($caps['batch_tile_px']??0);if($tilePx<512)json_fail('Nie można wyznaczyć bezpiecznego rozmiaru kafla dla dostępnej pamięci PHP.',501);$cols=(int)ceil($width/$tilePx);$rows=(int)ceil($height/$tilePx);$count=$cols*$rows;if($count>64)json_fail('Pakiet przekracza limit 64 kafli. Zwiększ rozdzielczość m/px lub zmniejsz obszar.',413,['tiles'=>$count,'batch_tile_px'=>$tilePx]);
$tmp=tempnam(sys_get_temp_dir(),'mapownik-export-');if($tmp===false)json_fail('Nie można utworzyć pliku tymczasowego.',500);@unlink($tmp);$zipPath=$tmp.'.zip';$GLOBALS['EXPORT_TEMP_FILES'][]=$zipPath;$zip=new ZipArchive();if($zip->open($zipPath,ZipArchive::CREATE|ZipArchive::OVERWRITE)!==true)json_fail('Nie można utworzyć archiwum ZIP.',500);
$mapW=$bbox[2]-$bbox[0];$mapH=$bbox[3]-$bbox[1];$manifest=['version'=>'19.41.4','crs'=>'EPSG:2180','bbox'=>$bbox,'width'=>$width,'height'=>$height,'format'=>$format,'batch_tile_px'=>$tilePx,'tiles'=>[]];
for($row=0;$row<$rows;$row++){for($col=0;$col<$cols;$col++){ $x=$col*$tilePx;$y=$row*$tilePx;$tw=min($tilePx,$width-$x);$th=min($tilePx,$height-$y);$minX=$bbox[0]+($x/$width)*$mapW;$maxX=$bbox[0]+(($x+$tw)/$width)*$mapW;$maxY=$bbox[3]-($y/$height)*$mapH;$minY=$bbox[3]-(($y+$th)/$height)*$mapH;$tb=[$minX,$minY,$maxX,$maxY];$tileMissing=[];$img=build_map($tb,$tw,$th,$basemap,$overlayKeys,$objects,$wmsSources,$tileMissing);if($tileMissing){$manifest['missing_fragments']=($manifest['missing_fragments']??0)+count($tileMissing);$manifest['missing_by_source']=$manifest['missing_by_source']??[];foreach($tileMissing as $failure){$mk=(string)($failure['source']??'unknown');$manifest['missing_by_source'][$mk]=($manifest['missing_by_source'][$mk]??0)+1;}}/* 18.18.0: kafel trafia do pliku tymczasowego i do ZIP przez addFile — wcześniej
   cały pakiet siedział w pamięci do close() i duże eksporty przekraczały memory_limit. */$tileTmp=tempnam(sys_get_temp_dir(),'mapownik-tile-');if($tileTmp===false)json_fail('Nie można utworzyć pliku tymczasowego.',500);$GLOBALS['EXPORT_TEMP_FILES'][]=$tileTmp;if($format==='jpeg')imagejpeg($img,$tileTmp,$quality);else imagepng($img,$tileTmp,6);imagedestroy($img);$base=sprintf('tile_r%02d_c%02d',$row+1,$col+1);$ext=$format==='jpeg'?'jpg':'png';$zip->addFile($tileTmp,$base.'.'.$ext);$world=world_file($tb,$tw,$th);$zip->addFromString($base.'.'.($format==='jpeg'?'jgw':'pgw'),$world);$manifest['tiles'][]=['file'=>$base.'.'.$ext,'world_file'=>$base.'.'.($format==='jpeg'?'jgw':'pgw'),'bbox'=>$tb,'width'=>$tw,'height'=>$th]; }}
if (!empty($manifest['missing_fragments']) && !$allowGaps) {
    $missingCount=(int)$manifest['missing_fragments']; $missingBySource=is_array($manifest['missing_by_source']??null)?$manifest['missing_by_source']:[];
    $zip->close(); @unlink($zipPath);
    json_fail('Pakiet eksportowy nie jest kompletny — część fragmentów źródeł mapowych nie została pobrana.',409,[
        'code'=>'EXPORT_INCOMPLETE','missing_count'=>$missingCount,'missing_by_source'=>$missingBySource,'missing'=>[]
    ]);
}
$zip->addFromString('manifest.json',json_encode($manifest,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));$zip->addFromString('README.txt',"MSPortal 19.41.4 — pakiet kafli eksportowych
CRS: EPSG:2180
Każdy obraz ma własny plik world file.
".(!empty($manifest['missing_fragments'])?"Uwaga: eksport wykonano świadomie mimo brakujących fragmentów źródeł.
":""));$zip->close();record_export_success($mode);header('Content-Type: application/zip');header('Content-Disposition: attachment; filename="mapownik-export-kafle.zip"');header('Cache-Control: no-store');readfile($zipPath);@unlink($zipPath);exit;
