<?php
declare(strict_types=1);
// 19.50.0: cron OVH może uruchamiać PHP jako CGI (nie CLI) — rozpoznajemy brak zapytania HTTP, nie samo PHP_SAPI.
if (!(PHP_SAPI === 'cli' || PHP_SAPI === 'phpdbg' || (!isset($_SERVER['REQUEST_METHOD']) && !isset($_SERVER['HTTP_HOST'])))) { http_response_code(403); exit; }
require __DIR__ . '/../api/_common.php';
$started = microtime(true);
maybe_maintain_map_cache();
// Jedna linia do dziennika crona (OVH zapisuje wyjście skryptu).
echo '[' . date('Y-m-d H:i:s') . '] Sprzątanie cache: zakończone w ' . round(microtime(true) - $started, 1) . " s.\n";
