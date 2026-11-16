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
| A kétlépcsős azonosítás hitelesítő alkalmazással (TOTP) működik, és **az adatbázis is kikényszeríti**: minden API-kérés előtt lefut egy ellenőrzés (`private.enforce_mfa`), amely visszautasítja a csak jelszóval belépett munkamenetet, ha a felhasználónak van megerősített hitelesítője. | A felület átirányítása önmagában megkerülhető volna; így minden táblára és függvényre érvényes, a később készülőkre is. | A `20261116100000_enforce_mfa.sql` migráció. |
| Tartalékkódok: bekapcsoláskor 10 egyszer használható kód készül (kérésre újak). Egy kód **kikapcsolja** a kétlépcsős azonosítást a fiókon, így a felhasználó jelszóval beléphet, és újra beállíthatja. | A Supabase Auth nem ad beépített tartalékkódot, és teljes értékű munkamenetet csak hitelesítővel tud kiadni. A kódoknak csak a kivonata van tárolva, olyan táblában, amelyet felhasználóként az API-n át sem olvasni, sem írni nem lehet. | `mfa_recovery_codes` tábla, `src/lib/auth/recovery-codes.ts`. |
| Az API-kérések előtti ellenőrzés minden szerepkörre lefut, a szerver saját (titkos kulcsos) kéréseire is; ezért minden API-szerepkörnek kell használati jog a `private` sémára. | Enélkül a szerver kérései – a kapcsolatok állapotától függően, tehát nem mindig – „permission denied for schema private” hibát adtak. Ezt egy böngészős próba hozta elő, a tesztek nem; a `20261116120000` migráció javítja. | Új API-szerepkör bevezetésekor ugyanezt a jogot meg kell adni. |
| A munkatárslistában az e-mail-címeket csak tulajdonos és admin látja. | A többi szerepkörnek a név és a szerepkör elég; személyes adatból a legkevesebb. | `list_members` függvény. |
| A meghívó hivatkozását a meghívónak kell eljuttatnia; a rendszer nem küld levelet. | Még nincs saját levélküldő (kérdéslista H5). A hivatkozás csak a létrehozáskor látható, utána csak új meghívóval pótolható. | Levélküldő bekötésekor a `inviteMemberAction` küldi ki. |
| Jelszócsere a profilban a régi jelszó bekérése nélkül történik. | A Supabase Auth alapbeállítása; a bejelentkezett munkamenet az igazolás. | A Supabase felületén a „Secure password change” bekapcsolásával szigorítható. |
| Az aktív munkamenetek listája nincs meg, csak a „kijelentkezés minden más eszközről”. | A Supabase Auth nem ad ki munkamenet-listát a felhasználónak. | Saját adatbázis-függvénnyel pótolható. |
| Az integrációs tesztek (`npm run test:integration`) a valódi fejlesztői Supabase-projekten futnak, saját, véletlen adatú tesztfelhasználókkal, amelyeket a végén törölnek. | Docker nélkül nincs helyi adatbázis; a sorszintű védelem csak valódi adatbázison igazolható. | Éles projekten **soha** nem futtathatók. |
| Böngészős (Playwright) automatizált tesztek még nincsenek; a fő folyamatot kézzel, a böngészőpanelben próbáltam végig. | A böngészők letöltése ezen a gépen lassú; a prompt a 11. fázisra teszi a végponttól végpontig teszteket. | – |

## Jogosultságok és napló

| Döntés | Indok | Mit érint, ha változik |
|---|---|---|
| A szerepkör–jogosultság mátrix **az adatbázisban** él (`permissions`, `role_permissions`); az alkalmazás onnan kérdezi le a felhasználó jogosultságait (`my_permissions`), a kódban csak a kulcsok nevei szerepelnek. | Így az alkalmazás és az adatbázis védelme nem térhet el egymástól, és egyedi szerepkör később kódmódosítás nélkül bevezethető. Egy integrációs teszt elbukik, ha a kódbeli és az adatbázisbeli kulcsok eltérnek. | Új jogosultság = migráció + a kulcs felvétele a `permissions.ts`-be és a szövegfájlba. |
| A mátrix a prompt 6. fejezetének táblázatát követi; az API-n át nem módosítható. | A prompt szerint a rendelő csak megtekinti. | Egyedi szerepkörökhöz szerkesztőfelület és írási szabály kell. |
| A tulajdonosra vonatkozó szabályok (csak tulajdonos módosíthat tulajdonost, az utolsó tulajdonos védett) szerepkör-alapúak maradtak. | Ezek nem jogosultságok, hanem a tulajdonosi szerep lényegéhez tartoznak. | `update_member`, `set_member_status`, `remove_member`. |
| A naplót adatbázis-függvények és egy trigger írják, ugyanabban a tranzakcióban, mint a naplózott műveletet. Felhasználóként csak olvasható (`audit.view`), és a szerver titkos kulcsával is csak hozzáadni lehet, módosítani és törölni nem. | „A napló nem módosítható.” Ha a művelet megtörtént, a bejegyzés is megvan; ha nem, az sincs. | – |
| A be- és kijelentkezés, a jelszócsere és a kétlépcsős azonosítás eseményei minden olyan fiók naplójába bekerülnek, amelynek a felhasználó aktív tagja. Ha a naplózás nem sikerül, a művelet attól még végbemegy (a hiba a szervernaplóba kerül). | A tulajdonos lássa a munkatársai belépéseit; egy sikeres belépést viszont ne tegyen sikertelenné a naplózás hibája. | `log_auth_event` függvény, `src/lib/audit/log-auth-event.ts`. |
| A napló oldal a legutóbbi 100 bejegyzést mutatja; szűrés, lapozás és export még nincs. | A naplóexport a prompt szerint csomagfüggő funkció, a 4. fázishoz tartozik. | `src/app/app/naplo/page.tsx`. |
| A napló a rendelő törlésekor vele együtt törlődne. | Rendelőtörlés még nincs; a megőrzési szabály nyitott kérdés (`NYITOTT_KERDESEK.md` 6. pont). | Az `audit_log.organization_id` idegen kulcsa. |

## Előfizetés

| Döntés | Indok | Mit érint, ha változik |
|---|---|---|
| A csomagok (név, keretek, funkciók, árak) és a számlázási beállítások (próbaidő hossza, türelmi idő, ÁFA) az adatbázisban vannak; a kódban nincs ár és nincs keret. | A prompt előírása. | `plans`, `billing_settings` táblák; szerkesztőfelületük a platform-adminnal készül el. |
| Két csomag van: **Egyéni** (1 felhasználó, 10 GB) és **Rendelő** (10 felhasználó, 100 GB). Ár nincs megadva; az árazási oldal ezt kiírja. | A megerősített csomagszerkezet; a számok helykitöltők (`NYITOTT_KERDESEK.md` 12. pont). | Csak adatmódosítás. |
| Minden új fiók 14 napos próbaidővel indul a típusának megfelelő csomagon; próbaidő alatt a tárhely 2 GB. | A prompt 7.1 és 7.2 pontja. | `billing_settings`. |
| Hogy egy fiók teljes értékűen használható-e vagy csak olvasható, azt **egyetlen adatbázis-függvény** dönti el az előfizetés állapotából (`private.organization_access`). Az alkalmazás ezt nem számolja újra, csak megjeleníti. | Egy helyen legyen a szabály; a fizetés később csak az állapotot és a dátumokat módosítja. | – |
| Csak olvasható módban a munkatársak kezelése (szerepkör, felfüggesztés, eltávolítás) tovább működik, új meghívó viszont nem hozható létre. | A rendelőnek lejárt előfizetéssel is tudnia kell hozzáférést megvonni; bővülni viszont ne tudjon. | `create_invitation`, `accept_invitation`. |
| A felhasználói keretbe a függő meghívók is beleszámítanak. | Különben a keret meghívókkal túlléphető volna. | `private.require_free_seat`. |
| A csomagok és előfizetések táblái felhasználóként közvetlenül nem olvashatók; minden adat függvényen át érkezik (`my_entitlements`, `list_public_plans`). | A Stripe-azonosítók és más rendelők adatai ne szivároghassanak. | – |
| Az előfizetés oldalon a fizetés helyén tájékoztató szöveg áll. | A Stripe még nincs bekötve (`NYITOTT_KERDESEK.md` 11. pont); nem akartam sehová nem vezető gombot. | A Stripe bekötésekor a csomagválasztó kerül a helyére. |

## Offline réteg

| Döntés | Indok | Mit érint, ha változik |
|---|---|---|
| **Saját megoldás:** helyi adatbázis a böngészőben (IndexedDB, Dexie), kimenő változások sora, a szerveren mezőszintű összefésülés. | Nem kell külön szinkronszerver; a fogankénti leletek összefésülési szabályai pontosan ránk szabhatók. A javaslatot a kérdéslista 15. pontjában tettem; válasz nem érkezett, a felhasználó a folytatást kérte. | A `src/lib/offline/` mappa; az új adattípusok ugyanezt a mintát követik. |
| A szerver nem teljes rekordot, hanem **változásokat** kap: csak a szerkesztett mezőket, és azt a revíziót, amelyről a szerkesztés indult. Különböző mezők szerkesztése két eszközön mind megmarad; ugyanazon mezőé esetén a későbbi írás nyer, a felülírt érték pedig a `sync_conflicts` táblában megmarad. | „Adat csendben nem veszhet el.” | `sync_push_clients` függvény. |
| A rekordok azonosítóját (UUID) az eszköz adja a létrehozáskor. | Az offline létrehozott rekord azonossága később nem változik; a feltöltés ismételhető, duplikáció nélkül. | – |
| A törlés sírkő (`deleted_at`), így a többi eszköz is értesül róla. Törölt rekordra érkező szerkesztés nem támasztja fel; a törlés marad. | A prompt: lezárt/törölt állapotra érkező offline módosítás nem íródik rá. | – |
| Lehívás (pull) a változásfolyam sorszáma (`seq`) szerint, 100 tételes átfedéssel. | Egymást átfedő tranzakciók felcserélt sorrendben fejeződhetnek be; az átfedés ezt kezeli, az ismételt rekordok ártalmatlanok (régebbi változat figyelmen kívül marad). | `PULL_OVERLAP` a `sync-engine.ts`-ben. |
| Az eszköz adatbázisa felhasználónként és fiókonként külön van (`vetdent:<felhasználó>:<fiók>`). | Közös tableten két felhasználó adata ne keveredjen. | `databaseName` |
| A felület mindig a helyi adatbázisból olvas és oda ír; a feltöltés a háttérben megy (indításkor, a kapcsolat visszatértekor, fél percenként, és szerkesztés után rögtön). | Az online és offline működés ugyanaz a kód. | `OfflineProvider` |
| A szerkesztés közben elküldött rekord esetén csak az elküldött mezők nyugtázódnak; az időközben végzett szerkesztés függőben marad. | Különben a nyugtázás elnyelné a friss szerkesztést. Teszttel igazolva. | `reconcileAfterPush` |
| A rendszer az adatbázis-kapcsolat helyett a **HTTPS-es `db query` úton** vitte fel az 5. fázis migrációját. | A gépen a közvetlen Postgres-kapcsolatot egy TLS-vizsgáló hálózati elem megszakítja; a tanúsítvány-ellenőrzés kikapcsolását (a CLI javaslata) szándékosan nem alkalmaztam. A migrációs előzményt kézzel rögzítettem, hogy a későbbi `db push` ne futtassa újra. | Ha a `db push` újra működik, a következő migrációk a megszokott úton mennek. |

### Service worker (kapcsolat nélküli indítás)

| Döntés | Indok | Mit érint, ha változik |
|---|---|---|
| A service worker egyszerű, kézzel írt szkript (`public/sw.js`), nem Serwist. | A dokumentum is csak három szabályt kér: statikus fájlok, oldalak, semmi más. Egy külső csomag nélkül átlátható és tesztelhető; a gyökérről kiszolgálva az egész oldalt vezérli. Kivétel a „minden forráskód TypeScript” szabály alól, mert a worker a Next-buildön kívül fut; a logikát `service-worker.test.ts` őrzi. | Ha az igények nőnek (előtöltés, frissítési értesítés), váltás Serwistre. |
| A `/_next/static` és az ikonok tartósan a gyorsítótárban vannak (cache first); a `/app` alatti oldalak hálózat-first, a sikeres válasz eltárolódik. Hálózat nélkül a pontos oldal, egyébként az `/app` kezdőoldal jön, végső esetben a böngésző saját hibaoldala. | A fájlnevek tartalmaznak hash-t, ezért nem avulnak el; az oldalak adatát a felület amúgy is az eszköz adatbázisából olvassa. | `public/sw.js` |
| Átirányítás és hibás válasz nem kerül a tárolóba; más eredet (Supabase), POST, belépési és `/auth` útvonalak érintetlenek. | Különben a belépési oldal vagy egy hibaoldal ülne a védett oldal helyén. | `public/sw.js` |
| Kijelentkezéskor és az eszköz törlésekor (10 hibás PIN) a worker oldal-tárolója ürül. | Közös tableten a következő felhasználó nem kaphatja az előző oldalait. | `clearCachedPages` |
| A worker csak éles buildben regisztrál. | Fejlesztés közben elavult fájlokat szolgálna ki, és zavarná a gyorsfrissítést. | `registerServiceWorker` |

## Gazdik és páciensek

| Döntés | Indok | Mit érint, ha változik |
|---|---|---|
| A páciensek és a gazdik ugyanazt a szinkronszerződést és ugyanazt az eszközoldali szabálykészletet használják (`record-model.ts`); egy új adattípus egy leírás (mezők, protokollnevek, alapértékek) és egy szerveroldali függvény. | Ne legyen két, eltérően viselkedő szinkronmegvalósítás. A gazdik tesztjei a közös modellre átírás után változtatás nélkül is átmentek. | A kezelési lap és a fogképlet ugyanezt a mintát követi. |
| A páciens faját (kutya/macska) létrehozás után nem lehet módosítani; a szerver visszautasítja, a felületen a mező le van tiltva. | A faj dönti el, melyik fogai vannak az állatnak; módosítása a meglévő fogképleteket érvénytelenítené. | `sync_push_patients`, `PatientEditor`. |
| Páciens csak a saját rendelő élő (nem törölt) gazdijához rendelhető, és átadható másik gazdinak ugyanabban a rendelőben. | Idegen fiók adatához ne lehessen kapcsolódni. | `sync_push_patients`. |
| Az eszköz a páciens feltöltését **kivárja**, amíg a gazdija nem ismert a szervernek (például mert a gazdit elutasították, és még nem javították ki). Nem hibajelzés és nem adatvesztés: a páciens függőben marad, és a gazdi elfogadása után megy. | Különben a gazdi hibája miatt a páciens is elutasításra kerülne, és a gazdi javítása után sem indulna újra magától. Teszttel igazolva. | `readyToSend` a `sync-engine.ts`-ben. |
| A feltöltés sorrendje: előbb a gazdik, azután a páciensek. | A páciens a gazdijára hivatkozik. | `syncAll` |
| Gazdi törlésekor a páciensei megmaradnak (a gazdira továbbra is hivatkoznak). | Szándékos: a gazdi törlése ne töröljön szakmai adatot. Mi legyen a gazditalan páciensekkel, az a megőrzési szabályok kérdése (`NYITOTT_KERDESEK.md` 6. pont). | – |
| A testtömeg a páciens aktuális értéke; a mérések előzményei (idővonal) a kezelési lapokhoz kapcsolódnak, még nem készültek el. | A prompt a lapon rögzített testtömegről beszél. | 7. fázis |
| A testtömeg tizedesvesszővel és ponttal is megadható; két tizedesre kerekítve tárolódik. | Magyar felhasználók vesszőt írnak. | `parsePatientForm` |

## Kezelési lap (7. fázis)

| Döntés | Indok | Mit érint, ha változik |
|---|---|---|
| A vizit ugyanazt a szinkronszerződést és eszközoldali szabálykészletet használja, mint a gazdi és a páciens (`visits-model.ts`, `sync_push_visits`). | Egy megoldás, ami már be van próbálva; a mezőszintű összefésülés és az ütközések rögzítése ingyen jár. | – |
| A lista jellegű részek (fő panasz címkéi, helyi blokkok, gyógyszerek) a szinkronban **JSON-szövegként** utaznak, egyetlen mezőként; az adatbázisban `jsonb`. A szöveg kanonikus (fix kulcssorrend, a címkék a katalógus sorrendjében), hogy az azonos tartalom azonos szöveg legyen. | A szinkronprotokoll csak skalárt visz, és a „változott-e” döntés egyenlőségvizsgálat. Hátrány: két eszköz ugyanazon lista két különböző soráról a teljes listára ütközik (az utolsó írás nyer, a másik az ütközések közé kerül). | `visit-lists.ts`, `clean_visit_field` |
| A **lezárás és az újranyitás nem része a szinkronnak**: külön adatbázis-függvény (`finalize_visit`, `reopen_visit`), csak online, szerveren ellenőrzött jogosultsággal (`visits.finalize`, `visits.reopen`), naplózva (`visit.finalized`, `visit.reopened`). | A prompt 8.11 pontja. Az eszköz a lezárt állapotot lehívással tudja meg. | – |
| Újranyitáshoz indoklás kell (3–500 karakter), amely a naplóba kerül. | A prompt: „indoklás kötelező, naplózott”. | `reopen_visit` |
| A **lezárt vizit nem szerkeszthető**. Ha olyan eszközről érkezik szerkesztés, amely a lezárás idején offline volt, a szerver **nem alkalmazza**, de a `sync_conflicts` táblába menti (az eszköz értéke „felülírt”, a lezárt lap értéke „érvényes”), és „változatlan”-nak nyugtázza, hogy az eszközön ne maradjon örökké függő szerkesztés. | Adat csendben nem veszhet el, de a lezárt tartalmat sem szabad megváltoztatni. Az ütközések megjelenítése a felületen még hátravan. | `sync_push_visits` |
| Lezárt vizit eszközről nem törölhető (`forbidden`); piszkozat igen. | A lezárt lap a kórlap része. | `sync_push_visits` |
| Lezáráskor kötelező: kezelőorvos neve és ASA-státusz. A vizit dátuma az adatbázisban mindig kötelező. | A prompt 8.11 pontja. A „tervezett, de el nem végzett beavatkozás” figyelmeztetés az odontogram után készül. | `finalize_visit` |
| A **kezelőorvos és az asszisztens szabad szöveg**, a vizit létrehozásakor a belépett felhasználó neve kerül a kezelőorvos mezőbe, ha lezárási joga van. | A prompt „a szervezet állatorvosai közül” választást kér; ehhez a munkatársak listáját az eszközre is le kellene tölteni. Nem sürgős, a lap használható nélküle. | `PatientVisits` |
| Az utolsó etetés ideje **zóna nélküli időpont** (`timestamp`), a rendelő helyi ideje. | A nap eseménye, nem abszolút időpont; így a kliens és a szerver szövege egyezik. | `visits.last_fed_at` |
| A páciens a vizit létrehozása után nem változtatható; csak a saját rendelő élő páciense választható. | Idegen fiók adatához ne lehessen kapcsolódni. | `sync_push_visits` |
| A kezelési lap **automatikusan ment** az eszközre (fél másodperc gépelés-szünet után) és elhagyáskor is; a fejléc mutatja a „mentve az eszközön” / „szinkronizálva” állapotot. | A prompt 8.2 pontja. | `VisitEditor` |
| Lezárás előtt a felület kényszeríti a feltöltést (`flush` + `syncNow`); ha a lap módosításai nem jutnak el a szerverre, nem zár. | Különben a lezárt példány hiányozna a legutóbbi módosításokból. | `Lifecycle` |
| Offline vagy lezárási jog nélkül a lap „lezárásra kész” jelölést kaphat; ez szinkronizálódik, a jogosult látja. | A prompt 8.11 pontja. A kapcsolat visszatérésekor a lezárás felajánlása a jelölésnél jelenik meg. | `readyToFinalize` |
| A „ki van még a lapon” (egyidejű szerkesztők jelzése) **nem készült el**. | Valós idejű jelenléthez külön csatorna kell; mezőszintű összefésülés és ütközésrögzítés viszont van. | Nyitott kérdés |
| A fogászati státusz (C szekció) helye a lapon jelölve van, tartalma a 8. fázisban (odontogram) készül. | A váz a 7. fázis feladata. | 8. fázis |

## Szakmai tartalom

| Döntés | Indok | Mit érint, ha változik |
|---|---|---|
| A fogkatalógus (`src/domain/teeth/catalog.ts`) adatként tárolja a fogakat; a gyökérszámok állatorvosi jóváhagyásra várnak. | A furkáció csak többgyökerű fogon rögzíthető, ehhez kell a gyökérszám. Bizonytalan esetben a megengedőbb érték szerepel (lásd `SZAKMAI_ELLENORZES.md`). | Csak a `POSITIONS` táblát kell módosítani. |

## Megválaszolatlan kérdések, amelyekre már épül kód

Egyelőre nincs ilyen. A `referencia/TISZTAZANDO_KERDESEK.md` 12 blokkoló kérdése meg van válaszolva; a nyitott kérdések alapfeltevései akkor kerülnek ide, amikor a hozzájuk tartozó funkció elkészül.
