<?php
/**
 * msportal 19.46.0 — testy poprawek z audytu funkcjonalnego (CLI, bez sieci):  php tools/test_audyt_19.43.0.php
 * A1: odpowiedź-błąd serwera gminy w krajowej integracji MPZP nie może być uznana za opis planu.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../api/_common.php';
require __DIR__ . '/../api/_vps_geo.php';
require __DIR__ . '/../api/_vps_ru.php';

$failures = 0; $count = 0;
$check = static function (string $name, bool $ok, string $detail = '') use (&$failures, &$count): void {
    $count++; if (!$ok) $failures++;
    printf("%s  %s%s\n", $ok ? 'OK  ' : 'BŁĄD', $name, $detail !== '' ? " — {$detail}" : '');
};
$parcel = ['polys' => [[[[471000, 698000], [471100, 698000], [471100, 698100], [471000, 698100], [471000, 698000]]]], 'lines' => [], 'points' => []];
$png = static function (bool $drawn): string {
    $im = imagecreatetruecolor(16, 16); imagesavealpha($im, true);
    imagefill($im, 0, 0, $drawn ? imagecolorallocatealpha($im, 200, 50, 50, 0) : imagecolorallocatealpha($im, 0, 0, 0, 127));
    ob_start(); imagepng($im); return (string)ob_get_clean();
};
$exception = "<hr/><?xml version='1.0'?><ServiceExceptionReport version=\"1.1.1\"><ServiceException code=\"LayerNotDefined\">msWMSLoadGetMapParams(): WMS server error. Invalid layer(s) given in the LAYERS parameter.</ServiceException></ServiceExceptionReport>";
$plan = "<hr/><html><body><table><tr><td>Przeznaczenie</td><td>MN — zabudowa mieszkaniowa jednorodzinna</td></tr></table></body></html>";

$r = vps_kimp_parcel($parcel, ['kimp:gfi' => $exception, 'kimp:map' => $png(false)]);
$check('błąd serwera gminy + pusty rysunek → wynik nieznany (nie „brak planu”, nie „plan”)', $r['ok'] === false && $r['matches'] === [], json_encode($r['checked'] ?? null));
$r = vps_kimp_parcel($parcel, ['kimp:gfi' => $exception, 'kimp:map' => 'nie-obraz']);
$check('błąd serwera gminy + brak rysunku → wynik nieznany', $r['ok'] === false && $r['matches'] === []);
$r = vps_kimp_parcel($parcel, ['kimp:gfi' => $exception, 'kimp:map' => $png(true)]);
$check('błąd opisu, ale plan na rysunku → plan „wg rysunku”', $r['ok'] === true && str_contains($r['matches'][0]['label'] ?? '', 'wg rysunku'));
$r = vps_kimp_parcel($parcel, ['kimp:gfi' => $exception . $plan, 'kimp:map' => $png(false)]);
$opis = (string)($r['matches'][0]['attributes']['Opis'] ?? '');
$check('część odpowiedzi z planem → plan z opisem bez treści błędu', $r['ok'] === true && str_contains($opis, 'zabudowa mieszkaniowa') && !preg_match('~msWMS|ServiceException|Invalid layer~i', $opis), mb_substr($opis, 0, 60));
$r = vps_kimp_parcel($parcel, ['kimp:gfi' => '<hr/>Brak wyniku', 'kimp:map' => $png(false)]);
$check('„brak wyniku” i pusty rysunek → brak planu (rozstrzygnięte)', $r['ok'] === true && $r['matches'] === [] && ($r['checked'] ?? '') === 'raster-empty');

printf("\n%d/%d testów poprawnych\n", $count - $failures, $count);
exit($failures > 0 ? 1 : 0);
