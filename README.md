# Parlament — v11.4, Polska w liczbach

Nowy wygląd strony głównej i zbiorczy dział „Polska w liczbach”. Logowanie i konta są odłożone.
Strona nie wymaga konfiguracji Supabase. Instrukcja: START-TUTAJ.txt.

## Działanie

`home.js` otwiera głosowania, profile, archiwum i Polskę w liczbach bez sesji.
`data-client.js` pobiera dane bez tokenów, cookies i klienta tożsamości.
Endpointy Sejmu, Senatu, Deficytu i dotychczasowego modułu AI są publiczne.
AI nadal wymaga istniejącego serwerowego OPENAI_API_KEY; bez niego zwykłe
wyszukiwanie i wszystkie pozostałe funkcje działają.

Stare pliki auth.js i auth-client.js są nieaktywnymi modułami zgodności.
Nie są uruchamiane z index.html. api/account.js nie odczytuje ani nie zapisuje
kont, a api/auth-config.js informuje o wyłączeniu logowania. Pozostałe pliki
przygotowanej wcześniej integracji nie uczestniczą w działaniu tej wersji.
Cała paczka zastępuje również wcześniejsze pliki przy ręcznym przesłaniu.

## Dane i języki

PL/EN obejmuje stronę główną i Deficyt. Starsze widoki oraz źródłowe opisy
parlamentarne pozostają po polsku. Kluby i Partie oraz Statystyki są zapowiedziami.
Polska i nieznany kraj: język polski; pozostałe kraje: angielski. Ręczny wybór
ma pierwszeństwo i jest zapamiętywany w przeglądarce.

api/budget odczytuje miesięczny raport MF. Kopia jest datowana i używana przy
niedostępności źródła. Nie ma symulowanego licznika na żywo. Limit z ustawy na
2026 r. wymaga aktualizacji dla kolejnego roku.

`api/economy` udostępnia osiem porównywalnych serii rocznych: deficyt, inflację,
realny wzrost PKB, dług publiczny, bezrobocie, płacę minimalną oraz osobno ceny
energii i paliw. Pasek pod menu pokazuje siedem pozycji: energia i paliwa są
połączone w jednej pozycji, ale na podstronie mają oddzielne wykresy. Pokazuje ostatnią
dostępną wartość wraz z rokiem i prowadzi prosto do wybranego wykresu.
Pasek obsługuje przeciąganie, gest dotykowy i przyciski kierunkowe; systemowy
scrollbar jest ukryty. Kliknięcie wykresu wybiera najbliższy rok, a tradycyjny
wybór roku pod wykresem nadal działa.

Deficyt korzysta z Eurostatu gov_10dd_edpt1, S13, B9, A, PL: PC_GDP i MIO_NAC.
Pokazuje do 30 ostatnich pełnych lat (kopia: 1996–2025, sprawdzona 11.09.2026).
Deficyt ma znak dodatni, nadwyżka ujemny; mld PLN to kwoty nominalne.
Zakres sektora rządowego i samorządowego jest szerszy niż miesięczny budżet
państwa na stronie głównej. Interfejs wyjaśnia różnicę.

Daty kadencji pochodzą z API Sejmu; okresy urzędowania premierów i skróty
koalicji z podlinkowanych zestawień Wikipedii. Metadane polityczne obejmują
lata do 2025. Kolejne gabinety tego samego premiera są połączone. Wyniki
roczne nie są rozdzielane między rządy. Porównanie kadencji bierze pierwszy
i ostatni pełny rok kalendarzowy wewnątrz kadencji. Jeden pełny rok nie
wystarcza do obliczenia zmiany.

## Praca nad kodem

Istniejący GitHub + Vercel, Framework Preset Other. Pliki statyczne w katalogu
głównym, funkcje w api. Nie zmieniaj Root Directory ani hostingu.

Na Node.js 24: npm ci, następnie npm test.
Lokalny backend: vercel dev. Otwarcie index.html z dysku nie uruchamia API.
# Wersja 11.5 — poprawka otwierania „Polska w liczbach”

Wgraj **całą zawartość paczki** do głównego katalogu repozytorium. Nie wystarczy wymienić tylko `home.js`: podstrona potrzebuje także `economy.js`, `economy-view.js`, `data-client.js`, `deficit-model.js`, `api/economy.js` oraz `lib/data/economy.json`.
