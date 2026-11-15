# Projektindító prompt – Állatorvosi fogászati kezelési lap (webes SaaS)

> **Mire való ez a fájl?** Ezt a fájlt egy kódoló AI-ügynöknek (pl. Claude Code) kell odaadni egy üres projektmappában. A fájl önmagában tartalmazza a teljes igényt; a forrása az „Állatorvosi Fogászati Kezelési Lap és Alkalmazás Terv 2.0” dokumentum, kiegészítve a felhasználó-, jogosultság- és előfizetés-kezeléssel.
>
> **Használat:**
> 1. Töltsd ki a `TISZTAZANDO_KERDESEK.md` „Válasz” sorait – legalább a `[BLOKKOLÓ]` jelölésűeket.
> 2. Másold az új projektmappa `referencia/` almappájába: `PROJEKT_PROMPT.md`, `TISZTAZANDO_KERDESEK.md`, `Kutya fogsor.jpg`, `Macska fogsor.jpg`.
> 3. Indítsd az ügynököt ezzel: *„Olvasd el a `referencia/PROJEKT_PROMPT.md` fájlt, és hajtsd végre.”*

---

## 1. Szereped és munkamódszered

Tapasztalt full-stack fejlesztőként egy éles használatra szánt, több-bérlős (multi-tenant) webes SaaS-alkalmazást építesz fel a nulláról. A megrendelő nem fejlesztő: a döntéseidet röviden, közérthetően indokold.

- **Először olvass:** nézd át a `referencia/` mappa minden fájlját. A `TISZTAZANDO_KERDESEK.md`-ben ahol a „Válasz” ki van töltve, az **felülírja** az itt leírtakat. Ahol üres, az ott megadott „Alapfeltevés” szerint haladj, és a döntést jegyezd fel a `docs/DONTESEK.md` fájlba (mit feltételeztél, hol kell módosítani, ha más a válasz).
- **Fázisokban dolgozz** (11. fejezet). Minden fázis végén: típusellenőrzés, lint, tesztek futtatása, commit, és 5–10 soros összefoglaló arról, mi készült el és hogyan próbálható ki. Ne állj meg jóváhagyásra várva, hacsak egy `[BLOKKOLÓ]` kérdés megválaszolatlan, és az alapfeltevés rossz irányba vinné a munka nagy részét.
- **Friss dokumentáció:** a könyvtárak API-ját ne emlékezetből használd – telepítés előtt nézd meg az aktuális stabil verzió dokumentációját.
- **Ne építs olyat, amit nem kértek** (13. fejezet). Ha valami hasznosnak tűnik, de nincs a leírásban, írd fel a `docs/OTLETEK.md`-be, ne valósítsd meg.
- A kód, az azonosítók és a commit üzenetek angolul, a felhasználói felület és a `docs/` magyarul készüljön.

## 2. A termék röviden

Tablet-első webalkalmazás állatorvosi rendelőknek, amellyel **kutyák (42 fog) és macskák (30 fog) fogászati kezelési lapja** vezethető: az anamnézistől az interaktív fogképleten (odontogram, Triadan-számozás) és a műtéti naplón át a gazdinak szóló PDF-összefoglalóig. A fő felhasználási helyzet: műtét közben, kesztyűs kézzel, tableten – ezért kevés érintés, nagy célfelületek, gyorsbeviteli panel és diktálás kell.

A termék előfizetéses SaaS, kétféle előfizetővel:
- **Rendelő** – vállalkozásként fizet elő, a munkatársai szerepkörök szerint férnek hozzá az adatokhoz;
- **Egyéni állatorvos** – magánszemélyként (vagy egyéni vállalkozóként) fizet elő, egyfős fiókkal.

Az alkalmazásnak **internetkapcsolat nélkül is teljes értékűen használhatónak kell lennie** a szakmai munkához (4.1 fejezet).

Munkanév: `vetdent` (a végleges név a kérdéslistában).

## 3. Technológiai keret

Az alábbi az alapértelmezett választás; ha a kérdéslista válasza mást ír elő, azt kövesd. Ha valamelyik elem a futtatáskor nem megfelelő (megszűnt, nem karbantartott), válassz egyenértékűt, és indokold a `docs/DONTESEK.md`-ben.

| Terület | Választás |
|---|---|
| Nyelv (forráskód) | **TypeScript, strict módban – a teljes forráskód** (kliens, szerver, szkriptek, tesztek). JavaScript-fájl csak ott lehet, ahol egy eszköz konfigurációja megköveteli. `any` használata kerülendő. |
| Keretrendszer | Next.js (App Router) |
| UI | Tailwind CSS + shadcn/ui, saját SVG odontogram-komponens |
| Adatbázis | **Supabase (PostgreSQL)** – SQL-migrációk a Supabase CLI-vel verziókezelve, az adatbázissémából generált TypeScript-típusok, sorszintű biztonság (RLS) minden bérlőhöz kötött táblán |
| Hitelesítés | Supabase Auth (e-mail + jelszó, e-mail-megerősítés, jelszó-visszaállítás, TOTP), `@supabase/ssr`-rel sütialapú munkamenet. A szervezet, tagság, meghívó, szerepkör és jogosultság **saját táblákban** él. |
| Fizetés | Stripe (Checkout + Customer Portal + webhookok), egy `BillingProvider` interfész mögött |
| Számlázás | Számlázz.hu (Számla Agent), egy `InvoiceProvider` interfész mögött; fejlesztéshez és teszthez szimulált megvalósítás |
| Offline működés | Telepíthető PWA (service worker) + helyi adatbázis a böngészőben + háttérszinkron a Supabase-zel (4.1 fejezet) |
| Fájltárolás | Supabase Storage, privát tárolók (bucket), szervezetenkénti útvonal-előtaggal, tárolószintű RLS-szabályokkal és aláírt, lejáró URL-ekkel |
| E-mail | SMTP-alapú tranzakciós levél (a hitelesítési levelek is saját SMTP-n, magyar sablonnal); fejlesztéshez a Supabase helyi levélfogója |
| PDF | Szerveroldali HTML → PDF (headless Chromium), hogy az odontogram ugyanabból az SVG-komponensből készüljön |
| Diktálás | Böngésző Web Speech API (`hu-HU`) egy `SpeechProvider` interfész mögött, hogy később szerveroldali szolgáltatóra cserélhető legyen |
| Validáció | Zod – ugyanaz a séma kliens- és szerveroldalon |
| Felület nyelve | `next-intl`, alapnyelv magyar; minden szöveg fordítási kulcsból jön (angol később hozzáadható) |
| Tesztek | Vitest (egység), Playwright (végponttól végpontig), RLS-szabályok tesztjei a helyi Supabase-en |
| Fejlesztői környezet | Supabase CLI helyi környezet (`supabase start`: adatbázis, Auth, Storage, levélfogó); `.env.example`; seed szkript |

Időzóna: `Europe/Budapest`, dátum- és számformátum: `hu-HU`.

**Supabase-szabályok:**
- Az éles Supabase-projekt EU-régióban legyen.
- A `service_role` kulcs kizárólag szerveroldalon használható (Stripe-webhook, platform-admin, háttérfeladatok), soha nem kerülhet a böngészőbe; minden ilyen használat egyetlen, jól körülhatárolt modulban legyen.
- A felhasználó nevében futó kérések a felhasználó munkamenetével mennek, hogy az RLS érvényesüljön.
- Sémaváltozás csak migrációs fájllal történhet, a Supabase felületén kézzel nem; a generált típusokat migráció után frissíteni kell.
- A csatolmányok tárhelyhasználatát saját táblában vezesd szervezetenként (a csomagkeret ellenőrzéséhez).
- A kezelési lap egyidejű szerkesztésénél (8.11) a jelenlét és a változások kijelzéséhez használható a Supabase Realtime.

## 4. Architektúra és bérlőkezelés

- **Bérlő = szervezet.** Minden szakmai adat (gazdi, páciens, vizit, csatolmány, sablon, beállítás) `organizationId`-t hordoz.
- **A szervezetnek két típusa van:** `clinic` (rendelő – több munkatárs, céges számlázási adatok) és `individual` (egyéni állatorvos – egyetlen tag, aki egyszerre tulajdonos és állatorvos; magánszemélyként számlázva). A két típus ugyanazt az adatmodellt és kódot használja; a különbség a tagok száma, a számlázási adatok és az elérhető csomagok. Az egyéni fiók adatvesztés nélkül rendelővé alakítható; rendelő csak akkor alakítható egyénivé, ha egyetlen tagja van.
- **Bérlőszigetelés két védvonallal:** (1) az adatbázisban RLS-szabály minden bérlőhöz kötött táblán, amely a bejelentkezett felhasználó szervezeti tagságából és jogosultságaiból vezeti le, mit láthat és módosíthat; (2) az alkalmazásban minden bérlőhöz kötött lekérdezés egy adatelérési rétegen megy át, amely kötelezően szűr az aktuális szervezetre. Közvetlen adatbázis-hívás a képernyők és API-végpontok kódjában tilos. RLS nélküli tábla nem maradhat a nyilvános sémában. Írj teszteket, amelyek bizonyítják, hogy az egyik szervezet felhasználója a másik szervezet rekordját sem olvasni, sem módosítani, sem azonosító kitalálásával elérni nem tudja.
- **Egy felhasználó több szervezetnek is tagja lehet** (pl. helyettesítő orvos); a felületen szervezetváltó van.
- **Három jogosultsági réteg egymás után:** (1) be van-e jelentkezve, (2) tag-e a szervezetben és megvan-e a szükséges jogosultsága, (3) engedi-e az előfizetési csomag (funkció és keret). Mindhárom ellenőrzés szerveroldalon történik; a felület csak elrejti, amit a szerver úgyis megtagadna.
- **Naplózás (audit):** ki, mikor, melyik szervezetben, mit csinált (belépés, meghívás, szerepkör-változás, kezelési lap lezárása/újranyitása, törlés, előfizetés-változás, megszemélyesítés). A napló nem módosítható.

### 4.1 Offline-első működés (teljes offline mód)

A szakmai munkát (műtő, gyenge wifi) internetkapcsolat nélkül is el kell tudni végezni. Ez az architektúra alapja, nem utólagos kiegészítés: **a szakmai képernyők mindig a helyi adatbázisból olvasnak és oda írnak**, a szerverrel háttérszinkron tartja a kapcsolatot. Online és offline állapotban ugyanaz a kód fut.

**Alapok**
- Telepíthető PWA: a service worker gyorsítótárazza az alkalmazáshéjat, így kapcsolat nélkül is elindul és frissítés után is működik.
- Helyi adatbázis a böngészőben (IndexedDB vagy arra épülő megoldás), szervezetenként és felhasználónként elkülönítve. Válassz bevált, Supabase/PostgreSQL-lel együttműködő local-first szinkronmegoldást, vagy építs saját kimenő sort (outbox); a választást és az indokait írd le a `docs/DONTESEK.md`-ben.
- Nézd meg az aktuális böngészőkorlátokat (tárhelykvóta, a helyi adatok automatikus ürítése, különösen iPaden), kérj tartós tárolást, és ha a megbízható működéshez a kezdőképernyőre telepítés kell, a felület vezesse végig ezen a felhasználót.

**Mi működik kapcsolat nélkül**

| Offline is működik | Csak online |
|---|---|
| Gazdik és páciensek keresése, megnyitása, felvétele, szerkesztése | Regisztráció, első bejelentkezés az adott eszközön, jelszó-visszaállítás |
| Új kezelési lap indítása, piszkozat folytatása | Munkatársak meghívása, szerepkörök módosítása |
| Teljes odontogram: kijelölés, gyorsbevitel, leletek, beavatkozások, tasakmélység, megjegyzések, visszavonás | Előfizetés, fizetés, számlák |
| Fotó készítése és csatolása (helyben tárolva, később feltöltve) | Kezelési lap végleges lezárása és újranyitása |
| Sablonok betöltése, kódtörzs, gyorsbeviteli panel | Szerveroldali PDF és e-mail-küldés (offline nyomtatási nézet van, a küldés sorba áll) |
| Korábbi lapok megtekintése (az eszközre letöltött körben) | Diktálás (a böngészős beszédfelismerés hálózatot igényel) |

Az eszközre letöltött adatkör alapértelmezése: a szervezet összes gazdijának és páciensének törzsadata, páciensenként az utolsó három kezelési lap és minden piszkozat, a csatolmányokból bélyegkép (a teljes kép igény szerint). A kör a kérdéslista válasza szerint módosítandó.

**Szinkron**
- Minden rekord kliensoldalon kap azonosítót (UUID), így offline létrehozva is végleges az azonosítója; a feltöltés idempotens, ismétlés nem okoz duplikációt.
- A változások műveletenként, sorrendben kerülnek a kimenő sorba; kapcsolat esetén a háttérben, megszakítás után folytathatóan töltődnek fel. A fotók külön, darabolható sorban mennek.
- **Ütközéskezelés:** mezőszintű összefésülés – ha két eszköz ugyanannak a lapnak más-más mezőjét vagy más-más fogát módosította, mindkettő megmarad. Ha ugyanazt a mezőt, a későbbi nyer, de a felülírt érték megőrződik, és a felület jelzi az ütközést, ahonnan visszaállítható. **Adat csendben nem veszhet el.**
- Törlés sírkő-jelöléssel (tombstone) szinkronizálódik.
- Ha egy lapot időközben lezártak, az arra vonatkozó offline módosítás nem íródik rá: „ütköző piszkozatként” megmarad, és egy állatorvos dönt róla.
- A szinkron a felhasználó munkamenetével megy, így az RLS és a jogosultságok a szerveren újra ellenőrződnek. Ha a hozzáférés időközben megszűnt (eltávolított munkatárs), a feltöltés elutasításra kerül és naplózódik; ha az előfizetés járt le, a lejárat előtt rögzített változások még feltölthetők.

**Biztonság az eszközön**
- Offline csak olyan eszközön lehet dolgozni, amelyen a felhasználó korábban online bejelentkezett. Az eszköznek alapértelmezés szerint legalább 7 naponta kapcsolódnia kell; ennél hosszabb kimaradás után a helyi adatok zárolódnak a következő online ellenőrzésig.
- Kijelentkezéskor a helyi adatok törlődnek az eszközről; ha van még fel nem töltött változás, a rendszer előbb figyelmeztet, és megpróbálja feltölteni.
- Tétlenség után (alapértelmezés: 10 perc) PIN-kódos feloldás, mert a tabletek közös használatúak lehetnek.
- Az eszközön csak annyi adat legyen, amennyi a munkához kell; több szervezet adata nem keveredhet.

**Felület**
- Mindig látható állapotjelző: online / offline, a feltöltésre váró változások és fotók száma, az utolsó sikeres szinkron ideje, „Szinkronizálás most” gomb.
- A csak online elérhető funkciók offline állapotban látszanak, de letiltva, rövid magyarázattal.
- Ütközések és elutasított feltöltések külön listában, feloldási lehetőséggel.

## 5. Felhasználókezelés

Teljes felülettel, magyarul:

- **Regisztráció:** e-mail + jelszó, majd fióktípus-választás:
  - *Rendelőként regisztrálok* – megadja a rendelő adatait (cégnév, székhely, adószám, telefonszám), annak tulajdonosa lesz, és munkatársakat hívhat meg.
  - *Egyéni állatorvosként regisztrálok* – a saját nevére szóló egyfős fiók jön létre (név, cím; adószám megadható, de nem kötelező), amelyben ő a tulajdonos és az állatorvos is.

  Mindkét esetben elindul a próbaidőszak.
- **E-mail-megerősítés**, **elfelejtett jelszó / jelszó-visszaállítás**, jelszóerősség-ellenőrzés.
- **Bejelentkezés**, kijelentkezés, „emlékezz rám”, sikertelen próbálkozások korlátozása.
- **Kétlépcsős azonosítás (TOTP)** bekapcsolható, tartalékkódokkal; a tulajdonos a szervezetben kötelezővé teheti.
- **Meghívás e-mailben:** a tulajdonos/admin szerepkörrel együtt hív meg munkatársat; a meghívó lejár (7 nap), visszavonható, újraküldhető. Meglévő fiókkal rendelkező meghívott csak elfogadja, újnak regisztrálnia kell.
- **Profil:** név, megjelenített titulus (pl. „dr.”), jelszócsere, 2FA, aktív munkamenetek listája és kiléptetése.
- **Munkatársak kezelése:** lista, szerepkör-módosítás, felfüggesztés, eltávolítás. Az utolsó tulajdonos nem távolítható el és nem fokozható le. Az eltávolított munkatárs által rögzített szakmai adat megmarad, a neve a lapokon olvasható marad.
- **Fióktörlés és adatexport** kérhető (GDPR).

## 6. Jogosultságkezelés

Jogosultság-alapú modellt építs: a kód mindenhol **jogosultságkulcsot** ellenőriz (pl. `visit.finalize`), a szerepkör csak jogosultságok csomagja. Így később egyedi szerepkör is bevezethető kódmódosítás nélkül.

**Szervezeti szerepkörök és alapértelmezett jogosultságaik:**

| Képesség | Tulajdonos | Admin | Állatorvos | Asszisztens | Recepciós |
|---|:-:|:-:|:-:|:-:|:-:|
| Előfizetés, számlázási adatok kezelése | ✔ | megtekint | – | – | – |
| Szervezet adatai, beállításai | ✔ | ✔ | – | – | – |
| Munkatársak meghívása, szerepkörök | ✔ | ✔ (tulajdonost nem módosíthat) | – | – | – |
| Naplók megtekintése | ✔ | ✔ | – | – | – |
| Kódtörzs és szervezeti sablonok szerkesztése | ✔ | ✔ | ✔ | – | – |
| Gazdik és páciensek felvétele, szerkesztése | ✔ | ✔ | ✔ | ✔ | ✔ |
| Gazdi/páciens törlése | ✔ | ✔ | ✔ | – | – |
| Kezelési lap létrehozása, szerkesztése (piszkozat) | ✔ | ✔ | ✔ | ✔ | – |
| Kezelési lap megtekintése | ✔ | ✔ | ✔ | ✔ | ✔ |
| Kezelési lap lezárása | ✔* | – | ✔ | – | – |
| Lezárt lap újranyitása / kiegészítése | ✔* | – | ✔ | – | – |
| Csatolmány feltöltése (fotó, röntgen) | ✔ | ✔ | ✔ | ✔ | – |
| Gazdi-PDF letöltése, e-mailben küldése | ✔ | ✔ | ✔ | ✔ | ✔ (csak lezárt lapról) |
| Saját sablonok | ✔ | ✔ | ✔ | ✔ | – |

\* Csak ha a tulajdonos egyben állatorvosként is meg van jelölve (a tagságon „szakmai jogosultság” jelző).

**Egyéni állatorvos fiókjában** az egyetlen tag tulajdonos és szakmai jogosultsággal is rendelkezik, tehát mindent megtehet. A munkatársak és szerepkörök felületei ilyenkor nem jelennek meg; helyettük rövid tájékoztató áll arról, hogy munkatársak meghívásához Rendelő csomagra kell váltani. Egyéni állatorvos ettől függetlenül meghívható más rendelőkbe is, és a szervezetváltóval vált közöttük.

**Platformszintű szerepkörök** (a szolgáltatás üzemeltetői, külön admin felületen):

- **Szuperadmin:** szervezetek, felhasználók, csomagok, előfizetések kezelése; próbaidő hosszabbítása, kézi csomag-hozzárendelés.
- **Support:** olvasási jog + megszemélyesítés (a szervezet nevében belépés hibakereséshez) – minden megszemélyesítés naplózott, a felületen jól látható sáv jelzi, és szakmai adatot módosítani közben nem lehet.

Készíts **szerepkör–jogosultság áttekintő oldalt** a szervezeti beállításokban (csak olvasható mátrix), hogy a tulajdonos lássa, melyik szerepkör mit tehet.

## 7. Előfizetés és fizetés

### 7.1 Modell

- Az előfizető a **szervezet** – akár rendelő, akár egyéni állatorvos. Egy szervezetnek egyszerre egy aktív előfizetése van.
- **Díjszámítás: fix csomagdíj** felhasználói kerettel (nem felhasználónkénti díj).
- **Csomagok az adatbázisban** élnek (`Plan`: név, leírás, havi/éves Stripe ár-azonosító, keretek, funkciók, melyik fióktípusnak választható, láthatóság, sorrend), és a platform-admin felületről szerkeszthetők, újak is felvehetők. **Árat és keretet a kódba égetni tilos.**
- Kiinduló csomagszerkezet: **két fizetős csomag + próbaidő** (a számok helykitöltők, az admin felületről állíthatók):

| | Próba (14 nap, kártya nélkül) | Egyéni | Rendelő |
|---|:-:|:-:|:-:|
| Kinek választható | mindkét fióktípus | egyéni állatorvos | rendelő |
| Felhasználók száma | a fióktípus csomagja szerint | 1 | 10 |
| Munkatársak meghívása, szerepkörök | a fióktípus szerint | – | ✔ |
| Tárhely csatolmányokra | 2 GB | 10 GB | 100 GB |
| Sablonok, diktálás, saját logó a PDF-en | ✔ | ✔ | ✔ |
| Naplóexport | – | – | ✔ |
| Számlázás | – | magánszemély névre (adószám opcionális) | cégnévre, adószámmal |

- **Váltás a két típus között:** az egyéni állatorvos a Rendelő csomag választásával rendelővé alakítja a fiókját (megadja a céges adatokat), minden adata megmarad. Fordítva csak akkor lehet, ha a rendelőnek egyetlen tagja maradt.
- **Jogosultsági réteg a csomaghoz (entitlements):** egyetlen modul válaszol a „használhatja-e a szervezet az X funkciót?” és „mennyi a kerete Y-ból, mennyit használt el?” kérdésekre. A funkciókapu a szerveren ellenőriz; a felületen a nem elérhető funkció látszik, de zárolva, „Váltson csomagot” hivatkozással.

### 7.2 Állapotok és viselkedés

| Állapot | Mit lát / tehet a szervezet |
|---|---|
| Próbaidő | Teljes funkcionalitás a próbacsomag keretei között; sávban a hátralévő napok. Bankkártya nem kell az induláshoz. |
| Aktív | A csomag szerinti működés. |
| Fizetési hiba (türelmi idő, 7 nap) | Minden működik; figyelmeztető sáv a tulajdonosnak és adminnak, e-mail értesítés. |
| Lejárt / lemondott | **Csak olvasható mód:** a meglévő adatok megtekinthetők, PDF és adatexport készíthető, de új vizit, szerkesztés és feltöltés nem. Adat nem törlődik. |
| Lemondva, de az időszak végéig aktív | Normál működés, sávban a lejárat dátuma, „Mégis folytatom” gomb. |

Csomagváltáskor: felfelé azonnal (időarányos elszámolással), lefelé az időszak végén. Ha lefelé váltáskor a használat meghaladja az új keretet (pl. több felhasználó), a váltás előtt a felület megmondja, mit kell rendezni.

### 7.3 Stripe-integráció

- Szervezet ↔ Stripe Customer; a Checkout-munkamenet előfizetési módban, számlázási cím bekérésével; az adószám rendelőnél kötelező, egyéni állatorvosnál megadható.
- **Az igazság forrása a webhook.** A sikeres visszairányítás csak „feldolgozás alatt” állapotot mutat; az előfizetés állapotát kizárólag az aláírás-ellenőrzött webhook-események frissítik az adatbázisban. Kezelendő legalább: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`.
- A webhook-feldolgozás **idempotens** (eseményazonosító tárolása), és soron kívül érkező eseményeket is helyesen kezel.
- Fizetési mód kezelése és számlák: Stripe Customer Portal. A számlák listája az alkalmazáson belül is látszik, letöltési hivatkozással.
- Fejlesztés kizárólag Stripe **teszt módban**; kulcsok csak környezeti változóból. A `README` írja le a Stripe CLI-vel történő helyi webhook-tesztelést és a termékek/árak létrehozását (seed szkript teszt módhoz).

**Számlázás: Számlázz.hu.** A Stripe a pénzt szedi be, az adóügyi számlát a Számlázz.hu állítja ki.
- Minden sikeres terhelés (`invoice.paid`) után a rendszer a Számlázz.hu Számla Agent felületén automatikusan számlát állít ki a szervezet számlázási adataira, és a Számlázz.hu e-mailben elküldi a vevőnek. Az API-t az aktuális hivatalos dokumentáció alapján használd.
- **Egy terheléshez pontosan egy számla** készül (a Stripe-számla azonosítójához kötve, idempotensen), akkor is, ha a webhook többször érkezik.
- A számlakiállítás hibája nem befolyásolja az előfizetés állapotát: a feladat sorba kerül, növekvő várakozással újrapróbálkozik, tartós hiba esetén a platform-admin felületen jelzés jelenik meg, és onnan kézzel újraindítható.
- Visszatérítéskor sztornó-, illetve helyesbítő számla készül.
- A rendszer tárolja a számla sorszámát és a PDF-et (vagy annak hivatkozását); az előfizetés oldalon ezek a számlák tölthetők le. A Stripe saját számla- és nyugtaleveleit kapcsold ki, hogy a vevő ne kapjon két különböző bizonylatot.
- Az ÁFA-kulcs és az, hogy az árak nettóban vagy bruttóban értendők, a platform-admin felületen állítható (a kérdéslista B13 pontja szerint).
- Az `InvoiceProvider` interfésznek két megvalósítása legyen: a valódi Számlázz.hu, és egy szimulált a fejlesztéshez és a tesztekhez. Valódi hívás csak akkor történik, ha az Agent-kulcs környezeti változóban meg van adva; teszt közben valódi számla soha nem készülhet.

### 7.4 Felületek

- **Nyilvános árazási oldal** (az Egyéni és a Rendelő csomag összehasonlítása, havi/éves váltó, nettó és bruttó ár feltüntetésével).
- **Előfizetés oldal a szervezeti beállításokban:** jelenlegi csomag és állapot, következő terhelés dátuma, keretek kihasználtsága (felhasználók, tárhely) sávdiagrammal, csomagváltás, lemondás/újraaktiválás, fizetési mód, számlák, számlázási adatok.
- **Csomagválasztó és fizetési folyamat** (Checkout), siker- és megszakítás-oldal.
- **Zárolt funkció jelzése** és **keret elérésének jelzése** (pl. 7. felhasználó meghívásakor).
- **Fióktípus-váltás** (egyéni → rendelő) a céges adatok bekérésével.
- **Platform-admin:** csomagok szerkesztése, szervezetek listája (típus, csomag, állapot, használat), előfizetési események idővonala szervezetenként, próbaidő-hosszabbítás, díjmentes csomag kézi hozzárendelése, kiállított számlák és a sikertelen számlakiállítások listája újraindítással, ÁFA-beállítások.

## 8. Szakmai mag: a kezelési lap

### 8.1 Törzsadatok

- **Gazdi:** név, telefonszám, e-mail, cím, megjegyzés, hozzájárulás e-mail küldéséhez. Egy gazdinak több állata lehet.
- **Páciens:** név, faj (kutya / macska), fajta, születési dátum vagy becsült kor, ivar, ivartalanítási státusz, testtömeg (dátummal, előzménnyel), chipszám, megjegyzés. A páciens adatlapján a vizitek idővonala és a legutóbbi fogképlet látszik.
- Keresés gazdi nevére, állat nevére, chipszámra, telefonszámra.

### 8.2 A kezelési lap (vizit) szekciói

Egylapos, függőlegesen görgethető elrendezés, rögzített szekciónavigációval; nincs lapozás a szekciók között. Folyamatos automatikus mentés a helyi adatbázisba, a lapon „mentve az eszközön” / „szinkronizálva” jelzéssel (4.1 fejezet).

**A) Páciens és vizit adatai (fejléc)**
- Gazdi neve, állat neve, faj, fajta, kor, ivartalanítási státusz, testtömeg (a törzsadatból, a viziten felülírható aktuális testtömeggel).
- Anesztéziai státusz: ASA I–V, utolsó etetés ideje, előzetes vérvizsgálat rövid összefoglalója.
- Vizit dátuma, kezelőorvos (a szervezet állatorvosai közül), asszisztens.

**B) Előzmények és indikáció (anamnézis)**
- Fő panasz: gyorsválasztó címkék (bűzös lehelet / halitosis, fogkő, nyálzás, táplálkozási nehézség, fájdalom jelzése) + szabad szöveg.
- Otthoni szájhigiénia: fogmosás gyakorisága, táp típusa.

**C) Fogászati státusz** – odontogram, lásd 8.3–8.6.

**D) Beavatkozási és műtéti napló**
- Fájdalomcsillapítás és érzéstelenítés: helyi blokkok tételesen (pl. n. infraorbitalis, n. alveolaris inferior; oldal; helyi érzéstelenítő típusa és adagja).
- Képalkotás: fogászati röntgenfelvételek csatolása foghoz vagy kvadránshoz.
- Varratok típusa és leírása.

**E) Utókezelési terv és hazaadó lap**
- Gyógyszeres terápia tételesen: antibiotikum, fájdalomcsillapító, szájfertőtlenítő gél (dózis, gyakoriság, időtartam).
- Táplálási javaslat a műtét utáni napokra (pl. áztatott táp, pépes étel).
- Kontroll időpontja (ha van varrat, a rendszer 10–14 nap múlvára javasol dátumot, szerkeszthetően).

### 8.3 Odontogram (fogképlet)

**Elrendezés.** A felső állcsont (maxilla) felül, az alsó állkapocs (mandibula) alul; **a páciens jobb oldala a képernyő bal szélén** (mint röntgenfelvételen). A négy Triadan-kvadráns vizuálisan elkülönül.

**Fogkatalógus** (maradó fogazat; adatként tárold, ne a komponensbe égesd):

| Faj | 100 – jobb felső | 200 – bal felső | 300 – bal alsó | 400 – jobb alsó | Összesen |
|---|---|---|---|---|:-:|
| Kutya | 101–110 | 201–210 | 301–311 | 401–411 | 42 |
| Macska | 101–104, 106–109 | 201–204, 206–209 | 301–304, 307–309 | 401–404, 407–409 | 30 |

Megjelenítési sorrend balról jobbra – felső sor: 110 → 101 | 201 → 210; alsó sor: 411 → 401 | 301 → 311 (macskánál a hiányzó számok kimaradnak). Fogtípus a számból: 01–03 metszőfog, 04 szemfog, 05–08 előzápfog, 09–11 zápfog. A katalógus foganként tárolja a gyökérszámot is (a furkáció csak többgyökerű fognál rögzíthető); a gyökérszámokat a `docs/SZAKMAI_ELLENORZES.md`-ben listázd ki állatorvosi jóváhagyásra.

**Grafika.** A fogakat saját készítésű, sematikus, de felismerhető SVG-alakzatok ábrázolják fogtípusonként. A `referencia/` mappában lévő két kép **csak elrendezési és számozási referencia** – harmadik fél szerzői jogi védelem alatt álló ábrái, ezért **nem ágyazhatók be, nem rajzolhatók át és nem másolhatók**.

**Fogkártyák.** Minden fog külön, legalább 44×44 px érintési felületű elem a számával.
- Koppintás: megnyílik a fog részletes adatlapja (leletek, beavatkozások, tasakmélység, megjegyzések, csatolmányok).
- Hosszan nyomás vagy „Kijelölés” mód: több fog kijelölése. Kijelölési segédek: teljes kvadráns, felső/alsó ív, fogtípus szerint (pl. összes metszőfog), mind, kijelölés törlése.
- Minden tömeges művelet visszavonható (visszavonás / újra).

**Színkódolás** – egy pillantásra látszódjon a szájüreg állapota. Ha egy fogra több is igaz, a listában előrébb álló nyer:

1. Piros – kihúzandó vagy kihúzott (EXT)
2. Kék – gyökérkezelt / gyökérkezelésre tervezett (ENDO)
3. Narancs – gyulladt vagy kezelést igényel (G, PD, FX, RES, Mob, Fur)
4. Sárga – csak fogkő (T)
5. Zöld – egészséges
6. Szürke, szaggatott körvonal – hiányzó fog (M, EXT-prev)

A szín mellett a fogkártyán rövid kódjelvények is látszanak (pl. „T2”, „PD3”), hogy a jelentés ne csak a színen múljon. A színek és a prioritás a szervezeti beállításokban módosítható legyen.

**Áthozatal.** Új vizit indításakor a páciens előző lezárt lapjáról a tartós állapotok (hiányzó, korábban kihúzott, gyökérkezelt fog) automatikusan átkerülnek; a többi lelet nem. A páciens adatlapján a korábbi fogképletek időrendben visszanézhetők.

### 8.4 Kódtörzs (leletek és beavatkozások)

A kódok adatként élnek (rendszerszintű alapkészlet + szervezeti kiegészítések), nem a kódban. Alapkészlet:

**Diagnosztikai / státuszkódok**

| Kód | Jelentés | Fokozatok / altípusok |
|---|---|---|
| 0 | Egészséges | – |
| T | Fogkő (tartarus) | T1 enyhe · T2 közepes · T3 súlyos, az egész koronát borítja |
| G | Ínygyulladás (gingivitis) | G1 enyhe vörösség · G2 ödémás, vérzékeny |
| PD | Parodontális betegség | PD1 3 mm alatti tasak · PD2 3–4 mm · PD3 4–6 mm · PD4 6 mm feletti, kifejezett csontvesztés |
| Mob | Mobilitás | Mob1 <1 mm oldalirányú · Mob2 >1 mm oldalirányú · Mob3 függőleges (axiális) mozgás is |
| Fur | Furkáció-érintettség | Fur1–Fur3 (csak többgyökerű fogon) |
| FX | Fogtörés | FX-C komplikált koronatörés (nyitott pulpa) · FX-NC nem komplikált koronatörés · FX-R gyökértörés |
| RES | Reszorptív lézió (FORL / TR) – **csak macskánál** | TR1 cement-/zománckárosodás · TR2 dentint érintő · TR3 pulpát elérő · TR4 meggyengült korona · TR5 gyökérmaradványok |
| M | Hiányzó fog | M valóban hiányzik · EXT-prev korábban kihúzták · IMP impaktált |

**Terápiás / beavatkozási kódok**

| Kód | Jelentés | Altípusok |
|---|---|---|
| U | Ultrahangos fogkő-eltávolítás | – |
| POL | Polírozás | – |
| EXT | Fogeltávolítás | EXT-S egyszerű, zárt · EXT-SURG sebészi (lebeny, fogszeparálás) |
| ENDO | Gyökérkezelés / vitális pulpakezelés | zárt · nyitott |
| RX | Intraorális röntgen készült | a jelölés megnyitja a csatolt képet |

Minden beavatkozásnak állapota van: **tervezett** vagy **elvégzett**. Szabályok: fajhoz nem tartozó kód nem választható (RES kutyánál); hiányzó fogra új lelet nem vehető fel; U rögzítésekor a rendszer felajánlja a POL-t is („fogkő-eltávolítás után kötelező lépés”), de nem kényszeríti.

### 8.5 Gyorsbeviteli panel

A képernyő szélén (álló tájolásnál alul) mindig látható sáv a leggyakoribb diagnosztikai és terápiás gombokkal, színnel és ikonnal megkülönböztetve. Logika: **kijelölés → művelet.**

1. A felhasználó kijelöl egy vagy több fogat (pl. 104, 204, 304).
2. Megnyom egy gyorsgombot (pl. FX).
3. A rendszer mindegyik kijelölt foghoz hozzárendeli a leletet, a fogak színe azonnal frissül, és ha a kódnak van fokozata/altípusa, egyetlen kis panel kéri be azt az összes kijelölt fogra (pl. „Nyitott a pulpa?”).

- Összetett gyorsgomb: pl. **„Fogkő-eltávolítás + polírozás”** egy érintéssel U + POL az összes kijelölt fogra.
- A panel gombjai és sorrendje szervezetenként testre szabható; összetett gombok létrehozhatók.
- Kijelölés nélkül megnyomott gomb „ecset” módba vált: a következő megérintett fogak kapják a címkét, amíg a felhasználó ki nem kapcsolja.

### 8.6 Tasakmélység és megjegyzések

- A fog adatlapján a mérési pontok sematikus elrendezésben jelennek meg (alapértelmezés: 6 pont – meziobukkális, bukkális, disztobukkális, meziolingvális/-palatinális, lingvális/palatinális, disztolingvális/-palatinális; a szervezet 4 pontos módra válthat).
- Bevitel 0–12 mm között gyorsgombokkal vagy léptetővel; érték megadása után a fókusz automatikusan a következő pontra ugrik.
- A küszöb feletti érték (alapértelmezés: 4 mm felett, fajonként állítható) pirossal kiemelve jelenik meg az adatlapon és jelzésként a fogkártyán.
- A mért értékekből a rendszer **javasolhat** PD-fokozatot, de automatikusan nem állítja be.
- Foganként szabad szöveges megjegyzés; a lap szintjén általános megjegyzés.

### 8.7 Csatolmányok: röntgen és fotó

- Feltöltés fájlból vagy közvetlenül a tablet kamerájával.
- Minden csatolmány kapcsolódhat a vizithez, egy kvadránshoz vagy egy konkrét foghoz; típusa: röntgen, „előtte” fotó, „utána” fotó, egyéb.
- **Előtte–utána gyorsmód:** a fogászati egységnél egy érintéssel fényképezhető, a kép azonnal a pácienshez és (ha van kijelölt fog) a foghoz rendelődik; az összetartozó párok egymás mellett nézhetők.
- Bélyegkép, teljes képernyős nézet nagyítással. Engedélyezett formátumok: JPEG, PNG, WebP, PDF; méretkorlát és típusellenőrzés a szerveren. A tárhelyhasználat beleszámít a csomag keretébe.
- Kapcsolat nélkül készített fotó az eszközön tárolódik, azonnal látszik a lapon, és a kapcsolat visszatérésekor töltődik fel.

### 8.8 Sablonok

- **Kezelési sablon:** leletek, beavatkozások és szövegek mentett csomagja, amely egy kattintással betölthető (pl. „Rutin fogtisztítás, 2. stádium + 1 db metszőfog-extrakció”, „Idős macska teljes szájüregi státusz + FORL-extrakciók”). Betöltéskor a felhasználó megadja, mely fogakra vonatkozzon, ha a sablon nem rögzíti.
- **Szövegsablon:** gyakori szövegrészek az utókezeléshez, táplálási javaslathoz, műtéti leíráshoz.
- Szervezeti (mindenki látja) és saját sablonok; meglévő lapból sablon menthető.

### 8.9 Diktálás

- Állandó mikrofon gomb a képernyő alján, valamint minden többsoros szövegmezőnél.
- A felismert szöveget a rendszer megerősítésre felkínálja, mielőtt elmenti.
- **Fogszám-felismerés:** ha a diktált szövegben Triadan-szám szerepel (pl. „a 104-es fog gyökerénél sipolynyílás van, sárgás váladékkal”), a megjegyzés a 104-es fog adatlapjához rendelődik; ha nincs szám, az éppen kijelölt foghoz, kijelölés híján az általános megjegyzéshez. A célhely a megerősítésnél módosítható.
- Ha a böngésző nem támogatja a beszédfelismerést, vagy nincs internetkapcsolat, a gomb ezt érthetően jelzi; a funkció csomagfüggő (7.1).

### 8.10 Gazdinak szóló összefoglaló (PDF)

Egy gombnyomásra készülő, közérthető, látványos dokumentum:
- rendelő neve, logója (csomagfüggő), elérhetősége; páciens és vizit adatai;
- színes fogképlet jelmagyarázattal: melyik foggal mi történt;
- beavatkozások közérthető magyarázattal (kódonként szerkeszthető laikus szöveg a kódtörzsben, pl. miért kellett egy fogat eltávolítani);
- előtte–utána fotók (kiválasztható, melyek kerüljenek bele);
- gyógyszerek, táplálási javaslat, kontroll időpontja.

Letölthető, nyomtatható, és a gazdinak e-mailben elküldhető az alkalmazásból (csak ha a gazdinál rögzítve van a hozzájárulás; a küldés naplózott). A PDF A4-es, nyomtatóbarát.

Kapcsolat nélkül a szerveroldali PDF nem készíthető: ilyenkor ugyanebből a tartalomból nyomtatási nézet nyílik (a böngésző nyomtatás / mentés PDF-be funkciójával használható), az e-mail-küldés pedig sorba áll a kapcsolat visszatéréséig.

### 8.11 Lezárás és módosíthatóság

- A lap állapota: **piszkozat → lezárt**. Lezárni csak szakmai jogosultsággal lehet; lezáráskor a rendszer ellenőrzi a kötelező mezőket (dátum, kezelőorvos, ASA-státusz) és figyelmeztet a nyilvánvaló hiányokra (pl. tervezett, de el nem végzett beavatkozás).
- Lezárt lap tartalma nem írható át; módosítás csak **újranyitással** (indoklás kötelező, naplózott) vagy **kiegészítő bejegyzéssel** lehetséges.
- **Lezárni és újranyitni csak online lehet** (szerveren ellenőrzött, naplózott esemény). Kapcsolat nélkül a lap „lezárásra kész” jelölést kaphat, és a kapcsolat visszatérésekor a rendszer felkínálja a lezárást.
- Ha ketten szerkesztik ugyanazt a lapot (orvos és asszisztens), ne vesszen el adat: mezőszintű összefésülés és ütközésjelzés a 4.1 fejezet szerint; online állapotban a felület mutassa, ki van még a lapon.

## 9. Képernyők

**Nyilvános:** nyitóoldal · árazás · regisztráció · bejelentkezés · e-mail-megerősítés · elfelejtett jelszó · meghívó elfogadása · ÁSZF és adatkezelési tájékoztató (helykitöltő szöveggel).

**Alkalmazás:** irányítópult (mai vizitek, félbehagyott piszkozatok, legutóbbi páciensek) · gazdik (lista, adatlap) · páciensek (lista, adatlap idővonallal) · kezelési lap (8. fejezet) · sablonok · szervezeti beállítások (adatok és logó, munkatársak és meghívók, szerepkörök áttekintése, kódtörzs, gyorsbeviteli panel, fogképlet-beállítások, előfizetés, napló) · profil.

**Platform-admin** (külön útvonal, külön jogosultság): szervezetek · felhasználók · csomagok · előfizetések és események · megszemélyesítés · rendszernapló.

Minden lista: keresés, szűrés, lapozás, üres állapot. Minden űrlap: mezőszintű hibaüzenet magyarul. Minden törlés megerősítést kér.

## 10. Nem funkcionális követelmények

- **Tablet-első, reszponzív:** elsődleges célkészülék a 10–13"-os tablet álló és fekvő tájolásban; asztali gépen és telefonon is használható (telefonon a fogképlet kvadránsonként váltható nézetben).
- **Kesztyűs használat:** nagy érintési felületek, kevés gépelés, nincs hover-függő funkció.
- **Biztonság:** a jelszókezelést a Supabase Auth végzi, biztonságos munkamenet-sütik, CSRF-védelem, kéréskorlátozás a hitelesítési végpontokon, szerveroldali bemenet-ellenőrzés, fájlok csak aláírt URL-en érhetők el, titkok kizárólag környezeti változóban.
- **Adatvédelem (GDPR):** a gazdik személyes adatait a rendelő adatkezelőként, a szolgáltatás adatfeldolgozóként kezeli. Szervezeti adatexport (géppel olvasható formátum + csatolmányok), gazdi adatainak törlése/anonimizálása, EU-n belüli tárolás feltételezése.
- **Megbízhatóság:** a szakmai munka kapcsolat nélkül is folytatható (4.1 fejezet); a felület mindig egyértelműen mutatja, mi van csak az eszközön és mi van már a szerveren. A böngésző bezárása, újratöltése vagy az eszköz újraindítása nem okozhat adatvesztést.
- **Akadálymentesség:** megfelelő kontraszt; az állapotot szín mellett szöveg/jelvény is hordozza; billentyűzettel is kezelhető.
- **Üzemeltethetőség:** strukturált naplózás, állapotellenőrző végpont, migrációk, `README` a helyi futtatáshoz és az élesítés lépéseihez.

## 11. Megvalósítási fázisok

1. **Alapozás:** projektváz, helyi Supabase-környezet, adatbázis és migrációk, típusgenerálás, megjelenési alapok (színek, tipográfia, tablet elrendezés), nyelvi réteg, telepíthető PWA-váz, CI-parancsok (lint, típusellenőrzés, teszt).
2. **Felhasználók és szervezetek:** regisztráció mindkét fióktípussal, belépés, e-mail-megerősítés, jelszó-visszaállítás, 2FA, meghívók, szervezetváltó, profil.
3. **Jogosultságok és napló:** jogosultságkulcsok, szerepkörök, szerveroldali ellenőrzés, RLS-szabályok, bérlőszigetelési tesztek, napló és megtekintő felülete.
4. **Előfizetés és számlázás:** csomagok, entitlements réteg, Stripe Checkout + Portal + webhookok, Számlázz.hu-számlakiállítás (szimulált megvalósítással tesztelve), fióktípus-váltás, előfizetési felületek, csak olvasható mód, platform-admin.
5. **Offline alapréteg:** helyi adatbázis, szinkronmotor, kimenő sor, ütközéskezelés, állapotjelző, PIN-zár – egy egyszerű adattípuson (gazdi) végponttól végpontig igazolva, mielőtt a szakmai képernyők ráépülnek.
6. **Törzsadatok:** gazdik, páciensek, keresés, irányítópult – már a helyi adatbázisra építve.
7. **Kezelési lap váza:** A, B, D, E szekciók, automatikus mentés, lezárás/újranyitás.
8. **Odontogram:** fogkatalógus, SVG fogképlet kutyára és macskára, fogadatlap, kódtörzs, színkódolás, kijelölés, gyorsbeviteli panel, tasakmélység, visszavonás, áthozatal.
9. **Csatolmányok, sablonok, diktálás** – offline fotósorral.
10. **Gazdi-PDF és e-mail-küldés** – offline nyomtatási nézettel és küldési sorral.
11. **Lezárás:** végponttól végpontig tesztek a fő folyamatokra (offline forgatókönyvekkel együtt), adatexport, biztonsági átnézés, dokumentáció (`README`, `docs/DONTESEK.md`, `docs/SZAKMAI_ELLENORZES.md`).

A seed szkript hozzon létre: egy demó rendelőt minden szerepkörrel (a belépési adatokat a `README` írja le, ne a kód), egy második rendelőt a szigetelés teszteléséhez, egy egyéni állatorvos fiókot, egy platform-szuperadmint, valamint mintaként egy kutya és egy macska pácienst egy-egy kitöltött kezelési lappal.

## 12. Elfogadási kritériumok

A munka akkor kész, ha az alábbiak mind igazolhatók (teszttel vagy a `README` szerinti kézi lépéssel):

1. Új felhasználó regisztrál, megerősíti az e-mail-címét, létrejön a rendelője próbaidőszakkal.
2. A tulajdonos meghív egy állatorvost és egy asszisztenst; mindkettő csak a szerepköre szerinti műveleteket éri el – a tiltott műveletet a szerver közvetlen kérésre is megtagadja.
3. Az egyik rendelő felhasználója semmilyen úton nem fér hozzá a másik rendelő adataihoz.
4. A tulajdonos Stripe teszt módban előfizet; a csomag a webhook hatására aktiválódik; csomagot vált; lemond; a lejárat után a rendelő csak olvasható módba kerül, az adatai megmaradnak.
5. Sikertelen fizetés webhookja után megjelenik a figyelmeztetés, a türelmi idő letelte után a csak olvasható mód.
6. A csomagkeret elérésekor (pl. felhasználószám) a rendszer érthető üzenettel megállít, és felkínálja a váltást.
7. Kutya páciensnél 42, macskánál 30 fog jelenik meg helyes Triadan-számozással és oldalhelyességgel.
8. Öt fog kijelölése után egyetlen érintéssel rájuk kerül a „fogkő-eltávolítás + polírozás”; a művelet visszavonható.
9. Három szemfog kijelölése + FX: mindhárom megkapja a leletet, a részletező panel egyszer kérdez, a fogak színe frissül.
10. Tasakmélység rögzíthető pontonként; a küszöb feletti érték piros.
11. Fotó készíthető a tablet kamerájával, és a kijelölt foghoz rendelődik; röntgen csatolható kvadránshoz.
12. Sablon menthető és betölthető.
13. A „104-es fog…” kezdetű diktált megjegyzés megerősítés után a 104-es foghoz kerül.
14. A gazdi-PDF elkészül a színes fogképlettel, és e-mailben elküldhető.
15. Lezárt lap nem szerkeszthető; újranyitás csak indoklással, és megjelenik a naplóban.
16. A platform-admin módosít egy csomagkeretet, és a változás kódmódosítás nélkül érvényesül.
17. Egyéni állatorvosként regisztrálva egyfős fiók jön létre, amelyben munkatárs nem hívható meg; Rendelő csomagra váltva a fiók rendelővé alakul, és minden korábbi adata megmarad.
18. Sikeres fizetés után számla készül a Számlázz.hu-megvalósításon keresztül (tesztben a szimulálttal igazolva): egy terheléshez pontosan egy, ismételt webhook esetén is; a számla letölthető az előfizetés oldalról. Sikertelen számlakiállítás látszik a platform-adminban, és újraindítható.
19. Kapcsolat nélkül az alkalmazás elindul, a páciens megnyitható, új kezelési lap indítható, a fogak jelölhetők, tasakmélység rögzíthető, fotó készíthető.
20. A kapcsolat visszatérésekor minden helyi változás és fotó feltöltődik, duplikáció nélkül; a felület végig mutatja a szinkron állapotát. A böngésző bezárása és újranyitása offline állapotban nem okoz adatvesztést.
21. Két eszköz kapcsolat nélkül szerkeszti ugyanazt a lapot: szinkron után egyik eszköz adata sem vész el csendben, az ütközés látható és feloldható.
22. Kijelentkezéskor a helyi adatok törlődnek az eszközről; fel nem töltött változás esetén a rendszer előbb figyelmeztet. Tétlenség után PIN-kód kell a folytatáshoz.

## 13. Amit ne csinálj

- Ne ágyazd be és ne rajzold át a referenciaképek ábráit; ne használd harmadik fél logóját.
- Ne építs gyógyszeradag-számítást, automatikus diagnózist vagy kezelési javaslatot – az alkalmazás rögzít és megjelenít, nem dönt.
- Ne építs gazdiknak szóló belépést/portált, időpontfoglalót, készletkezelést, a rendelő saját ügyfeleinek szóló díjtételezést vagy számlázást, illetve natív mobilalkalmazást (az offline működést a telepíthető webalkalmazás adja).
- Ne vezess be felhasználónkénti díjszámítást és harmadik fizetős csomagot; a csomagok az admin felületről később bővíthetők.
- Ne használj éles Stripe-kulcsot; ne írj árat, keretet, titkot vagy belépési adatot a forráskódba.
- Ne vezess be tejfogazatot (Triadan 500–800) vagy további fajokat, de a fogkatalógus adatszerkezete tegye lehetővé a későbbi bővítést.
- Ne jelents késznek olyan fázist, amelynek a tesztjei nem futnak le zölden – ilyenkor írd le pontosan, mi nem működik.
