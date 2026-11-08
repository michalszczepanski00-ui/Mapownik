<?php
declare(strict_types=1);
// 18.18.3 — testy rozpoznawania obiektów w odpowiedziach GetFeatureInfo.
// Uruchom: php tools/test_identify_parse.php   (kod wyjścia 0 = wszystko OK)
require __DIR__ . '/../api/_identify_parse.php';

$cases = [
    // [opis, treść, INFO_FORMAT, Content-Type, oczekiwany stan, fragment tekstu|null]
    ['GeoServer HTML — pusty punkt (przyczyna fałszywego „Tak" dla Natura 2000)',
        "<html>\n  <head>\n    <title>Geoserver GetFeatureInfo output</title>\n  </head>\n  <style type=\"text/css\">\n\ttable.featureInfo { border: 1px solid #ccc }\n  </style>\n  <body>\n  </body>\n</html>",
        'text/html', 'text/html;charset=utf-8', 'empty', null],
    ['GeoServer HTML — obiekt Natura 2000',
        "<html><head><title>Geoserver GetFeatureInfo output</title></head><body><table class=\"featureInfo\"><caption class=\"featureInfo\">SpecjalneObszaryOchrony</caption><tr><th>fid</th><th>kod</th><th>nazwa</th></tr><tr><td>SpecjalneObszaryOchrony.12</td><td>PLH220033</td><td>Dolna Wisła</td></tr></table></body></html>",
        'text/html', 'text/html', 'found', 'PLH220033'],
    ['GeoServer JSON — pusty punkt',
        '{"type":"FeatureCollection","features":[],"totalFeatures":"unknown","numberReturned":0,"crs":null}',
        'application/json', 'application/json', 'empty', null],
    ['GeoServer JSON — obiekt',
        '{"type":"FeatureCollection","features":[{"type":"Feature","id":"SpecjalneObszaryOchrony.12","geometry":null,"properties":{"kod":"PLH220033","nazwa":"Dolna Wisła","the_geom":null}}]}',
        'application/json', 'application/json', 'found', 'nazwa: Dolna Wisła'],
    ['GeoServer GML2 — pusty punkt',
        '<?xml version="1.0" encoding="UTF-8"?><wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs" xmlns:gml="http://www.opengis.net/gml"><gml:boundedBy><gml:null>unknown</gml:null></gml:boundedBy></wfs:FeatureCollection>',
        'application/vnd.ogc.gml', 'application/vnd.ogc.gml', 'empty', null],
    ['GeoServer GML2 — obiekt',
        '<?xml version="1.0" encoding="UTF-8"?><wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs" xmlns:gml="http://www.opengis.net/gml" xmlns:GDOS="http://gdos"><gml:featureMember><GDOS:ObszarySpecjalnejOchrony fid="OSO.3"><GDOS:the_geom><gml:MultiPolygon><gml:coordinates>1,1</gml:coordinates></gml:MultiPolygon></GDOS:the_geom><GDOS:kod>PLB220004</GDOS:kod><GDOS:nazwa>Dolina Dolnej Wisły</GDOS:nazwa></GDOS:ObszarySpecjalnejOchrony></gml:featureMember></wfs:FeatureCollection>',
        'application/vnd.ogc.gml', 'application/vnd.ogc.gml', 'found', 'kod: PLB220004'],
    ['GeoServer text/plain — pusty punkt', "no features were found\n", 'text/plain', 'text/plain', 'empty', null],
    ['MapServer text/plain — pusty punkt', "GetFeatureInfo results:\n\nLayer 'przewod_gazowy'\n", 'text/plain', 'text/plain', 'empty', null],
    ['MapServer text/plain — obiekt', "GetFeatureInfo results:\n\nLayer 'przewod_gazowy'\n  Feature 12: \n  rodzaj = 'gazowy'\n  srednica = '110'\n", 'text/plain', 'text/plain', 'found', "rodzaj = 'gazowy'"],
    ['MapServer GML — pusty punkt', '<?xml version="1.0" encoding="UTF-8"?><msGMLOutput xmlns:gml="http://www.opengis.net/gml"></msGMLOutput>', 'application/vnd.ogc.gml', 'text/xml', 'empty', null],
    ['MapServer GML — obiekt', '<?xml version="1.0" encoding="UTF-8"?><msGMLOutput xmlns:gml="http://www.opengis.net/gml"><przewod_gazowy_layer><przewod_gazowy_feature><gml:boundedBy><gml:Box><gml:coordinates>1,1 2,2</gml:coordinates></gml:Box></gml:boundedBy><rodzaj>gazowy</rodzaj></przewod_gazowy_feature></przewod_gazowy_layer></msGMLOutput>', 'application/vnd.ogc.gml', 'text/xml', 'found', 'rodzaj: gazowy'],
    ['ArcGIS XML — pusty punkt', '<?xml version="1.0" encoding="UTF-8"?><FeatureInfoResponse xmlns:esri_wms="http://www.esri.com/wms" xmlns="http://www.esri.com/wms"></FeatureInfoResponse>', 'text/xml', 'text/xml', 'empty', null],
    ['ArcGIS XML — obiekt', '<?xml version="1.0" encoding="UTF-8"?><FeatureInfoResponse xmlns="http://www.esri.com/wms"><FIELDS OBJECTID="5" NAZWA="Złoże Bełchatów" STAN="E"></FIELDS></FeatureInfoResponse>', 'text/xml', 'text/xml', 'found', 'NAZWA: Złoże Bełchatów'],
    ['ArcGIS HTML — sam nagłówek kolekcji', "<html><head><title>Info</title></head><body><h5>FeatureInfoCollection - layer name: '0'</h5></body></html>", 'text/html', 'text/html', 'empty', null],
    ['HTML — tabela z nagłówkami bez wierszy', '<html><body><table><tr><th>kod</th><th>nazwa</th></tr></table></body></html>', 'text/html', 'text/html', 'empty', null],
    ['Wyjątek usługi (nieobsługiwany format)', '<?xml version="1.0"?><ServiceExceptionReport version="1.1.1"><ServiceException code="InvalidFormat">Unsupported INFO_FORMAT</ServiceException></ServiceExceptionReport>', 'application/json', 'application/vnd.ogc.se_xml', 'invalid', null],
    ['GeoMedia (integracja EGiB) — pola Attribute Name, bez kodu QR (19.8.5)',
        '<?xml version="1.0"?><FeatureCollection xmlns="http://www.intergraph.com/geomedia/gml" xmlns:gml="http://www.opengis.net/gml"><gml:featureMember><Layer Name="integracja"><Attribute Name="Numer działki">60/18</Attribute><Attribute Name="Oznaczenie użytku">R</Attribute><Attribute Name="Oznaczenie konturu">IIIa</Attribute><Attribute Name="Kod QR"><![CDATA[<img src="https://example/QR_gen?x=1"/>]]></Attribute></Layer></gml:featureMember></FeatureCollection>',
        'text/xml', 'text/xml', 'found', "Oznaczenie użytku: R\nOznaczenie konturu: IIIa"],
    ['Oracle MapViewer (MPZP Warszawa) — puste ROWSET, nie rozstrzyga (19.8.6)',
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<GetFeatureInfo_Result>\n  <ROWSET name=\"MPZP_PRZEZNACZENIE_TERENU\" >\n  </ROWSET>\n</GetFeatureInfo_Result>",
        'text/xml', 'text/html', 'empty', null],
    ['Oracle MapViewer (MPZP Warszawa) — przeznaczenie terenu (19.8.6)',
        '<?xml version="1.0" encoding="UTF-8"?><GetFeatureInfo_Result><ROWSET name="MPZP_PRZEZNACZENIE_TERENU" ><ROW num="1"><INTEN_ZAB> </INTEN_ZAB><MAX_WYS> </MAX_WYS><FUN_NAZWA>droga zbiorcza</FUN_NAZWA><FUN_SYMB>1.KDZ</FUN_SYMB></ROW></ROWSET></GetFeatureInfo_Result>',
        'text/xml', 'text/html', 'found', "Przeznaczenie: droga zbiorcza\nSymbol przeznaczenia: 1.KDZ"],
    ['Obraz PNG zamiast informacji (Rejestr Urbanistyczny, INFO_FORMAT GML) — inny format (19.8.6)',
        "\x89PNG\r\n\x1a\n\0\0\0\rIHDR", 'application/vnd.ogc.gml', 'image/png', 'invalid', null],
    ['Rejestr Urbanistyczny JSON — strefa POG bez identyfikatora i pustych pól (19.8.6)',
        '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"Identyfikator":"PL.ZIPPZP.10037_326201-POG_1POG-798SW","Oznaczenie":"798SW","Tytuł alternatywny":"-","Maksymalna wysokość zabudowy":"38 m"}}]}',
        'application/json', 'application/json', 'found', "Oznaczenie: 798SW\nMaksymalna wysokość zabudowy: 38 m"],
    ['Wartość z HTML — bez znaczników', '{"type":"FeatureCollection","features":[{"properties":{"opis":"<b>Strefa</b> &amp; <img src=\\"x\\"/>SW"}}]}', 'application/json', 'application/json', 'found', 'opis: Strefa & SW'],
    ['Plan ogólny (GML Geoportalu) — bez identyfikatorów INSPIRE, polskie nazwy, jednostka',
        '<?xml version="1.0"?><wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs" xmlns:gml="http://www.opengis.net/gml" xmlns:app="http://app"><gml:featureMember><app:StrefaPlanistyczna><app:identifier>https://www.gov.pl/x/1POG-234SJ</app:identifier><app:lokalnyId>1POG-234SJ</app:lokalnyId><app:oznaczenie>234SJ</app:oznaczenie><app:maksWysokoscZabudowy>10</app:maksWysokoscZabudowy><app:maksWysokoscZabudowy_uom>m</app:maksWysokoscZabudowy_uom></app:StrefaPlanistyczna></gml:featureMember></wfs:FeatureCollection>',
        'application/vnd.ogc.gml', 'text/xml', 'found', "Oznaczenie: 234SJ\nMaks. wysokość zabudowy: 10 m"],
    ['JSON bez listy obiektów', '{"error":"x"}', 'application/json', 'application/json', 'invalid', null],
    ['HTML „brak danych"', '<html><body><p>Brak danych dla wskazanego punktu</p></body></html>', 'text/html', 'text/html', 'empty', null],
];

$fail = 0;
foreach ($cases as [$label, $body, $fmt, $ct, $expect, $needle]) {
    $r = identify_analyze($body, $fmt, $ct);
    $ok = $r['state'] === $expect && ($needle === null || str_contains((string)$r['text'], $needle));
    if (!$ok) $fail++;
    printf("%s  %s → %s%s\n", $ok ? 'OK  ' : 'BŁĄD', $label, $r['state'], $ok ? '' : ' (oczekiwano ' . $expect . ($needle ? ', tekst z „' . $needle . '"' : '') . '; tekst: ' . json_encode($r['text'], JSON_UNESCAPED_UNICODE) . ')');
}
printf("\n%d/%d przypadków poprawnych\n", count($cases) - $fail, count($cases));
exit($fail === 0 ? 0 : 1);
