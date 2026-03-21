<?php

return [
    'name' => env('APP_NAME', 'MyApp'),
    'env' => env('APP_ENV', 'local'),
    'debug' => (bool) env('APP_DEBUG', true),
    'url' => env('APP_URL', 'http://localhost'),
    'timezone' => 'UTC',
    'locale' => 'en',
    'fallback_locale' => 'en',
    'faker_locale' => 'en_US',
    'cipher' => 'AES-256-CBC',
    'key' => env('APP_KEY', 'base64:'.base64_encode(random_bytes(32))),
    'maintenance' => [
        'driver' => 'file',
    ],
];
