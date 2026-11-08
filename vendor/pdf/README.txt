Mapownik 19.36.0 — biblioteki raportu działki PDF (ładowane dopiero po kliknięciu „Pobierz PDF”).

jspdf.umd.min.js      — jsPDF 4.2.1 (MIT, github.com/parallax/jsPDF), plik dist/jspdf.umd.min.js z npm
                        (zawiera fflate i fast-png; opcjonalne html2canvas/canvg/dompurify nie są używane).
Inter_400Regular.ttf  — Inter, krój regularny i pogrubiony (SIL Open Font License 1.1, Inter-LICENSE-OFL.txt),
Inter_700Bold.ttf       z pakietu @expo-google-fonts/inter 0.4.2. jsPDF osadza w PDF tylko użyte znaki.

Pliki są „immutable” (vendor/pdf/.htaccess) — nowa wersja biblioteki musi mieć nową nazwę pliku albo katalog.
