# Parlament — głosowania Sejmu i Senatu

Gotowy do wdrożenia serwis pokazujący wyniki głosowań polskiego parlamentu.

## Źródła danych

- Sejm RP: oficjalne API `https://api.sejm.gov.pl/`
- Senat RP: oficjalny serwis `https://www.senat.gov.pl/prace/posiedzenia/`

## Funkcje

- najnowsze głosowania Sejmu i Senatu,
- wyszukiwarka Sejmu,
- indywidualne głosy posłów,
- rozkład klubowy,
- profile posłów i frekwencja,
- opcjonalny moduł AI oparty na oficjalnych rekordach Sejmu,
- responsywny interfejs na telefon i komputer.

## Deployment

Najprostsza instrukcja znajduje się w `START-TUTAJ.txt`.

### Vercel

Projekt jest przygotowany jako statyczny frontend + funkcje serverless w katalogu `/api`.
Vercel wykryje je automatycznie po imporcie repozytorium.

### Zmienne środowiskowe (opcjonalne)

```text
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-luna
```

Bez tych zmiennych działa cały serwis oprócz przycisku „Zapytaj AI”.

## Architektura

```text
index.html       interfejs
style.css        wygląd
app.js           logika przeglądarki
api/sejm.js      proxy i logika oficjalnego API Sejmu
api/senat.js     parser oficjalnego serwisu Senatu
api/ai.js        opcjonalna warstwa AI
vercel.json      konfiguracja wdrożenia
```

## Bezpieczeństwo

Klucz OpenAI nigdy nie jest umieszczany w kodzie frontendowym. `OPENAI_API_KEY` powinien być zapisany wyłącznie jako Environment Variable w Vercel.
