<?php
/**
 * msportal 19.41.4-b — testy poprawek z audytu (uruchamiane z wiersza poleceń, bez sieci):
 *   php tools/test_audyt_19.41.4-b.php
 * Sprawdza: ukrywanie danych osób fizycznych w pozwoleniach (Z1), walidację udostępnianych projektów (B3),
 * kontrolę adresów po przekierowaniu (B7).
 * (B4 — przypięte sumy bibliotek vendor/static — nieaktualne od 19.45.0: biblioteki są w paczce Vite.)
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

require __DIR__ . '/../api/_common.php';
require __DIR__ . '/../api/_permits_privacy.php';
require __DIR__ . '/../api/_shared_project_schema.php';

$failures = 0; $count = 0;
$check = static function (string $name, bool $ok, string $detail = '') use (&$failures, &$count): void {
    $count++;
    if (!$ok) $failures++;
    printf("%s  %s%s\n", $ok ? 'OK  ' : 'BŁĄD', $name, $detail !== '' ? " — {$detail}" : '');
};

// --- Z1: inwestorzy
$hidden = 'osoba fizyczna (dane ukryte)';
foreach (['Jan Kowalski', 'KOWALSKA ANNA', 'Sabina Solarz', 'Piotr Bankowski', 'Anna Nowak-Wiśniewska', 'Tomasz Gminny', 'Sebastian Saj'] as $person) {
    $check("osoba fizyczna ukryta: {$person}", permits_public_investor($person) === $hidden, (string)permits_public_investor($person));
}
foreach (['XYZ Sp. z o.o.', 'ABC S.A.', 'Gmina Kórnik', 'Spółdzielnia Mieszkaniowa „Przyszłość”', 'PGE Dystrybucja S.A.',
          'Urząd Miejski w Starogardzie', 'Skarb Państwa - Lasy Państwowe', 'Wspólnota Mieszkaniowa ul. Lipowa 5'] as $entity) {
    $check("podmiot widoczny: {$entity}", permits_public_investor($entity) === $entity);
}
$check('pusty inwestor → null', permits_public_investor('') === null && permits_public_investor(null) === null);

// --- B3: projekt udostępniany
$ring = static fn(float $x, float $y, float $s): array => [[$x, $y], [$x + $s, $y], [$x + $s, $y + $s], [$x, $y + $s], [$x, $y]];
$project = [
    'format' => 'mapownik-project', 'formatVersion' => 1, 'app' => ['name' => 'msportal', 'version' => '19.52.0'],
    'exportedAt' => '2026-11-08T12:00:00Z', 'crs' => 'EPSG:2180', 'project' => ['name' => 'Test', 'schemaVersion' => 2], 'state' => null,
    'objects' => [
        ['id' => 'a', 'name' => 'Poligon', 'properties' => new stdClass(), 'geometry' => ['type' => 'Polygon', 'coordinates' => [$ring(471000, 698000, 100), $ring(471030, 698030, 20)]]],
        ['id' => 'b', 'name' => 'Multi', 'geometry' => ['type' => 'MultiPolygon', 'coordinates' => [[$ring(471200, 698000, 50)], [$ring(471300, 698000, 40)]]]],
        ['id' => 'c', 'name' => 'Linia', 'geometry' => ['type' => 'LineString', 'coordinates' => [[471000, 698200], [471150.25, 698260.5]]]],
        ['id' => 'd', 'name' => 'Punkt', 'properties' => ['features' => ['x.y' => ['a' => ['b' => new stdClass()]]]], 'geometry' => ['type' => 'Point', 'coordinates' => [471050, 698150]]],
    ],
];
$json = json_encode($project, JSON_UNESCAPED_UNICODE);
try {
    $normalized = shared_project_normalize($json);
    $check('poprawny projekt przyjęty bez zmian treści', json_decode($normalized, true) == json_decode($json, true));
    $check('puste obiekty JSON zachowane jako {}', str_contains($normalized, '"properties":{}') && str_contains($normalized, '"b":{}'));
} catch (Throwable $e) {
    $check('poprawny projekt przyjęty', false, $e->getMessage());
}
$normalized = shared_project_normalize(json_encode($project + ['smiec' => str_repeat('x', 100)]));
$check('nieznane pole najwyższego poziomu usunięte', !str_contains($normalized, 'smiec'));
$reject = static function (string $name, array|string $doc) use ($check): void {
    try { shared_project_normalize(is_string($doc) ? $doc : json_encode($doc)); $check("odrzucony: {$name}", false, 'przyjęty'); }
    catch (SharedProjectInvalid $e) { $check("odrzucony: {$name}", true, $e->getMessage()); }
};
$reject('inny format', ['format' => 'x', 'objects' => []]);
$reject('lista zamiast obiektu', '[1,2,3]');
$reject('obiekt bez geometrii', ['format' => 'mapownik-project', 'objects' => [['id' => 'x']]]);
$reject('GeometryCollection', ['format' => 'mapownik-project', 'objects' => [['id' => 'x', 'geometry' => ['type' => 'GeometryCollection', 'coordinates' => []]]]]);
$reject('współrzędne tekstowe', ['format' => 'mapownik-project', 'objects' => [['id' => 'x', 'geometry' => ['type' => 'Point', 'coordinates' => ['1', '2']]]]]);
$reject('zbyt długi tekst', ['format' => 'mapownik-project', 'objects' => [['id' => 'x', 'name' => str_repeat('a', 10001), 'geometry' => ['type' => 'Point', 'coordinates' => [1, 2]]]]]);
$reject('ponad 20 000 wierzchołków', ['format' => 'mapownik-project', 'objects' => [['id' => 'x', 'geometry' => ['type' => 'LineString', 'coordinates' => array_fill(0, 20001, [1, 2])]]]]);
$reject('ponad 5000 obiektów', ['format' => 'mapownik-project', 'objects' => array_fill(0, 5001, ['id' => 'x', 'geometry' => ['type' => 'Point', 'coordinates' => [1, 2]]])]);

// --- B7: adresy po przekierowaniu
$check('adres publiczny przepuszczony', mapownik_ip_is_public('193.0.96.1') && mapownik_ip_is_public('2a00:1450::1'));
foreach (['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.16.0.5', '169.254.169.254', '::1', 'fd00::1'] as $ip) {
    $check("adres wewnętrzny odrzucony: {$ip}", !mapownik_ip_is_public($ip));
}
$hardening = mapownik_curl_hardening();
$check('cURL: limit przekierowań i protokoły HTTP/HTTPS', ($hardening[CURLOPT_MAXREDIRS] ?? 0) === 5 && ($hardening[CURLOPT_REDIR_PROTOCOLS] ?? 0) === (CURLPROTO_HTTP | CURLPROTO_HTTPS));

printf("\n%d/%d testów poprawnych\n", $count - $failures, $count);
exit($failures > 0 ? 1 : 0);
