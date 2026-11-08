<?php
declare(strict_types=1);

function orthophoto_time($value): ?string {
    if (!is_string($value) || !preg_match('/^(199[5-9]|20\d{2})-(0[1-9]|1[0-2])-01$/D', $value)) return null;
    return $value;
}

function orthophoto_months(string $xml): array {
    if (!preg_match('/<(?:\w+:)?Dimension\b[^>]*\bname=["\']time["\'][^>]*>(.*?)<\/(?:\w+:)?Dimension>/si', $xml, $m)) return [];
    $text = trim(strip_tags($m[1]));
    if (!preg_match('/(\d{4}-\d{2})-\d{2}[^\/]*\/(\d{4}-\d{2})-\d{2}[^\/]*\/P1M/', $text, $range)) return [];
    $start = DateTimeImmutable::createFromFormat('!Y-m-d', $range[1] . '-01');
    $end = DateTimeImmutable::createFromFormat('!Y-m-d', $range[2] . '-01');
    if (!$start || !$end || $end < $start) return [];
    $months = [];
    for ($date = $start; $date <= $end && count($months) < 1500; $date = $date->modify('+1 month')) $months[] = $date->format('Y-m');
    return $months;
}

/** GUGiK text/plain is a semicolon table preceded by @Raster. No HTML is returned to the client. */
function orthophoto_records(string $text): array {
    $text = preg_replace('/^\s*@Raster\s*/i', '', $text) ?? $text;
    $parts = array_map('trim', explode(';', $text));
    $keys = []; $offset = 0;
    foreach ($parts as $part) {
        if (!preg_match('/^[a-z_][a-z0-9_]*$/i', $part)) break;
        $keys[] = strtolower($part); $offset++;
    }
    if (!in_array('aktualnosc', $keys, true) || count($keys) > 100) return [];
    $records = []; $seen = [];
    for ($i = $offset; $i + count($keys) <= count($parts) && count($records) < 50; $i += count($keys)) {
        $row = array_combine($keys, array_slice($parts, $i, count($keys)));
        $date = DateTimeImmutable::createFromFormat('!d.m.Y', (string)($row['aktualnosc'] ?? ''));
        $dateErrors = DateTimeImmutable::getLastErrors();
        if (!$date || ($dateErrors && ($dateErrors['warning_count'] || $dateErrors['error_count']))) continue;
        $resolution = (float)str_replace(',', '.', (string)($row['rozdz'] ?? '0'));
        $name = substr((string)($row['name'] ?? ''), 0, 80);
        $key = $date->format('Y-m-d') . ':' . $resolution . ':' . $name;
        if (isset($seen[$key])) continue; $seen[$key] = true;
        $records[] = ['date' => $date->format('Y-m-d'), 'resolution' => $resolution > 0 ? $resolution : null,
            'name' => $name, 'colour' => substr((string)($row['kolor'] ?? ''), 0, 20)];
    }
    usort($records, static fn($a, $b) => strcmp($b['date'], $a['date']));
    return $records;
}

/** Verified live GUGiK range on 2026-10-03. Used only when capabilities are unavailable. */
function orthophoto_verified_months(): array {
    return orthophoto_months('<Dimension name="time">1995-01-01/2025-11-01/P1M</Dimension>');
}
