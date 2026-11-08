<?php
declare(strict_types=1);

/**
 * 19.8.0: geometria w czystym PHP — zastępuje shapely/pyproj z backendu VPS.
 *
 * Działa na zwykłym hostingu bez rozszerzeń poza standardową biblioteką PHP.
 * Geometrie wejściowe to GeoJSON (EPSG:4326, lon/lat). Obliczenia metryczne
 * wykonywane są w EPSG:2180 (PUWG 1992, odwzorowanie Gaussa-Krügera na GRS80,
 * szereg Krügera 6. rzędu — dokładność poniżej milimetra w obszarze Polski).
 *
 * Wewnętrzna postać geometrii (po geo_normalize):
 *   ['polys' => [[ring, ring, ...], ...], 'lines' => [[[x,y],...], ...], 'points' => [[x,y], ...]]
 * Pierścienie są domknięte, zewnętrzne przeciwnie do ruchu wskazówek zegara,
 * otwory zgodnie z ruchem wskazówek (wymagane przez geo_intersection_area).
 */

const GEO_EPS = 1e-6;

function geo_tm_constants(): array {
    static $c = null;
    if ($c !== null) return $c;
    $a = 6378137.0;
    $f = 1 / 298.257222101;
    $n = $f / (2 - $f);
    $n2 = $n * $n; $n3 = $n2 * $n; $n4 = $n3 * $n; $n5 = $n4 * $n; $n6 = $n5 * $n;
    $A = $a / (1 + $n) * (1 + $n2 / 4 + $n4 / 64 + $n6 / 256);
    $alpha = [
        $n / 2 - 2 * $n2 / 3 + 5 * $n3 / 16 + 41 * $n4 / 180 - 127 * $n5 / 288 + 7891 * $n6 / 37800,
        13 * $n2 / 48 - 3 * $n3 / 5 + 557 * $n4 / 1440 + 281 * $n5 / 630 - 1983433 * $n6 / 1935360,
        61 * $n3 / 240 - 103 * $n4 / 140 + 15061 * $n5 / 26880 + 167603 * $n6 / 181440,
        49561 * $n4 / 161280 - 179 * $n5 / 168 + 6601661 * $n6 / 7257600,
        34729 * $n5 / 80640 - 3418889 * $n6 / 1995840,
        212378941 * $n6 / 319334400,
    ];
    $beta = [
        $n / 2 - 2 * $n2 / 3 + 37 * $n3 / 96 - $n4 / 360 - 81 * $n5 / 512 + 96199 * $n6 / 604800,
        $n2 / 48 + $n3 / 15 - 437 * $n4 / 1440 + 46 * $n5 / 105 - 1118711 * $n6 / 3870720,
        17 * $n3 / 480 - 37 * $n4 / 840 - 209 * $n5 / 4480 + 5569 * $n6 / 90720,
        4397 * $n4 / 161280 - 11 * $n5 / 504 - 830251 * $n6 / 7257600,
        4583 * $n5 / 161280 - 108847 * $n6 / 3991680,
        20648693 * $n6 / 638668800,
    ];
    $delta = [
        2 * $n - 2 * $n2 / 3 - 2 * $n3 + 116 * $n4 / 45 + 26 * $n5 / 45 - 2854 * $n6 / 675,
        7 * $n2 / 3 - 8 * $n3 / 5 - 227 * $n4 / 45 + 2704 * $n5 / 315 + 2323 * $n6 / 945,
        56 * $n3 / 15 - 136 * $n4 / 35 - 1262 * $n5 / 105 + 73814 * $n6 / 2835,
        4279 * $n4 / 630 - 332 * $n5 / 35 - 399572 * $n6 / 14175,
        4174 * $n5 / 315 - 144838 * $n6 / 6237,
        601676 * $n6 / 22275,
    ];
    $c = [
        'e' => sqrt($f * (2 - $f)), 'A' => $A, 'alpha' => $alpha, 'beta' => $beta, 'delta' => $delta,
        'k0' => 0.9993, 'lon0' => deg2rad(19.0), 'fe' => 500000.0, 'fn' => -5300000.0,
    ];
    return $c;
}

/** EPSG:4326 (lon, lat) -> EPSG:2180 (easting, northing). */
function geo_to2180(float $lon, float $lat): array {
    $c = geo_tm_constants();
    $phi = deg2rad($lat);
    $lam = deg2rad($lon) - $c['lon0'];
    $s = sin($phi);
    $t = sinh(atanh($s) - $c['e'] * atanh($c['e'] * $s));
    $xiP = atan2($t, cos($lam));
    $etaP = atanh(sin($lam) / sqrt(1 + $t * $t));
    $xi = $xiP; $eta = $etaP;
    foreach ($c['alpha'] as $i => $al) {
        $j = 2 * ($i + 1);
        $xi += $al * sin($j * $xiP) * cosh($j * $etaP);
        $eta += $al * cos($j * $xiP) * sinh($j * $etaP);
    }
    return [$c['fe'] + $c['k0'] * $c['A'] * $eta, $c['fn'] + $c['k0'] * $c['A'] * $xi];
}

/** EPSG:2180 (easting, northing) -> EPSG:4326 (lon, lat). */
function geo_to4326(float $x, float $y): array {
    $c = geo_tm_constants();
    $xi = ($y - $c['fn']) / ($c['k0'] * $c['A']);
    $eta = ($x - $c['fe']) / ($c['k0'] * $c['A']);
    $xiP = $xi; $etaP = $eta;
    foreach ($c['beta'] as $i => $be) {
        $j = 2 * ($i + 1);
        $xiP -= $be * sin($j * $xi) * cosh($j * $eta);
        $etaP -= $be * cos($j * $xi) * sinh($j * $eta);
    }
    $chi = asin(sin($xiP) / cosh($etaP));
    $phi = $chi;
    foreach ($c['delta'] as $i => $de) $phi += $de * sin(2 * ($i + 1) * $chi);
    $lam = $c['lon0'] + atan2(sinh($etaP), cos($xiP));
    return [rad2deg($lam), rad2deg($phi)];
}

// ---------------------------------------------------------------- normalizacja

function geo_ring_signed_area(array $ring): float {
    $sum = 0.0;
    $n = count($ring);
    for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
        $sum += $ring[$j][0] * $ring[$i][1] - $ring[$i][0] * $ring[$j][1];
    }
    return $sum / 2;
}

/** Domknięty pierścień bez powtórzonych punktów; null, gdy zdegenerowany. */
function geo_clean_ring(array $coords, ?callable $project): ?array {
    $ring = [];
    foreach ($coords as $pt) {
        if (!is_array($pt) || count($pt) < 2 || !is_numeric($pt[0]) || !is_numeric($pt[1])) return null;
        $p = $project ? $project((float)$pt[0], (float)$pt[1]) : [(float)$pt[0], (float)$pt[1]];
        if (!is_finite($p[0]) || !is_finite($p[1])) return null;
        $last = end($ring);
        if ($last !== false && $last[0] === $p[0] && $last[1] === $p[1]) continue;
        $ring[] = $p;
    }
    if (count($ring) >= 2 && $ring[0] === $ring[count($ring) - 1]) array_pop($ring);
    if (count($ring) < 3) return null;
    $ring[] = $ring[0];
    return $ring;
}

/**
 * GeoJSON geometry (EPSG:4326) -> postać wewnętrzna. $metric=true przelicza do EPSG:2180.
 * Zwraca null dla geometrii pustej lub nieobsługiwanej.
 */
function geo_normalize(array $geometry, bool $metric = true): ?array {
    $project = $metric ? fn(float $x, float $y): array => geo_to2180($x, $y) : null;
    $out = ['polys' => [], 'lines' => [], 'points' => []];
    $type = (string)($geometry['type'] ?? '');
    $coords = $geometry['coordinates'] ?? null;
    $addPoly = function (array $rings) use (&$out, $project): void {
        $poly = [];
        foreach (array_values($rings) as $k => $raw) {
            if (!is_array($raw)) continue;
            $ring = geo_clean_ring($raw, $project);
            if ($ring === null) { if ($k === 0) return; continue; }
            $area = geo_ring_signed_area($ring);
            if (abs($area) <= 0.0) { if ($k === 0) return; continue; }
            if (($k === 0 && $area < 0) || ($k > 0 && $area > 0)) $ring = array_reverse($ring);
            $poly[] = $ring;
        }
        if ($poly) $out['polys'][] = $poly;
    };
    $addLine = function (array $raw) use (&$out, $project): void {
        $line = [];
        foreach ($raw as $pt) {
            if (!is_array($pt) || count($pt) < 2 || !is_numeric($pt[0]) || !is_numeric($pt[1])) return;
            $line[] = $project ? $project((float)$pt[0], (float)$pt[1]) : [(float)$pt[0], (float)$pt[1]];
        }
        if (count($line) === 1) $out['points'][] = $line[0];
        elseif ($line) $out['lines'][] = $line;
    };
    $addPoint = function ($pt) use (&$out, $project): void {
        if (!is_array($pt) || count($pt) < 2 || !is_numeric($pt[0]) || !is_numeric($pt[1])) return;
        $out['points'][] = $project ? $project((float)$pt[0], (float)$pt[1]) : [(float)$pt[0], (float)$pt[1]];
    };
    if (!is_array($coords) && $type !== 'GeometryCollection') return null;
    switch ($type) {
        case 'Point': $addPoint($coords); break;
        case 'MultiPoint': foreach ($coords as $p) $addPoint($p); break;
        case 'LineString': $addLine($coords); break;
        case 'MultiLineString': foreach ($coords as $l) if (is_array($l)) $addLine($l); break;
        case 'Polygon': $addPoly($coords); break;
        case 'MultiPolygon': foreach ($coords as $p) if (is_array($p)) $addPoly($p); break;
        case 'GeometryCollection':
            foreach ((array)($geometry['geometries'] ?? []) as $g) {
                if (!is_array($g)) continue;
                $part = geo_normalize($g, $metric);
                if ($part === null) continue;
                foreach (['polys', 'lines', 'points'] as $k) array_push($out[$k], ...$part[$k]);
            }
            break;
        default: return null;
    }
    return ($out['polys'] || $out['lines'] || $out['points']) ? $out : null;
}

function geo_bounds(array $g): array {
    $minx = $miny = INF; $maxx = $maxy = -INF;
    $visit = function (array $pt) use (&$minx, &$miny, &$maxx, &$maxy): void {
        if ($pt[0] < $minx) $minx = $pt[0];
        if ($pt[0] > $maxx) $maxx = $pt[0];
        if ($pt[1] < $miny) $miny = $pt[1];
        if ($pt[1] > $maxy) $maxy = $pt[1];
    };
    foreach ($g['polys'] as $poly) foreach ($poly[0] as $pt) $visit($pt);
    foreach ($g['lines'] as $line) foreach ($line as $pt) $visit($pt);
    foreach ($g['points'] as $pt) $visit($pt);
    return [$minx, $miny, $maxx, $maxy];
}

function geo_area(array $g): float {
    $area = 0.0;
    foreach ($g['polys'] as $poly) foreach ($poly as $ring) $area += geo_ring_signed_area($ring);
    return abs($area);
}

/** Lista odcinków [x1,y1,x2,y2] (krawędzie wieloboków i linii). */
function geo_segments(array $g): array {
    $segs = [];
    foreach ($g['polys'] as $poly) foreach ($poly as $ring) {
        for ($i = 0, $n = count($ring) - 1; $i < $n; $i++) {
            $segs[] = [$ring[$i][0], $ring[$i][1], $ring[$i + 1][0], $ring[$i + 1][1]];
        }
    }
    foreach ($g['lines'] as $line) {
        for ($i = 0, $n = count($line) - 1; $i < $n; $i++) {
            $segs[] = [$line[$i][0], $line[$i][1], $line[$i + 1][0], $line[$i + 1][1]];
        }
    }
    return $segs;
}

// ------------------------------------------------------------ predykaty i odległości

/** Parzystość przecięć po wszystkich pierścieniach (poprawne dla wieloboków z otworami i multi). */
function geo_point_in_polys(float $x, float $y, array $polys): bool {
    $inside = false;
    foreach ($polys as $poly) foreach ($poly as $ring) {
        $n = count($ring) - 1;
        for ($i = 0; $i < $n; $i++) {
            $x1 = $ring[$i][0]; $y1 = $ring[$i][1]; $x2 = $ring[$i + 1][0]; $y2 = $ring[$i + 1][1];
            if (($y1 > $y) !== ($y2 > $y)) {
                $xi = $x1 + ($y - $y1) * ($x2 - $x1) / ($y2 - $y1);
                if ($x < $xi) $inside = !$inside;
            }
        }
    }
    return $inside;
}

function geo_point_seg_dist2(float $px, float $py, array $s): float {
    [$x1, $y1, $x2, $y2] = $s;
    $dx = $x2 - $x1; $dy = $y2 - $y1;
    $len2 = $dx * $dx + $dy * $dy;
    $t = $len2 > 0 ? (($px - $x1) * $dx + ($py - $y1) * $dy) / $len2 : 0.0;
    if ($t < 0) $t = 0.0; elseif ($t > 1) $t = 1.0;
    $ex = $x1 + $t * $dx - $px; $ey = $y1 + $t * $dy - $py;
    return $ex * $ex + $ey * $ey;
}

function geo_orient(float $ax, float $ay, float $bx, float $by, float $cx, float $cy): float {
    return ($bx - $ax) * ($cy - $ay) - ($by - $ay) * ($cx - $ax);
}

function geo_segments_intersect(array $a, array $b): bool {
    [$ax, $ay, $bx, $by] = $a; [$cx, $cy, $dx, $dy] = $b;
    if (max($ax, $bx) < min($cx, $dx) || max($cx, $dx) < min($ax, $bx)
        || max($ay, $by) < min($cy, $dy) || max($cy, $dy) < min($ay, $by)) return false;
    $d1 = geo_orient($cx, $cy, $dx, $dy, $ax, $ay);
    $d2 = geo_orient($cx, $cy, $dx, $dy, $bx, $by);
    $d3 = geo_orient($ax, $ay, $bx, $by, $cx, $cy);
    $d4 = geo_orient($ax, $ay, $bx, $by, $dx, $dy);
    if ((($d1 > 0 && $d2 < 0) || ($d1 < 0 && $d2 > 0)) && (($d3 > 0 && $d4 < 0) || ($d3 < 0 && $d4 > 0))) return true;
    // Przypadki styczne i współliniowe.
    return geo_point_seg_dist2($ax, $ay, $b) <= GEO_EPS * GEO_EPS || geo_point_seg_dist2($bx, $by, $b) <= GEO_EPS * GEO_EPS
        || geo_point_seg_dist2($cx, $cy, $a) <= GEO_EPS * GEO_EPS || geo_point_seg_dist2($dx, $dy, $a) <= GEO_EPS * GEO_EPS;
}

function geo_seg_seg_dist2(array $a, array $b): float {
    if (geo_segments_intersect($a, $b)) return 0.0;
    return min(geo_point_seg_dist2($a[0], $a[1], $b), geo_point_seg_dist2($a[2], $a[3], $b),
               geo_point_seg_dist2($b[0], $b[1], $a), geo_point_seg_dist2($b[2], $b[3], $a));
}

/** Dowolny punkt geometrii (do testu zawierania). */
function geo_any_points(array $g): array {
    $pts = $g['points'];
    foreach ($g['lines'] as $line) $pts[] = $line[0];
    foreach ($g['polys'] as $poly) $pts[] = $poly[0][0];
    return $pts;
}

function geo_intersects(array $a, array $b): bool {
    $ba = geo_bounds($a); $bb = geo_bounds($b);
    if ($ba[2] < $bb[0] - GEO_EPS || $bb[2] < $ba[0] - GEO_EPS || $ba[3] < $bb[1] - GEO_EPS || $bb[3] < $ba[1] - GEO_EPS) return false;
    if ($b['polys']) foreach (geo_any_points($a) as $p) if (geo_point_in_polys($p[0], $p[1], $b['polys'])) return true;
    if ($a['polys']) foreach (geo_any_points($b) as $p) if (geo_point_in_polys($p[0], $p[1], $a['polys'])) return true;
    $sa = geo_segments($a); $sb = geo_segments($b);
    foreach ($sa as $s) foreach ($sb as $t) if (geo_segments_intersect($s, $t)) return true;
    foreach ($a['points'] as $p) foreach ($sb as $t) if (geo_point_seg_dist2($p[0], $p[1], $t) <= GEO_EPS * GEO_EPS) return true;
    foreach ($b['points'] as $p) foreach ($sa as $s) if (geo_point_seg_dist2($p[0], $p[1], $s) <= GEO_EPS * GEO_EPS) return true;
    foreach ($a['points'] as $p) foreach ($b['points'] as $q) if (abs($p[0] - $q[0]) <= GEO_EPS && abs($p[1] - $q[1]) <= GEO_EPS) return true;
    return false;
}

/** Odległość euklidesowa między geometriami (0, gdy się przecinają) — jak shapely.distance. */
function geo_distance(array $a, array $b): float {
    if (geo_intersects($a, $b)) return 0.0;
    $best = INF;
    $sa = geo_segments($a); $sb = geo_segments($b);
    foreach ($sa as $s) foreach ($sb as $t) {
        $d = geo_seg_seg_dist2($s, $t);
        if ($d < $best) $best = $d;
    }
    foreach ($a['points'] as $p) {
        foreach ($sb as $t) $best = min($best, geo_point_seg_dist2($p[0], $p[1], $t));
        foreach ($b['points'] as $q) $best = min($best, ($p[0] - $q[0]) ** 2 + ($p[1] - $q[1]) ** 2);
    }
    foreach ($b['points'] as $q) foreach ($sa as $s) $best = min($best, geo_point_seg_dist2($q[0], $q[1], $s));
    return sqrt($best);
}

/** Odległość punktu od geometrii (0 wewnątrz wieloboku). */
function geo_point_distance(float $x, float $y, array $g): float {
    if ($g['polys'] && geo_point_in_polys($x, $y, $g['polys'])) return 0.0;
    $best = INF;
    foreach (geo_segments($g) as $s) {
        $d = geo_point_seg_dist2($x, $y, $s);
        if ($d < $best) $best = $d;
    }
    foreach ($g['points'] as $p) $best = min($best, ($p[0] - $x) ** 2 + ($p[1] - $y) ** 2);
    return sqrt($best);
}

/** Najmniejsza odległość prostokąta od punktu (dolne ograniczenie dla geo_point_distance). */
function geo_bounds_point_distance(array $b, float $x, float $y): float {
    $dx = max($b[0] - $x, 0.0, $x - $b[2]);
    $dy = max($b[1] - $y, 0.0, $y - $b[3]);
    return sqrt($dx * $dx + $dy * $dy);
}

function geo_bounds_distance(array $a, array $b): float {
    $dx = max($b[0] - $a[2], 0.0, $a[0] - $b[2]);
    $dy = max($b[1] - $a[3], 0.0, $a[1] - $b[3]);
    return sqrt($dx * $dx + $dy * $dy);
}

// ---------------------------------------------------------- pole części wspólnej

/**
 * Pole części wspólnej dwóch zbiorów wieloboków (twierdzenie Greena).
 *
 * Brzeg A∩B składa się z fragmentów brzegu A leżących wewnątrz B oraz fragmentów
 * brzegu B leżących wewnątrz A. Każdą krawędź dzielimy w punktach przecięcia
 * z drugą figurą i sumujemy ½(x1·y2 − x2·y1) dla fragmentów, których środek leży
 * wewnątrz. Wspólne krawędzie o zgodnym kierunku liczone są raz, o przeciwnym — wcale.
 * Wynik jest dokładny (z dokładnością do arytmetyki zmiennoprzecinkowej) także dla
 * wieloboków wklęsłych, z otworami i wieloczęściowych.
 */
function geo_intersection_area(array $polysA, array $polysB): float {
    if (!$polysA || !$polysB) return 0.0;
    // Przesunięcie początku układu do wnętrza danych: iloczyny x·y w EPSG:2180 (~10¹¹)
    // tracą precyzję przy odejmowaniu dużych sum częściowych.
    $ox = $polysA[0][0][0][0]; $oy = $polysA[0][0][0][1];
    $shift = fn(array $polys): array => array_map(fn(array $poly): array => array_map(
        fn(array $ring): array => array_map(fn(array $p): array => [$p[0] - $ox, $p[1] - $oy], $ring), $poly), $polys);
    $polysA = $shift($polysA); $polysB = $shift($polysB);
    $segA = geo_segments(['polys' => $polysA, 'lines' => [], 'points' => []]);
    $segB = geo_segments(['polys' => $polysB, 'lines' => [], 'points' => []]);
    $total = geo_boundary_inside_sum($segA, $segB, $polysB, true)
           + geo_boundary_inside_sum($segB, $segA, $polysA, false);
    return max(0.0, $total / 2);
}

function geo_boundary_inside_sum(array $edges, array $otherEdges, array $otherPolys, bool $keepSharedSameDirection): float {
    $sum = 0.0;
    $tol = 1e-4; // 0,1 mm w EPSG:2180
    // Prosty indeks krawędzi drugiej figury po zakresie Y.
    $obox = [];
    foreach ($otherEdges as $k => $e) $obox[$k] = [min($e[0], $e[2]) - $tol, max($e[0], $e[2]) + $tol, min($e[1], $e[3]) - $tol, max($e[1], $e[3]) + $tol];
    foreach ($edges as $e) {
        [$x1, $y1, $x2, $y2] = $e;
        $dx = $x2 - $x1; $dy = $y2 - $y1;
        $len2 = $dx * $dx + $dy * $dy;
        if ($len2 <= 0) continue;
        $ex0 = min($x1, $x2) - $tol; $ex1 = max($x1, $x2) + $tol; $ey0 = min($y1, $y2) - $tol; $ey1 = max($y1, $y2) + $tol;
        $ts = [0.0, 1.0];
        $near = [];
        foreach ($otherEdges as $k => $o) {
            $b = $obox[$k];
            if ($b[1] < $ex0 || $b[0] > $ex1 || $b[3] < $ey0 || $b[2] > $ey1) continue;
            $near[] = $o;
            [$x3, $y3, $x4, $y4] = $o;
            $fx = $x4 - $x3; $fy = $y4 - $y3;
            $den = $dx * $fy - $dy * $fx;
            $flen = sqrt($fx * $fx + $fy * $fy);
            $elen = sqrt($len2);
            // Końce drugiego odcinka leżące na krawędzi (styk, wspólny fragment) zawsze ją dzielą.
            foreach ([[$x3, $y3], [$x4, $y4]] as [$px, $py]) {
                $t = (($px - $x1) * $dx + ($py - $y1) * $dy) / $len2;
                if ($t <= 0 || $t >= 1) continue;
                $qx = $x1 + $t * $dx; $qy = $y1 + $t * $dy;
                if (($qx - $px) ** 2 + ($qy - $py) ** 2 <= $tol * $tol) $ts[] = $t;
            }
            // Właściwe przecięcie tylko dla odcinków wyraźnie nierównoległych (stabilność numeryczna).
            if ($flen > 0 && abs($den) > 1e-8 * $elen * $flen) {
                $t = (($x3 - $x1) * $fy - ($y3 - $y1) * $fx) / $den;
                $u = (($x3 - $x1) * $dy - ($y3 - $y1) * $dx) / $den;
                if ($t > 0 && $t < 1 && $u >= 0 && $u <= 1) $ts[] = $t;
            }
        }
        sort($ts);
        $prev = null;
        foreach ($ts as $t) {
            if ($prev !== null && $t - $prev > 1e-12) {
                $ax = $x1 + $prev * $dx; $ay = $y1 + $prev * $dy;
                $bx = $x1 + $t * $dx; $by = $y1 + $t * $dy;
                $mx = ($ax + $bx) / 2; $my = ($ay + $by) / 2;
                $onBoundary = null;
                foreach ($near as $o) {
                    if (geo_point_seg_dist2($mx, $my, $o) <= $tol * $tol) { $onBoundary = $o; break; }
                }
                if ($onBoundary !== null) {
                    $same = ($onBoundary[2] - $onBoundary[0]) * $dx + ($onBoundary[3] - $onBoundary[1]) * $dy > 0;
                    if ($keepSharedSameDirection && $same) $sum += $ax * $by - $bx * $ay;
                } elseif (geo_point_in_polys($mx, $my, $otherPolys)) {
                    $sum += $ax * $by - $bx * $ay;
                }
            }
            $prev = $t;
        }
    }
    return $sum;
}

/**
 * Punkt na pewno wewnątrz wieloboku (odpowiednik shapely representative_point):
 * środek najszerszego odcinka poziomej prostej przez środek zasięgu.
 */
function geo_representative_point(array $g): array {
    [$minx, $miny, $maxx, $maxy] = geo_bounds($g);
    if (!$g['polys']) return [($minx + $maxx) / 2, ($miny + $maxy) / 2];
    $best = null; $bestWidth = -1.0;
    foreach ([0.5, 0.37, 0.63, 0.25, 0.75] as $frac) {
        $y = $miny + ($maxy - $miny) * $frac;
        $xs = [];
        foreach ($g['polys'] as $poly) foreach ($poly as $ring) {
            for ($i = 0, $n = count($ring) - 1; $i < $n; $i++) {
                [$x1, $y1] = $ring[$i]; [$x2, $y2] = $ring[$i + 1];
                if (($y1 > $y) !== ($y2 > $y)) $xs[] = $x1 + ($y - $y1) * ($x2 - $x1) / ($y2 - $y1);
            }
        }
        sort($xs);
        for ($i = 0; $i + 1 < count($xs); $i += 2) {
            $w = $xs[$i + 1] - $xs[$i];
            if ($w > $bestWidth) { $bestWidth = $w; $best = [($xs[$i] + $xs[$i + 1]) / 2, $y]; }
        }
        if ($best !== null) break;
    }
    return $best ?? [($minx + $maxx) / 2, ($miny + $maxy) / 2];
}

/** Przekształca postać wewnętrzną z EPSG:2180 z powrotem na GeoJSON EPSG:4326. */
function geo_to_geojson4326(array $g): array {
    $ring = fn(array $r): array => array_map(function (array $p): array {
        [$lon, $lat] = geo_to4326($p[0], $p[1]);
        return [round($lon, 8), round($lat, 8)];
    }, $r);
    $polys = array_map(fn(array $poly): array => array_map($ring, $poly), $g['polys']);
    if (count($polys) === 1) return ['type' => 'Polygon', 'coordinates' => $polys[0]];
    return ['type' => 'MultiPolygon', 'coordinates' => $polys];
}

// ------------------------------------------------------------------------- WKT

/** Parser (MULTI)POLYGON WKT -> współrzędne GeoJSON (bez przeliczania układu). */
function geo_parse_wkt_polygon(string $wkt): ?array {
    $wkt = trim((string)preg_replace('~^\s*SRID\s*=\s*\d+\s*;~i', '', $wkt));
    if (!preg_match('~^(MULTIPOLYGON|POLYGON)\s*(?:Z|M|ZM)?\s*(\(.*\))~is', $wkt, $m)) return null;
    $type = strtoupper($m[1]);
    $body = $m[2];
    $pos = 0;
    $len = strlen($body);
    $parse = function () use (&$parse, &$pos, $body, $len) {
        while ($pos < $len && ctype_space($body[$pos])) $pos++;
        if ($pos >= $len || $body[$pos] !== '(') throw new RuntimeException('WKT: oczekiwano "("');
        $pos++;
        while ($pos < $len && ctype_space($body[$pos])) $pos++;
        if ($pos < $len && $body[$pos] === '(') {
            $items = [];
            while (true) {
                $items[] = $parse();
                while ($pos < $len && ctype_space($body[$pos])) $pos++;
                if ($pos < $len && $body[$pos] === ',') { $pos++; continue; }
                if ($pos < $len && $body[$pos] === ')') { $pos++; return $items; }
                throw new RuntimeException('WKT: błędna składnia');
            }
        }
        $end = strpos($body, ')', $pos);
        if ($end === false) throw new RuntimeException('WKT: brak ")"');
        $chunk = substr($body, $pos, $end - $pos);
        $pos = $end + 1;
        $points = [];
        foreach (explode(',', $chunk) as $pair) {
            $nums = preg_split('~\s+~', trim($pair)) ?: [];
            if (count($nums) < 2 || !is_numeric($nums[0]) || !is_numeric($nums[1])) throw new RuntimeException('WKT: błędna współrzędna');
            $points[] = [(float)$nums[0], (float)$nums[1]];
        }
        return $points;
    };
    try {
        $coords = $parse();
    } catch (RuntimeException) {
        return null;
    }
    return ['type' => $type === 'POLYGON' ? 'Polygon' : 'MultiPolygon', 'coordinates' => $coords];
}
