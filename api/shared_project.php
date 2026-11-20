<?php
declare(strict_types=1);
require __DIR__ . '/_common.php';
require_once __DIR__ . '/_shared_project_schema.php';

/**
 * Udostępnianie projektu przez link.
 *
 * Kliknięcie „Udostępnij" w Eksporcie wysyła tu DOKŁADNIE ten sam tekst,
 * który normalnie trafia do pliku .mapownik (ta sama funkcja serializująca
 * po stronie klienta) — serwer nie wie nic więcej o formacie niż to, że to
 * JSON z kilkoma oczekiwanymi polami. Pełną walidację schematu i tak robi
 * klient przy wczytywaniu (`parseMSPortalProjectFile`), więc tu sprawdzamy
 * tylko tyle, żeby nie zapisać śmieci na dysku.
 *
 * Świadomie NIE jest to dokument współdzielony do wspólnej edycji: każde
 * „Udostępnij" tworzy NOWY, niezależny wpis pod nowym id. Otwarcie linku
 * wczytuje ten zapis jako osobny projekt lokalny — dalsza edycja u odbiorcy
 * nigdy nie dotyka oryginału. Brak logowania jest tu bez znaczenia dla
 * bezpieczeństwa zapisu: nie ma czego nadpisać, bo POST zawsze zakłada nowy
 * plik pod losowym id, nigdy nie nadpisuje istniejącego.
 *
 * Przechowywane w data/ (nie cache/) — to dane użytkownika, nie coś, co da
 * się odtworzyć z zapytania. Katalog data/ jest już zablokowany dla
 * bezpośredniego dostępu przez root .htaccess (`RewriteRule ^data/ - [R=404,L]`),
 * więc jedyna droga do treści to ten plik.
 *
 * Wygasanie jest „przesuwane": każde odczytanie linku odświeża jego datę, więc
 * aktywnie używane udostępnienia nie znikają, a zapomniane linki same się
 * sprzątają po SHARED_PROJECT_TTL bez użycia.
 */

const SHARED_PROJECT_MAX_BYTES = 8 * 1024 * 1024; // 8 MiB — hojnie jak na jeden projekt, celowo mniej niż limit importu 25 MB po stronie klienta
const SHARED_PROJECT_QUOTA_BYTES = 536870912; // 512 MiB across all links
const SHARED_PROJECT_QUOTA_FILES = 5000;
const SHARED_PROJECT_TTL = 90 * 86400; // 90 dni bez otwarcia
const SHARED_PROJECT_ID_RE = '/^(?:[0-9a-f]{10}|[0-9a-f]{32})$/';
const SHARED_PROJECT_SWEEP_CHANCE = 50; // 1 na 50 zapisów — częstotliwość wystarczająca przy tej skali ruchu

function shared_project_root(): string {
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'shared';
}

function shared_project_path(string $id): string {
    return shared_project_root() . DIRECTORY_SEPARATOR . substr($id, 0, 2) . DIRECTORY_SEPARATOR . $id . '.json';
}

/** Usuwa wpisy, których nikt nie otworzył od SHARED_PROJECT_TTL. Tania, losowa okazja zamiast crona. */
function shared_project_sweep(): void {
    $root = shared_project_root();
    if (!is_dir($root)) return;
    $now = time();
    foreach (glob($root . '/*/*.json') ?: [] as $file) {
        if (($now - (int)@filemtime($file)) > SHARED_PROJECT_TTL) {
            if (@unlink($file)) @unlink($file . '.owner');
        }
    }
}

function shared_project_reject(string $message, int $status = 400): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * 19.41.4-b (audyt B3): limit na adres (IPv6 — na sieć /64): 60 zapisów na godzinę i 64 MB na dobę.
 * Rekord to lista [czas, bajty]; dawny format (sama lista czasów) jest czytany jako 0 bajtów.
 */
const SHARED_PROJECT_DAILY_BYTES = 64 * 1024 * 1024;
function shared_project_client_key(): string {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'local');
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        $bin = @inet_pton($ip);
        if (is_string($bin) && strlen($bin) === 16) $ip = bin2hex(substr($bin, 0, 8)) . '::/64';
    }
    return $ip;
}
function shared_project_limit_writes(int $bytes): void {
    $dir = cache_root() . '/shared-rate';
    if (!ensure_dir($dir)) shared_project_reject('Nie można przygotować zapisu projektu.', 503);
    $file = $dir . '/' . hash('sha256', shared_project_client_key()) . '.json';
    $fh = @fopen($file, 'c+');
    if (!$fh) shared_project_reject('Nie można przygotować zapisu projektu.', 503);
    if (!flock($fh, LOCK_EX)) { fclose($fh); shared_project_reject('Nie można przygotować zapisu projektu.', 503); }
    $now = time();
    $stored = json_decode(stream_get_contents($fh) ?: '[]', true);
    $entries = [];
    foreach (is_array($stored) ? $stored : [] as $v) {
        if (is_numeric($v)) $entries[] = [(int)$v, 0];
        elseif (is_array($v) && isset($v[0], $v[1]) && is_numeric($v[0]) && is_numeric($v[1])) $entries[] = [(int)$v[0], (int)$v[1]];
    }
    $entries = array_values(array_filter($entries, static fn($e) => $e[0] > $now - 86400));
    $lastHour = count(array_filter($entries, static fn($e) => $e[0] > $now - 3600));
    $dayBytes = array_sum(array_column($entries, 1));
    if ($lastHour >= 60 || $dayBytes + $bytes > SHARED_PROJECT_DAILY_BYTES) {
        flock($fh, LOCK_UN); fclose($fh);
        shared_project_reject('Zbyt wiele udostępnionych projektów. Spróbuj ponownie później.', 429);
    }
    $entries[] = [$now, $bytes];
    ftruncate($fh, 0); rewind($fh);
    $ok = fwrite($fh, json_encode($entries)) !== false;
    fflush($fh); flock($fh, LOCK_UN); fclose($fh);
    if (!$ok) shared_project_reject('Nie można przygotować zapisu projektu.', 503);
}

/** Serialize quota checks with writes/deletions; lock is released on exit too. */
function shared_project_lock() {
    $root = shared_project_root();
    if (!ensure_dir($root)) shared_project_reject('Nie można przygotować udostępniania.', 503);
    $lock = @fopen($root . '/.write.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) shared_project_reject('Zapis projektu jest niedostępny.', 503);
    return $lock;
}
function shared_project_check_quota(int $incomingBytes): void {
    $bytes = 0; $count = 0;
    $directories = new DirectoryIterator(shared_project_root());
    foreach ($directories as $directory) {
        if ($directory->isDot() || !$directory->isDir() || $directory->isLink()) continue;
        foreach (new DirectoryIterator($directory->getPathname()) as $file) {
            if (!$file->isFile() || $file->isLink() || $file->getExtension() !== 'json') continue;
            $bytes += $file->getSize(); $count++;
            if ($bytes + $incomingBytes > SHARED_PROJECT_QUOTA_BYTES || $count >= SHARED_PROJECT_QUOTA_FILES) {
                shared_project_reject('Osiągnięto limit udostępnionych projektów. Usuń niepotrzebne linki lub skontaktuj się z administratorem.', 507);
            }
        }
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Owner secret travels only in a POST body; never in a public share URL.
if ($method === 'POST' && ($_GET['action'] ?? '') === 'revoke') {
    $body = file_get_contents('php://input', false, null, 0, 2049) ?: '';
    if (strlen($body) > 2048) shared_project_reject('Żądanie jest zbyt duże.', 413);
    $data = json_decode($body, true);
    $id = (string)($data['id'] ?? ''); $token = (string)($data['token'] ?? '');
    if (!preg_match(SHARED_PROJECT_ID_RE, $id) || !preg_match('/^[0-9a-f]{64}$/', $token)) shared_project_reject('Nieprawidłowy klucz usuwania.', 400);
    $lock = shared_project_lock();
    $file = shared_project_path($id);
    $hash = @file_get_contents($file . '.owner');
    if (!is_string($hash) || !hash_equals(trim($hash), hash('sha256', $token))) shared_project_reject('Brak uprawnienia do usunięcia tego linku lub link już nie istnieje.', 403);
    if (is_file($file) && !@unlink($file)) shared_project_reject('Nie udało się usunąć linku.', 503);
    @unlink($file . '.owner');
    flock($lock, LOCK_UN); fclose($lock);
    header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
    echo json_encode(['ok' => true]); exit;
}

// --------------------------------------------------------------- odczyt
if ($method === 'GET') {
    $id = (string)($_GET['id'] ?? '');
    if (!preg_match(SHARED_PROJECT_ID_RE, $id)) {
        shared_project_reject('Nieprawidłowy identyfikator linku.', 400);
    }
    $file = shared_project_path($id);
    if (!is_file($file) || (time() - (int)@filemtime($file)) > SHARED_PROJECT_TTL) {
        shared_project_reject('Link wygasł albo nigdy nie istniał.', 404);
    }
    @touch($file); // przesuwa wygaśnięcie — aktywnie otwierane linki nie znikają
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    readfile($file);
    exit;
}

// --------------------------------------------------------------- zapis
if ($method === 'POST') {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > SHARED_PROJECT_MAX_BYTES) {
        shared_project_reject('Projekt przekracza limit 8 MB dla linku udostępniania.', 413);
    }
    $body = file_get_contents('php://input', false, null, 0, SHARED_PROJECT_MAX_BYTES + 1) ?: '';
    if ($body === '') {
        shared_project_reject('Pusty projekt.', 400);
    }
    if (strlen($body) > SHARED_PROJECT_MAX_BYTES) {
        shared_project_reject('Projekt przekracza limit ' . (SHARED_PROJECT_MAX_BYTES / 1024 / 1024) . ' MB dla linku udostępniania.', 413);
    }
    try {
        $body = shared_project_normalize($body);
    } catch (SharedProjectInvalid $e) {
        shared_project_reject('To nie jest poprawny projekt MSPortalu (' . $e->getMessage() . ').', 422);
    } catch (ValueError | JsonException $e) {
        shared_project_reject('To nie jest poprawny projekt MSPortalu.', 422);
    }

    shared_project_limit_writes(strlen($body));
    $lock = shared_project_lock();
    if (random_int(1, SHARED_PROJECT_SWEEP_CHANCE) === 1) shared_project_sweep();
    shared_project_check_quota(strlen($body));

    do {
        $id = bin2hex(random_bytes(16));
    } while (is_file(shared_project_path($id)));

    $ownerToken = bin2hex(random_bytes(32));
    if (!atomic_write(shared_project_path($id) . '.owner', hash('sha256', $ownerToken))) shared_project_reject('Nie udało się zapisać klucza usuwania.', 500);
    if (!atomic_write(shared_project_path($id), $body)) {
        @unlink(shared_project_path($id) . '.owner');
        shared_project_reject('Nie udało się zapisać linku na serwerze.', 500);
    }

    flock($lock, LOCK_UN); fclose($lock);

    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['id' => $id, 'ownerToken' => $ownerToken], JSON_UNESCAPED_UNICODE);
    exit;
}

shared_project_reject('Nieobsługiwana metoda.', 405);
