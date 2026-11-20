<?php
/**
 * 19.43.0 — podsumowanie błędów zgłoszonych przez przeglądarki (api/client_errors.php).
 *   php tools/client_errors_report.php [dni=7]
 * Grupuje po komunikacie, pokazuje liczbę, wersje aplikacji, ostatnie wystąpienie i źródło.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../api/_common.php';
$days = max(1, (int)($argv[1] ?? 7));
$groups = [];
for ($d = 0; $d < $days; $d++) {
    $file = cache_root() . '/client-errors/' . gmdate('Y-m-d', time() - $d * 86400) . '.jsonl';
    if (!is_file($file)) continue;
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $r = json_decode($line, true);
        if (!is_array($r)) continue;
        $key = ($r['type'] ?? '') . ' | ' . mb_substr((string)($r['message'] ?? ''), 0, 160);
        $g = $groups[$key] ?? ['count' => 0, 'versions' => [], 'last' => '', 'source' => ''];
        $g['count']++; $g['versions'][(string)($r['appVersion'] ?? '?')] = true;
        if (($r['at'] ?? '') > $g['last']) { $g['last'] = (string)$r['at']; $g['source'] = (string)($r['source'] ?? ''); }
        $groups[$key] = $g;
    }
}
uasort($groups, static fn($a, $b) => $b['count'] <=> $a['count']);
if (!$groups) { echo "Brak zgłoszonych błędów w ostatnich {$days} dniach.\n"; exit(0); }
foreach ($groups as $key => $g) {
    printf("%5d×  %s\n        wersje: %s · ostatnio: %s · %s\n", $g['count'], $key, implode(', ', array_keys($g['versions'])), $g['last'], $g['source']);
}
