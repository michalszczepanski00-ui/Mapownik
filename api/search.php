<?php
declare(strict_types=1);
require __DIR__ . '/_common.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function search_fail(string $message, int $status = 400): never {
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function search_ok(array $payload): never {
    echo json_encode(['ok' => true] + $payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function text_query(string $key, int $minLength = 0, int $maxLength = 120): string {
    $value = trim((string)($_GET[$key] ?? ''));
    if ($value === '' || mb_strlen($value) < $minLength) {
        search_fail('Brak wymaganego parametru: ' . $key . '.', 400);
    }
    if (mb_strlen($value) > $maxLength) {
        $value = mb_substr($value, 0, $maxLength);
    }
    return preg_replace('/\s+/u', ' ', $value) ?? $value;
}

function optional_text_query(string $key, int $maxLength = 120): string {
    $value = trim((string)($_GET[$key] ?? ''));
    if ($value === '') return '';
    if (mb_strlen($value) > $maxLength) $value = mb_substr($value, 0, $maxLength);
    return preg_replace('/\s+/u', ' ', $value) ?? $value;
}

function norm(?string $value): ?string {
    $value = is_string($value) ? trim($value) : '';
    return $value !== '' ? $value : null;
}

function exact_rank(string $query, string $candidate): int {
    $q = mb_strtolower(trim($query));
    $c = mb_strtolower(trim($candidate));
    if ($q === $c) return 0;
    if (str_starts_with($c, $q)) return 1;
    if (str_contains($c, $q)) return 2;
    return 3;
}

/**
 * 19.41.4-b (audyt Z3): zapasowe zapytania do Nominatim z serwera zgodnie z zasadami OSMF —
 * własny User-Agent z adresem serwisu (zamiast udawania przeglądarki), pamięć wyników na 24 h
 * i najwyżej 1 zapytanie na sekundę z całego hostingu (wszyscy użytkownicy dzielą jego adres IP).
 */
const NOMINATIM_USER_AGENT = 'MSPortal/19.48.0 (+https://mapownik.swiadectwa.net)';
const NOMINATIM_CACHE_TTL = 86400;
function nominatim_get(string $url): array {
    $dir = cache_root() . '/nominatim';
    $key = hash('sha256', $url);
    $cacheFile = $dir . '/' . substr($key, 0, 2) . '/' . $key . '.json';
    if (is_fresh($cacheFile, NOMINATIM_CACHE_TTL)) {
        $body = (string)@file_get_contents($cacheFile);
        if ($body !== '') return [200, $body, 'application/json', ''];
    }
    if (!ensure_dir($dir) || !function_exists('curl_init')) return [0, '', '', 'Brak zapisu w cache wyszukiwania.'];
    $lock = @fopen($dir . '/.throttle', 'c+');
    if ($lock === false) return [0, '', '', 'Brak zapisu w cache wyszukiwania.'];
    $deadline = microtime(true) + 3.0;
    while (!@flock($lock, LOCK_EX | LOCK_NB)) {
        if (microtime(true) > $deadline) { fclose($lock); return [429, '', '', 'Wyszukiwarka jest zajęta.']; }
        usleep(100000);
    }
    try {
        $wait = (float)stream_get_contents($lock) + 1.1 - microtime(true);
        if ($wait > 0) usleep((int)round(min(1.1, $wait) * 1000000));
        $ch = curl_init($url);
        $ca = mapownik_ca_bundle();
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_TIMEOUT => 12,
            CURLOPT_USERAGENT => NOMINATIM_USER_AGENT, CURLOPT_HTTPHEADER => ['Accept: application/json', 'Accept-Language: pl'],
            CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2, CURLOPT_ENCODING => '', CURLOPT_FOLLOWLOCATION => false]
            + ($ca !== null ? [CURLOPT_CAINFO => $ca] : []));
        $result = mapownik_curl_exec($ch);
        ftruncate($lock, 0); rewind($lock); fwrite($lock, sprintf('%.3F', microtime(true))); fflush($lock);
    } finally {
        @flock($lock, LOCK_UN); fclose($lock);
    }
    [$status, $body] = $result;
    if ($status === 200 && $body !== '' && is_array(json_decode($body, true))) atomic_write($cacheFile, $body);
    return $result;
}

function nominatim_json(string $url): array {
    [$status, $body, $type, $error] = nominatim_get($url);
    if ($status < 200 || $status >= 300 || trim($body) === '') {
        if ($error !== '') error_log('msportal search.php nominatim: ' . $error);
        search_fail('Usługa wyszukiwania miejsc jest chwilowo niedostępna.', $status === 429 ? 429 : 502);
    }
    $json = json_decode($body, true);
    if (!is_array($json)) {
        search_fail('Usługa wyszukiwania zwróciła nieprawidłową odpowiedź.', 502);
    }
    return $json;
}

function normalize_bbox($bbox): ?array {
    if (!is_array($bbox) || count($bbox) !== 4) return null;
    $values = array_map(static fn($value) => is_numeric($value) ? (float)$value : null, $bbox);
    if (in_array(null, $values, true)) return null;
    return [(float)$values[2], (float)$values[0], (float)$values[3], (float)$values[1]];
}

function normalize_county(?string $value): ?string {
    $value = norm($value);
    if ($value === null) return null;
    return preg_replace('/^powiat\s+/iu', '', $value) ?: $value;
}

function locality_from_address(array $address, array $row): ?string {
    foreach (['city', 'town', 'village', 'hamlet', 'municipality', 'suburb', 'locality'] as $key) {
        if (!empty($address[$key])) return trim((string)$address[$key]);
    }
    foreach (['namedetails', 'display_name', 'name'] as $key) {
        if (!empty($row[$key]) && is_string($row[$key])) {
            $candidate = trim(explode(',', $row[$key])[0]);
            if ($candidate !== '') return $candidate;
        }
    }
    return null;
}

function search_localities(string $query): never {
    $params = [
        'q' => $query,
        'countrycodes' => 'pl',
        'accept-language' => 'pl',
        'addressdetails' => '1',
        'namedetails' => '1',
        'limit' => '12',
        'dedupe' => '1',
        'format' => 'jsonv2',
    ];
    $url = 'https://nominatim.openstreetmap.org/search?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    $rows = nominatim_json($url);
    $items = [];
    $seen = [];
    foreach ($rows as $row) {
        if (!is_array($row)) continue;
        $address = is_array($row['address'] ?? null) ? $row['address'] : [];
        $localityName = locality_from_address($address, $row);
        if ($localityName === null) continue;
        $commune = norm((string)($address['municipality'] ?? $address['city'] ?? $address['town'] ?? $address['village'] ?? ''));
        $county = normalize_county($address['county'] ?? null);
        $voivodeship = norm((string)($address['state'] ?? ''));
        $dedupeKey = mb_strtolower($localityName . '|' . ($commune ?? '') . '|' . ($county ?? '') . '|' . ($voivodeship ?? ''));
        if (isset($seen[$dedupeKey])) continue;
        $seen[$dedupeKey] = true;
        $items[] = [
            'id' => (string)($row['place_id'] ?? $dedupeKey),
            'label' => $localityName,
            'localityName' => $localityName,
            'commune' => $commune,
            'county' => $county,
            'voivodeship' => $voivodeship,
            'lat' => isset($row['lat']) && is_numeric($row['lat']) ? (float)$row['lat'] : null,
            'lon' => isset($row['lon']) && is_numeric($row['lon']) ? (float)$row['lon'] : null,
            'boundingBox' => normalize_bbox($row['boundingbox'] ?? null),
        ];
    }

    usort($items, static function (array $a, array $b) use ($query): int {
        $rankA = exact_rank($query, (string)$a['localityName']);
        $rankB = exact_rank($query, (string)$b['localityName']);
        if ($rankA !== $rankB) return $rankA <=> $rankB;
        return strcmp((string)($a['voivodeship'] ?? ''), (string)($b['voivodeship'] ?? ''));
    });

    search_ok(['mode' => 'locality', 'bboxOrder' => 'west,south,east,north', 'bboxCrs' => 'EPSG:4326', 'items' => array_slice($items, 0, 10)]);
}

function search_streets(string $query, string $locality, string $commune, string $voivodeship): never {
    $parts = [$query, $locality];
    if ($commune !== '' && mb_strtolower($commune) !== mb_strtolower($locality)) $parts[] = $commune;
    if ($voivodeship !== '') $parts[] = $voivodeship;
    $parts[] = 'Polska';
    $params = [
        'q' => implode(', ', $parts),
        'countrycodes' => 'pl',
        'accept-language' => 'pl',
        'addressdetails' => '1',
        'limit' => '12',
        'dedupe' => '1',
        'format' => 'jsonv2',
    ];
    $url = 'https://nominatim.openstreetmap.org/search?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    $rows = nominatim_json($url);
    $items = [];
    $seen = [];
    foreach ($rows as $row) {
        if (!is_array($row)) continue;
        $address = is_array($row['address'] ?? null) ? $row['address'] : [];
        $streetName = norm((string)($address['road'] ?? $address['pedestrian'] ?? $address['footway'] ?? $address['cycleway'] ?? $address['path'] ?? $row['name'] ?? ''));
        if ($streetName === null) continue;
        $localityName = locality_from_address($address, ['name' => $locality, 'display_name' => $locality]);
        $itemCommune = norm((string)($address['municipality'] ?? $address['city'] ?? $address['town'] ?? $address['village'] ?? $commune));
        $itemVoivodeship = norm((string)($address['state'] ?? $voivodeship));
        $dedupeKey = mb_strtolower($streetName . '|' . ($localityName ?? '') . '|' . ($itemCommune ?? '') . '|' . ($itemVoivodeship ?? ''));
        if (isset($seen[$dedupeKey])) continue;
        $seen[$dedupeKey] = true;
        $items[] = [
            'id' => (string)($row['place_id'] ?? $dedupeKey),
            'label' => $streetName,
            'streetName' => $streetName,
            'localityName' => $localityName,
            'commune' => $itemCommune,
            'voivodeship' => $itemVoivodeship,
            'lat' => isset($row['lat']) && is_numeric($row['lat']) ? (float)$row['lat'] : null,
            'lon' => isset($row['lon']) && is_numeric($row['lon']) ? (float)$row['lon'] : null,
            'boundingBox' => normalize_bbox($row['boundingbox'] ?? null),
        ];
    }

    usort($items, static function (array $a, array $b) use ($query): int {
        $rankA = exact_rank($query, (string)$a['streetName']);
        $rankB = exact_rank($query, (string)$b['streetName']);
        if ($rankA !== $rankB) return $rankA <=> $rankB;
        return strcmp((string)($a['localityName'] ?? ''), (string)($b['localityName'] ?? ''));
    });

    search_ok(['mode' => 'street', 'bboxOrder' => 'west,south,east,north', 'bboxCrs' => 'EPSG:4326', 'items' => array_slice($items, 0, 10)]);
}

function parse_uldk_record(string $line): ?array {
    $line = trim($line);
    if ($line === '') return null;
    if (!preg_match('~(?:SRID\s*=\s*\d+\s*;\s*)?(?:MULTIPOLYGON|POLYGON)\s*\(~i', $line, $match, PREG_OFFSET_CAPTURE)) {
        return null;
    }
    $offset = (int)$match[0][1];
    $wkt = trim(substr($line, $offset));
    $prefix = rtrim(trim(substr($line, 0, $offset)), "|;\t ");
    $fields = [];
    if ($prefix !== '') {
        if (str_contains($prefix, '|')) $fields = array_map('trim', explode('|', $prefix));
        elseif (str_contains($prefix, "\t")) $fields = array_map('trim', explode("\t", $prefix));
        elseif (str_contains($prefix, ';')) $fields = array_map('trim', explode(';', $prefix));
        else $fields = [trim($prefix)];
    }
    while (count($fields) < 7) $fields[] = '';
    [$id, $parcel, $region, $commune, $county, $voivodeship, $datasource] = array_slice($fields, 0, 7);
    return [
        'id' => $id !== '' ? $id : null,
        'parcel' => $parcel !== '' ? $parcel : null,
        'region' => $region !== '' ? $region : null,
        'commune' => $commune !== '' ? $commune : null,
        'county' => $county !== '' ? $county : null,
        'voivodeship' => $voivodeship !== '' ? $voivodeship : null,
        'datasource' => $datasource !== '' ? $datasource : null,
        'wkt' => $wkt,
        'srid' => 2180,
        'label' => $parcel !== '' ? $parcel : ($id !== '' ? $id : 'działka'),
    ];
}

/** 19.26.0: równoległe zapytania tekstowe do ULDK (curl_multi) — wynik: [url => treść albo ''] . */
function uldk_multi_get(array $urls, int $timeout = 12): array {
    $out = array_fill_keys($urls, '');
    if (!$urls || !function_exists('curl_multi_init')) {
        foreach ($urls as $url) { [$status, $body] = vendor_remote_get($url, 'text/plain'); $out[$url] = $status >= 200 && $status < 300 ? (string)$body : ''; }
        return $out;
    }
    $multi = curl_multi_init(); $handles = [];
    foreach ($urls as $url) {
        $ch = curl_init($url);
        $options = [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_TIMEOUT => $timeout,
            CURLOPT_USERAGENT => MAPOWNIK_USER_AGENT, CURLOPT_HTTPHEADER => ['Accept: text/plain']];
        $ca = mapownik_ca_bundle(); if ($ca !== null) $options[CURLOPT_CAINFO] = $ca;
        curl_setopt_array($ch, $options);
        curl_multi_add_handle($multi, $ch); $handles[$url] = $ch;
    }
    do { $status = curl_multi_exec($multi, $running); if ($running) curl_multi_select($multi, 1.0); } while ($running && $status === CURLM_OK);
    foreach ($handles as $url => $ch) {
        if ((int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE) === 200) $out[$url] = (string)curl_multi_getcontent($ch);
        curl_multi_remove_handle($multi, $ch); curl_close($ch);
    }
    curl_multi_close($multi);
    return $out;
}

/**
 * 19.26.0: „miejscowość + numer” — działka szukana we wszystkich obrębach jednostki ewidencyjnej,
 * w której leży punkt miejscowości (obręby w miastach mają inne nazwy niż miejscowość, np. „Wieliczka 1”, „Wieliczka 2”).
 */
function uldk_parcels_in_unit(string $parcelNumber, float $lon, float $lat): array {
    $base = 'https://uldk.gugik.gov.pl/?';
    $regionAt = uldk_multi_get([$base . http_build_query(['request' => 'GetRegionByXY', 'xy' => sprintf('%.6F,%.6F,4326', $lon, $lat), 'result' => 'id,region'], '', '&', PHP_QUERY_RFC3986)]);
    if (!preg_match('~^(\d{6}_\d)\.\d{4}\|~m', (string)reset($regionAt), $m)) return [];
    $unit = $m[1];
    // Obręby jednostki numerowane od 0001 — sprawdzamy paczkami po 10, dopóki paczka coś zawiera (maks. 80).
    $regions = [];
    for ($start = 1; $start <= 80; $start += 10) {
        $urls = [];
        for ($i = $start; $i < $start + 10; $i++) $urls[sprintf('%s.%04d', $unit, $i)] = $base . http_build_query(['request' => 'GetRegionByNameOrId', 'id' => sprintf('%s.%04d', $unit, $i), 'result' => 'id'], '', '&', PHP_QUERY_RFC3986);
        $bodies = uldk_multi_get(array_values($urls));
        $found = 0;
        foreach ($urls as $region => $url) if (str_contains($bodies[$url], $region)) { $regions[] = $region; $found++; }
        if ($found < 10) break;
    }
    if (!$regions) return [];
    $urls = [];
    foreach ($regions as $region) $urls[] = $base . http_build_query(['request' => 'GetParcelById', 'id' => $region . '.' . $parcelNumber, 'result' => 'id,parcel,region,commune,county,voivodeship,datasource,geom_wkt', 'srid' => '2180'], '', '&', PHP_QUERY_RFC3986);
    $items = [];
    foreach (uldk_multi_get($urls) as $body) {
        foreach (preg_split('/\R/u', trim(preg_replace('/^\xEF\xBB\xBF/', '', $body) ?? $body)) ?: [] as $line) {
            $record = parse_uldk_record((string)$line);
            if ($record !== null) $items[] = $record;
        }
    }
    return $items;
}

function search_parcels(string $parcelQuery, string $locality = '', bool $exactId = false, ?array $lonLat = null): never {
    // 19.26.0: najpierw obręby jednostki ewidencyjnej z punktu miejscowości; nazwa obrębu jako zapas.
    if (!$exactId && $lonLat !== null && preg_match('~^\d+(?:/\d+)?$~', $parcelQuery)) {
        $inUnit = uldk_parcels_in_unit($parcelQuery, $lonLat[0], $lonLat[1]);
        if ($inUnit) {
            $seen = []; $unique = [];
            foreach ($inUnit as $item) { $key = (string)($item['id'] ?? ''); if ($key === '' || isset($seen[$key])) continue; $seen[$key] = true; $unique[] = $item; }
            usort($unique, static fn(array $a, array $b): int => strcmp((string)($a['region'] ?? ''), (string)($b['region'] ?? '')));
            search_ok(['mode' => 'parcel', 'items' => array_slice($unique, 0, 25)]);
        }
    }
    $id = $exactId ? strtoupper($parcelQuery) : ($locality . ' ' . $parcelQuery);
    $params = [
        'request' => $exactId ? 'GetParcelById' : 'GetParcelByIdOrNr',
        'id' => $id,
        'result' => 'id,parcel,region,commune,county,voivodeship,datasource,geom_wkt',
        'srid' => '2180',
    ];
    $url = 'https://uldk.gugik.gov.pl/?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    [$status, $body, $type, $error] = vendor_remote_get($url, 'text/plain, text/*;q=0.9, */*;q=0.5');
    if ($status < 200 || $status >= 300 || trim($body) === '') {
        if ($error !== '') error_log('msportal search.php uldk: ' . $error);
        search_fail('Usługa ULDK jest chwilowo niedostępna.', 502);
    }

    $body = preg_replace('/^\xEF\xBB\xBF/', '', $body) ?? $body;
    $lines = preg_split('/\R/u', trim($body)) ?: [];
    if (!$lines) search_ok(['mode' => 'parcel', 'items' => []]);

    $first = trim((string)array_shift($lines));
    if ($first !== '' && !preg_match('/^\d+$/', $first)) {
        // Niektóre błędy ULDK zwracają status / komunikat tekstowy.
        if (str_starts_with($first, '-')) search_fail($first, 404);
        $candidate = parse_uldk_record($first);
        if ($candidate !== null) {
            array_unshift($lines, $first);
        } else {
            $details = trim(implode(' ', $lines));
            search_fail($details !== '' ? $details : $first, 404);
        }
    } elseif ($first === '0') {
        // 0 wyników albo rekordy zaczną się w kolejnych wierszach; obsłużymy przez parser poniżej.
    }

    $items = [];
    foreach ($lines as $line) {
        $record = parse_uldk_record((string)$line);
        if ($record !== null) $items[] = $record;
    }

    // Fallback: część wdrożeń może zwrócić pojedynczy rekord bez poprzedzającej liczby.
    if (!$items && $first !== '') {
        $record = parse_uldk_record($first);
        if ($record !== null) $items[] = $record;
    }

    $seen = [];
    $unique = [];
    foreach ($items as $item) {
        $key = (string)($item['id'] ?? $item['label']);
        if ($key === '' || isset($seen[$key])) continue;
        $seen[$key] = true;
        $unique[] = $item;
    }

    if ($exactId) {
        $unique = array_values(array_filter($unique, static fn(array $item): bool =>
            strtoupper((string)($item['id'] ?? '')) === $id
        ));
    }

    usort($unique, static function (array $a, array $b) use ($parcelQuery): int {
        $rankA = exact_rank($parcelQuery, (string)($a['parcel'] ?? $a['label'] ?? ''));
        $rankB = exact_rank($parcelQuery, (string)($b['parcel'] ?? $b['label'] ?? ''));
        if ($rankA !== $rankB) return $rankA <=> $rankB;
        return strcmp((string)($a['region'] ?? ''), (string)($b['region'] ?? ''));
    });

    search_ok(['mode' => $exactId ? 'parcel-id' : 'parcel', 'items' => array_slice($unique, 0, $exactId ? 1 : 25)]);
}

/**
 * 19.27.0: adres w jednym polu („Warszawa, Marszałkowska 100”, „Gusowskiego 20 Starogard Gdański”)
 * — geokoder GUGiK UUG (punkty adresowe PRG). Zwraca punkty w EPSG:4326 i 2180.
 */
function uug_rows(string $query): ?array {
    $url = 'https://services.gugik.gov.pl/uug/?' . http_build_query(['request' => 'GetAddress', 'address' => $query], '', '&', PHP_QUERY_RFC3986);
    [$status, $body] = vendor_remote_get($url, 'application/json, */*;q=0.5', 12, 6);
    if ($status < 200 || $status >= 300 || trim((string)$body) === '') return null;
    $json = json_decode((string)$body, true);
    return is_array($json['results'] ?? null) ? array_values($json['results']) : [];
}

/** Zapas dla adresów, których UUG nie zna (np. Warszawa): OpenStreetMap, tylko wyniki z numerem domu. */
function nominatim_address_items(string $query): array {
    $url = 'https://nominatim.openstreetmap.org/search?' . http_build_query(['q' => $query, 'countrycodes' => 'pl', 'accept-language' => 'pl', 'addressdetails' => '1', 'limit' => '6', 'format' => 'jsonv2'], '', '&', PHP_QUERY_RFC3986);
    [$status, $body] = nominatim_get($url);
    $rows = $status >= 200 && $status < 300 ? json_decode((string)$body, true) : null;
    $items = [];
    foreach (is_array($rows) ? $rows : [] as $row) {
        $a = is_array($row['address'] ?? null) ? $row['address'] : [];
        $street = trim((string)($a['road'] ?? $a['pedestrian'] ?? $a['square'] ?? ''));
        // Bez numeru domu tylko sama ulica (przybliżenie) — oznaczona w opisie wyniku.
        if (!is_numeric($row['lon'] ?? null) || (empty($a['house_number']) && $street === '')) continue;
        $city = trim((string)($a['city'] ?? $a['town'] ?? $a['village'] ?? $a['hamlet'] ?? ''));
        $items[] = [
            'id' => 'osm:' . ($row['osm_type'] ?? '') . ($row['osm_id'] ?? ''),
            'label' => trim($street . ' ' . ($a['house_number'] ?? '')) . ($city !== '' ? ', ' . $city : ''),
            'street' => $street ?: null, 'number' => isset($a['house_number']) ? (string)$a['house_number'] : null, 'localityName' => $city ?: null,
            'approximate' => empty($a['house_number']),
            'postcode' => norm((string)($a['postcode'] ?? '')), 'voivodeship' => norm((string)($a['state'] ?? '')), 'county' => normalize_county($a['county'] ?? null),
            'accuracy' => null, 'lon' => round((float)$row['lon'], 7), 'lat' => round((float)$row['lat'], 7), 'source' => 'OpenStreetMap',
        ];
    }
    return $items;
}

function search_addresses(string $query): never {
    require_once __DIR__ . '/_vps_geo.php';
    $rows = uug_rows($query);
    // „Gusowskiego 20 Starogard Gdański” → „Starogard Gdański, Gusowskiego 20” (UUG oczekuje miejscowości na początku).
    if ($rows === [] && !str_contains($query, ',') && preg_match('/^(.+?\s\d+[\p{L}\d\/]*)\s+(\p{L}[\p{L}\s\.-]+)$/u', $query, $m)) {
        $rows = uug_rows(trim($m[2]) . ', ' . trim($m[1]));
    }
    if ($rows === null) $rows = [];
    $items = [];
    foreach ($rows as $row) {
        if (!is_array($row) || !is_numeric($row['x'] ?? null) || !is_numeric($row['y'] ?? null)) continue;
        $x = (float)$row['x']; $y = (float)$row['y'];
        [$lon, $lat] = geo_to4326($x, $y);
        $street = trim((string)($row['street'] ?? ''));
        $number = trim((string)($row['number'] ?? ''));
        $city = trim((string)($row['city'] ?? ''));
        $unit = trim((string)($row['jednostka'] ?? ''), '{}');
        $parts = array_map(static fn($v) => trim($v, '" '), explode(',', $unit));
        $items[] = [
            'id' => 'uug:' . ($row['teryt'] ?? '') . ':' . ($row['simc'] ?? '') . ':' . ($row['ulic'] ?? '') . ':' . $number,
            'label' => trim(($street !== '' ? $street . ' ' : '') . $number) . ($city !== '' ? ', ' . $city : ''),
            'street' => $street !== '' ? $street : null,
            'number' => $number !== '' ? $number : null,
            'localityName' => $city !== '' ? $city : null,
            'postcode' => norm((string)($row['code'] ?? '')),
            'voivodeship' => $parts[1] ?? null,
            'county' => $parts[2] ?? null,
            'accuracy' => is_numeric($row['accuracy'] ?? null) ? (float)$row['accuracy'] : null,
            'lon' => round($lon, 7), 'lat' => round($lat, 7),
            'x2180' => $x, 'y2180' => $y,
        ];
    }
    usort($items, static fn($a, $b) => ($b['accuracy'] ?? 0) <=> ($a['accuracy'] ?? 0));
    if (!$items) {
        $items = nominatim_address_items($query);
        // Najpierw dokładne adresy, potem same ulice; po jednym wyniku na ulicę.
        usort($items, static fn($a, $b) => (int)!empty($a['approximate']) <=> (int)!empty($b['approximate']));
        $seen = [];
        $items = array_values(array_filter($items, static function ($item) use (&$seen) { $k = mb_strtolower($item['label']); if (isset($seen[$k])) return false; $seen[$k] = true; return true; }));
    }
    search_ok(['mode' => 'address', 'items' => array_slice($items, 0, 6)]);
}

$mode = strtolower(trim((string)($_GET['mode'] ?? '')));
if ($mode === '') search_fail('Brak trybu wyszukiwania.', 400);

if ($mode === 'locality') {
    search_localities(text_query('q', 2, 80));
}
if ($mode === 'street') {
    search_streets(
        text_query('q', 2, 80),
        text_query('locality', 1, 80),
        optional_text_query('commune', 80),
        optional_text_query('voivodeship', 80),
    );
}
if ($mode === 'parcel') {
    $lon = filter_var($_GET['lon'] ?? null, FILTER_VALIDATE_FLOAT);
    $lat = filter_var($_GET['lat'] ?? null, FILTER_VALIDATE_FLOAT);
    search_parcels(
        text_query('q', 1, 80),
        text_query('locality', 1, 80),
        false,
        ($lon !== false && $lat !== false && $lon >= 14 && $lon <= 24.5 && $lat >= 49 && $lat <= 55) ? [(float)$lon, (float)$lat] : null,
    );
}
if ($mode === 'address') {
    $q = text_query('q', 4, 120);
    if (!preg_match('/\d/u', $q) || !preg_match('/\p{L}{2,}/u', $q)) search_ok(['mode' => 'address', 'items' => []]);
    search_addresses($q);
}
if ($mode === 'parcel-id') {
    $id = strtoupper(text_query('q', 13, 80));
    if (!preg_match('/^\d{6}_[1-9]\.\d{4}\.(?:AR_\d+\.)?\d+(?:\/\d+)?$/D', $id)) {
        search_fail('Podaj pełny identyfikator działki, np. 141201_1.0001.6509.', 400);
    }
    search_parcels($id, '', true);
}

search_fail('Nieobsługiwany tryb wyszukiwania.', 400);
