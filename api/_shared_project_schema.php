<?php
declare(strict_types=1);

/**
 * 19.41.4-b (audyt B3): serwer przyjmuje tylko strukturę pliku .mapownik (persistence/projectTransfer.js),
 * a zapisuje ją ponownie zakodowaną — bez nieznanych pól najwyższego poziomu. Wcześniej wystarczyły pola
 * „format” i „objects”, a reszta dowolnej treści była przechowywana i serwowana z domeny portalu.
 * Limity jak w kliencie (geometry/geometryLimits.js): 5000 obiektów, 20 000 wierzchołków na obiekt, 100 000 razem.
 */
const SHARED_PROJECT_TOP_KEYS = ['format', 'formatVersion', 'app', 'exportedAt', 'crs', 'project', 'state', 'objects'];
const SHARED_PROJECT_GEOMETRY_TYPES = ['Point', 'LineString', 'Polygon', 'MultiPolygon'];
const SHARED_PROJECT_MAX_STRING = 10000;
const SHARED_PROJECT_MAX_DEPTH = 24; // properties.features przechowuje dowolny JSON funkcji

final class SharedProjectInvalid extends RuntimeException {}

/** Sprawdza drzewo JSON: głębokość, długość tekstów, liczby skończone. */
function shared_project_check_tree(mixed $value, int $depth = 0): void {
    if ($depth > SHARED_PROJECT_MAX_DEPTH) throw new SharedProjectInvalid('zbyt głęboka struktura danych');
    if (is_string($value)) { if (mb_strlen($value, 'UTF-8') > SHARED_PROJECT_MAX_STRING) throw new SharedProjectInvalid('zbyt długi tekst'); return; }
    if (is_float($value) && !is_finite($value)) throw new SharedProjectInvalid('nieprawidłowa liczba');
    if (is_array($value) || is_object($value)) foreach ((array)$value as $k => $child) {
        if (is_string($k) && strlen($k) > 120) throw new SharedProjectInvalid('zbyt długa nazwa pola');
        shared_project_check_tree($child, $depth + 1);
    }
}

/** Liczy wierzchołki geometrii i sprawdza, że współrzędne to pary liczb. */
function shared_project_geometry_vertices(object $geometry): int {
    $type = $geometry->type ?? null;
    $coords = $geometry->coordinates ?? null;
    if (!is_string($type) || !in_array($type, SHARED_PROJECT_GEOMETRY_TYPES, true) || !is_array($coords)) throw new SharedProjectInvalid('nieobsługiwana geometria');
    $depth = ['Point' => 0, 'LineString' => 1, 'Polygon' => 2, 'MultiPolygon' => 3][$type];
    $count = 0;
    $walk = static function (array $node, int $level) use (&$walk, &$count, $depth): void {
        if ($level === $depth) {
            if (count($node) < 2 || count($node) > 4) throw new SharedProjectInvalid('nieprawidłowa współrzędna');
            foreach ($node as $n) if (!is_int($n) && !(is_float($n) && is_finite($n))) throw new SharedProjectInvalid('nieprawidłowa współrzędna');
            $count++;
            return;
        }
        foreach ($node as $child) { if (!is_array($child)) throw new SharedProjectInvalid('nieprawidłowa geometria'); $walk($child, $level + 1); }
    };
    $walk($coords, 0);
    if ($count > 20000) throw new SharedProjectInvalid('obiekt ma ponad 20 000 wierzchołków');
    return $count;
}

/** Zwraca znormalizowany JSON projektu albo rzuca SharedProjectInvalid. */
function shared_project_normalize(string $body): string {
    $doc = json_decode($body, false, 64);
    if (!is_object($doc)) throw new SharedProjectInvalid('to nie jest obiekt JSON');
    if (($doc->format ?? null) !== 'mapownik-project') throw new SharedProjectInvalid('brak formatu mapownik-project');
    $objects = $doc->objects ?? null;
    if (!is_array($objects)) throw new SharedProjectInvalid('brak listy obiektów');
    if (count($objects) > 5000) throw new SharedProjectInvalid('ponad 5000 obiektów');
    if (isset($doc->project) && !is_object($doc->project)) throw new SharedProjectInvalid('nieprawidłowy opis projektu');
    if (isset($doc->state) && !is_object($doc->state)) throw new SharedProjectInvalid('nieprawidłowy stan projektu');
    $total = 0;
    foreach ($objects as $object) {
        if (!is_object($object)) throw new SharedProjectInvalid('nieprawidłowy obiekt');
        if (!is_string($object->id ?? null) || ($object->id ?? '') === '' || strlen($object->id) > 240) throw new SharedProjectInvalid('obiekt bez identyfikatora');
        if (!is_object($object->geometry ?? null)) throw new SharedProjectInvalid('obiekt bez geometrii');
        $total += shared_project_geometry_vertices($object->geometry);
        if ($total > 100000) throw new SharedProjectInvalid('ponad 100 000 wierzchołków');
    }
    $clean = new stdClass();
    foreach (SHARED_PROJECT_TOP_KEYS as $key) if (property_exists($doc, $key)) $clean->{$key} = $doc->{$key};
    shared_project_check_tree($clean);
    $out = json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    if (!is_string($out)) throw new SharedProjectInvalid('nie można zapisać danych');
    return $out;
}
