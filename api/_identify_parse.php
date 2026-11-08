<?php
declare(strict_types=1);

/*
 * 18.18.3 — rozpoznawanie, czy odpowiedź GetFeatureInfo zawiera obiekt.
 *
 * Do 18.18.2 wynik „jest obiekt" brał się z tego, że w odpowiedzi HTML po
 * zdjęciu znaczników został jakikolwiek tekst. GeoServer (np. GDOŚ — Natura
 * 2000, formy ochrony przyrody) także dla pustego punktu zwraca stronę
 * z <title>Geoserver GetFeatureInfo output</title>; tytuł zostawał jako tekst
 * i każdy punkt dostawał „Tak / W obszarze".
 *
 * Teraz o obecności decyduje liczba obiektów w formacie strukturalnym
 * (JSON, GML, XML ArcGIS). HTML i tekst są tylko rezerwą dla usług, które nie
 * podają formatu strukturalnego, z ostrzejszymi regułami (sam nagłówek, pusta
 * tabela albo pusta treść = brak obiektu).
 *
 * Wynik: ['state' => 'found'|'empty'|'invalid', 'text' => string|null, 'count' => int|null, 'basis' => string]
 *   basis: json | gml | xml (pusty wynik rozstrzyga), mapviewer | html | text (pusty wynik nie rozstrzyga)
 *   found   — co najmniej jeden obiekt,
 *   empty   — poprawna odpowiedź bez obiektów,
 *   invalid — wyjątek usługi / nieobsługiwany format / nieczytelna treść (spróbuj innego formatu).
 */

const IDENTIFY_STRUCTURED_FORMATS = ['application/json', 'application/vnd.ogc.gml', 'text/xml'];
const IDENTIFY_TEXT_FORMATS = ['text/html', 'text/plain'];

/** Pola techniczne, których nie pokazujemy w opisie obiektu. */
function identify_skip_field(string $name): bool {
    $n = strtolower($name);
    // 19.8.5: pola integracji EGiB, które w panelu były surowym HTML (kod QR, link do raportu)
    // albo długą formułką prawną.
    // 19.8.5: techniczne identyfikatory planów ogólnych (INSPIRE) — były pierwszą linią opisu.
    // 19.8.6: „Identyfikator” — to samo pole w odpowiedziach Rejestru Urbanistycznego.
    if (in_array($n, ['identifier', 'identyfikator', 'przestrzennazw', 'lokalnyid', 'wersjaid', 'poczatekwersjiobiektu', 'koniecwersjiobiektu', 'modyfikacja'], true)) return true;
    if (in_array($n, ['kod qr', 'informacje dodatkowe o działce', 'informacje o pochodzeniu danych', 'data publikacji danych'], true)) return true;
    if (in_array($n, ['the_geom', 'geom', 'geometry', 'shape', 'boundedby', 'msgeometry', 'objectid', 'fid', 'gml_id', 'shape.area', 'shape.len', 'shape_area', 'shape_length', 'shape.starea()', 'shape.stlength()', 'coordinates', 'poslist', 'pos', 'x', 'y', 'lowercorner', 'uppercorner'], true)) return true;
    return false;
}

function identify_limit_text(string $text): string {
    $text = trim($text);
    if (function_exists('mb_strlen') && function_exists('mb_substr')) {
        if (mb_strlen($text, 'UTF-8') > 1800) $text = mb_substr($text, 0, 1797, 'UTF-8') . '…';
    } elseif (strlen($text) > 1800) {
        $text = substr($text, 0, 1797) . '...';
    }
    return $text;
}

function identify_is_exception(string $body): bool {
    return preg_match('/ServiceException|ExceptionReport|ows:Exception|InvalidFormat|InvalidParameterValue|LayerNotDefined|LayerNotQueryable|not supported|nie jest obs/i', $body) === 1;
}

/** 19.8.5: czytelne nazwy pól planów ogólnych (Geoportal / Rejestr Urbanistyczny). */
const IDENTIFY_FIELD_LABELS = [
    'tytul' => 'Tytuł', 'oznaczenie' => 'Oznaczenie',
    'obowiazujeod' => 'Obowiązuje od', 'obowiazujedo' => 'Obowiązuje do', 'lacze' => 'Uchwała (dziennik urzędowy)',
    'maksnadziemnaintensywnosczabudowy' => 'Maks. intensywność zabudowy',
    'maksudzialpowierzchnizabudowy' => 'Maks. udział powierzchni zabudowy (%)',
    'makswysokosczabudowy' => 'Maks. wysokość zabudowy',
    'minudzialpowierzchnibiologicznieczynnej' => 'Min. udział pow. biologicznie czynnej (%)',
    // 19.8.6: MPZP z Oracle MapViewer (np. Warszawa).
    'fun_symb' => 'Symbol przeznaczenia', 'fun_nazwa' => 'Przeznaczenie',
    'inten_zab' => 'Intensywność zabudowy', 'max_wys' => 'Maks. wysokość zabudowy',
];

/** @param array<int,array<string,mixed>> $rows */
function identify_rows_text(array $rows): string {
    $blocks = [];
    foreach (array_slice($rows, 0, 10) as $row) {
        $lines = [];
        foreach ($row as $key => $value) {
            if (identify_skip_field((string)$key)) continue;
            if (is_array($value) || is_object($value)) continue;
            $value = identify_plain_value((string)$value);
            // 19.8.6: „-” = pole puste w Rejestrze Urbanistycznym („Tytuł alternatywny: -”).
            if ($value === '' || $value === '-' || strtolower($value) === 'null') continue;
            if (str_ends_with((string)$key, '_uom')) continue;
            $unit = trim((string)($row[$key . '_uom'] ?? ''));
            $label = IDENTIFY_FIELD_LABELS[strtolower((string)$key)] ?? $key;
            $lines[] = $label . ': ' . $value . ($unit !== '' && !is_array($row[$key . '_uom']) ? ' ' . $unit : '');
        }
        if ($lines) $blocks[] = implode("\n", $lines);
    }
    return identify_limit_text(implode("\n\n", $blocks));
}

/** 19.8.5: wartość pola bez znaczników HTML (obrazki, linki) i encji. */
function identify_plain_value(string $value): string {
    if (str_contains($value, '<')) {
        $value = preg_replace('/<(?:img|script|style)\b[^>]*>(?:.*?<\/(?:script|style)>)?/is', ' ', $value) ?? '';
        $value = strip_tags($value);
    }
    if (str_contains($value, '&')) $value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return trim(preg_replace('/\s+/u', ' ', $value) ?? '');
}

function identify_parse_json(string $body): array {
    $data = json_decode($body, true);
    if (!is_array($data)) return ['state' => 'invalid', 'text' => null, 'count' => null, 'basis' => 'json'];
    if (isset($data['features']) && is_array($data['features'])) {
        $rows = [];
        foreach ($data['features'] as $feature) {
            if (!is_array($feature)) continue;
            $props = $feature['properties'] ?? $feature['attributes'] ?? [];
            $rows[] = is_array($props) ? $props : [];
        }
        $count = count($data['features']);
        if ($count === 0) return ['state' => 'empty', 'text' => null, 'count' => 0, 'basis' => 'json'];
        $text = identify_rows_text($rows);
        return ['state' => 'found', 'text' => $text !== '' ? $text : 'Obiekt bez opisu atrybutów.', 'count' => $count, 'basis' => 'json'];
    }
    return ['state' => 'invalid', 'text' => null, 'count' => null, 'basis' => 'json'];
}

function identify_parse_xml(string $body): array {
    if (identify_is_exception($body)) return ['state' => 'invalid', 'text' => null, 'count' => null, 'basis' => 'xml'];
    $prev = libxml_use_internal_errors(true);
    $doc = new DOMDocument();
    $ok = $doc->loadXML($body, LIBXML_NONET | LIBXML_NOCDATA | LIBXML_COMPACT);
    libxml_clear_errors();
    libxml_use_internal_errors($prev);
    if (!$ok || !$doc->documentElement) return ['state' => 'invalid', 'text' => null, 'count' => null, 'basis' => 'xml'];
    $root = $doc->documentElement;
    $rootName = $root->localName;
    $rows = [];

    // ArcGIS: <FeatureInfoResponse><FIELDS a="…" b="…"/></FeatureInfoResponse>
    // (także <FeatureInfoCollection><FeatureInfo><Field><FieldName/><FieldValue/></Field>…)
    if (in_array($rootName, ['FeatureInfoResponse', 'FeatureInfoCollection'], true)) {
        foreach ($doc->getElementsByTagName('FIELDS') as $fields) {
            $row = [];
            foreach ($fields->attributes as $attr) $row[$attr->name] = $attr->value;
            $rows[] = $row;
        }
        foreach ($doc->getElementsByTagName('FeatureInfo') as $info) {
            $row = [];
            foreach ($info->getElementsByTagName('Field') as $field) {
                $name = $field->getElementsByTagName('FieldName')->item(0)?->textContent;
                $value = $field->getElementsByTagName('FieldValue')->item(0)?->textContent;
                if ($name !== null) $row[$name] = (string)$value;
            }
            $rows[] = $row;
        }
        return identify_rows_result($rows, 'xml');
    }

    // GML (GeoServer, deegree): FeatureCollection z featureMember / featureMembers / member.
    if (in_array($rootName, ['FeatureCollection', 'GetFeatureInfoResponse'], true)) {
        foreach ($root->childNodes as $child) {
            if (!$child instanceof DOMElement) continue;
            $name = $child->localName;
            if ($name === 'featureMember' || $name === 'member') {
                foreach ($child->childNodes as $feature) if ($feature instanceof DOMElement) $rows[] = identify_element_row($feature);
            } elseif ($name === 'featureMembers') {
                foreach ($child->childNodes as $feature) if ($feature instanceof DOMElement) $rows[] = identify_element_row($feature);
            } elseif ($name === 'Layer' || $name === 'layer') {
                foreach ($child->getElementsByTagName('*') as $feature) {
                    if ($feature->localName === 'Feature' || $feature->localName === 'feature') $rows[] = identify_element_row($feature);
                }
            }
        }
        return identify_rows_result($rows, 'gml');
    }

    // 19.8.6 — Oracle MapViewer (krajowa integracja MPZP dla części gmin, m.in. Warszawa):
    // <GetFeatureInfo_Result><ROWSET name="…"><ROW num="1"><FUN_SYMB>1.KDZ</FUN_SYMB>…
    // Do 19.8.5 ten format był „nieczytelny” dla każdego INFO_FORMAT, więc identyfikacja
    // kończyła się błędem 502. Pusta odpowiedź ma podstawę „mapviewer”, a nie „xml”: kaskada
    // GUGiK zwraca puste ROWSET także wtedy, gdy serwer gminy nie zdążył odpowiedzieć, więc
    // brak wierszy nie rozstrzyga o braku planu (identify.php sprawdza wtedy rysunek planu).
    if ($rootName === 'GetFeatureInfo_Result') {
        foreach ($doc->getElementsByTagName('ROW') as $rowElement) {
            $row = identify_element_row($rowElement);
            unset($row['num']);
            $rows[] = $row;
        }
        return identify_rows_result($rows, 'mapviewer');
    }

    // MapServer: <msGMLOutput><nazwa_layer><nazwa_feature>…</nazwa_feature></nazwa_layer></msGMLOutput>
    if ($rootName === 'msGMLOutput') {
        foreach ($root->childNodes as $layer) {
            if (!$layer instanceof DOMElement) continue;
            foreach ($layer->childNodes as $feature) {
                if ($feature instanceof DOMElement && str_ends_with($feature->localName, '_feature')) $rows[] = identify_element_row($feature);
            }
        }
        return identify_rows_result($rows, 'gml');
    }

    return ['state' => 'invalid', 'text' => null, 'count' => null, 'basis' => 'xml'];
}

/** Wartości liściowych elementów obiektu (bez geometrii). */
function identify_element_row(DOMElement $feature): array {
    $row = [];
    // GeoMedia (np. krajowa integracja EGiB): <Layer Name="integracja"><Attribute Name="Numer działki">…
    // — nazwa warstwy nie jest atrybutem obiektu, a nazwa pola siedzi w atrybucie Name.
    // Do 19.8.4 wszystkie pola nadpisywały jedno „Attribute” (zostawał ostatni: kod QR).
    $geoMedia = $feature->localName === 'Layer' && $feature->hasAttribute('Name');
    foreach ($feature->attributes ?? [] as $attr) {
        if ($geoMedia && $attr->name === 'Name') continue;
        if (!identify_skip_field($attr->name) && !str_contains($attr->name, 'id')) $row[$attr->name] = $attr->value;
    }
    foreach ($feature->childNodes as $child) {
        if (!$child instanceof DOMElement) continue;
        $field = $child->localName === 'Attribute' && $child->hasAttribute('Name') ? $child->getAttribute('Name') : $child->localName;
        if (identify_skip_field($field)) continue;
        $hasElementChild = false;
        foreach ($child->childNodes as $grand) if ($grand instanceof DOMElement) { $hasElementChild = true; break; }
        if ($hasElementChild) continue; // geometria albo struktura zagnieżdżona
        $row[$field] = trim($child->textContent);
    }
    return $row;
}

function identify_rows_result(array $rows, string $basis): array {
    $count = count($rows);
    if ($count === 0) return ['state' => 'empty', 'text' => null, 'count' => 0, 'basis' => $basis];
    $text = identify_rows_text($rows);
    return ['state' => 'found', 'text' => $text !== '' ? $text : 'Obiekt bez opisu atrybutów.', 'count' => $count, 'basis' => $basis];
}

function identify_html_to_text(string $body): string {
    $body = preg_replace('~<head\b[^>]*>.*?</head>~is', ' ', $body) ?? $body;
    $body = preg_replace('~<(script|style|title|caption)\b[^>]*>.*?</\1>~is', ' ', $body) ?? $body;
    $body = preg_replace('~<(?:br|/tr|/p|/div|/li|/h[1-6])\b[^>]*>~i', "\n", $body) ?? $body;
    $body = preg_replace('~</td\s*>~i', ' · ', $body) ?? $body;
    $text = html_entity_decode(strip_tags($body), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace('/[ \t\x{00A0}]+/u', ' ', $text) ?? $text;
    $text = preg_replace('/\h*\R\h*/u', "\n", $text) ?? $text;
    $text = preg_replace('/\n{3,}/u', "\n\n", $text) ?? $text;
    return trim($text);
}

/** Zwroty, które w odpowiedziach tekstowych znaczą „brak obiektu". */
function identify_text_says_empty(string $text): bool {
    if ($text === '') return true;
    if (preg_match('/\b(brak wyniku|brak wyników|brak danych|brak obiekt\w*|nie znaleziono|no results?|no features?( were)? found|no features?|0 features?|search returned no results)\b/ui', $text) === 1) return true;
    // Same nagłówki bez treści: „GetFeatureInfo results:", „Layer 'x'", „FeatureInfoCollection - layer name: 0", „@0".
    $lines = array_filter(array_map('trim', preg_split('/\R/u', $text) ?: []), static fn($l) => $l !== '' && $l !== '·');
    $meaningful = array_filter($lines, static function (string $line): bool {
        if (preg_match('/^(geoserver\s+)?getfeatureinfo\b.*$/i', $line)) return false;
        if (preg_match('/^(layer|warstwa)\s*[\'"]?[^\'"]*[\'"]?\s*:?$/iu', $line)) return false;
        if (preg_match('/^featureinfocollection\b.*$/i', $line)) return false;
        if (preg_match('/^@\S+$/', $line)) return false;
        if (preg_match('/^[\s·:|-]+$/u', $line)) return false;
        return true;
    });
    return count($meaningful) === 0;
}

function identify_parse_html(string $body): array {
    if (identify_is_exception($body)) return ['state' => 'invalid', 'text' => null, 'count' => null, 'basis' => 'html'];
    // Tabela z nagłówkami, ale bez komórek danych = brak obiektu.
    if (preg_match('/<table\b/i', $body) && !preg_match('/<td\b/i', $body)) return ['state' => 'empty', 'text' => null, 'count' => 0, 'basis' => 'html'];
    $text = identify_html_to_text($body);
    if (identify_text_says_empty($text)) return ['state' => 'empty', 'text' => null, 'count' => 0, 'basis' => 'html'];
    return ['state' => 'found', 'text' => identify_limit_text($text), 'count' => null, 'basis' => 'html'];
}

function identify_parse_plain(string $body): array {
    if (identify_is_exception($body)) return ['state' => 'invalid', 'text' => null, 'count' => null, 'basis' => 'text'];
    $text = trim(preg_replace('/\R{3,}/u', "\n\n", $body) ?? $body);
    // MapServer: „GetFeatureInfo results:" + sekcje warstw; obiekty mają wiersze „Feature N:".
    if (preg_match('/GetFeatureInfo results/i', $text) && !preg_match('/^\s*Feature\s+\S+\s*:/mi', $text)) {
        return ['state' => 'empty', 'text' => null, 'count' => 0, 'basis' => 'text'];
    }
    if (identify_text_says_empty($text)) return ['state' => 'empty', 'text' => null, 'count' => 0, 'basis' => 'text'];
    return ['state' => 'found', 'text' => identify_limit_text($text), 'count' => null, 'basis' => 'text'];
}

/** Główne wejście: odpowiedź usługi w danym INFO_FORMAT → stan. */
function identify_analyze(string $body, string $infoFormat, string $contentType = ''): array {
    $trimmed = ltrim($body);
    if ($trimmed === '') return ['state' => 'invalid', 'text' => null, 'count' => null, 'basis' => 'none'];
    $ct = strtolower($contentType);
    // 19.8.6: obraz zamiast informacji (Rejestr Urbanistyczny odsyła PNG na INFO_FORMAT
    // application/vnd.ogc.gml) — to nieobsługiwany format, nie „brak obiektu”. Wcześniej
    // bajty PNG szły do parsera tekstu jako pusta odpowiedź i kończyły sprawdzanie źródła.
    if (str_starts_with($ct, 'image/') || str_starts_with($body, "\x89PNG") || str_starts_with($body, "\xFF\xD8\xFF") || str_starts_with($body, 'GIF8')) {
        return ['state' => 'invalid', 'text' => null, 'count' => null, 'basis' => 'image'];
    }
    // Usługa mogła zignorować INFO_FORMAT — decyduje faktyczna treść.
    if ($trimmed[0] === '{' || str_contains($ct, 'json')) return identify_parse_json($trimmed);
    if (str_starts_with($trimmed, '<?xml') || (str_contains($ct, 'xml') && !str_contains($ct, 'html'))) {
        if (preg_match('/<html\b/i', $trimmed)) return identify_parse_html($trimmed);
        return identify_parse_xml($trimmed);
    }
    if (preg_match('/^<(!doctype\s+html|html|body|table|div|h\d|p)\b/i', $trimmed) || str_contains($ct, 'html')) return identify_parse_html($trimmed);
    if ($trimmed[0] === '<') return identify_parse_xml($trimmed);
    return identify_parse_plain($trimmed);
}
