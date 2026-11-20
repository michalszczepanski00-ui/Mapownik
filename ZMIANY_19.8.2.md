# 19.8.2 — kompaktowy układ warstw, buforów i wysokości

- Grupy i warstwy: czcionka 12 px; grupy półgrube, warstwy zwykłe również po włączeniu. Nagłówki grup około 28 px; wiersze warstw około 30 px, długie nazwy do dwóch linii.
- Trójstanowe checkboxy grup zastępują Włącz / Wyłącz. Rozwijanie jest niezależne od widoczności. Zachowano zbiorczy zestaw sieci KIUT.
- Z panelu Warstwy usunięto skrót do zdjęć i podkładów oraz zestawy Grunt / Uzbrojenie / Planowanie / Ograniczenia.
- Podczas buforowania i we właściwościach gotowych buforów usunięto blok skrótów Bufor / Analizuj otoczenie / Wysokości / Odległości itd. W zwykłych obiektach skróty pozostają dostępne.
- Analiza wysokości: krótka instrukcja, zwijane ustawienia obszaru po otrzymaniu wyniku, sześć statystyk w jednym rzędzie na komputerze.
- Przezroczystość, próbki i poziomice pod Opcjami wyświetlania; źródło i siatka pod Dane i próbkowanie; porównanie działek jest zwijane.
- Zachowano zwijane szczegóły nachyleń oraz wykopów i nasypów, krótką legendę i odczyt wysokości.
- Eksport PNG / PDF w jednej stopce. Domyślna wysokość analizy obszaru w doku i osobnym oknie: 260 px. Ręczna zmiana wymiarów pozostaje dostępna. Profil liniowy zachowuje dotychczasowy układ i domyślny rozmiar.
- Na dotyku większe obszary kliknięcia; na wąskim ekranie statystyki w trzech kolumnach.
- Nowy katalog app-19.8.2 i parametry wersji zapobiegają użyciu starych plików z pamięci przeglądarki.

## Weryfikacja

- Kontrola składni JavaScript, lokalnych importów, skryptów HTML i spójności wersji.
- Przeglądarka 1280 × 720: trzy stany checkboxa grupy; tworzenie bufora; analiza prostokąta i dwóch obszarów; zwijanie ustawień, opcje wyświetlania i porównanie działek.
- Wyniki wysokości podczas kontroli układu pochodziły z osobnego lokalnego serwera danych testowych. Serwer ani dane testowe nie są częścią wydania. Nie potwierdzano dostępności produkcyjnej usługi NMT.
- PHP nie jest zainstalowane lokalnie; w plikach PHP zmieniono wyłącznie oznaczenia wersji.
