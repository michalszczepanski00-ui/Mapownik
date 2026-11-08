<?php
declare(strict_types=1);
function wms_semantic_issues(array $source, array $layers): array {
    $titles = [];
    foreach ($layers as $layer) $titles[(string)($layer['name'] ?? '')] = (string)($layer['title'] ?? '');
    $issues = [];
    foreach (($source['expected_titles'] ?? []) as $name => $phrase) {
        if (!isset($titles[$name])) continue;
        if (!preg_match('~' . preg_quote($phrase, '~') . '~iu', $titles[$name])) $issues[] = ['name'=>(string)$name,'expected'=>$phrase,'actual'=>$titles[$name]];
    }
    return $issues;
}
