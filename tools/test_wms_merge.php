<?php
declare(strict_types=1);
// 19.8.6 — test scalania obrazów planów ogólnych (GUGiK + Rejestr Urbanistyczny).
// Uruchom: php tools/test_wms_merge.php   (kod wyjścia 0 = wszystko OK)
require __DIR__ . '/../api/_common.php';

function test_png(int $size, ?array $rect, array $rgba, bool $palette = false): string {
    $img = imagecreatetruecolor($size, $size);
    imagealphablending($img, false);
    imagesavealpha($img, true);
    imagefill($img, 0, 0, imagecolorallocatealpha($img, 0, 0, 0, 127));
    if ($rect) imagefilledrectangle($img, $rect[0], $rect[1], $rect[2], $rect[3], imagecolorallocatealpha($img, ...$rgba));
    if ($palette) imagetruecolortopalette($img, false, 16);
    ob_start();
    imagepng($img);
    imagedestroy($img);
    return (string)ob_get_clean();
}

function pixel(string $png, int $x, int $y): array {
    $img = imagecreatefromstring($png);
    $c = imagecolorsforindex($img, imagecolorat($img, $x, $y));
    imagedestroy($img);
    return [$c['red'], $c['green'], $c['blue'], $c['alpha']];
}

$fail = 0;
$check = static function (string $label, bool $ok) use (&$fail): void {
    echo ($ok ? 'OK    ' : 'BŁĄD  ') . $label . PHP_EOL;
    if (!$ok) $fail++;
};

// GUGiK rysuje lewą połowę (czerwień), RU — cały kafel (zieleń, półprzezroczysta).
$gugik = test_png(512, [0, 0, 255, 511], [200, 0, 0, 40]);
$ru = test_png(512, [0, 0, 511, 511], [0, 150, 0, 60], true);
$merged = wms_merge_fill([$gugik, $ru]);
$check('wynik jest obrazem PNG', is_string($merged) && str_starts_with($merged, "\x89PNG"));
$check('piksel GUGiK zostaje (pierwsze źródło ma pierwszeństwo)', pixel($merged, 10, 10) === [200, 0, 0, 40]);
$check('pusty piksel GUGiK uzupełniony z RU (także z obrazu z paletą)', pixel($merged, 400, 10)[1] === 150 && pixel($merged, 400, 10)[3] < 127);
$empty = test_png(512, null, [0, 0, 0, 127]);
$check('oba puste → przezroczysty', pixel(wms_merge_fill([$empty, $empty]), 300, 300)[3] === 127);
$check('nieczytelny drugi obraz pomijany', pixel(wms_merge_fill([$gugik, 'to nie jest PNG']), 10, 10) === [200, 0, 0, 40]);
$check('inna wielkość drugiego obrazu pomijana', pixel(wms_merge_fill([$gugik, test_png(256, [0, 0, 255, 255], [0, 150, 0, 0])]), 400, 10)[3] === 127);

foreach ([512, 1024] as $size) {
    $a = test_png($size, [0, 0, intdiv($size, 2), $size - 1], [200, 0, 0, 40]);
    $b = test_png($size, [0, 0, $size - 1, $size - 1], [0, 150, 0, 60]);
    $t = microtime(true);
    wms_merge_fill([$a, $b]);
    $ms = (int)round((microtime(true) - $t) * 1000);
    echo "      czas scalania {$size}×{$size}: {$ms} ms" . PHP_EOL;
}

echo PHP_EOL . ($fail ? "$fail błędów" : 'wszystkie testy poprawne') . PHP_EOL;
exit($fail ? 1 : 0);
