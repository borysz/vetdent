# VetDent – állatorvosi fogászati kezelési lap

Tabletre tervezett, előfizetéses webalkalmazás kutyák és macskák fogászati kezelési lapjának vezetéséhez. A teljes igény a [`referencia/PROJEKT_PROMPT.md`](referencia/PROJEKT_PROMPT.md) fájlban, a nyitott kérdések a [`referencia/TISZTAZANDO_KERDESEK.md`](referencia/TISZTAZANDO_KERDESEK.md) fájlban vannak. A „VetDent” munkanév.

## Állapot

| Fázis | Tartalom | Állapot |
|---|---|---|
| 1 | Alapozás: projektváz, megjelenés, nyelvi réteg, PWA-jegyzék, tesztkeret, fogkatalógus | ✅ kész |
| 2 | Felhasználók és szervezetek (Supabase Auth) | ⏳ következik – Supabase-projekt kell hozzá |
| 3 | Jogosultságok és napló | – |
| 4 | Előfizetés (Stripe) és számlázás (Számlázz.hu) | – |
| 5 | Offline alapréteg | – |
| 6 | Törzsadatok: gazdik, páciensek | – |
| 7 | Kezelési lap váza | – |
| 8 | Odontogram | – |
| 9 | Csatolmányok, sablonok, diktálás | – |
| 10 | Gazdi-PDF és e-mail | – |
| 11 | Lezárás: tesztek, adatexport, biztonsági átnézés | – |

Az 1. fázisból az adatbázis-migrációk és a típusgenerálás átkerült a 2. fázisba, mert felhős Supabase-projekt nélkül nem ellenőrizhetők (lásd [`docs/DONTESEK.md`](docs/DONTESEK.md)).

## Futtatás helyben

Előfeltétel: Node.js 24 LTS és Git.

```bash
npm install
```

```bash
npm run dev
```

Ezután az alkalmazás a <http://localhost:3000> címen érhető el.

## Parancsok

| Parancs | Mit csinál |
|---|---|
| `npm run dev` | Fejlesztői szerver |
| `npm run build` | Éles build |
| `npm run start` | Az éles build futtatása |
| `npm run lint` | Kódellenőrzés (ESLint) |
| `npm run typecheck` | Típusellenőrzés (TypeScript, strict) |
| `npm run test` | Egységtesztek (Vitest) |
| `npm run check` | Lint + típusellenőrzés + tesztek egyben |

## Felépítés

| Hely | Tartalom |
|---|---|
| `src/app/` | Oldalak, elrendezés, webalkalmazás-jegyzék |
| `src/components/` | Felületi komponensek |
| `src/domain/` | Szakmai logika felülettől függetlenül (pl. fogkatalógus) |
| `src/i18n/`, `messages/` | Nyelvi réteg; minden felületi szöveg a `messages/hu.json`-ból jön |
| `src/lib/` | Közös segédmodulok (pl. környezeti változók ellenőrzése) |
| `docs/` | Döntések, ötletek, szakmai ellenőrzésre váró adatok |
| `referencia/` | A projektindító prompt és a kérdéslista |

## Szabályok

- A teljes forráskód TypeScript, strict módban.
- Felületi szöveg nem kerül a kódba, csak fordítási kulcs.
- Titok, ár, keret és belépési adat nem kerül a forráskódba; a beállítások mintája a `.env.example`.
- A Next.js ebben a verzióban több ponton eltér a korábbiaktól – kódírás előtt a `node_modules/next/dist/docs/` alatti dokumentáció az irányadó (lásd `AGENTS.md`).

## Következő lépések (2. fázishoz)

1. Supabase-fiók és egy fejlesztői projekt létrehozása **EU-régióban** (pl. Frankfurt). A létrehozáskor megadott adatbázisjelszót érdemes jelszókezelőbe menteni – a migrációk feltöltéséhez kell majd.
2. A `.env.example` lemásolása `.env.local` néven, és a három Supabase-érték (projektcím, nyilvános kulcs, titkos kulcs) beírása.
3. Bejelentkezés a Supabase CLI-be, hogy a migrációk feltölthetők legyenek (a 2. fázis elején, közösen).
