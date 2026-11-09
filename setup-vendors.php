<?php
declare(strict_types=1);
require __DIR__ . '/api/_vendor_builder.php';
// 19.41.4-b (audyt B4): tylko z wiersza poleceń (php setup-vendors.php). Anonimowe żądanie WWW nie może
// uruchamiać pobierania kodu JavaScript z sieci. Biblioteki są w paczce wydania (vendor/static/).
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo "Przygotowanie bibliotek działa tylko z wiersza poleceń. Brakujące pliki wgraj z paczki wydania: katalog vendor/static/.\n";
    exit;
}
$refreshRequested = in_array('--refresh', $argv ?? [], true) || (isset($_GET['refresh']) && $_GET['refresh'] === '1');
// Public HTTP may prepare only missing vendors. Forced refresh is deliberately
// disabled over HTTP so an anonymous request cannot trigger repeated downloads.
if ($refreshRequested && PHP_SAPI !== 'cli') {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Wymuszone odświeżanie bibliotek jest wyłączone przez HTTP.\n";
    exit;
}
$refresh = $refreshRequested && PHP_SAPI === 'cli';
$before = vendor_status_data();
$result = $before['ready'] && !$refresh ? ['ok' => true, 'results' => [], 'status' => $before] : build_all_vendors($refresh);
$auto = isset($_GET['auto']) && $_GET['auto'] === '1';
if ($auto && ($result['ok'] ?? false)) { header('Location: ./?vendor=ready'); exit; }
?>
<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MSPortal 19.42.0 — przygotowanie bibliotek</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#18202c}.card{border:1px solid #d8dee8;border-radius:14px;padding:22px;background:#fff;box-shadow:0 8px 28px #00000012}.ok{color:#157347}.bad{color:#b42318}code{background:#f4f6f8;padding:2px 5px;border-radius:5px}table{border-collapse:collapse;width:100%;margin:18px 0}td,th{padding:8px;border-bottom:1px solid #e5e7eb;text-align:left}</style>
</head>
<body><div class="card">
<h1>MSPortal 19.42.0 — biblioteki lokalne</h1>
<?php if ($result['ok']): ?>
<p class="ok"><strong>Gotowe.</strong> Wszystkie biblioteki potrzebne do uruchomienia MSPortalu są zapisane lokalnie na tym serwerze. Od tej chwili start aplikacji nie zależy od esm.sh ani jsDelivr.</p>
<?php else: ?>
<p class="bad"><strong>Nie udało się przygotować wszystkich bibliotek.</strong> Istniejące poprawne pliki nie zostały usunięte. Spróbuj ponownie później.</p>
<?php endif; ?>
<table><thead><tr><th>Moduł</th><th>Stan</th><th>Tryb / błąd</th></tr></thead><tbody>
<?php foreach (($result['results'] ?: $result['status']['files']) as $key => $row): ?>
<tr><td><?=htmlspecialchars((string)$key)?></td><td><?=($row['ok'] ?? false) ? '✓' : '✗'?></td><td><?=htmlspecialchars((string)($row['mode'] ?? $row['error'] ?? (($row['bytes'] ?? 0) . ' B')))?></td></tr>
<?php endforeach; ?>
</tbody></table>
<p><a href="./">← Uruchom MSPortal</a> &nbsp; <a href="./diagnostyka.html">Diagnostyka</a></p>
<?php if ($result['ok']): ?><p><small>Wymuszone odświeżanie vendorów przez publiczne HTTP jest wyłączone. Strona przygotowuje tylko brakujące biblioteki.</small></p><?php endif; ?>
</div></body></html>
