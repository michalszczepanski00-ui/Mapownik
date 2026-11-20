<?php
declare(strict_types=1);

/**
 * 19.41.4-b (audyt Z1, RODO): nazwa inwestora jest pokazywana tylko wtedy, gdy wygląda na podmiot
 * (spółka, gmina, instytucja…). Imiona i nazwiska osób fizycznych zastępuje „osoba fizyczna”.
 * Aby pokazywać wszystkie nazwy (po decyzji prawnej), zmień na true.
 */
const PERMITS_SHOW_PERSON_NAMES = false;
// Całe słowa po normalizacji (małe litery, znaki inne niż litery/cyfry → spacja): „Sp. z o.o.” → „sp z o o”.
const PERMITS_ENTITY_WORDS = ['sa', 's a', 'sc', 's c', 'sp', 'z o o', 'zoo', 'phu', 'p h u', 'fhu', 'f h u', 'pphu', 'gmbh', 'ltd', 'inc', 'llc',
    'kg', 'bv', 'b v', 'se', 'pkp', 'gddkia', 'pse', 'pge', 'enea', 'energa', 'tauron', 'orlen', 'pgnig', 'bank', 'solar', 'energy', 'wind',
    'development', 'developer', 'deweloper', 'invest', 'inwest', 'holding', 'grupa', 'firma', 'centrum', 'ośrodek', 'osrodek', 'akademia',
    'szkoła', 'szkola', 'przedszkole', 'kościół', 'kosciol', 'lasy', 'skarb', 'straż', 'straz', 'operator', 'estate', 'property', 'projekt',
    'construction', 'polska', 'polskie', 'miasto', 'miasta', 'gmina', 'gminy', 'powiat', 'powiatu', 'wody', 'gaz', 'kurii', 'kuria'];
// Przedrostki słów (lewa granica słowa): „województwa”, „spółdzielnia mieszkaniowa”, „Urząd Miejski”…
const PERMITS_ENTITY_PREFIXES = ['województw', 'wojewodztw', 'starostw', 'przedsiębiorstw', 'przedsiebiorstw', 'budowlan', 'państwow', 'panstwow',
    'spółk', 'spolk', 'spółdziel', 'spoldziel', 'wspólnot', 'wspolnot', 'zakład', 'zaklad', 'nadleśnictw', 'nadlesnictw', 'uniwersytet', 'politechnik',
    'szpital', 'instytut', 'fundacj', 'stowarzysz', 'parafi', 'diecezj', 'agencj', 'dyrekcj', 'urząd', 'urzęd', 'urzad', 'urzed', 'zarząd', 'zarzad',
    'zgromadz', 'towarzystw', 'klasztor', 'inwestycj', 'nieruchomo', 'energety', 'ciepłown', 'cieplown', 'wodociąg', 'wodociag', 'kanalizac',
    'komunaln', 'powiatow', 'usług', 'uslug', 'handl', 'produkc', 'transport', 'logisty', 'consult', 'servic', 'serwis', 'hurtown'];

function permits_public_investor(mixed $value): ?string {
    $name = trim((string)($value ?? ''));
    if ($name === '') return null;
    if (PERMITS_SHOW_PERSON_NAMES) return $name;
    $norm = ' ' . trim(preg_replace('/[^\p{L}\p{N}]+/u', ' ', mb_strtolower($name, 'UTF-8')) ?? '') . ' ';
    foreach (PERMITS_ENTITY_WORDS as $word) if (str_contains($norm, ' ' . $word . ' ')) return $name;
    foreach (PERMITS_ENTITY_PREFIXES as $prefix) if (str_contains($norm, ' ' . $prefix)) return $name;
    return 'osoba fizyczna (dane ukryte)';
}
