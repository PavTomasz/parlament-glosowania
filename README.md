# Parlament — głosowania Sejmu i Senatu, v11

Aktualizacja istniejącego projektu GitHub + Vercel. Dodaje ekran wejściowy,
konta Supabase i obowiązkowe logowanie. Instrukcja dla właściciela strony:
[START-TUTAJ.txt](START-TUTAJ.txt).

## Nowa strona główna i Deficyt

Biały, czarny, czerwony i szary interfejs z sześcioma pozycjami menu.
Strona główna, logowanie i Deficyt obsługują PL/EN. Starsze ekrany i źródłowe
opisy parlamentarne pozostają po polsku. Kluby i Partie oraz Statystyki
są zapowiedziane w menu; ich moduły powstaną w następnym etapie.

`api/locale` odczytuje kraj z nagłówka Vercel. Polska: PL, inne kraje: EN,
brak kraju: PL. Ręczny wybór jest zapisywany i ma pierwszeństwo.
`api/budget` odczytuje najnowszy raport miesięczny MF i korzysta z datowanej
kopii, gdy źródło jest niedostępne. Nie symuluje licznika w czasie rzeczywistym.
Limit z ustawy dotyczy 2026 r.; po zmianie roku wymaga aktualizacji.

Chroniony `api/deficit` pobiera Eurostat `gov_10dd_edpt1`, S13, B9, A, PL:
PC_GDP i MIO_NAC, maksymalnie 30 ostatnich pełnych lat. Znak salda jest
odwracany: deficyt dodatni, nadwyżka ujemna. Kwoty to nominalne mld PLN.
W razie niedostępności używana jest zweryfikowana kopia z 11.09.2026.
Źródłowy JSON pod /lib/data także kierowany jest przez chroniony endpoint.

Zakres Eurostatu to cały sektor instytucji rządowych i samorządowych,
a miesięczny wskaźnik MF dotyczy wyłącznie budżetu państwa. Interfejs
wyraźnie rozróżnia te zakresy. Daty kadencji: API Sejmu. Daty premierów
i skróty koalicji: zestawienia Wikipedii wskazane przy wykresie.
Metadane polityczne obejmują lata do 2025; kolejne lata wymagają ich
uzupełnienia. Kolejne gabinety tego samego premiera są połączone.
Wyniki roczne nie są rozdzielane między rządy. Porównania kadencji
biorą pierwszy i ostatni pełny rok kalendarzowy wewnątrz kadencji,
a przy jednym pełnym roku nie wyliczają zmiany.

## Zachowanie kont

- Logowanie linkiem e-mail bez hasła; pierwsze potwierdzenie tworzy użytkownika.
- Google, Apple, Facebook, Microsoft, LinkedIn, X, GitHub i Discord pojawiają
  się po włączeniu i skonfigurowaniu dostawcy w Supabase.
- Po pierwszym logowaniu użytkownik wybiera rodzaj konta.
- Konto prywatne jest bezpłatne. Konto firmowe wymaga aktywnego planu
  z datą `paid_until` w przyszłości.
- Płatności i oferta firmowa nie są jeszcze wdrożone; konto firmowe pozostaje
  zablokowane. Nie ma checkoutu, pobierania opłat, monitoringu, alertów ani
  eksportów CSV/PDF. Potrzebna będzie osobna integracja rozliczeń.
- Wylogowanie usuwa widoczne rekordy i zamyka szczegóły. Odpowiedzi z poprzedniej
  sesji są odrzucane. Nie ma wejścia bez konta.

## Konfiguracja

1. W Supabase ustaw Site URL oraz Redirect URLs na adres produkcyjny strony.
2. Uruchom [supabase/setup.sql](supabase/setup.sql) w SQL Editor.
3. W Vercel dodaj `SUPABASE_URL` i `SUPABASE_PUBLISHABLE_KEY` dla Production.
4. Wgraj komplet plików, zachowując foldery, i wdroż nową wersję.
5. Przetestuj e-mail właściciela. Do publicznej wysyłki podłącz własny SMTP;
   domyślna poczta Supabase obsługuje tylko adresy zespołu projektu.

Kod przyjmuje nowy klucz `sb_publishable_...` lub istniejący legacy `anon`.
Klucze `sb_secret_...` i legacy `service_role` są odrzucane; nie są potrzebne.
Opcjonalny moduł AI nadal korzysta z serwerowych zmiennych `OPENAI_API_KEY`
i `OPENAI_MODEL`. Zmiana zmiennych Vercel wymaga nowego wdrożenia.

## Pliki

| Ścieżka | Rola |
| --- | --- |
| `index.html`, `style.css`, `login.css` | Widok aplikacji i landing |
| `auth-client.js` | Źródło obsługi logowania i sesji |
| `auth.js` | Gotowy, dołączony pakiet dla przeglądarki |
| `app.js` | Głosowania i profile, ładowane po sprawdzeniu dostępu |
| `api/auth-config.js` | Publiczna konfiguracja i włączeni dostawcy |
| `api/account.js` | Zweryfikowane konto oraz wybór jego typu |
| `lib/auth.js` | Serwerowa weryfikacja tożsamości i uprawnień |
| `api/sejm.js`, `api/senat.js`, `api/ai.js` | Chronione endpointy danych |
| `supabase/setup.sql` | Tabela kont, uprawnienia kolumn i reguły RLS |
| `tests/` | Testy serwera i interfejsu logowania |
| `vercel.json` | Nagłówki i konfiguracja istniejącego hostingu |

Vercel: statyczny frontend w katalogu głównym i funkcje w `/api`,
Framework Preset „Other”. Nie jest potrzebna migracja hostingu ani nowy projekt.
`auth.js` jest już skompilowany, więc ręczny upload nie wymaga budowania plików
na komputerze właściciela. Zachowaj dotychczasowy Root Directory projektu.

## Praca nad kodem

Na Node.js 24:

```sh
npm ci
npm test
npm run build:auth
```

Po zmianie `auth-client.js` ponownie wygeneruj i wgraj `auth.js`.
Do uruchomienia lokalnego backendu użyj Vercel CLI (`vercel dev`) z odpowiednimi
zmiennymi środowiskowymi. Lokalny adres wymaga osobnego wpisu Redirect URLs.
Samo otwarcie `index.html` z dysku nie uruchomi API ani logowania.

## Kontrola dostępu

Każdy chroniony request weryfikuje token przez Supabase `/auth/v1/user`
i odczytuje własny rekord konta przez Data API z tokenem użytkownika.
Metadane z przeglądarki nie nadają uprawnień. Odrzucane są tożsamości anonimowe
i adresy bez potwierdzenia. Odpowiedzi kont oraz danych nie są cache'owane
w przeglądarce ani wspólnej pamięci CDN.

RLS ogranicza odczyt i utworzenie rekordu do jego właściciela. Użytkownik może
wstawić jedynie `user_id` i `account_type`. Brak praw do aktualizacji chroni
status płatności, termin dostępu oraz typ już utworzonego konta. Integracja
rozliczeń musi aktualizować płatny dostęp po zweryfikowanym zdarzeniu
operatora płatności i obsługiwać odnowienia, anulowanie oraz zwroty.

Testy obejmują brak/odrzucenie tokena, konta prywatne i firmowe, próby nadania
sobie uprawnień, nieprawidłową konfigurację, wysyłkę linku, OAuth, wybór konta,
wylogowanie i odpowiedzi kończące się po zmianie sesji. Testy używają atrap
odpowiedzi Supabase i SDK. Nie zastępują testu dostarczania wiadomości,
zewnętrznych dostawców OAuth oraz zastosowania SQL w rzeczywistym projekcie.

## Dane parlamentarne

Dotychczasowe funkcje obejmują wyniki Sejmu i Senatu, indywidualne głosy,
profile posłów, statystyki, archiwum oraz opcjonalne zapytania AI.
Zakres historycznych informacji zależy od oficjalnych źródeł. Ta aktualizacja
dotyczy kont i logowania; nie potwierdza kompletności historycznych rekordów.

## Dokumentacja usług

- [Linki logowania e-mail](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Adresy przekierowań](https://supabase.com/docs/guides/auth/redirect-urls)
- [Klucze projektu](https://supabase.com/docs/guides/api/api-keys)
- [Konfiguracja poczty SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Dostawcy społecznościowi](https://supabase.com/docs/guides/auth/social-login)
- [Reguły RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Zmienne Vercel](https://vercel.com/docs/projects/environment-variables/managing-environment-variables)
