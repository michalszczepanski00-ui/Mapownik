<?php
/**
 * 19.43.0 (audyt S3) — błędy JavaScript zgłaszane przez przeglądarki użytkowników (diagnostics/errorLog.js).
 *
 * POST api/client_errors.php  {type, message, stack, source, path, appVersion, userAgent}  → 204
 * Zapis: cache/client-errors/RRRR-MM-DD.jsonl (jeden wiersz JSON na błąd), 30 dni (sprzątanie crona).
 * Odczyt dla administratora: php tools/client_errors_report.php  (z wiersza poleceń, nie przez WWW).
 *
 * Ochrona: tylko POST z JSON do 8 KB, 30 zgłoszeń na godzinę na adres (IPv6: sieć /64), 5 MB na dobę łącznie.
 * Adres IP nie jest zapisywany (tylko skrót do limitu, w osobnym pliku). Pola przycinane, bez znaków sterujących.
 */
declare(strict_types=1);
require __DIR__ . '/_common.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const CLIENT_ERRORS_MAX_BODY = 8192;
const CLIENT_ERRORS_PER_HOUR = 30;
const CLIENT_ERRORS_DAILY_BYTES = 5 * 1024 * 1024;

function client_errors_done(int $status): never { http_response_code($status); exit; }

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') { header('Allow: POST'); client_errors_done(405); }
$raw = (string)file_get_contents('php://input', false, null, 0, CLIENT_ERRORS_MAX_BODY + 1);
if ($raw === '' || strlen($raw) > CLIENT_ERRORS_MAX_BODY) client_errors_done(413);
$data = json_decode($raw, true);
if (!is_array($data) || !is_string($data['message'] ?? null) || trim($data['message']) === '') client_errors_done(400);

$dir = cache_root() . '/client-errors';
if (!ensure_dir($dir)) client_errors_done(503);

// Limit na adres (skrót IP, okno godzinowe).
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'local');
if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) { $bin = @inet_pton($ip); if (is_string($bin) && strlen($bin) === 16) $ip = bin2hex(substr($bin, 0, 8)) . '::/64'; }
$rate = @fopen($dir . '/rate-' . substr(hash('sha256', $ip), 0, 24) . '.json', 'c+');
if ($rate !== false && flock($rate, LOCK_EX)) {
    $now = time();
    $list = json_decode((string)stream_get_contents($rate), true);
    $list = array_values(array_filter(is_array($list) ? $list : [], static fn($t) => is_int($t) && $now - $t < 3600));
    if (count($list) >= CLIENT_ERRORS_PER_HOUR) { flock($rate, LOCK_UN); fclose($rate); client_errors_done(429); }
    $list[] = $now;
    ftruncate($rate, 0); rewind($rate); fwrite($rate, json_encode($list));
    flock($rate, LOCK_UN); fclose($rate);
}

$clean = static function ($value, int $max): string {
    $text = is_scalar($value) ? (string)$value : '';
    $text = (string)preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', ' ', $text);
    return function_exists('mb_substr') ? mb_substr($text, 0, $max, 'UTF-8') : substr($text, 0, $max);
};
$record = [
    'at' => gmdate('c'),
    'type' => in_array($data['type'] ?? '', ['error', 'unhandledrejection', 'react'], true) ? $data['type'] : 'error',
    'message' => $clean($data['message'], 1000),
    'stack' => $clean($data['stack'] ?? '', 3000),
    'source' => $clean(preg_replace('/[?#].*$/', '', (string)($data['source'] ?? '')), 300),
    'path' => $clean(preg_replace('/[?#].*$/', '', (string)($data['path'] ?? '')), 200),
    'appVersion' => $clean($data['appVersion'] ?? '', 40),
    'userAgent' => $clean($data['userAgent'] ?? '', 300),
];
$line = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE) . "\n";
$file = $dir . '/' . gmdate('Y-m-d') . '.jsonl';
if ((int)@filesize($file) + strlen($line) > CLIENT_ERRORS_DAILY_BYTES) client_errors_done(507);
@file_put_contents($file, $line, FILE_APPEND | LOCK_EX);
client_errors_done(204);
