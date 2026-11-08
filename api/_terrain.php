<?php
declare(strict_types=1);

// Heights are keyed by coordinates, never by the upstream response order.
function terrain_point_key(float $east, float $north): string {
    return number_format($east, 2, '.', '') . ' ' . number_format($north, 2, '.', '');
}
function terrain_parse_response(string $body): array {
    $body = trim(preg_replace('/^\xEF\xBB\xBF/', '', $body) ?? $body);
    $items = [];
    foreach (preg_split('/\s*,\s*/u', $body) ?: [] as $chunk) {
        if (preg_match('/^\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?|nan|null|nodata)\s*$/iu', trim($chunk), $m)) {
            $numeric = is_numeric($m[3]);
            $height = $numeric ? (float)$m[3] : null;
            $valid = $numeric && is_finite($height) && $height > -1000 && $height < 10000;
            $items[terrain_point_key((float)$m[2], (float)$m[1])] = [
                'height' => $valid ? $height : null, 'status' => $valid ? 'ok' : 'no_data',
            ];
        }
    }
    return $items;
}
function terrain_batch(array $points): array {
    $started = microtime(true);
    $cacheDir = cache_root() . '/terrain-v2'; // Old nullable batch caches are intentionally not reused.
    $rows = []; $missing = []; $cacheHits = 0;
    foreach ($points as $index => $point) {
        $key = terrain_point_key($point[0], $point[1]);
        $cacheFile = $cacheDir . '/' . hash('sha256', $key) . '.json';
        $cached = is_fresh($cacheFile, 7 * 86400) ? json_decode((string)@file_get_contents($cacheFile), true) : null;
        if (is_array($cached) && ($cached['key'] ?? '') === $key && is_numeric($cached['height'] ?? null)
            && $cached['height'] > -1000 && $cached['height'] < 10000 && (float)$cached['height'] !== 0.0) {
            // 19.41.0: wysokość dokładnie 0 nie jest brana z cache — GUGiK pod obciążeniem zwracał 0 dla całych paczek punktów.
            $rows[$index] = ['height' => (float)$cached['height'], 'status' => 'ok']; $cacheHits++;
        } else {
            $missing[$index] = $point;
            $rows[$index] = ['height' => null, 'status' => 'retryable'];
        }
    }
    $status = 200; $message = null;
    if ($missing) {
        $list = implode(',', array_map(static fn(array $p): string =>
            number_format($p[1], 2, '.', '') . ' ' . number_format($p[0], 2, '.', ''), array_values($missing)));
        $url = 'https://services.gugik.gov.pl/nmt/?' . http_build_query(['request' => 'GetHByPointList', 'list' => $list], '', '&', PHP_QUERY_RFC3986);
        try {
            [$status, $body, $type, $error] = official_gis_remote_get($url, 'text/plain,text/*;q=0.9,*/*;q=0.5', 8);
            if ($status >= 200 && $status < 300 && trim($body) !== '') {
                $parsed = terrain_parse_response($body);
                // 19.41.0: zero obok niezerowych wysokości w tej samej odpowiedzi to błąd usługi — punkt do ponowienia, bez cache.
                $nonZero = count(array_filter($parsed, static fn(array $row): bool => $row['status'] === 'ok' && abs((float)$row['height']) > 0.05));
                foreach ($missing as $index => $point) {
                    $key = terrain_point_key($point[0], $point[1]);
                    if (!isset($parsed[$key])) continue;
                    $rows[$index] = $parsed[$key];
                    if ($rows[$index]['status'] === 'ok' && (float)$rows[$index]['height'] === 0.0) {
                        if ($nonZero > 0) $rows[$index] = ['height' => null, 'status' => 'retryable'];
                        continue;
                    }
                    if ($rows[$index]['status'] === 'ok') {
                        atomic_write($cacheDir . '/' . hash('sha256', $key) . '.json',
                            json_encode(['key' => $key, 'height' => $rows[$index]['height']], JSON_UNESCAPED_SLASHES) ?: '{}');
                    }
                }
                if (count($parsed) === 0) $message = 'Nie rozpoznano odpowiedzi NMT.';
            } else $message = 'NMT HTTP ' . $status . ($error !== '' ? ': ' . $error : '');
        } catch (Throwable $e) { $message = $e->getMessage(); }
    }
    ksort($rows);
    $received = count(array_filter($rows, static fn(array $row): bool => $row['status'] === 'ok'));
    $diagnostic = ['samples' => count($points), 'received' => $received, 'cacheHits' => $cacheHits,
        'httpStatus' => $status, 'durationMs' => (int)round((microtime(true) - $started) * 1000), 'error' => $message];
    if ($received < count($points)) error_log('MSPortal NMT: ' . json_encode($diagnostic, JSON_UNESCAPED_UNICODE));
    return ['heights' => array_column($rows, 'height'), 'statuses' => array_column($rows, 'status'), 'diagnostic' => $diagnostic];
}
