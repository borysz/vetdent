# VetDent – állatorvosi fogászati kezelési lap

Tabletre tervezett, előfizetéses webalkalmazás kutyák és macskák fogászati kezelési lapjának vezetéséhez. A teljes igény a [`referencia/PROJEKT_PROMPT.md`](referencia/PROJEKT_PROMPT.md) fájlban, a nyitott kérdések a [`referencia/TISZTAZANDO_KERDESEK.md`](referencia/TISZTAZANDO_KERDESEK.md) fájlban vannak. A „VetDent” munkanév.

## Állapot

| Fázis | Tartalom | Állapot |
|---|---|---|
| 1 | Alapozás: projektváz, megjelenés, nyelvi réteg, PWA-jegyzék, tesztkeret, fogkatalógus | ✅ kész |
| 2 | Felhasználók és szervezetek (Supabase Auth) | ✅ kész, néhány tétel döntésre vár (lásd lent) |
| 3 | Jogosultságok és napló | ✅ kész |
| 4 | Előfizetés (Stripe) és számlázás (Számlázz.hu) | ⏸ **elhalasztva a demó utánra**: a demó verzió ingyenes. Kész az alap (csomagok, próbaidő, keretek, csak olvasható mód, előfizetés és árazási oldal); a fizetés, a számlázás és a platform-admin később készül. |
| 5 | Offline alapréteg | 🔶 részben kész: helyi adatbázis, szinkronmotor, ütközéskezelés a szerveren, a gazdik felülete (lista, keresés, új, szerkesztés, törlés), állapotjelző. Kész még: PIN-zár tétlenség után (10 perc; 5 hibás próba után várakozás, 10 után az eszköz törlése és kijelentkeztetés), és az eszköz zárolása, ha 7 napnál régebben ért el szervert. Hátravan: service worker (kapcsolat nélküli indítás), az ütközések megjelenítése. A felület böngészős kipróbálása nem sikerült (`docs/NYITOTT_KERDESEK.md` 17. pont). |
| 6 | Törzsadatok: gazdik, páciensek | ✅ gazdik és páciensek kész (lista, keresés, felvétel, szerkesztés, törlés, offline). Az irányítópult mutatja a gazdik és páciensek számát és a legutóbbi pácienseket (a mai vizitek a kezelési lappal készülnek el). A felület böngészős kipróbálása nem sikerült (`docs/NYITOTT_KERDESEK.md` 17. pont). |
| 7 | Kezelési lap váza | – |
| 8 | Odontogram | – |
| 9 | Csatolmányok, sablonok, diktálás | – |
| 10 | Gazdi-PDF és e-mail | – |
| 11 | Lezárás: tesztek, adatexport, biztonsági átnézés | – |

A döntések és az eltérések a tervtől a [`docs/DONTESEK.md`](docs/DONTESEK.md) fájlban, a menet közben felmerült kérdések a [`docs/NYITOTT_KERDESEK.md`](docs/NYITOTT_KERDESEK.md) fájlban vannak.

### Ismert, megoldandó hibák

- **Teljes oldalbetöltés időnként nem aktiválódik a fejlesztői környezetben** – részletek és próbalépések: [`docs/NYITOTT_KERDESEK.md`](docs/NYITOTT_KERDESEK.md) 18. pont.

## A 3. fázis tartalma

- **Jogosultságkulcsok:** a kód jogosultságot ellenőriz (pl. `members.manage`), nem szerepkört. Hogy melyik szerepkör mit tehet, az adatbázis `permissions` és `role_permissions` táblája mondja meg; ebből olvas az alkalmazás és az adatbázis sorszintű védelme is.
- **Szerepkörök oldal:** csak olvasható áttekintés arról, melyik szerepkör mit tehet.
- **Napló:** ki, mikor, mit tett a fiókban (fiók létrehozása és módosítása, meghívók, szerepkör-változás, felfüggesztés, eltávolítás, be- és kijelentkezés, jelszócsere, kétlépcsős azonosítás). A bejegyzések az API-n át nem módosíthatók és nem törölhetők.
- 47 integrációs teszt fedi a fiókok elszigetelését, a szabályokat, a kétlépcsős azonosítást, a jogosultsági mátrixot és a naplót.

### A 2. fázis állása

| Kész | Még hátravan |
|---|---|
| Regisztráció, bejelentkezés, kijelentkezés | Saját levélküldő és magyar levélsablonok (addig a meghívó hivatkozását kézzel kell továbbítani) |
| Elfelejtett jelszó és új jelszó beállítása | A kétlépcsős azonosítás kötelezővé tétele egy rendelőben |
| Fiók létrehozása: rendelő vagy egyéni állatorvos; váltás több fiók között | Aktív munkamenetek listája (most csak „kijelentkezés minden más eszközről” van) |
| Munkatársak: meghívás, szerepkör, felfüggesztés, eltávolítás, kilépés | Fióktörlés és adatexport |
| Meghívó elfogadása (belépéssel vagy regisztrációval) | |
| Profil: név, titulus, jelszócsere | |
| Kétlépcsős azonosítás hitelesítő alkalmazással és tartalékkódokkal, az adatbázisban is kikényszerítve | |
| Fiók adatainak szerkesztése | |
| Adatbázisséma sorszintű védelemmel; a szabályok adatbázis-függvényekben | |
| Integrációs tesztek a fiókok elszigetelésére, a szabályokra és a kétlépcsős azonosításra | |

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
| `npm run test:integration` | Integrációs tesztek a fejlesztői Supabase-projekten (saját tesztadatokkal, amelyeket a végén töröl) – éles projekten soha ne futtasd |
| `npm run db:push` | Az új migrációk feltöltése a Supabase-projektbe |
| `npm run db:types` | A TypeScript-típusok újragenerálása az adatbázissémából |

## Felépítés

| Hely | Tartalom |
|---|---|
| `src/app/` | Oldalak, elrendezés, webalkalmazás-jegyzék |
| `src/components/` | Felületi komponensek |
| `src/domain/` | Szakmai logika felülettől függetlenül (pl. fogkatalógus) |
| `src/i18n/`, `messages/` | Nyelvi réteg; minden felületi szöveg a `messages/hu.json`-ból jön |
| `src/lib/` | Közös segédmodulok: környezeti változók, Supabase-kliensek, azonosítás (`auth/`), szervezetek (`organizations/`) |
| `src/proxy.ts` | Minden kérés előtt frissíti a munkamenetet, és elvégzi az átirányításokat |
| `supabase/migrations/` | Az adatbázisséma változásai |
| `tests/integration/` | A valódi adatbázison futó tesztek |
| `docs/` | Döntések, ötletek, szakmai ellenőrzésre váró adatok |
| `referencia/` | A projektindító prompt és a kérdéslista |

## Szabályok

- A teljes forráskód TypeScript, strict módban.
- Felületi szöveg nem kerül a kódba, csak fordítási kulcs.
- Titok, ár, keret és belépési adat nem kerül a forráskódba; a beállítások mintája a `.env.example`.
- A Next.js ebben a verzióban több ponton eltér a korábbiaktól – kódírás előtt a `node_modules/next/dist/docs/` alatti dokumentáció az irányadó (lásd `AGENTS.md`).

## Supabase beállítása új gépen

1. A `.env.example` lemásolása `.env.local` néven, és a három Supabase-érték (projektcím, nyilvános kulcs, titkos kulcs) beírása.
2. Bejelentkezés és a projekt összekapcsolása a Supabase parancssori eszközzel:

```bash
npx supabase login
```

```bash
npx supabase link --project-ref <projektazonosító>
```

3. A Supabase felületén (Authentication → URL Configuration) a „Site URL” legyen `http://localhost:3000`, az engedélyezett átirányítások között pedig szerepeljen a `http://localhost:3000/**`. Enélkül a megerősítő és jelszó-visszaállító levelek hivatkozásai nem az alkalmazásba vezetnek.

A Supabase beépített levélküldője csak próbára való (óránként néhány levél); éles használathoz saját levélküldő kell.
