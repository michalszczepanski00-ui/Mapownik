<?php
declare(strict_types=1);

/**
 * 19.41.0 — kafle NMT do widoku „Teren 3D”.
 *
 * Źródło: WCS GUGiK (NMT 1 m, pokrycie DTM_PL-KRON86-NH_TIFF, EPSG:2180). Usługa nie wysyła nagłówka CORS
 * i odpowiada wolno (kilkadziesiąt sekund), dlatego kafle o stałym podziale są pobierane przez serwer
 * raz i zapisywane w cache/dem/ (180 dni). Serwer nie renderuje 3D — tylko przekazuje i zapisuje dane.
 *
 * Kafel: 256 × 256 komórek o boku p ∈ {1, 2, 4, 8, 16} m; zasięg x ∈ [tx·256p, (tx+1)·256p), y ∈ [ty·256p, (ty+1)·256p).
 * Odpowiedź binarna (little-endian): 'MDM1' | u16 szer. | u16 wys. | f64 min | f64 krok | f64 x zachód | f64 y północ
 * (nagłówek 40 B), potem u16 na komórkę wierszami od północy; 65535 = brak danych; wysokość = min + wartość × krok.
 */

const DEM_LEVELS = [1, 2, 4, 8, 16];
const DEM_TILE = 256;
const DEM_WCS = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModelFormatTIFF';
const DEM_COVERAGE = 'DTM_PL-KRON86-NH_TIFF';
const DEM_DATUM = 'PL-KRON86-NH';
const DEM_TTL = 180 * 86400;
const DEM_CACHE_MAX_BYTES = 1073741824; // 1 GiB
const DEM_UPSTREAM_TIMEOUT = 140;
const DEM_SLOTS = 2;                    // równoczesne zapytania do GUGiK z całego serwera
const DEM_NEW_TILES_PER_HOUR = 60;      // nowe kafle (spoza cache) na adres IP
const DEM_NODATA = 65535;

final class DemError extends RuntimeException {
    public function __construct(public readonly int $status, string $message, public readonly array $headers = []) { parent::__construct($message); }
}

function dem_cache_dir(): string { return cache_root() . DIRECTORY_SEPARATOR . 'dem'; }

function dem_tile_path(int $p, int $tx, int $ty): string {
    return dem_cache_dir() . DIRECTORY_SEPARATOR . $p . DIRECTORY_SEPARATOR . $tx . DIRECTORY_SEPARATOR . $ty . '.bin';
}

/** Zasięg kafla w EPSG:2180: [xmin, ymin, xmax, ymax]. */
function dem_tile_extent(int $p, int $tx, int $ty): array {
    $size = DEM_TILE * $p;
    return [$tx * $size, $ty * $size, ($tx + 1) * $size, ($ty + 1) * $size];
}

function dem_validate(int $p, int $tx, int $ty): void {
    if (!in_array($p, DEM_LEVELS, true)) throw new DemError(400, 'Nieprawidłowy poziom (p = 1, 2, 4, 8 albo 16 m).');
    [$x0, $y0, $x1, $y1] = dem_tile_extent($p, $tx, $ty);
    // Polska w EPSG:2180 (z zapasem): x 140–900 km, y 120–800 km.
    if ($x1 < 140000 || $x0 > 900000 || $y1 < 120000 || $y0 > 800000) throw new DemError(400, 'Kafel poza zasięgiem NMT Polski.');
}

function dem_client_ip(): string {
    return (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

/** Limit nowych kafli na godzinę dla adresu IP (kafle z cache bez limitu). */
function dem_rate_limit(): void {
    $dir = dem_cache_dir() . DIRECTORY_SEPARATOR . 'rate';
    if (!ensure_dir($dir)) return;
    $file = $dir . DIRECTORY_SEPARATOR . substr(hash('sha256', dem_client_ip()), 0, 24) . '.json';
    $h = @fopen($file, 'c+');
    if ($h === false) return;
    try {
        @flock($h, LOCK_EX);
        $now = time();
        $list = json_decode((string)stream_get_contents($h), true);
        $list = array_values(array_filter(is_array($list) ? $list : [], static fn($t) => is_int($t) && $now - $t < 3600));
        if (count($list) >= DEM_NEW_TILES_PER_HOUR) throw new DemError(429, 'Limit nowych kafli NMT na godzinę wyczerpany — spróbuj później albo zmniejsz obszar.', ['Retry-After' => '600']);
        $list[] = $now;
        ftruncate($h, 0); rewind($h); fwrite($h, json_encode($list));
    } finally { @flock($h, LOCK_UN); fclose($h); }
}

/** Jedno z DEM_SLOTS miejsc na zapytanie do GUGiK (czeka na wolne miejsce). */
function dem_acquire_slot() {
    $dir = dem_cache_dir();
    if (!ensure_dir($dir)) return null;
    $deadline = microtime(true) + 60;
    while (true) {
        for ($i = 0; $i < DEM_SLOTS; $i++) {
            $h = @fopen($dir . DIRECTORY_SEPARATOR . "slot-{$i}.lock", 'c');
            if ($h === false) return null;
            if (@flock($h, LOCK_EX | LOCK_NB)) return $h;
            fclose($h);
        }
        if (microtime(true) > $deadline) throw new DemError(503, 'Serwer pobiera już inne kafle NMT — ponów za chwilę.', ['Retry-After' => '5']);
        usleep(250000);
    }
}

function dem_wcs_url(int $p, int $tx, int $ty): string {
    [$x0, $y0, $x1, $y1] = dem_tile_extent($p, $tx, $ty);
    $q = 'SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=' . DEM_COVERAGE . '&FORMAT=image/tiff'
        . "&SUBSET=x({$x0},{$x1})&SUBSET=y({$y0},{$y1})&SCALESIZE=x(" . DEM_TILE . '),y(' . DEM_TILE . ')';
    if ($p > 1) $q .= '&INTERPOLATION=AVERAGE';
    return DEM_WCS . '?' . $q;
}

/**
 * Minimalny odczyt TIFF z WCS GUGiK: float32, bez kompresji, paski albo kafle, jedna próbka na piksel.
 * Zwraca ['width', 'height', 'values' (float[]), 'tie' => [x, y], 'scale' => [sx, sy], 'nodata' => ?float].
 */
function dem_parse_tiff(string $bin): array {
    if (strlen($bin) < 16) throw new DemError(502, 'Pusta odpowiedź WCS.');
    $bo = substr($bin, 0, 2);
    if ($bo !== 'II' && $bo !== 'MM') throw new DemError(502, 'WCS nie zwrócił pliku TIFF.');
    $le = $bo === 'II';
    $u16 = static fn(int $o): int => unpack($le ? 'v' : 'n', substr($bin, $o, 2))[1];
    $u32 = static fn(int $o): int => unpack($le ? 'V' : 'N', substr($bin, $o, 4))[1];
    if ($u16(2) !== 42) throw new DemError(502, 'Nieobsługiwany TIFF (BigTIFF).');
    $ifd = $u32(4);
    $n = $u16($ifd);
    $tags = [];
    $typeSize = [1 => 1, 2 => 1, 3 => 2, 4 => 4, 5 => 8, 11 => 4, 12 => 8, 16 => 8];
    for ($i = 0; $i < $n; $i++) {
        $e = $ifd + 2 + $i * 12;
        $tag = $u16($e); $type = $u16($e + 2); $count = $u32($e + 4);
        $size = ($typeSize[$type] ?? 1) * $count;
        $off = $size <= 4 ? $e + 8 : $u32($e + 8);
        $vals = [];
        for ($k = 0; $k < min($count, 100000); $k++) {
            $o = $off + $k * ($typeSize[$type] ?? 1);
            $vals[] = match ($type) {
                3 => $u16($o),
                4 => $u32($o),
                12 => unpack($le ? 'e' : 'E', substr($bin, $o, 8))[1],
                2 => null,
                default => null,
            };
        }
        if ($type === 2) $vals = [rtrim(substr($bin, $off, $count), "\0")];
        $tags[$tag] = $vals;
    }
    $w = (int)($tags[256][0] ?? 0); $h = (int)($tags[257][0] ?? 0);
    if ($w < 1 || $h < 1) throw new DemError(502, 'TIFF bez wymiarów.');
    if ((int)($tags[258][0] ?? 0) !== 32 || (int)($tags[339][0] ?? 1) !== 3) throw new DemError(502, 'TIFF nie zawiera wysokości float32.');
    if ((int)($tags[259][0] ?? 1) !== 1) throw new DemError(502, 'TIFF skompresowany — nieobsługiwany.');
    $f32 = $le ? 'g' : 'G';
    $values = array_fill(0, $w * $h, NAN);
    if (isset($tags[324])) { // kafle TIFF
        $tw = (int)$tags[322][0]; $th = (int)$tags[323][0];
        $across = (int)ceil($w / $tw);
        foreach ($tags[324] as $idx => $offset) {
            $chunk = unpack("{$f32}*", substr($bin, (int)$offset, $tw * $th * 4));
            $c0 = ($idx % $across) * $tw; $r0 = intdiv($idx, $across) * $th;
            for ($r = 0; $r < $th && $r0 + $r < $h; $r++) for ($c = 0; $c < $tw && $c0 + $c < $w; $c++) $values[($r0 + $r) * $w + $c0 + $c] = $chunk[$r * $tw + $c + 1];
        }
    } else { // paski
        $data = '';
        foreach ($tags[273] ?? [] as $k => $offset) $data .= substr($bin, (int)$offset, (int)($tags[279][$k] ?? 0));
        if (strlen($data) < $w * $h * 4) throw new DemError(502, 'TIFF niekompletny.');
        $values = array_values(unpack("{$f32}*", substr($data, 0, $w * $h * 4)));
    }
    $nodata = isset($tags[42113][0]) && is_numeric(trim((string)$tags[42113][0])) ? (float)trim((string)$tags[42113][0]) : null;
    return ['width' => $w, 'height' => $h, 'values' => $values, 'tie' => [(float)($tags[33922][3] ?? NAN), (float)($tags[33922][4] ?? NAN)],
        'scale' => [(float)($tags[33550][0] ?? NAN), (float)($tags[33550][1] ?? NAN)], 'nodata' => $nodata];
}

/** Float32 → nagłówek + Uint16 (krok 1 cm, większy przy dużej rozpiętości). */
function dem_encode(array $tiff, float $x0, float $y1): string {
    $vals = $tiff['values'];
    $valid = [];
    foreach ($vals as $v) if (is_float($v) && is_finite($v) && $v > -1000 && $v < 3000 && ($tiff['nodata'] === null || abs($v - $tiff['nodata']) > 1e-3)) $valid[] = $v;
    $min = $valid ? min($valid) : 0.0; $max = $valid ? max($valid) : 0.0;
    $step = max(0.01, ($max - $min) / 65534);
    $out = 'MDM1' . pack('vv', $tiff['width'], $tiff['height']) . pack('eeee', $min, $step, $x0, $y1);
    $buf = [];
    foreach ($vals as $v) {
        $ok = is_float($v) && is_finite($v) && $v > -1000 && $v < 3000 && ($tiff['nodata'] === null || abs($v - $tiff['nodata']) > 1e-3);
        $buf[] = $ok ? min(65534, (int)round(($v - $min) / $step)) : DEM_NODATA;
    }
    foreach (array_chunk($buf, 4096) as $chunk) $out .= pack('v*', ...$chunk);
    return $out;
}

/** Pobiera kafel z WCS, sprawdza georeferencję i zwraca zakodowane bajty + czas zapytania. */
function dem_fetch_tile(int $p, int $tx, int $ty): array {
    [$x0, , , $y1] = dem_tile_extent($p, $tx, $ty);
    $started = microtime(true);
    [$status, $body, $type, $error] = vendor_remote_get(dem_wcs_url($p, $tx, $ty), 'image/tiff', DEM_UPSTREAM_TIMEOUT, 10);
    $ms = (int)round((microtime(true) - $started) * 1000);
    if ($status < 200 || $status >= 300 || !str_starts_with($body, 'II') && !str_starts_with($body, 'MM')) {
        $detail = $error ?: (str_contains((string)$type, 'xml') ? trim(preg_replace('~\s+~', ' ', strip_tags($body))) : "HTTP {$status}");
        throw new DemError(502, 'WCS GUGiK nie zwrócił kafla NMT: ' . mb_substr((string)$detail, 0, 200), ['X-Mapownik-DEM-Ms' => (string)$ms]);
    }
    $tiff = dem_parse_tiff($body);
    if ($tiff['width'] !== DEM_TILE || $tiff['height'] !== DEM_TILE) throw new DemError(502, "WCS zwrócił {$tiff['width']} × {$tiff['height']} zamiast " . DEM_TILE . ' × ' . DEM_TILE . '.');
    // Georeferencja: lewy górny róg = (x0, y1), piksel = p (tolerancja pół piksela).
    if (is_finite($tiff['tie'][0]) && (abs($tiff['tie'][0] - $x0) > $p / 2 || abs($tiff['tie'][1] - $y1) > $p / 2)) throw new DemError(502, 'Niezgodna georeferencja kafla WCS.');
    if (is_finite($tiff['scale'][0]) && abs($tiff['scale'][0] - $p) > $p * 0.01) throw new DemError(502, 'Niezgodny rozmiar piksela kafla WCS.');
    return [dem_encode($tiff, (float)$x0, (float)$y1), $ms];
}

/** Raz na dobę: usuwa najstarsze kafle ponad limit wielkości cache. */
function dem_maintain_cache(): void {
    $marker = dem_cache_dir() . DIRECTORY_SEPARATOR . 'maintenance.stamp';
    if (is_fresh($marker, 86400)) return;
    @touch($marker);
    $files = []; $total = 0;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(dem_cache_dir(), FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) if ($f->isFile() && str_ends_with($f->getFilename(), '.bin')) { $files[] = [$f->getMTime(), $f->getPathname(), $f->getSize()]; $total += $f->getSize(); }
    if ($total <= DEM_CACHE_MAX_BYTES) return;
    usort($files, static fn($a, $b) => $a[0] <=> $b[0]);
    foreach ($files as [$mtime, $path, $size]) { if ($total <= DEM_CACHE_MAX_BYTES * 0.9) break; if (@unlink($path)) $total -= $size; }
}
