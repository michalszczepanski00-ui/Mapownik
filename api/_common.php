<?php
declare(strict_types=1);

const MAPOWNIK_USER_AGENT = 'MSPortal/19.43.0 (+server-cache)';
const MAPOWNIK_TIMEOUT = 20;
const MAPOWNIK_TILE_CACHE_MAX_AGE = 7776000; // 90 dni
const MAPOWNIK_TILE_CACHE_MAX_BYTES = 3221225472; // 3 GiB
const MAPOWNIK_TILE_CACHE_MAINTENANCE_INTERVAL = 86400; // raz na dobę

function cache_root(): string {
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'cache';
}

function ensure_dir(string $dir): bool {
    return is_dir($dir) || @mkdir($dir, 0775, true);
}

function is_fresh(string $file, int $ttl): bool {
    return is_file($file) && (time() - (int)@filemtime($file)) <= $ttl;
}

function atomic_write(string $file, string $data): bool {
    $dir = dirname($file);
    if (!ensure_dir($dir)) return false;
    $tmp = $file . '.tmp.' . bin2hex(random_bytes(4));
    if (@file_put_contents($tmp, $data, LOCK_EX) === false) return false;
    @chmod($tmp, 0664);
    return @rename($tmp, $file);
}

/**
 * 19.41.4-b (audyt B7): wspólne utwardzenie cURL. Przekierowania tylko HTTP/HTTPS, najwyżej 5
 * (integracje GUGiK przekierowują do serwerów gmin i powiatów, część z nich tylko po HTTP).
 * Odpowiedź PO PRZEKIEROWANIU na adres prywatny/zastrzeżony (np. usługa zewnętrzna odsyła na 127.0.0.1
 * albo 10.x) jest odrzucana — serwer nie może czytać sieci wewnętrznej hostingu. Bez przekierowania
 * adres pochodzi z allowlisty w kodzie. Gdy hosting wychodzi do internetu przez serwer proxy, adres
 * połączenia to adres proxy (zwykle prywatny), więc kontrola jest wtedy pomijana.
 */
function mapownik_curl_hardening(): array {
    $options = [CURLOPT_MAXREDIRS => 5];
    if (defined('CURLPROTO_HTTP') && defined('CURLPROTO_HTTPS')) {
        $options[CURLOPT_PROTOCOLS] = CURLPROTO_HTTP | CURLPROTO_HTTPS;
        $options[CURLOPT_REDIR_PROTOCOLS] = CURLPROTO_HTTP | CURLPROTO_HTTPS;
    }
    return $options;
}

function mapownik_outbound_proxy(): bool {
    foreach (['https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY', 'all_proxy', 'ALL_PROXY'] as $name) {
        $value = getenv($name);
        if (is_string($value) && trim($value) !== '') return true;
    }
    return false;
}

function mapownik_ip_is_public(string $ip): bool {
    if ($ip === '') return true; // brak połączenia (błąd/timeout) — nic nie zostało odczytane
    return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
}

/** Wykonuje przygotowany uchwyt cURL i zwraca [status, body, type, error] z kontrolą adresu docelowego. */
function mapownik_curl_exec($ch): array {
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $type = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $error = curl_error($ch);
    $ip = (string)curl_getinfo($ch, CURLINFO_PRIMARY_IP);
    $redirects = (int)curl_getinfo($ch, CURLINFO_REDIRECT_COUNT);
    curl_close($ch);
    if ($redirects > 0 && !mapownik_outbound_proxy() && !mapownik_ip_is_public($ip)) {
        return [0, '', '', 'Odrzucono przekierowanie na adres wewnętrzny.'];
    }
    return [$status, is_string($body) ? $body : '', $type, $error];
}

function remote_get(string $url): array {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => MAPOWNIK_TIMEOUT,
            CURLOPT_USERAGENT => MAPOWNIK_USER_AGENT,
            CURLOPT_HTTPHEADER => ['Accept: image/avif,image/webp,image/apng,image/*,*/*;q=0.8'],
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ];
        $caBundle = mapownik_ca_bundle();
        if ($caBundle !== null) $options[CURLOPT_CAINFO] = $caBundle;
        curl_setopt_array($ch, $options + mapownik_curl_hardening());
        return mapownik_curl_exec($ch);
    }

    if (filter_var((string)ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN)) {
        $context = stream_context_create([
            'http' => [
                'timeout' => MAPOWNIK_TIMEOUT,
                'user_agent' => MAPOWNIK_USER_AGENT,
                'follow_location' => 1,
                'max_redirects' => 5,
                'ignore_errors' => true,
            ],
            'ssl' => array_filter(['verify_peer' => true, 'verify_peer_name' => true, 'allow_self_signed' => false, 'cafile' => mapownik_ca_bundle()]),
        ]);
        $body = @file_get_contents($url, false, $context);
        $status = 0;
        $type = '';
        foreach (($http_response_header ?? []) as $header) {
            if (preg_match('~^HTTP/\S+\s+(\d+)~i', $header, $m)) $status = (int)$m[1];
            if (stripos($header, 'Content-Type:') === 0) $type = trim(substr($header, 13));
        }
        return [$status, is_string($body) ? $body : '', $type, $body === false ? 'file_get_contents failed' : ''];
    }

    return [0, '', '', 'Brak cURL i allow_url_fopen'];
}


function mapownik_ca_bundle(): ?string {
    $bundled = __DIR__ . '/certs/cacert.pem';
    if (is_file($bundled) && is_readable($bundled) && (int)@filesize($bundled) > 100000) return $bundled;
    foreach ([(string)ini_get('curl.cainfo'), (string)ini_get('openssl.cafile')] as $candidate) {
        $candidate = trim($candidate);
        if ($candidate !== '' && is_file($candidate) && is_readable($candidate)) return $candidate;
    }
    return null;
}

function vendor_remote_get(string $url, string $accept = '*/*', int $timeout = 30, int $connectTimeout = 8): array {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => $connectTimeout,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_USERAGENT => 'Mozilla/5.0 MSPortalVendor/19.43.0',
            CURLOPT_HTTPHEADER => ['Accept: ' . $accept],
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_ENCODING => '',
        ];
        $caBundle = mapownik_ca_bundle();
        if ($caBundle !== null) $options[CURLOPT_CAINFO] = $caBundle;
        curl_setopt_array($ch, $options + mapownik_curl_hardening());
        return mapownik_curl_exec($ch);
    }
    if (filter_var((string)ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN)) {
        $context = stream_context_create([
            'http' => [
                'timeout' => $timeout,
                'user_agent' => 'Mozilla/5.0 MSPortalVendor/19.43.0',
                'header' => "Accept: {$accept}\r\n",
                'follow_location' => 1,
                'max_redirects' => 5,
                'ignore_errors' => true,
            ],
            'ssl' => array_filter(['verify_peer' => true, 'verify_peer_name' => true, 'allow_self_signed' => false, 'cafile' => mapownik_ca_bundle()]),
        ]);
        $body = @file_get_contents($url, false, $context);
        $status = 0;
        $type = '';
        foreach (($http_response_header ?? []) as $header) {
            if (preg_match('~^HTTP/\S+\s+(\d+)~i', $header, $m)) $status = (int)$m[1];
            if (stripos($header, 'Content-Type:') === 0) $type = trim(substr($header, 13));
        }
        return [$status, is_string($body) ? $body : '', $type, $body === false ? 'file_get_contents failed' : ''];
    }
    return [0, '', '', 'Brak cURL i allow_url_fopen'];
}


/**
 * Fetch official public GIS endpoints with strict TLS verification.
 * MSPortal never downgrades CURLOPT_SSL_VERIFYPEER. If the hosting CA store is
 * incomplete, the request fails explicitly so the server CA bundle can be fixed.
 */
function gis_circuit_file(string $url): string {
    $base = (string)preg_replace('/\?.*$/', '', $url);
    return cache_root() . '/health/' . hash('sha256', strtolower($base)) . '.json';
}

function gis_circuit_read(string $url): array {
    $file = gis_circuit_file($url);
    if (!is_file($file)) return ['failures' => [], 'open_until' => 0, 'probe_until' => 0];
    $data = json_decode((string)@file_get_contents($file), true);
    if (!is_array($data)) return ['failures' => [], 'open_until' => 0, 'probe_until' => 0];
    $now = time();
    $failures = array_values(array_filter((array)($data['failures'] ?? []), fn($ts): bool => is_int($ts) && ($now - $ts) <= 30));
    return [
        'failures' => $failures,
        'open_until' => (int)($data['open_until'] ?? 0),
        'probe_until' => (int)($data['probe_until'] ?? 0),
    ];
}

function gis_circuit_write(string $url, array $state): void {
    $file = gis_circuit_file($url);
    atomic_write($file, json_encode($state, JSON_UNESCAPED_SLASHES) ?: '{"failures":[],"open_until":0,"probe_until":0}');
}

function gis_circuit_with_lock(string $url, callable $callback): array {
    $lockFile = gis_circuit_file($url) . '.lock';
    ensure_dir(dirname($lockFile));
    $handle = @fopen($lockFile, 'c+');
    if ($handle === false) return $callback(gis_circuit_read($url), false);
    try {
        @flock($handle, LOCK_EX);
        $state = gis_circuit_read($url);
        $result = $callback($state, true);
        return is_array($result) ? $result : $state;
    } finally {
        @flock($handle, LOCK_UN);
        @fclose($handle);
    }
}

function gis_circuit_before(string $url): array {
    return gis_circuit_with_lock($url, function(array $state, bool $locked) use ($url): array {
        $now = time();
        if ((int)$state['open_until'] > $now) {
            return ['allowed' => false, 'state' => 'open', 'open_until' => (int)$state['open_until'], 'failures' => count($state['failures'])];
        }
        if ((int)$state['open_until'] > 0) {
            if ((int)$state['probe_until'] > $now) {
                return ['allowed' => false, 'state' => 'half-open', 'open_until' => 0, 'failures' => count($state['failures'])];
            }
            // Lease one half-open probe. Other PHP workers are rejected until it
            // succeeds/fails or the short lease expires.
            $state['probe_until'] = $now + 20;
            if ($locked) gis_circuit_write($url, $state);
            return ['allowed' => true, 'state' => 'half-open', 'open_until' => 0, 'failures' => count($state['failures'])];
        }
        return ['allowed' => true, 'state' => 'closed', 'open_until' => 0, 'failures' => count($state['failures'])];
    });
}

function gis_circuit_record(string $url, bool $success): array {
    return gis_circuit_with_lock($url, function(array $state, bool $locked) use ($url, $success): array {
        $now = time();
        $wasHalfOpen = (int)$state['probe_until'] > 0 || ((int)$state['open_until'] > 0 && (int)$state['open_until'] <= $now);
        if ($success) {
            $state = ['failures' => [], 'open_until' => 0, 'probe_until' => 0];
        } else {
            $state['probe_until'] = 0;
            $state['failures'][] = $now;
            $state['failures'] = array_slice($state['failures'], -20);
            if ($wasHalfOpen || count($state['failures']) >= 10) $state['open_until'] = $now + 60;
        }
        if ($locked) gis_circuit_write($url, $state);
        return $state;
    });
}

function official_gis_http11_get(string $url, string $accept, int $timeout = 6): array {
    if (!function_exists('curl_init')) return vendor_remote_get($url, $accept, $timeout, min(4, max(2, $timeout)));
    $ch = curl_init($url);
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => min(4, max(2, $timeout)),
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_USERAGENT => 'Mozilla/5.0 MSPortal/19.43.0',
        CURLOPT_HTTPHEADER => ['Accept: ' . $accept, 'Connection: close'],
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_ENCODING => '',
        CURLOPT_FORBID_REUSE => true,
        CURLOPT_FRESH_CONNECT => true,
    ];
    if (defined('CURL_HTTP_VERSION_1_1')) $options[CURLOPT_HTTP_VERSION] = CURL_HTTP_VERSION_1_1;
    $caBundle = mapownik_ca_bundle();
    if ($caBundle !== null) $options[CURLOPT_CAINFO] = $caBundle;
    curl_setopt_array($ch, $options + mapownik_curl_hardening());
    return mapownik_curl_exec($ch);
}

/**
 * Public GIS transport with bounded retries and a per-endpoint circuit breaker.
 * A broken endpoint cannot hold dozens of PHP workers for tens of seconds each.
 */
function official_gis_remote_get(string $url, string $accept = '*/*', int $timeout = 5, ?string $circuitKey = null): array {
    // 17.8.3: the circuit breaker can be keyed per logical source (e.g.
    // "wms:kiut_gas") instead of per upstream host path. Previously all seven
    // KIUT layers shared one breaker, so one bad layer blanked all of them.
    $circuit = ($circuitKey !== null && $circuitKey !== '') ? 'circuit:' . $circuitKey : $url;
    $gate = gis_circuit_before($circuit);
    if (!$gate['allowed']) {
        if (($gate['state'] ?? '') === 'half-open') {
            return [503, '', '', 'circuit half-open probe in progress'];
        }
        return [503, '', '', 'circuit open until ' . gmdate('c', (int)$gate['open_until'])];
    }

    $last = [0, '', '', 'request failed'];
    $delaysUs = [0, 350000];

    foreach ($delaysUs as $attempt => $delayUs) {
        if ($delayUs > 0) usleep($delayUs);
        $useHttp11 = $attempt > 0;
        if ($useHttp11) $last = official_gis_http11_get($url, $accept, $timeout);
        else $last = vendor_remote_get($url, $accept, $timeout, min(5, max(2, $timeout)));
        [$status, $body, $type, $error] = $last;
        if ($status >= 200 && $status < 300 && $body !== '') {
            gis_circuit_record($circuit, true);
            return $last;
        }

        // TLS errors are never retried with reduced certificate verification.

        // Do not retry deterministic client/configuration errors.
        if ($status >= 400 && $status < 500 && $status !== 408 && $status !== 429) break;
        // 17.8.3: a full timeout is not retried inside the same PHP worker. The
        // browser already retries, and a second 15 s wait would keep a scarce
        // shared-hosting worker busy for 30 s.
        if (gis_is_timeout_error((string)$error)) break;
    }
    gis_circuit_record($circuit, false);
    return $last;
}

function gis_is_timeout_error(string $error): bool {
    $error = strtolower($error);
    return $error !== '' && (str_contains($error, 'timed out') || str_contains($error, 'timeout'));
}


function normalize_wms_label(string $value): string {
    $value = trim($value);
    if (function_exists('iconv')) {
        $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
        if (is_string($ascii) && $ascii !== '') $value = $ascii;
    }
    $value = strtolower($value);
    return preg_replace('/[^a-z0-9]+/', '', $value) ?? '';
}

function parse_wms_capabilities_layers(string $xml): array {
    if ($xml === '') return [];
    if (class_exists('DOMDocument')) {
        $previous = libxml_use_internal_errors(true);
        try {
            $doc = new DOMDocument();
            if (@$doc->loadXML($xml, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING)) {
                $xpath = new DOMXPath($doc);
                $result = [];
                $nodes = $xpath->query('//*[local-name()="Layer"]');
                if ($nodes !== false) {
                    foreach ($nodes as $layerNode) {
                        $nameList = $xpath->query('./*[local-name()="Name"][1]', $layerNode);
                        $titleList = $xpath->query('./*[local-name()="Title"][1]', $layerNode);
                        $nameNode = $nameList !== false ? $nameList->item(0) : null;
                        if (!$nameNode) continue;
                        $titleNode = $titleList !== false ? $titleList->item(0) : null;
                        $name = trim((string)$nameNode->textContent);
                        $title = trim((string)($titleNode?->textContent ?? ''));
                        if ($name === '') continue;
                        $result[] = ['name' => html_entity_decode($name, ENT_QUOTES | ENT_XML1, 'UTF-8'), 'title' => html_entity_decode($title, ENT_QUOTES | ENT_XML1, 'UTF-8')];
                    }
                }
                if ($result) return $result;
            }
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }

    // Pure-PHP streaming fallback for shared hosting without DOM/SimpleXML.
    // WMS capabilities are hierarchical: Layer elements may contain child Layer
    // elements and Name/Title are not guaranteed to be adjacent. A token stack
    // preserves the direct Name/Title pair for every nested layer and also
    // accepts arbitrary namespace prefixes (wms:Layer, ns1:Name, ...).
    if (!preg_match_all('~<!\\[CDATA\\[.*?\\]\\]>|<!--.*?-->|<[^>]+>|[^<]+~s', $xml, $tokenMatches)) return [];
    $frames = [];
    $result = [];
    $captureField = null;
    $captureDepth = -1;
    $captureText = '';

    $finishCapture = static function () use (&$frames, &$captureField, &$captureDepth, &$captureText): void {
        if ($captureField === null || $captureDepth < 0 || !isset($frames[$captureDepth])) {
            $captureField = null; $captureDepth = -1; $captureText = ''; return;
        }
        $value = trim($captureText);
        if (str_starts_with($value, '<![CDATA[') && str_ends_with($value, ']]>')) {
            $value = substr($value, 9, -3);
        }
        $value = html_entity_decode(trim(strip_tags($value)), ENT_QUOTES | ENT_XML1, 'UTF-8');
        if ($value !== '' && ($frames[$captureDepth][$captureField] ?? '') === '') {
            $frames[$captureDepth][$captureField] = $value;
        }
        $captureField = null; $captureDepth = -1; $captureText = '';
    };

    foreach ($tokenMatches[0] as $token) {
        if ($token === '') continue;
        if ($token[0] !== '<') {
            if ($captureField !== null) $captureText .= $token;
            continue;
        }
        if (str_starts_with($token, '<!--')) continue;
        if (str_starts_with($token, '<![CDATA[')) {
            if ($captureField !== null) $captureText .= $token;
            continue;
        }
        if (str_starts_with($token, '<?') || str_starts_with($token, '<!DOCTYPE')) continue;

        $isEnd = preg_match('~^<\\s*/~', $token) === 1;
        if (!preg_match('~^<\\s*/?\\s*(?:[A-Za-z_][A-Za-z0-9_.-]*:)?([A-Za-z_][A-Za-z0-9_.-]*)\\b~', $token, $tagMatch)) continue;
        $local = strtolower((string)$tagMatch[1]);
        $selfClosing = preg_match('~/\\s*>$~', $token) === 1;

        if ($isEnd) {
            if (($local === 'name' || $local === 'title') && $captureField === $local) {
                $finishCapture();
                continue;
            }
            if ($local === 'layer') {
                if ($captureField !== null && $captureDepth === count($frames) - 1) $finishCapture();
                $frame = array_pop($frames);
                if (is_array($frame)) {
                    $name = trim((string)($frame['name'] ?? ''));
                    $title = trim((string)($frame['title'] ?? ''));
                    if ($name !== '') $result[] = ['name' => $name, 'title' => $title];
                }
            }
            continue;
        }

        if ($local === 'layer') {
            $frames[] = ['name' => '', 'title' => ''];
            if ($selfClosing) {
                $frame = array_pop($frames);
                if (is_array($frame) && ($frame['name'] ?? '') !== '') $result[] = $frame;
            }
            continue;
        }
        if (($local === 'name' || $local === 'title') && $frames) {
            $depth = count($frames) - 1;
            if (($frames[$depth][$local] ?? '') === '') {
                $captureField = $local;
                $captureDepth = $depth;
                $captureText = '';
                if ($selfClosing) $finishCapture();
            }
        }
    }
    if ($captureField !== null) $finishCapture();
    while ($frames) {
        $frame = array_pop($frames);
        if (is_array($frame) && trim((string)($frame['name'] ?? '')) !== '') $result[] = $frame;
    }

    $seen = [];
    $unique = [];
    foreach ($result as $layer) {
        $name = trim((string)($layer['name'] ?? ''));
        $title = trim((string)($layer['title'] ?? ''));
        if ($name === '') continue;
        $key = $name . "\\0" . $title;
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $unique[] = ['name' => $name, 'title' => $title];
    }
    return $unique;
}

/**
 * Resolve technical WMS layer names from GetCapabilities using stable,
 * human-readable titles. This is used for public services whose technical
 * Name values can change while the published layer titles stay stable.
 */
function resolve_wms_layers_from_capabilities(array $source): ?string {
    $targets = $source['capabilities_titles'] ?? null;
    $ordinals = $source['capabilities_ordinals'] ?? null;
    $baseUrl = (string)($source['capabilities_url'] ?? $source['url'] ?? '');
    if (!is_array($targets) || !$targets || $baseUrl === '') return null;

    $ttl = max(300, (int)($source['capabilities_ttl'] ?? 86400));
    $resolutionSeed = json_encode(['url' => $baseUrl, 'targets' => $targets, 'ordinals' => $ordinals, 'resolver' => 4], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: $baseUrl;
    $resolutionKey = hash('sha256', $resolutionSeed);
    $resolvedCache = cache_root() . '/capabilities/resolved/' . substr($resolutionKey, 0, 2) . '/' . $resolutionKey . '.json';
    if (is_fresh($resolvedCache, $ttl)) {
        $cached = json_decode((string)@file_get_contents($resolvedCache), true);
        $layers = is_array($cached) ? (string)($cached['layers'] ?? '') : '';
        if ($layers !== '') return $layers;
    }

    $capUrl = $baseUrl . (str_contains($baseUrl, '?') ? '&' : '?') . http_build_query([
        'SERVICE' => 'WMS',
        'REQUEST' => 'GetCapabilities',
    ], '', '&', PHP_QUERY_RFC3986);
    $cacheKey = hash('sha256', $capUrl);
    $cache = cache_root() . '/capabilities/xml/' . substr($cacheKey, 0, 2) . '/' . $cacheKey . '.xml';
    $xml = '';
    if (is_fresh($cache, $ttl)) {
        $xml = (string)@file_get_contents($cache);
    }
    if ($xml === '') {
        [$status, $body] = official_gis_remote_get($capUrl, 'application/xml,text/xml,application/vnd.ogc.wms_xml,*/*;q=0.2', 12);
        if ($status >= 200 && $status < 300 && $body !== '') {
            $xml = $body;
            atomic_write($cache, $body);
        }
    }
    if ($xml === '') return null;

    $catalog = parse_wms_capabilities_layers($xml);
    if (!$catalog && is_file($cache)) {
        // A previous deployment may have cached an HTML/error response under the
        // capabilities key. Discard it once and retry against the live service.
        @unlink($cache);
        [$status, $body] = official_gis_remote_get($capUrl, 'application/xml,text/xml,application/vnd.ogc.wms_xml,*/*;q=0.2', 12);
        if ($status >= 200 && $status < 300 && $body !== '') {
            $catalog = parse_wms_capabilities_layers($body);
            if ($catalog) atomic_write($cache, $body);
        }
    }
    if (!$catalog) return null;
    $resolved = [];
    foreach ($targets as $target) {
        $aliases = is_array($target) ? $target : [$target];
        $aliasKeys = array_values(array_filter(array_map(fn($v) => normalize_wms_label((string)$v), $aliases)));
        if (!$aliasKeys) return null;
        $match = null;
        foreach ($catalog as $layer) {
            $titleKey = normalize_wms_label((string)($layer['title'] ?? ''));
            $nameKey = normalize_wms_label((string)($layer['name'] ?? ''));
            if (in_array($titleKey, $aliasKeys, true) || in_array($nameKey, $aliasKeys, true)) {
                $match = (string)$layer['name'];
                break;
            }
        }
        if ($match === null) {
            // Some services prepend a group label to the title. Use a conservative
            // suffix match only when it produces a single unambiguous layer.
            $candidates = [];
            foreach ($catalog as $layer) {
                $titleKey = normalize_wms_label((string)($layer['title'] ?? ''));
                foreach ($aliasKeys as $aliasKey) {
                    if ($aliasKey !== '' && str_ends_with($titleKey, $aliasKey)) {
                        $candidates[(string)$layer['name']] = true;
                    }
                }
            }
            if (count($candidates) === 1) $match = (string)array_key_first($candidates);
        }
        if ($match === null) {
            // Last fallback for services that decorate both ends of a layer title.
            // Require one unique match to avoid silently selecting the wrong layer.
            $candidates = [];
            foreach ($catalog as $layer) {
                $titleKey = normalize_wms_label((string)($layer['title'] ?? ''));
                foreach ($aliasKeys as $aliasKey) {
                    if ($aliasKey !== '' && strlen($aliasKey) >= 8 && str_contains($titleKey, $aliasKey)) {
                        $candidates[(string)$layer['name']] = true;
                    }
                }
            }
            if (count($candidates) === 1) $match = (string)array_key_first($candidates);
        }
        if (($match === null || $match === '') && is_array($ordinals)) {
            $targetIndex = count($resolved);
            $ordinal = $ordinals[$targetIndex] ?? null;
            if (is_int($ordinal) || (is_string($ordinal) && ctype_digit($ordinal))) {
                $ordinal = (int)$ordinal;
                $leafCatalog = array_values(array_filter($catalog, static fn($layer) => (string)($layer['name'] ?? '') !== ''));
                if (isset($leafCatalog[$ordinal]['name'])) $match = (string)$leafCatalog[$ordinal]['name'];
            }
        }
        if ($match === null || $match === '') return null;
        $resolved[] = $match;
    }
    $layers = implode(',', array_values(array_unique($resolved)));
    if ($layers !== '') {
        atomic_write($resolvedCache, json_encode(['layers' => $layers, 'resolved_at' => time()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{"layers":""}');
    }
    return $layers !== '' ? $layers : null;
}

function validate_raster_bytes(string $body, string $contentType, int $minDimension = 16): array {
    if (strlen($body) < 64 || !str_contains(strtolower($contentType), 'image/')) {
        return [false, 0, 0, 'nieprawidłowy typ lub zbyt mała odpowiedź'];
    }
    if (function_exists('getimagesizefromstring')) {
        $info = @getimagesizefromstring($body);
        if (!is_array($info) || !isset($info[0], $info[1])) return [false, 0, 0, 'obrazu nie można zdekodować'];
        $width = (int)$info[0];
        $height = (int)$info[1];
        if ($width < $minDimension || $height < $minDimension) return [false, $width, $height, 'podejrzanie mały obraz'];
        return [true, $width, $height, ''];
    }
    $isPng = str_starts_with($body, "\x89PNG\r\n\x1a\n");
    $isJpeg = str_starts_with($body, "\xFF\xD8\xFF");
    return [$isPng || $isJpeg, 0, 0, ($isPng || $isJpeg) ? '' : 'brak sygnatury PNG/JPEG'];
}

// 17.6.4: $dimensions is an optional by-reference out-param so a caller that
// needs the decoded [width, height] right after validating (serve_file()'s
// X-MSPortal-Raster-Size header, below) doesn't have to call getimagesize()
// on the same file a second time — that was a full extra file open + header
// decode on every single cache-hit response.
function cached_raster_valid(string $file, int $minDimension = 16, ?array &$dimensions = null): bool {
    $dimensions = null;
    if (!is_file($file) || (int)@filesize($file) < 64) return false;
    if (function_exists('getimagesize')) {
        $info = @getimagesize($file);
        if (!is_array($info) || !isset($info[0], $info[1])) return false;
        $width = (int)$info[0];
        $height = (int)$info[1];
        if ($width < $minDimension || $height < $minDimension) return false;
        $dimensions = [$width, $height];
        return true;
    }
    return true;
}

function serve_file(string $file, string $contentType, int $maxAge = 86400, string $cacheStatus = 'HIT', ?array $knownDimensions = null): never {
    header('Content-Type: ' . $contentType);
    header('Cache-Control: public, max-age=' . $maxAge . ', stale-if-error=604800');
    header('X-MSPortal-Cache: ' . $cacheStatus);
    if (is_file($file)) header('X-MSPortal-Cache-Age: ' . max(0, time() - (int)@filemtime($file)));
    if (str_contains(strtolower($contentType), 'image/')) {
        // Reuse dimensions the caller already decoded (typically via
        // cached_raster_valid()) instead of reading/decoding the file again.
        $dims = $knownDimensions;
        if ($dims === null && function_exists('getimagesize')) {
            $info = @getimagesize($file);
            if (is_array($info) && isset($info[0], $info[1])) $dims = [(int)$info[0], (int)$info[1]];
        }
        if ($dims !== null) header('X-MSPortal-Raster-Size: ' . (int)$dims[0] . 'x' . (int)$dims[1]);
    }
    readfile($file);
    exit;
}

function serve_bytes(string $bytes, string $contentType, string $cacheStatus = 'MISS', int $maxAge = 86400): never {
    header('Content-Type: ' . $contentType);
    header('Cache-Control: public, max-age=' . $maxAge . ', stale-if-error=604800');
    header('X-MSPortal-Cache: ' . $cacheStatus);
    echo $bytes;
    exit;
}

function fallback_png(): string {
    return base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=') ?: '';
}

function fail_tile(string $message, int $upstreamStatus = 502): never {
    // Placeholder jest prawidłowym kafelkiem. Status upstream zachowujemy wyłącznie diagnostycznie.
    http_response_code(200);
    header('X-MSPortal-Upstream-Status: ' . $upstreamStatus);
    header('X-MSPortal-Upstream-Error: ' . preg_replace('/[^A-Za-z0-9 ._:-]/', '', $message));
    serve_bytes(fallback_png(), 'image/png', 'FALLBACK', 300);
}

function reject_tile_request(string $message, int $status = 400): never {
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    exit($message);
}

/**
 * Streams cache file records instead of materializing them all at once. At the
 * 3 GiB cache budget a full tile cache is on the order of 150 000 files —
 * building one PHP array of that size cost well over 100 MB of heap on
 * typical shared hosting, which could exhaust memory_limit mid-request.
 */
function map_cache_files_iterator(array $dirs): iterable {
    foreach ($dirs as $dir) {
        if (!is_dir($dir)) continue;
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        foreach ($iterator as $info) {
            if (!$info->isFile()) continue;
            $name = $info->getFilename();
            if ($name === '.gitkeep' || $name === '.htaccess' || str_starts_with($name, '.maintenance')) continue;
            yield [
                'path' => $info->getPathname(),
                'mtime' => $info->getMTime(),
                'size' => $info->getSize(),
            ];
        }
    }
}

/**
 * Bounded max-heap (by mtime) that tracks the N globally oldest files seen
 * while streaming the cache directories, without holding every remaining
 * file record in memory. The heap's top is always the *newest* file among
 * the tracked candidates, so a freshly-seen file only needs to be compared
 * against that one entry to decide whether it belongs in the "oldest N".
 */
final class MSPortalOldestFilesHeap extends SplMaxHeap {
    protected function compare($value1, $value2): int {
        return $value1['mtime'] <=> $value2['mtime'];
    }
}

// Upper bound on how many "eviction candidate" file records are held in memory
// at once. Bounds peak memory to a low-double-digit MB figure regardless of
// how many files the cache actually contains.
const MAPOWNIK_TILE_CACHE_EVICTION_CANDIDATES = 20000;

function maintain_map_cache(): array {
    $root = cache_root();
    // 18.18.0: także pamięć wysokości NMT (jeden plik na punkt — wcześniej rosła
    // bez końca i na OVH wyczerpywała limit liczby plików).
    // 19.41.4-b (audyt B2): także kafle i odpowiedzi „Czyj las” (BDL) — wcześniej nikt ich nie usuwał.
    $dirs = [$root . '/ortho', $root . '/topography', $root . '/wms', $root . '/orthophoto', $root . '/terrain-v2', $root . '/forest'];
    $now = time();
    $removed = 0;
    $removedBytes = 0;
    // 18.18.0: katalogi krótkotrwałe — fragmenty eksportu do „Ponów”, liczniki
    // limitu eksportów, zapamiętane warianty identyfikacji.
    // 19.41.4-b (audyt B2): ceny RCN (ważne 3 dni, starsze służą tylko jako zapas przy awarii GUGiK)
    // i limity udostępniania — wcześniej przybywało ich bez końca.
    foreach ([$root . '/export-chunks' => 86400, $root . '/export-rate' => 86400, $root . '/identify-winner' => 30 * 86400,
              $root . '/rcn' => 30 * 86400, $root . '/shared-rate' => 2 * 86400, $root . '/nominatim' => 7 * 86400, $root . '/client-errors' => 30 * 86400] as $dir => $maxAge) {
        foreach (map_cache_files_iterator([$dir]) as $file) {
            if (($now - $file['mtime']) > $maxAge && @unlink($file['path'])) { $removed++; $removedBytes += $file['size']; }
        }
    }
    // Pliki limitów per adres IP leżą obok blokad, których usuwać nie wolno — tylko wzorzec rate-*.
    foreach ([$root . '/source-monitor/rate-*.json', $root . '/vps/rate-*.json', $root . '/dem/rate/*.json'] as $pattern) {
        foreach (glob($pattern) ?: [] as $path) {
            $mtime = (int)@filemtime($path);
            if ($mtime > 0 && ($now - $mtime) > 86400) {
                $size = (int)@filesize($path);
                if (@unlink($path)) { $removed++; $removedBytes += $size; }
            }
        }
    }
    $remainingTotal = 0;
    $oldest = new MSPortalOldestFilesHeap();
    $cap = MAPOWNIK_TILE_CACHE_EVICTION_CANDIDATES;

    foreach (map_cache_files_iterator($dirs) as $file) {
        if (($now - $file['mtime']) > MAPOWNIK_TILE_CACHE_MAX_AGE) {
            if (@unlink($file['path'])) {
                $removed++;
                $removedBytes += $file['size'];
            }
            continue;
        }
        $remainingTotal += $file['size'];
        if ($oldest->count() < $cap) {
            $oldest->insert($file);
        } elseif ($file['mtime'] < $oldest->top()['mtime']) {
            $oldest->extract();
            $oldest->insert($file);
        }
    }

    if ($remainingTotal > MAPOWNIK_TILE_CACHE_MAX_BYTES) {
        // The heap holds at most MAPOWNIK_TILE_CACHE_EVICTION_CANDIDATES
        // records, so sorting it is cheap regardless of total cache size.
        // If the cache needs to shed more files than the candidate cap in a
        // single run, the remainder is picked up on the next scheduled pass
        // instead of growing memory usage further.
        $candidates = [];
        foreach ($oldest as $file) $candidates[] = $file;
        usort($candidates, fn(array $a, array $b): int => $a['mtime'] <=> $b['mtime']);
        $target = (int)(MAPOWNIK_TILE_CACHE_MAX_BYTES * 0.90);
        foreach ($candidates as $file) {
            if ($remainingTotal <= $target) break;
            if (@unlink($file['path'])) {
                $removed++;
                $removedBytes += $file['size'];
                $remainingTotal -= $file['size'];
            }
        }
    }

    return ['removed' => $removed, 'removed_bytes' => $removedBytes, 'remaining_bytes' => max(0, $remainingTotal)];
}

// A cron-driven run (tools/maintain_cache.php) is expected daily. A request
// served over HTTP only falls back to running maintenance itself when cron
// has clearly not run for a while, so normal traffic doesn't pay for it.
const MAPOWNIK_TILE_CACHE_HTTP_FALLBACK_INTERVAL = 7 * 86400; // raz na tydzień, awaryjnie

function maybe_maintain_map_cache(): void {
    $root = cache_root();
    if (!ensure_dir($root)) return;
    $marker = $root . '/.maintenance-18.18.0';
    $interval = PHP_SAPI === 'cli' ? MAPOWNIK_TILE_CACHE_MAINTENANCE_INTERVAL : MAPOWNIK_TILE_CACHE_HTTP_FALLBACK_INTERVAL;
    if (is_fresh($marker, $interval)) return;

    $lockPath = $root . '/.maintenance-18.18.0.lock';
    $handle = @fopen($lockPath, 'c');
    if ($handle === false) return;
    if (!@flock($handle, LOCK_EX | LOCK_NB)) {
        fclose($handle);
        return;
    }
    clearstatcache(true, $marker);
    if (!is_fresh($marker, $interval)) {
        // Touch the marker BEFORE doing the work. If maintenance is interrupted
        // by a resource limit or a crash partway through, the next request must
        // not immediately retry the same expensive pass — at worst one
        // maintenance window is skipped, which is far cheaper than a retry loop.
        @touch($marker);
        maintain_map_cache();
    }
    @flock($handle, LOCK_UN);
    fclose($handle);
}

/**
 * 19.8.6: składa obrazy tej samej wielkości — piksele przezroczyste w pierwszym biorą wartość
 * z kolejnego. Zwraca null, gdy GD nie potrafi odczytać obrazów (wtedy serwujemy pierwszy).
 * Pętla po pikselach, bo GD nie ma maski alfa; dla kafla 512×512 to ok. 0,1 s.
 */
function wms_merge_fill(array $images, ?int &$merged = null): ?string {
    if (!function_exists('imagecreatefromstring') || !$images) return null;
    $base = @imagecreatefromstring((string)$images[0]);
    if ($base === false) return null;
    if (!imageistruecolor($base)) imagepalettetotruecolor($base);
    imagealphablending($base, false);
    imagesavealpha($base, true);
    $w = imagesx($base);
    $h = imagesy($base);
    if ($w * $h > 4_200_000) { imagedestroy($base); return null; }
    $merged = 1;
    foreach (array_slice($images, 1) as $bytes) {
        $layer = @imagecreatefromstring((string)$bytes);
        if ($layer === false) continue;
        if (!imageistruecolor($layer)) imagepalettetotruecolor($layer);
        if (imagesx($layer) === $w && imagesy($layer) === $h) {
            $merged++;
            for ($y = 0; $y < $h; $y++) {
                for ($x = 0; $x < $w; $x++) {
                    if (((imagecolorat($base, $x, $y) >> 24) & 0x7F) !== 127) continue;
                    $color = imagecolorat($layer, $x, $y);
                    if ((($color >> 24) & 0x7F) !== 127) imagesetpixel($base, $x, $y, $color);
                }
            }
        }
        imagedestroy($layer);
    }
    ob_start();
    imagepng($base);
    $out = (string)ob_get_clean();
    imagedestroy($base);
    return $out !== '' ? $out : null;
}
