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
| **shadcn/ui** a `base-nova` stílussal (Base UI alapokon); a generált komponensek a `src/components/ui/` alatt vannak, és a mi kódunk részei. | A parancssori eszköz aktuális alapértelmezése. | – |
| A gombok és beviteli mezők alapmérete 44 px, a mezők betűmérete 16 px. | Kesztyűs, tabletes használat; iOS-en a 16 px-nél kisebb mező ráközelítést vált ki. | A `button.tsx` és `input.tsx` méretei. |
| Az általános színek a shadcn/ui szókészletét használják (`background`, `primary`, `muted` …), értékük a `globals.css` `:root` blokkjában van; saját token csak ott van, ahol a shadcn/ui-nak nincs (fogállapotok, figyelmeztetés, érintési méret). | Egy szókészlet a generált és a saját komponensekben. | – |
| Egyetlen (világos) megjelenés van; a `dark:` változat egy soha be nem állított osztályhoz kötött. | Sötét mód nincs a követelmények között; így a komponensek nem reagálnak félig az operációs rendszer sötét módjára. | Sötét mód bevezetésekor a `.dark` változók megadása. |
| A felület **magázó** megszólítást használ. | Szakmai felhasználók (rendelők, állatorvosok); a promptban szereplő „Váltson csomagot” megfogalmazást követi. | A `messages/hu.json` szövegei. |
| A hivatkozási képek (`referencia/*.jpg`) nincsenek a Gitben. | Harmadik fél szerzői jogi védelem alatt álló anyagai; csak helyben, elrendezési mintaként használhatók. | – |

## Felhasználók, szervezetek, adatbázis

| Döntés | Indok | Mit érint, ha változik |
|---|---|---|
| A sémaváltozások a `supabase/migrations/` fájljaiból kerülnek fel (`npm run db:push`), a típusok a sémából generálódnak (`npm run db:types`). | A prompt előírása; a felhős projekten Docker nélkül is működik. | – |
| Az üzleti szabályt hordozó írások (szervezet létrehozása, meghívás, szerepkör-változtatás, eltávolítás) **adatbázis-függvényeken** mennek át; a táblákra közvetlen írási jog nincs. | A szabály egyetlen helyen él, és a kliensről nem kerülhető meg. | Új szabály = új migráció. |
| Az adatbázis-függvények gépi hibakódot adnak (pl. `last_owner`), amelyet az alkalmazás fordít le (`dbErrors` a szövegfájlban); ismeretlen hiba általános üzenetet kap. | Nyers adatbázis-üzenet nem kerülhet a felhasználó elé. | – |
| A meghívónak csak a kivonata (hash) van tárolva; a kivonat oszlopa a tulajdonosnak sem olvasható. | Az adatbázis kiolvasásával se lehessen meghívót elfogadni. | – |
| Egy felhasználónak legfeljebb egy egyéni állatorvosi fiókja és összesen legfeljebb 5 saját tulajdonú szervezete lehet. | Visszaélés elleni észszerű korlát; a prompt nem szabályozza. | `create_organization` függvény. |
| Az aktív szervezetet a `vd_org` süti jegyzi meg; érvénytelen érték esetén az első tagság az aktív. | Szerveroldali oldalaknak is tudniuk kell; az offline réteg ezt eszközönkénti beállítással egészíti ki. | – |
| A munkamenet ellenőrzése mindig kérésenként fut (`await connection()` a `getCurrentUser`-ben), nem töltődik elő és nem gyorsítótárazódik. | A token lejáratának ellenőrzése időfüggő; a Next.js gyorsítótárazási módja ezt másképp hibának jelzi. Azonosítást nem gyorsítótárazunk. | A bejelentkezett oldalak munkamenettől függő részei nem jelennek meg azonnal navigáláskor (rövid „Betöltés…”). |
| Az e-mailes hivatkozások alapértelmezésben a `/auth/callback` útvonalra érkeznek (PKCE), a Supabase gyári levélsablonjaival; a `/auth/confirm` útvonal a saját sablonokhoz már készen áll. | Így nem kell azonnal sablont módosítani a Supabase felületén. | Saját, magyar levélsablonok bevezetésekor a `token_hash`-es hivatkozásra érdemes váltani (más eszközön megnyitva is működik). |
| Az új jelszó legalább 10 karakter. | „Jelszóerősség-ellenőrzés” a promptban, pontos szabály nélkül. | `src/lib/auth/schemas.ts`; a Supabase felületén a kiszivárgott jelszavak ellenőrzése külön bekapcsolható. |
| Az integrációs tesztek (`npm run test:integration`) a valódi fejlesztői Supabase-projekten futnak, saját, véletlen adatú tesztfelhasználókkal, amelyeket a végén törölnek. | Docker nélkül nincs helyi adatbázis; a sorszintű védelem csak valódi adatbázison igazolható. | Éles projekten **soha** nem futtathatók. |
| Böngészős (Playwright) automatizált tesztek még nincsenek; a fő folyamatot kézzel, a böngészőpanelben próbáltam végig. | A böngészők letöltése ezen a gépen lassú; a prompt a 11. fázisra teszi a végponttól végpontig teszteket. | – |

## Szakmai tartalom

| Döntés | Indok | Mit érint, ha változik |
|---|---|---|
| A fogkatalógus (`src/domain/teeth/catalog.ts`) adatként tárolja a fogakat; a gyökérszámok állatorvosi jóváhagyásra várnak. | A furkáció csak többgyökerű fogon rögzíthető, ehhez kell a gyökérszám. Bizonytalan esetben a megengedőbb érték szerepel (lásd `SZAKMAI_ELLENORZES.md`). | Csak a `POSITIONS` táblát kell módosítani. |

## Megválaszolatlan kérdések, amelyekre már épül kód

Egyelőre nincs ilyen. A `referencia/TISZTAZANDO_KERDESEK.md` 12 blokkoló kérdése meg van válaszolva; a nyitott kérdések alapfeltevései akkor kerülnek ide, amikor a hozzájuk tartozó funkció elkészül.
