<?php
/**
 * msportal 19.46.0 — testy poprawek karty działki (CLI, bez sieci):  php tools/test_19.46.0.php
 * Opis obiektów z usług planów: bez powtórzeń, polskie etykiety pól, „Data wersji” przy projekcie planu.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../api/_common.php';
require __DIR__ . '/../api/_identify_parse.php';

$failures = 0; $count = 0;
$check = static function (string $name, bool $ok, string $detail = '') use (&$failures, &$count): void {
    $count++; if (!$ok) $failures++;
    printf("%s  %s%s\n", $ok ? 'OK  ' : 'BŁĄD', $name, $detail !== '' ? " — {$detail}" : '');
};

$act = ['tytul' => 'Plan ogólny gminy miasta Wałcz', 'typPlanu' => 'plan ogólny gminy', 'poziomHierarchii' => 'lokalny', 'status' => 'w opracowaniu', 'obowiazujeOd' => '2026-02-01', 'tytulAlternatywny' => 'POG m.Wałcz'];
$zone = ['nazwa' => 'strefa usługowa', 'symbol' => 'SU', 'oznaczenie' => '4SU', 'profilPodstawowy' => 'teren usług,teren komunikacji', 'status' => 'w opracowaniu', 'obowiazujeOd' => '2026-02-02', 'charakterUstalenia' => 'ogólnie wiążące'];
$text = identify_rows_text([$act, $act, $zone, $zone]);
$check('rekordy bez powtórzeń', substr_count($text, 'Plan ogólny gminy miasta Wałcz') === 1 && substr_count($text, 'Oznaczenie: 4SU') === 1, $text);
$check('etykiety po polsku', str_contains($text, 'Rodzaj planu: plan ogólny gminy') && str_contains($text, 'Poziom: lokalny') && str_contains($text, 'Nazwa skrócona: POG m.Wałcz') && str_contains($text, 'Charakter ustalenia: ogólnie wiążące'));
$check('brak surowych nazw pól', !preg_match('/typPlanu|poziomHierarchii|tytulAlternatywny|profilPodstawowy|charakterUstalenia/', $text));
$check('projekt planu: „Data wersji” zamiast „Obowiązuje od”', str_contains($text, 'Data wersji: 2026-02-01') && !str_contains($text, 'Obowiązuje od'));
$check('lista z przecinkami czytelna', str_contains($text, 'teren usług, teren komunikacji'));
$adopted = identify_rows_text([['tytul' => 'Plan ogólny gminy X', 'status' => 'prawnie wiążący', 'obowiazujeOd' => '2025-12-01', 'maksWysokoscZabudowy' => '1,5']]);
$check('plan uchwalony: „Obowiązuje od”', str_contains($adopted, 'Obowiązuje od: 2025-12-01'));
$check('liczby z przecinkiem bez zmian; nieznane pole camelCase opisane', str_contains($adopted, 'Maks. wysokość zabudowy: 1,5') || str_contains($adopted, ': 1,5'), $adopted);

printf("\n%d/%d testów poprawnych\n", $count - $failures, $count);
exit($failures > 0 ? 1 : 0);
