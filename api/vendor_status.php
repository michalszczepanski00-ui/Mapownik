<?php
declare(strict_types=1);
require __DIR__ . '/_vendor_builder.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode(vendor_status_data(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
