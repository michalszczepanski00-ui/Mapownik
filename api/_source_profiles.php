<?php
declare(strict_types=1);
function mapownik_source_profiles(): array {
    static $profiles = null;
    if ($profiles !== null) return $profiles;
    $data = json_decode((string)file_get_contents(__DIR__ . '/../data/source-profiles.json'), true, 64, JSON_THROW_ON_ERROR);
    if (!is_array($data['sources'] ?? null)) throw new RuntimeException('Brak rejestru źródeł.');
    $profiles = [];
    foreach ($data['sources'] as $key => $value) {
        $profiles[$key] = array_diff_key($value, array_flip(['title','layer_id','group','description','min_zoom','max_zoom','opacity','z_index','provider','provider_url','identify','transport','client_transport','single_image','client_timeout_ms','projection','verified_at','hidden','hidden_reason']));
    }
    return $profiles;
}
function mapownik_profile_identify_sources(): array {
    $result = [];
    foreach (mapownik_source_profiles() as $key => $value) {
        if (in_array($key, ['glebowa_coverage','nmt_hypsometry'], true)) continue;
        $value['query_layers'] = $value['layers'];
        $result[$key] = $value;
    }
    return $result;
}
