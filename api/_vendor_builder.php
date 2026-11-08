<?php
declare(strict_types=1);
require_once __DIR__ . '/_common.php';

// Dependency stack identifier, intentionally independent of the MSPortal app version.
const MAPOWNIK_VENDOR_RELEASE = 'vendor-react19.2.8-ol10.10.0-lucide1.47.0-v3';

function vendor_static_dir(): string {
    return dirname(__DIR__) . '/vendor/static';
}

function vendor_manifest_file(): string {
    return vendor_static_dir() . '/manifest.json';
}

function vendor_specs(): array {
    return [
        'react' => ['kind' => 'esm', 'url' => 'https://esm.sh/react@19.2.8?standalone&target=es2022', 'file' => 'react.js', 'min' => 500],
        'react-jsx-runtime' => ['kind' => 'esm', 'url' => 'https://esm.sh/react@19.2.8/jsx-runtime?standalone&target=es2022', 'file' => 'react-jsx-runtime.js', 'min' => 500],
        'react-dom' => ['kind' => 'esm', 'url' => 'https://esm.sh/react-dom@19.2.8?standalone&target=es2022&deps=react@19.2.8', 'file' => 'react-dom.js', 'min' => 1000],
        'react-dom-client' => ['kind' => 'esm', 'url' => 'https://esm.sh/react-dom@19.2.8/client?standalone&target=es2022&deps=react@19.2.8', 'file' => 'react-dom-client.js', 'min' => 1000],
        'radix-dropdown' => ['kind' => 'esm', 'url' => 'https://esm.sh/@radix-ui/react-dropdown-menu@2.1.16?standalone&target=es2022&deps=react@19.2.8,react-dom@19.2.8', 'file' => 'radix-dropdown.js', 'min' => 1000],
        'radix-tooltip' => ['kind' => 'esm', 'url' => 'https://esm.sh/@radix-ui/react-tooltip@1.2.8?standalone&target=es2022&deps=react@19.2.8,react-dom@19.2.8', 'file' => 'radix-tooltip.js', 'min' => 1000],
        'proj4' => ['kind' => 'esm', 'url' => 'https://esm.sh/proj4@2.22.0?standalone&target=es2022', 'file' => 'proj4.js', 'min' => 10000],
        'zod' => ['kind' => 'esm', 'url' => 'https://esm.sh/zod@4.6.5?standalone&target=es2022', 'file' => 'zod.js', 'min' => 5000],
        'lucide-react' => ['kind' => 'esm', 'url' => 'https://esm.sh/lucide-react@1.47.0?standalone&target=es2022&deps=react@19.2.8&exports=Activity,Blend,Building2,ChartSpline,Check,ChevronDown,ChevronRight,Circle,CircleDashed,CircleDot,Crosshair,Download,Eye,EyeOff,FileJson,FolderKanban,GripVertical,Hand,Home,ImageDown,Info,LandPlot,LassoSelect,Layers3,ListTree,LoaderCircle,LocateFixed,Magnet,Map,MapPin,Minus,Moon,Mountain,MousePointer2,MoveHorizontal,MoveUpRight,Palette,Pentagon,Pin,Plus,RectangleHorizontal,Redo2,RefreshCw,Road,RotateCcw,RotateCw,Route,Rows3,Ruler,ScanSearch,Search,Shapes,Signpost,SquareDashedMousePointer,Star,Sun,Tag,Trash2,Truck,Type,Undo2,Upload,Waypoints,X,ZoomIn', 'file' => 'lucide-react.js', 'min' => 6000],
        'openlayers-js' => ['kind' => 'raw', 'url' => 'https://cdn.jsdelivr.net/npm/ol@10.10.0/dist/ol.js', 'file' => 'openlayers.js', 'min' => 50000, 'accept' => 'application/javascript,text/javascript,*/*;q=0.8'],
        'openlayers-css' => ['kind' => 'raw', 'url' => 'https://cdn.jsdelivr.net/npm/ol@10.10.0/ol.css', 'file' => 'openlayers.css', 'min' => 1000, 'accept' => 'text/css,*/*;q=0.8'],
    ];
}

function vendor_manifest_data(): ?array {
    $file = vendor_manifest_file();
    if (!is_file($file)) return null;
    $data = json_decode((string)@file_get_contents($file), true);
    if (!is_array($data) || !is_array($data['files'] ?? null)) return null;
    $release = (string)($data['release'] ?? '');
    if ($release !== MAPOWNIK_VENDOR_RELEASE) return null;
    return $data;
}

function vendor_manifest_entry(array $spec): ?array {
    $manifest = vendor_manifest_data();
    if (!$manifest) return null;
    foreach ($manifest['files'] as $entry) {
        if (is_array($entry) && ($entry['file'] ?? null) === $spec['file']) return $entry;
    }
    return null;
}

function vendor_file_is_valid(array $spec): bool {
    $file = vendor_static_dir() . '/' . $spec['file'];
    if (!is_file($file) || (int)@filesize($file) < (int)$spec['min']) return false;
    $entry = vendor_manifest_entry($spec);
    $expected = is_array($entry) ? strtolower((string)($entry['sha256'] ?? '')) : '';
    if (!preg_match('/^[a-f0-9]{64}$/', $expected)) return false;
    $actual = @hash_file('sha256', $file);
    return is_string($actual) && hash_equals($expected, strtolower($actual));
}

function vendor_status_data(): array {
    $files = [];
    $ready = true;
    $manifestReady = vendor_manifest_data() !== null;
    foreach (vendor_specs() as $key => $spec) {
        $path = vendor_static_dir() . '/' . $spec['file'];
        $entry = vendor_manifest_entry($spec);
        $ok = vendor_file_is_valid($spec);
        $ready = $ready && $ok;
        $files[$key] = [
            'ok' => $ok,
            'file' => $spec['file'],
            'bytes' => is_file($path) ? (int)@filesize($path) : 0,
            'sha256_expected' => is_array($entry) ? ($entry['sha256'] ?? null) : null,
            'integrity' => $ok ? 'verified' : ($manifestReady ? 'mismatch-or-missing' : 'manifest-missing-or-release-mismatch'),
        ];
    }
    return ['ready' => $ready, 'release' => MAPOWNIK_VENDOR_RELEASE, 'manifest' => $manifestReady, 'files' => $files];
}

function esm_absolute(string $specifier, string $baseUrl): string {
    if (str_starts_with($specifier, 'https://')) return $specifier;
    if (str_starts_with($specifier, '/')) return 'https://esm.sh' . $specifier;
    if (str_starts_with($specifier, './') || str_starts_with($specifier, '../')) {
        $base = parse_url($baseUrl);
        $path = (string)($base['path'] ?? '/');
        $dir = preg_replace('~/[^/]*$~', '/', $path) ?: '/';
        $parts = [];
        foreach (explode('/', $dir . $specifier) as $part) {
            if ($part === '' || $part === '.') continue;
            if ($part === '..') { array_pop($parts); continue; }
            $parts[] = $part;
        }
        return 'https://esm.sh/' . implode('/', $parts);
    }
    return $specifier;
}

function follow_esm_entry_for_setup(string $url): array {
    $current = $url;
    for ($i = 0; $i < 5; $i++) {
        [$status, $body, $type, $error] = vendor_remote_get($current, 'application/javascript,text/javascript,*/*;q=0.8');
        if ($status < 200 || $status >= 300 || $body === '') return [false, '', $current, "HTTP $status $error"];
        if (strlen($body) < 20000 && preg_match('~export\s*(?:\*|\{[^}]*\})\s*from\s*["\']([^"\']+)["\']~s', $body, $m)) {
            $next = esm_absolute($m[1], $current);
            if (str_starts_with($next, 'https://esm.sh/')) {
                $current = $next;
                continue;
            }
        }
        return [true, $body, $current, ''];
    }
    return [false, '', $current, 'Zbyt wiele przekierowań esm.sh'];
}

function vendor_peer_specifier(string $specifier): ?string {
    $s = $specifier;
    if (str_starts_with($s, 'https://esm.sh')) {
        $p = parse_url($s);
        $s = (string)($p['path'] ?? '');
    }
    if (preg_match('~^/react@[^/]+(?:/.*)?$~', $s) && str_contains($s, 'jsx-runtime')) return 'react/jsx-runtime';
    if (preg_match('~^/react@[^/]+(?:/.*)?$~', $s)) return 'react';
    if (preg_match('~^/react-dom@[^/]+(?:/.*client.*)?$~', $s) && str_contains($s, 'client')) return 'react-dom/client';
    if (preg_match('~^/react-dom@[^/]+(?:/.*)?$~', $s)) return 'react-dom';
    if (in_array($s, ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'], true)) return $s;
    return null;
}

function rewrite_vendor_for_static(string $body, string $resolvedUrl): array {
    $patterns = [
        '~(\bfrom\s*)(["\'])([^"\']+)\2~',
        '~(\bimport\s*\(\s*)(["\'])([^"\']+)\2(\s*\))~',
        '~(\bimport\s*)(["\'])([^"\']+)\2~',
    ];
    foreach ($patterns as $pattern) {
        $body = preg_replace_callback($pattern, function(array $m): string {
            $peer = vendor_peer_specifier($m[3]);
            if ($peer === null) return $m[0];
            if (isset($m[4])) return $m[1] . $m[2] . $peer . $m[2] . $m[4];
            return $m[1] . $m[2] . $peer . $m[2];
        }, $body) ?? $body;
    }

    $specifiers = [];
    foreach ($patterns as $pattern) {
        if (preg_match_all($pattern, $body, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $m) $specifiers[] = $m[3];
        }
    }
    $unexpected = [];
    foreach (array_unique($specifiers) as $s) {
        if (in_array($s, ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'], true)) continue;
        if (str_starts_with($s, 'data:') || str_starts_with($s, 'blob:')) continue;
        $unexpected[] = $s;
    }
    if ($unexpected !== []) {
        return [false, $body, 'Pozostałe importy: ' . implode(', ', array_slice($unexpected, 0, 8))];
    }
    return [true, "/* MSPortal 19.0.0 static vendor | source: {$resolvedUrl} */\n" . $body, ''];
}

function build_one_vendor(string $key, array $spec, bool $refresh = false): array {
    $dir = vendor_static_dir();
    ensure_dir($dir);
    $target = $dir . '/' . $spec['file'];
    if (!$refresh && vendor_file_is_valid($spec)) {
        return ['ok' => true, 'mode' => 'existing', 'file' => $spec['file'], 'bytes' => (int)filesize($target)];
    }

    if ($spec['kind'] === 'raw') {
        [$status, $body, $type, $error] = vendor_remote_get($spec['url'], $spec['accept'] ?? '*/*');
        if ($status < 200 || $status >= 300 || strlen($body) < (int)$spec['min']) {
            if (vendor_file_is_valid($spec)) return ['ok' => true, 'mode' => 'stale-kept', 'file' => $spec['file'], 'error' => "HTTP $status $error"];
            return ['ok' => false, 'file' => $spec['file'], 'error' => "HTTP $status $error"];
        }
        $final = $body;
    } else {
        [$ok, $body, $resolved, $error] = follow_esm_entry_for_setup($spec['url']);
        if (!$ok) {
            if (vendor_file_is_valid($spec)) return ['ok' => true, 'mode' => 'stale-kept', 'file' => $spec['file'], 'error' => $error];
            return ['ok' => false, 'file' => $spec['file'], 'error' => $error];
        }
        [$valid, $final, $validationError] = rewrite_vendor_for_static($body, $resolved);
        if (!$valid || strlen($final) < (int)$spec['min']) {
            if (vendor_file_is_valid($spec)) return ['ok' => true, 'mode' => 'stale-kept', 'file' => $spec['file'], 'error' => $validationError];
            return ['ok' => false, 'file' => $spec['file'], 'error' => $validationError ?: 'Bundle zbyt mały'];
        }
    }

    if (!atomic_write($target, $final)) {
        if (vendor_file_is_valid($spec)) return ['ok' => true, 'mode' => 'stale-kept', 'file' => $spec['file'], 'error' => 'Nie udało się nadpisać pliku'];
        return ['ok' => false, 'file' => $spec['file'], 'error' => 'Nie udało się zapisać pliku'];
    }
    if (!is_file($target) || (int)@filesize($target) < (int)$spec['min']) {
        @unlink($target);
        return ['ok' => false, 'file' => $spec['file'], 'error' => 'Zapisany bundle jest zbyt mały lub nieczytelny'];
    }
    return ['ok' => true, 'mode' => 'downloaded', 'file' => $spec['file'], 'bytes' => strlen($final), 'sha256' => hash_file('sha256', $target)];
}

function build_all_vendors(bool $refresh = false): array {
    $results = [];
    $ok = true;
    foreach (vendor_specs() as $key => $spec) {
        $result = build_one_vendor($key, $spec, $refresh);
        $results[$key] = $result;
        $ok = $ok && ($result['ok'] ?? false);
    }
    if ($ok) {
        $manifest = [
            'release' => MAPOWNIK_VENDOR_RELEASE,
            'preparedAt' => gmdate('c'),
            'files' => [],
        ];
        foreach (vendor_specs() as $key => $spec) {
            $path = vendor_static_dir() . '/' . $spec['file'];
            $manifest['files'][$key] = [
                'file' => $spec['file'],
                'bytes' => (int)filesize($path),
                'sha256' => hash_file('sha256', $path),
            ];
        }
        atomic_write(vendor_manifest_file(), json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }
    return ['ok' => $ok, 'results' => $results, 'status' => vendor_status_data()];
}
