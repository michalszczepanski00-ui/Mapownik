# msportal 19.0.0 — start architektury VPS

- Rebranding interfejsu z Mapownik na msportal; nowy katalog zasobów `app-19.0.0` z odświeżeniem cache.
- Zachowanie zgodności z istniejącymi projektami `.mapownik` i funkcjonalnościami 18.18.4.
- Backend FastAPI pod reverse proxy `/vps/api/`.
- Baza SQLite/RTree i importer GeoParquet / GeoPackage w paczkach, minimalny RAM.
- Panel „RCN i BDOT10k”, zapytania na żądanie, tabela i nakładka wektorowa, eksport CSV, mediana RCN.
- Pliki konfiguracji systemd i Nginx, instalator dla Ubuntu 24.04, dokumentacja.

**Nie jest załączona baza BDOT10k ani RCN.** Stary moduł analiz BDOT10k jeszcze używa starego magazynu i nie czyta nowej bazy VPS. Patrz README_MSPORTAL_VPS.md.
