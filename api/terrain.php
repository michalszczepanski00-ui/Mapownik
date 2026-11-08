<?php
declare(strict_types=1);
require __DIR__ . '/_common.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function terrain_fail(string $message, int $status = 400): never {
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
function terrain_ok(array $payload): never {
    echo json_encode(['ok' => true] + $payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
require __DIR__ . '/_terrain.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET' && (($_GET['action'] ?? '') === 'metadata')) {
    terrain_ok([
        'crs' => 'EPSG:2180',
        'model' => 'NMT',
        'source' => 'GUGiK NMT 1 m / GetHByPointList',
        'verticalDatum' => 'PL-KRON86-NH',
        'heightType' => 'wysokość normalna',
        'heightUnit' => 'm',
    ]);
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET' && (($_GET['action'] ?? '') === 'capabilities')) {
    terrain_ok([
        'crs' => 'EPSG:2180',
        'maxPoints' => 800,
        'recommendedAreaSamples' => 200,
        'maxAreaSamples' => 800,
        'areaSamplePresets' => [
            ['id' => 'fast', 'label' => 'Szybka', 'samples' => 50],
            ['id' => 'accurate', 'label' => 'Dokładna', 'samples' => 200],
            ['id' => 'veryAccurate', 'label' => 'Bardzo dokładna', 'samples' => 400],
            ['id' => 'dense', 'label' => 'Gęsta siatka', 'samples' => 800],
        ],
        'maxParcels' => 12,
        'batchSize' => 40,
        'verticalDatum' => 'PL-KRON86-NH',
    ]);
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') terrain_fail('Użyj POST.', 405);
$raw = (string)file_get_contents('php://input');
if (strlen($raw) > 120000) terrain_fail('Żądanie jest zbyt duże.', 413);
$data = json_decode($raw, true);
if (!is_array($data) || !is_array($data['points'] ?? null)) terrain_fail('Brak listy punktów.');
$rawPoints = $data['points'];
if (count($rawPoints) < 1 || count($rawPoints) > 800) terrain_fail('Analiza NMT może zawierać od 1 do 800 punktów.');
$points = [];
foreach ($rawPoints as $index => $point) {
    if (!is_array($point) || count($point) < 2 || !is_numeric($point[0]) || !is_numeric($point[1])) terrain_fail('Nieprawidłowy punkt #' . ($index + 1) . '.');
    $x = (float)$point[0]; $y = (float)$point[1];
    if (!is_finite($x) || !is_finite($y) || $x < -100000 || $x > 1100000 || $y < -100000 || $y > 1100000) terrain_fail('Punkt poza obsługiwanym zakresem EPSG:2180.');
    $points[] = [$x, $y];
}

$sampleIds = $data['sampleIds'] ?? array_keys($points);
if (!is_array($sampleIds) || count($sampleIds) !== count($points)) terrain_fail('Niezgodne identyfikatory próbek.');
foreach ($sampleIds as $id) if (!is_int($id) || $id < 0 || $id > 100000) terrain_fail('Nieprawidłowy identyfikator próbki.');
try {
    $heights = []; $statuses = []; $diagnostics = [];
    foreach (array_chunk($points, 40) as $batch) {
        $result = terrain_batch($batch);
        array_push($heights, ...$result['heights']);
        array_push($statuses, ...$result['statuses']);
        $diagnostics[] = $result['diagnostic'];
    }
    terrain_ok([
        'crs' => 'EPSG:2180',
        'model' => 'NMT',
        'source' => 'GUGiK NMT 1 m / GetHByPointList',
        'verticalDatum' => 'PL-KRON86-NH',
        'heightType' => 'wysokość normalna',
        'heightUnit' => 'm',
        'heights' => $heights,
        'sampleIds' => array_values($sampleIds),
        'statuses' => $statuses,
        'complete' => count(array_filter($statuses, static fn(string $s): bool => $s === 'ok')) === count($points),
        'diagnostics' => $diagnostics,
    ]);
} catch (Throwable $e) {
    terrain_fail('Nie udało się pobrać wysokości NMT: ' . $e->getMessage(), 502);
}
