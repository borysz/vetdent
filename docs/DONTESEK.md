# Döntések naplója

Ide kerül minden olyan döntés, amely eltér a `referencia/PROJEKT_PROMPT.md`-től, pontosítja azt, vagy egy megválaszolatlan kérdés alapfeltevésére épül. Ha egy döntést később módosítani kell, itt látszik, mit és hol érint.

## Környezet

| Döntés | Indok | Mit érint, ha változik |
|---|---|---|
| A projekt a `C:\Users\borosn\dev\vetdent` mappában van, a OneDrive-on kívül. | A fejlesztői függőségek (több tízezer fájl) szinkronizálása lassít és fájlzárolási hibát okoz. | A mappa bárhová áthelyezhető; a biztonsági mentést a Git adja. |
| Fejlesztéshez **felhős Supabase-projekt** lesz, nem helyi (Docker) környezet. | A gépen nincs Docker, a telepítése rendszergazdai jogot igényel. A prompt eredetileg helyi Supabase-t írt elő. | Az RLS-tesztek a felhős fejlesztői projekten futnak; a migrációk a Supabase CLI-vel kerülnek fel. Docker telepítése után helyi környezetre lehet váltani. |
| Node.js 24 LTS és Git felhasználói szinten telepítve (`winget`). | Nincs rendszergazdai jog. | – |
| A Git-szerző a tárolóban helyileg van beállítva (`borosn`, a megadott e-mail-címmel). | Friss telepítésnél nincs globális beállítás; commit nélkül nincs visszaállítási pont. | `git config user.name "…"` paranccsal átírható. |

## Technológia

| Döntés | Indok | Mit érint, ha változik |
|---|---|---|
| **Next.js 16.4**, React 19.3, Tailwind CSS 4.3, Turbopack, `cacheComponents` és `partialPrefetching` bekapcsolva. | A `create-next-app` aktuális alapértelmezése. A keretrendszer több ponton eltér a korábbi verzióktól (pl. a middleware neve `proxy`), ezért a kód a csomaggal szállított dokumentáció (`node_modules/next/dist/docs/`) alapján készül. | – |
| **next-intl 4** útvonalba épített nyelv nélkül; a nyelv egyelőre állandó (`hu`). | Egyetlen nyelv van; a szövegek így is fordítási kulcsból jönnek (`messages/hu.json`), a kulcsok típusellenőrzöttek. | Második nyelv felvételekor a nyelv a felhasználói profilból jön (`src/i18n/request.ts`). |
| **Service worker még nincs** az 1. fázisban; a telepíthetőséget a webalkalmazás-jegyzék (`src/app/manifest.ts`) és az ikonok adják. | A service worker a teljes offline réteg része (5. fázis), és TypeScriptben, a Next.js dokumentációja által javasolt Serwisttel készül. Egy ideiglenes, kézzel írt JavaScript-változat megszegné a „teljes forráskód TypeScript” szabályt, és később el kellene dobni. | Az alkalmazás az 5. fázisig kapcsolat nélkül nem indul el. |
| A `shadcn/ui` bevezetése a 2. fázisra marad. | Az 1. fázisban még nincs űrlap vagy párbeszédablak; a komponensek akkor kerülnek be, amikor először kellenek. | – |
| A hivatkozási képek (`referencia/*.jpg`) nincsenek a Gitben. | Harmadik fél szerzői jogi védelem alatt álló anyagai; csak helyben, elrendezési mintaként használhatók. | – |

## Szakmai tartalom

| Döntés | Indok | Mit érint, ha változik |
|---|---|---|
| A fogkatalógus (`src/domain/teeth/catalog.ts`) adatként tárolja a fogakat; a gyökérszámok állatorvosi jóváhagyásra várnak. | A furkáció csak többgyökerű fogon rögzíthető, ehhez kell a gyökérszám. Bizonytalan esetben a megengedőbb érték szerepel (lásd `SZAKMAI_ELLENORZES.md`). | Csak a `POSITIONS` táblát kell módosítani. |

## Megválaszolatlan kérdések, amelyekre már épül kód

Egyelőre nincs ilyen. A `referencia/TISZTAZANDO_KERDESEK.md` 12 blokkoló kérdése meg van válaszolva; a nyitott kérdések alapfeltevései akkor kerülnek ide, amikor a hozzájuk tartozó funkció elkészül.
