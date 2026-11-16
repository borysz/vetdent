# Menet közben felmerült kérdések

A fejlesztés közben felmerült kérdések gyűjtőhelye. Egyik sem állította meg a munkát: mindegyiknél ott van, mivel számoltam addig is. Ha egy válasz megszületik, a „Válasz” sorba kerül, és a kód ahhoz igazodik.

A projekt indulása előtti kérdések a [`referencia/TISZTAZANDO_KERDESEK.md`](../referencia/TISZTAZANDO_KERDESEK.md) fájlban vannak.

## Döntést igényel

**1. Hol legyen a kód biztonsági mentése?**
- Miért kérdés: a projekt a `C:\Users\borosn\dev\vetdent` mappában van, a OneDrive-on kívül, és a Git-tároló csak ezen a gépen létezik. Ha a géppel történik valami, a munka elvész.
- Addig is: minden lépés helyi Git-commitba kerül.
- Javaslat: privát távoli tároló (pl. GitHub) létrehozása; a feltöltést egy paranccsal be tudom állítani.
- Válasz: ✅ **Megoldva (2026-11-16).** Privát GitHub-tároló: <https://github.com/borysz/vetdent>, ág: `main`. A `.env.local` és a szerzői jogi védelem alatti képek szándékosan nincsenek benne. Mentés: `git push`.

**2. Melyik levélküldő szolgáltatót használjuk, és milyen címről menjenek a levelek?** (a kérdéslista H5 pontja)
- Miért kérdés: enélkül a meghívó hivatkozását a meghívónak kézzel kell továbbítania, a megerősítő és jelszó-visszaállító levelek pedig a Supabase gyári, angol sablonjával és korlátozott próba-levélküldőjével mennek ki (óránként néhány levél).
- Addig is: a meghívó hivatkozása megjelenik a képernyőn másolásra.
- Válasz:

**3. Tegező vagy magázó legyen a felület?**
- Addig is: magázó („Adja meg az e-mail-címét”).
- Válasz:

**4. Megfelel-e, hogy a tartalékkód kikapcsolja a kétlépcsős azonosítást?**
- Miért kérdés: a Supabase csak hitelesítővel ad teljes értékű belépést, ezért a tartalékkód nem „beenged”, hanem kikapcsolja a kétlépcsős azonosítást a fiókon; a felhasználó utána jelszóval lép be, és újra beállíthatja.
- Addig is: így működik.
- Válasz:

**5. Kérje-e a rendszer a régi jelszót jelszócserekor?**
- Addig is: nem kéri (a bejelentkezett munkamenet az igazolás).
- Válasz:

**6. Mi történjen a rendelő adataival fióktörléskor, és mennyi ideig kell megőrizni a kezelési dokumentációt?** (a kérdéslista B10 és I2 pontja)
- Miért kérdés: enélkül nem tudom felelősen megépíteni a fiók- és rendelőtörlést.
- Addig is: törlés nincs az alkalmazásban; a munkatárs eltávolítható, a rendelő nem törölhető.
- Válasz:

**7. Kell-e, hogy a tulajdonos kötelezővé tehesse a kétlépcsős azonosítást a rendelőben?**
- Addig is: mindenki magának kapcsolja be; rendelőszintű kötelezés nincs.
- Válasz:

**11. Stripe-fiók és tesztkulcsok** (a kérdéslista B8 pontja)
- Miért kérdés: a fizetés bekötéséhez Stripe-fiók kell, teszt módú kulcsokkal. Ezeket neked kell létrehoznod és a `.env.local` fájlba írnod (én nem láthatom őket).
- Addig is: elkészülnek a csomagok, a próbaidő, a keretek, a csak olvasható mód és az előfizetés oldal; a „fizetés” gomb még nem visz sehová.
- Válasz:

**12. Mennyibe kerüljenek a csomagok, és mik legyenek a pontos keretek?** (a kérdéslista B1, B5, B6 pontja)
- Addig is: az Egyéni csomag 1 felhasználóval és 10 GB tárhellyel, a Rendelő csomag 10 felhasználóval és 100 GB tárhellyel szerepel; ár nincs megadva, az árazási oldal ezt jelzi. Minden érték az adatbázisban van, kódmódosítás nélkül állítható.
- Válasz:

**13. Számlázz.hu-fiók, Számla Agent kulcs, ÁFA-beállítás** (a kérdéslista B13 és B14 pontja)
- Addig is: a számlázás nincs bekötve.
- Válasz:

**14. Ki legyen a platform első szuperadminja?** (a kérdéslista C8 pontja)
- Miért kérdés: a platform-admin felülethez (csomagok szerkesztése, rendelők listája, próbaidő-hosszabbítás) ki kell jelölni legalább egy üzemeltetői fiókot.
- Addig is: platform-admin felület nincs; a csomagok és beállítások az adatbázisban módosíthatók.
- Válasz:

**15. Milyen megoldásra épüljön az offline működés?** (5. fázis)
- Miért kérdés: ez a projekt legnagyobb architekturális döntése. A lehetőségek: kész szinkronszolgáltatás (külön üzemeltetendő szerverrel jár), kész kliensoldali könyvtár, vagy saját megoldás (helyi adatbázis a böngészőben + kimenő sor + mezőszintű összefésülés).
- Addig is: nem kezdtem el. Javaslatom a saját megoldás, mert nem kell hozzá külön szerver, és a kezelési lap összefésülési szabályai (fogankénti leletek) pontosan ránk szabhatók; cserébe több a saját kód és a teszt.
- Válasz:

**16. Meddig használható a demó verzió ingyen?** (2026-11-16: a fizetés és a számlázás a demó utánra halasztva)
- Miért kérdés: jelenleg minden új fiók 14 napos próbaidővel indul, utána csak olvasható lesz. Egy ingyenes demóban ez kizárná a felhasználókat. A 11–13. és 14. kérdés (Stripe, árak, Számlázz.hu, platform-admin) a demó utánra marad.
- Addig is: a beállítás nem változott (14 nap); a próbaidő hossza az adatbázisban (`billing_settings.trial_days`) kódmódosítás nélkül átállítható.
- Javaslat: a demó időtartamára hosszú próbaidő (pl. 365 nap), és a fizetős csomagok bevezetésekor külön döntés a meglévő demófiókokról.
- Válasz:

**17. A gazdik felületét (offline) még nem sikerült a böngészőben kipróbálni.** (2026-11-16)
- Mi történt: a kód elkészült, a típusellenőrzés, a lint, a build és a 101 egységteszt hibátlan, a szinkronprotokoll 21 integrációs tesztje is átment. A böngészős kipróbálás viszont nem sikerült: a böngészőpanel rejtve volt, és a fejlesztői szerver a Supabase Auth felé `fetch failed` hibát kapott, miközben ugyanarról a gépről egy különálló Node-szkript elérte a Supabase-t.
- Gyanú: a gépen vállalati TLS-vizsgáló (Sophos) van, amely a Supabase felé a korábbinál másként viselkedik; a közvetlen adatbázis-kapcsolat (`supabase db push`) ugyanezért nem működött, a migrációt a HTTPS-es `db query` úton vittem fel, és a migrációs előzményt kézzel rögzítettem.
- Kérés: nyisd meg a böngészőpanelt, vagy próbáld ki te: bejelentkezés → Gazdik → új gazdi felvétele → a böngésző fejlesztői eszközeiben „Offline” mód → szerkesztés → újra online, és nézd meg, feltöltődik-e a változás.
- Válasz:
- Részben megoldva (2026-11-16, új gép): a böngészőpanelben szimulált offline móddal (a Supabase-kérések elutasítása és `navigator.onLine` felülírása) az offline felvett gazdi függő maradt, online módra váltva feltöltődött, a törlése is. Valódi böngészős offline móddal (F12 → Network → Offline) még nem próbáltam; ez a service workerrel együtt a következő próba.

**18. MEGOLDVA (a böngészőpanel sajátossága, nem az alkalmazás hibája): a teljes oldalbetöltés „nem éled fel” a panelben.** (2026-11-16)
- Tünet: frissítés után (pl. `/app/paciensek`, `/app`, `/app/gazdik`) az oldal a „Betöltés az eszközről…” szövegnél marad, mert a React nem kapcsolja át interaktívra (a `div#S:0` stream-szegmens rejtve marad, a header/menü elemein nincs React-kötés). Menüből kattintva minden működik.
- Mért adatok: a fejlesztői szerver naplójában `AuthRetryableFetchError: fetch failed` hibák; a böngészőben „The server could not finish this Suspense boundary… Switched to client rendering” és „Router action dispatched before initialization”. Külön Node-szkript ugyanarról a gépről 12/12 alkalommal elérte a Supabase-t (30–110 ms). A szerveroldali renderelés 300–500 ms alatt lefut.
- Gyanúk: (1) a panel által indított szerverfolyamat környezete; (2) a céges hálózati védelem (Sophos) szakaszos beavatkozása; (3) munkamenet-frissítés (`getClaims`) hibája a szerveroldali renderben. Közös nevező, hogy a szerveroldali Supabase-hívás hibája a teljes `OfflineBoundary` Suspense-határt elrontja.
- Próba: `npm run dev` a saját terminálban, majd `http://localhost:3000/app/paciensek` frissítése. Ha ott működik, a hiba a panel környezetében van.
- Részben megoldva (2026-11-16): ha a szerver nem éri el az auth szervert, az már nem számít „nincs bejelentkezve”-nek (nem dob ki a belépési oldalra, a proxy sem irányít át), hanem hibaoldal jelenik meg „Újrapróbálom” gombbal (`src/app/app/error.tsx`). Ez a tünetet szelídíti, az okot nem szünteti meg.
- Új gépen (2026-11-16) a fejlesztői szerverrel a belépés és a `/app/paciensek` hiba nélkül betöltött, `fetch failed` nem jelentkezett; a hosszabb frissítgetéses próba még hátravan.
- Kész: a service worker (`public/sw.js`), amely éles buildben a kiszolgált oldalakat eltárolja, így hálózat nélkül is elindul az alkalmazás. **Még hátravan:** valódi böngészős próba (`npm run build`, `npm run start`, bejelentkezés, oldalak megnyitása, utána hálózat nélkül frissítés). A panel beépített böngészője nem engedte a regisztrációt, ott nem lehetett kipróbálni.
- **Ok (2026-11-16, igazolva):** a böngészőpanel addig nem rajzol képkockát az oldalnak, amíg valami nem kér egyet (fókusz, képernyőkép, kattintás); a `requestAnimationFrame` addig nem fut le (mérve: `document.hasFocus()` hamis, a rAF 2 másodperc alatt sem tüzelt). A React 19.2 a streamelt Suspense-szegmens felfedését (`$RC`, a rejtett `div#S:0`) képkockához köti, ezért az `/app` alatti oldalak (ahol a tartalom Suspense mögül streamelődik) a „Betöltés…” szövegen maradnak, és a kliens nem kapcsol át. A nyilvános oldalak azért hydratáltak, mert nincs Suspense mögötti tartalmuk. Bizonyíték: a hiba 30 másodpercig is megmaradt, egyetlen képernyőkép után az oldal azonnal felfedte magát és működött. A szerver HTML-je minden esetben teljes és hibátlan volt.
- **Teendő nincs az alkalmazásban.** Valódi böngészőben (a felhasználó Chrome-jában) nem jelentkezik, mert ott az oldal fókuszban van; háttérfülön a felfedés a fókuszba kerüléskor megtörténik. A panelben teljes oldalbetöltés után egy képernyőkép (vagy kattintás) elég az aktiváláshoz; kliensoldali navigáció (`window.next.router.push`) eleve működik.
- Az `AuthRetryableFetchError` a régi gépen külön jelenség volt (céges hálózati védelem); az új gépen nem jelentkezett.
- Válasz:

## Tudnivaló, teendő nélkül is rendben van

**8. Az `npm audit` 7 közepes súlyosságú sérülékenységet jelez a függőségekben.**
- Fejlesztői eszközöket érintenek (pl. a kódellenőrző egy régebbi verzióját); még nem néztem át tételesen. Élesítés előtt át kell nézni.

**9. A törölt felhasználó munkamenete a lejáratáig (legfeljebb kb. egy óráig) érvényes marad.**
- Adathoz nem fér hozzá, mert a tagságai és a profilja törlődtek, de a felületen bejelentkezettnek látszik. Ha ez gond, a felhasználó törlésekor a munkameneteit is azonnal vissza kell vonni.

**10. A Supabase-projekt a parancssori eszközben „production” jelöléssel szerepel.**
- Ez a Supabase fő ágának neve, nem azt jelenti, hogy éles rendszer. Élesítéshez külön projekt kell (a kérdéslista H6 pontja); az integrációs teszteket éles projekten soha nem szabad futtatni.

**11. A kezelési lap (7. fázis) böngészős próbája.** (2026-11-16)
- Kipróbálva a böngészőpanelben (éles build): új vizit a páciens oldaláról, automatikus mentés, szinkron a szerverre, lezárás, újranyitás indoklással, piszkozat törlése. Nem próbáltam: offline szerkesztés a vizit lapján, két eszköz egyidejű szerkesztése, jogosultság nélküli felhasználó, telefonos és fekvő/álló tablet nézet.
- A teljes oldalbetöltés a panelben itt is megakadt az `/app` alatt (lásd 18. pont): éles módban is, a szerver HTML-je hibátlan és teljes. Kliensoldali navigációval (`window.next.router.push`) minden működött. A hiba tehát nem a kezelési lapé, de a 18. pont továbbra is az első teendő.
- A próba két naplóbejegyzést hagyott a fiók naplójában (`visit.finalized`, `visit.reopened`, indoklás: „Próba: a felület kipróbálása”); a naplóbejegyzések nem törölhetők.
- Hátravan: az ütközések megjelenítése (a lezárt lapra érkező elutasított szerkesztések is ide kerülnek), a „ki van még a lapon” jelzés, a lezárási figyelmeztetések (az odontogram után).
- Az `entitlements` integrációs teszt „14 napos próbaidő” ellenőrzése 14,00002 napot mért (határ: 14); a gép órája másodpercekkel eltér a szerverétől. Nem a kezelési laphoz tartozik; ha gyakran előfordul, a határt kerekíteni kell.

**12. Az odontogram (8. fázis): ami még nem készült el, és amit nem próbáltam.** (2026-11-16)
- Nem készült el (a prompt kéri, a váz működik nélküle): a színek és prioritásuk, a gyorsgombok sorrendje és az összetett gombok **szervezeti beállítása**; a **4 pontos** tasakmérés módja és a küszöb **fajonkénti** állítása; **telefonon** kvadránsonként váltható nézet (most vízszintesen görgethető sor); a **röntgen** (RX) jelölés megnyitja a csatolt képet (a csatolmányok a 9. fázisban jönnek); a páciens adatlapján a **korábbi fogképletek időrendben** (a vizitek listája megvan, a fogkép nem).
- Böngészőpanelben kipróbálva (éles build): kijelölés (szemfogak), fogkő T2 négy fogra, fogkő-eltávolítás után a polírozás felajánlása és rögzítése, visszavonás és újra, ecset mód, hiányzó fog és a rá felvett lelet elutasítása, fogadatlap tasakmélységgel és PD-javaslattal, mély tasak jelzése, a szerveren megjelenő rekordok, a lezárt vizit olvasható fogképlete, az áthozatal új vizitre. Nem próbáltam: hosszú nyomás érintőképernyőn (a panelben egérrel nem szimulálható), álló tablet, billentyűzetes használat, két eszköz egyidejű fogképe.
- Az ütközések megjelenítése és a lezárási figyelmeztetés („tervezett, de el nem végzett beavatkozás”) most már megvalósítható volna: a fogképlet megvan.
- Fur (furkáció) csak többgyökerű fogra kérhető az alkalmazásban, az adatbázis ezt nem ellenőrzi.

## A 2. fázisból nyitva maradt

| Tétel | Mi kell hozzá |
|---|---|
| Meghívó és rendszerlevelek küldése, magyar sablonok | 2. kérdés |
| Fióktörlés és adatexport | 6. kérdés |
| Kétlépcsős azonosítás kötelezővé tétele rendelőnként | 7. kérdés |
| Aktív munkamenetek listája | Saját adatbázis-függvény; nem sürgős |
