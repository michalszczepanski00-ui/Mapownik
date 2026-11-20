/**
 * 19.42.0 — zod bez kompilacji walidatorów do kodu (jitless).
 * Strona ma politykę CSP bez 'unsafe-eval'; zod w trybie domyślnym sprawdza wtedy `new Function("")`,
 * co przeglądarka zgłasza jako naruszenie CSP (walidacja i tak działała, tylko wolniejszą ścieżką).
 * Musi być importowany jako pierwszy moduł aplikacji (main.js), przed pierwszym użyciem schematu.
 */
import * as z from 'zod';

z.config({ jitless: true });
