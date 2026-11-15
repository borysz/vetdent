# Tisztázandó kérdések – Állatorvosi fogászati kezelési lap

**Hogyan használd:** minden kérdés alatt van egy *Alapfeltevés* – a `PROJEKT_PROMPT.md` jelenleg ezzel számol. Ha egyetértesz, hagyd üresen a *Válasz* sort; ha nem, írd oda a döntést, és az felülírja a promptot.

Jelölések: `[BLOKKOLÓ]` – a válasz az architektúrát vagy az üzleti modellt érinti, érdemes a fejlesztés indítása előtt eldönteni · `[FONTOS]` – az adott funkció elkészítése előtt kell · `[RÁÉR]` – menet közben is eldönthető.

**Már eldöntve:** adatbázis: Supabase · forráskód: TypeScript · fizetés: valószínűleg Stripe.

**Állapot:** mind a 12 `[BLOKKOLÓ]` kérdés megválaszolva (✅ jelöli), a válaszok át vannak vezetve a `PROJEKT_PROMPT.md`-be. A válaszokból 8 új, `[FONTOS]` / `[RÁÉR]` szintű kérdés következett (🆕 jelöli): A7, B13–B15, E9–E12.

---

## A) Üzleti modell és célcsoport

**A1. Ki a vevő: rendelő (több munkatárssal) vagy egyéni állatorvos?** `[BLOKKOLÓ]`
- Alapfeltevés: a rendelő (szervezet) fizet elő, és meghívja a munkatársait. Egyéni orvos egyfős rendelőként használja.
- Válasz: ✅ **Mindkettő.** Legyen lehetőség arra, hogy a rendelő vállalkozásként fizessen elő, és arra is, hogy az orvos magánszemélyként. → Két fióktípus készül: Rendelő és Egyéni állatorvos.

**A2. Egy felhasználó több rendelőben is dolgozhat ugyanazzal a fiókkal (pl. helyettesítő orvos)?** `[BLOKKOLÓ]`
- Alapfeltevés: igen, szervezetváltóval.
- Válasz: ✅ **Igen, szervezetváltóval.**

**A3. Egy rendelőnek lehet több telephelye, és külön kell-e kezelni az adataikat?** `[FONTOS]`
- Alapfeltevés: nem, egy szervezet = egy adatkör; több telephely később jöhet.
- Válasz:

**A4. Csak magyar piacra készül, vagy külföldre is?** `[FONTOS]`
- Alapfeltevés: induláskor csak magyar nyelv és magyar piac, de a felület fordíthatóra épül.
- Válasz:

**A5. Mi legyen a termék neve és a domain?** `[RÁÉR]`
- Alapfeltevés: munkanév `vetdent`, arculat nélkül (semleges, letisztult megjelenés).
- Válasz:

**A6. Van meglévő arculat (logó, színek)?** `[RÁÉR]`
- Alapfeltevés: nincs, az ügynök választ visszafogott színvilágot.
- Válasz:

**A7. 🆕 Az egyéni állatorvos fiókjában lehet-e további felhasználó (pl. egy asszisztens)?** `[FONTOS]`
- Alapfeltevés: nem, az Egyéni csomag egyfelhasználós; aki munkatársat szeretne, Rendelő csomagra vált.
- Válasz:

## B) Előfizetés, fizetés, számlázás

**B1. Milyen csomagok legyenek, mi a különbség köztük, és mennyibe kerülnek?** `[BLOKKOLÓ]`
- Alapfeltevés: három fizetős csomag (Alap / Rendelő / Klinika) + 14 napos próba; a különbség a felhasználószám, a tárhely és néhány funkció (diktálás, saját logó a PDF-en, naplóexport). Az árak helykitöltők, az admin felületről állíthatók.
- Válasz: ✅ **2 csomag + próbaidő: Egyéni** (egyéni állatorvosnak, 1 felhasználó) **és Rendelő** (több munkatárs) – megerősítve. Az árak és a pontos keretek még hiányoznak; az admin felületen állíthatók.

**B2. Csomagdíj vagy felhasználónkénti (per-seat) díj?** `[BLOKKOLÓ]`
- Alapfeltevés: fix csomagdíj felhasználói kerettel (egyszerűbb a vevőnek és a megvalósításnak).
- Válasz: ✅ **Fix csomagdíj.**

**B3. Legyen-e ingyenes próbaidő, milyen hosszú, és kell-e hozzá bankkártya?** `[FONTOS]`
- Alapfeltevés: 14 nap, bankkártya nélkül.
- Válasz:

**B4. Legyen-e tartósan ingyenes csomag?** `[FONTOS]`
- Alapfeltevés: nincs.
- Válasz:

**B5. Havi és éves fizetés is legyen? Éves kedvezménnyel?** `[FONTOS]`
- Alapfeltevés: mindkettő; a kedvezmény mértéke a Stripe-ban beállított ártól függ.
- Válasz:

**B6. Milyen pénznemben történik a fizetés (HUF, EUR)?** `[FONTOS]`
- Alapfeltevés: HUF.
- Válasz:

**B7. Hogyan készül a magyar szabályoknak megfelelő számla (NAV-adatszolgáltatás)?** `[BLOKKOLÓ]`
- Miért kérdés: a Stripe saját számlája önmagában jellemzően nem elég a magyar számlázási előírásokhoz; általában számlázóprogram (pl. Számlázz.hu, Billingo) kapcsolódik hozzá. Ezt érdemes a könyvelővel egyeztetni.
- Alapfeltevés: első körben csak Stripe; a kódban előkészített csatlakozási pont van számlázóprogramhoz, de integráció nem készül.
- Válasz: ✅ **Számlázz.hu-integráció.** Sikeres Stripe-fizetés után a rendszer automatikusan számlát állít ki.

**B8. Ki lesz a szolgáltató (cég, amely a Stripe-fiókot birtokolja és számláz)? Van már Stripe-fiók?** `[FONTOS]`
- Alapfeltevés: még nincs; a fejlesztés Stripe teszt módban folyik.
- Válasz:

**B9. Mi történjen, ha lejár vagy megszűnik az előfizetés?** `[BLOKKOLÓ]`
- Alapfeltevés: 7 nap türelmi idő fizetési hiba esetén, utána csak olvasható mód (megtekintés, PDF, adatexport marad); adat nem törlődik automatikusan.
- Válasz: ✅ **Csak olvasható mód**, 7 nap türelmi idővel.

**B10. Mennyi ideig őrizzük a lemondott rendelő adatait, és utána töröljük-e?** `[FONTOS]`
- Alapfeltevés: nincs automatikus törlés; a törlés kérésre történik.
- Válasz:

**B11. Kell-e kuponkód, akciós ár, partnerkedvezmény?** `[RÁÉR]`
- Alapfeltevés: nem; a Stripe promóciós kódjai később bekapcsolhatók.
- Válasz:

**B12. Bankkártyán kívül kell más fizetési mód (átutalás, díjbekérő)?** `[RÁÉR]`
- Alapfeltevés: csak bankkártya; a platform-admin kézzel is hozzárendelhet csomagot (pl. átutalással fizető ügyfélnek).
- Válasz:

**B13. 🆕 ÁFA: a szolgáltató áfakörös-e, és az árak nettóban vagy bruttóban értendők?** `[FONTOS]`
- Miért kérdés: a Számlázz.hu-számlán és az árazási oldalon is helyesen kell szerepelnie; a könyvelő tudja megmondani.
- Alapfeltevés: 27% ÁFA; az árak nettóban vannak megadva, a felület a bruttót is kiírja; az admin felületen állítható.
- Válasz:

**B14. 🆕 Van-e már Számlázz.hu-fiók és Számla Agent kulcs? Milyen számlaelőtagot használjon a rendszer?** `[FONTOS]`
- Alapfeltevés: még nincs; a fejlesztés szimulált számlázóval folyik, a valódi kulcs élesítéskor kerül be.
- Válasz:

**B15. 🆕 Az egyéni állatorvos milyen névre kap számlát?** `[FONTOS]`
- Miért kérdés: magánszemélynek adószám nélkül, egyéni vállalkozónak adószámmal kell kiállítani.
- Alapfeltevés: a saját nevére és címére; adószámot megadhat, de nem kötelező.
- Válasz:

## C) Felhasználók és jogosultságok

**C1. Megfelel az öt szerepkör: Tulajdonos, Admin, Állatorvos, Asszisztens, Recepciós?** `[BLOKKOLÓ]`
- Alapfeltevés: igen, a prompt 6. fejezetének mátrixa szerint.
- Válasz: ✅ **Igen, mind az öt.** (Egyéni állatorvos fiókjában az egyetlen tag tulajdonos és állatorvos egyszerre.)

**C2. Ki zárhat le kezelési lapot? Csak állatorvos?** `[FONTOS]`
- Alapfeltevés: csak állatorvos (vagy állatorvosként megjelölt tulajdonos); az asszisztens szerkeszthet, de nem zárhat le.
- Válasz:

**C3. Láthatja-e a recepciós a szakmai adatokat (leletek, műtéti napló)?** `[FONTOS]`
- Alapfeltevés: megtekintheti, de nem szerkesztheti.
- Válasz:

**C4. Kell-e, hogy a rendelő saját, egyedi szerepköröket hozhasson létre?** `[RÁÉR]`
- Alapfeltevés: nem most, de az adatmodell lehetővé teszi.
- Válasz:

**C5. Kötelező legyen-e a kétlépcsős azonosítás?** `[RÁÉR]`
- Alapfeltevés: választható; a tulajdonos kötelezővé teheti a rendelőben.
- Válasz:

**C6. Kell-e belépés Google- vagy Microsoft-fiókkal?** `[RÁÉR]`
- Alapfeltevés: nem, csak e-mail + jelszó.
- Válasz:

**C7. Kapjon-e a gazdi saját belépést (pl. hogy visszanézze a leleteket)?** `[BLOKKOLÓ]`
- Alapfeltevés: nem; a gazdi csak PDF-et kap e-mailben vagy nyomtatva.
- Válasz: ✅ **Nem, csak PDF.**

**C8. Ki üzemelteti a platformot, és kell-e a supportnak „belépés az ügyfél nevében” funkció?** `[FONTOS]`
- Alapfeltevés: van platform-admin felület szuperadmin és support szerepkörrel; a megszemélyesítés naplózott, szakmai adat közben nem módosítható.
- Válasz:

## D) Szakmai tartalom – állatorvosi döntést igényel

**D1. Reszorptív lézió (RES / TR) fokozatai: 1–4 vagy 1–5?** `[FONTOS]`
- Miért kérdés: a dokumentum egy helyen „1–4 fokozat”-ot, máshol „TR 4/5”-öt ír; a macska referencialap 5 stádiumot és 3 típust használ.
- Alapfeltevés: TR1–TR5 stádium, típus (1–3) nélkül.
- Válasz:

**D2. Ínygyulladás fokozatai: G1–G2, vagy a referencialapok szerinti 0–3 index?** `[FONTOS]`
- Alapfeltevés: a dokumentum szerinti G1–G2.
- Válasz:

**D3. Fogkő: a dokumentum szerinti T1–T3, vagy a referencialapok szerinti 0–3 fogkőindex?** `[RÁÉR]`
- Alapfeltevés: T1–T3.
- Válasz:

**D4. Tasakmélység: 4 vagy 6 mérési pont foganként?** `[FONTOS]`
- Alapfeltevés: 6 pont, rendelőnként 4-re állítható.
- Válasz:

**D5. Mi legyen a pirossal kiemelt küszöb? Kutyánál és macskánál azonos?** `[FONTOS]`
- Miért kérdés: a dokumentum 4 mm feletti értéket ír, de a macskák normál tasakmélysége kisebb a kutyákénál.
- Alapfeltevés: 4 mm felett mindkét fajnál, fajonként állítható.
- Válasz:

**D6. Javasoljon-e a rendszer PD-fokozatot a mért tasakmélységből?** `[RÁÉR]`
- Alapfeltevés: javasol, de nem állít be automatikusan.
- Válasz:

**D7. Végleges-e a színkódolás és a prioritási sorrend?** `[FONTOS]`
- Miért kérdés: a dokumentum két, kissé eltérő színsémát ír le (zöld/sárga/narancs/piros, illetve sárga/piros/kék).
- Alapfeltevés: piros (kihúzandó/kihúzott) > kék (gyökérkezelt) > narancs (gyulladt, kezelendő) > sárga (csak fogkő) > zöld (egészséges); hiányzó fog szürke, szaggatott.
- Válasz:

**D8. Kell-e a tejfogazat (Triadan 500–800) és a kevert fogazat kezelése?** `[FONTOS]`
- Alapfeltevés: nem, csak maradó fogazat; a perzisztáló tejfog megjegyzésként rögzíthető.
- Válasz:

**D9. Csak kutya és macska, vagy más faj is (nyúl, vadászgörény, ló)?** `[BLOKKOLÓ]`
- Alapfeltevés: csak kutya és macska; az adatszerkezet bővíthető.
- Válasz: ✅ **Csak kutya és macska.**

**D10. Elég a dokumentumban felsorolt kódkészlet, vagy kellenek a referencialapok további kódjai is?** `[FONTOS]`
- Például: ínysorvadás (GR), ínyhiperplázia (GH), pulpaexpozíció (PE), szuvasodás (CA), zománchiba (ED), kopás (AT/AB), szájüregi daganat (OM), szájgyulladás (ST), visszamaradt gyökér (RTR), gingivoplasztika (GVP).
- Alapfeltevés: a dokumentum készlete az alap; a rendelő saját kódokat vehet fel.
- Válasz:

**D11. A furkáció (Fur) is kapjon gyorsgombot?** `[RÁÉR]`
- Miért kérdés: az adatstruktúrában szerepel, a gyorsgombok listájában nem.
- Alapfeltevés: igen.
- Válasz:

**D12. Az impaktált fog külön kód legyen, vagy a „hiányzó” altípusa?** `[RÁÉR]`
- Alapfeltevés: az M altípusa (IMP).
- Válasz:

**D13. Ki hagyja jóvá a szakmai adatokat (gyökérszámok foganként, kódok laikus magyarázata a gazdi-PDF-hez)?** `[FONTOS]`
- Alapfeltevés: az ügynök kilistázza ezeket a `docs/SZAKMAI_ELLENORZES.md` fájlba, és egy állatorvos ellenőrzi élesítés előtt.
- Válasz:

**D14. Honnan lesznek a fogábrák?** `[FONTOS]`
- Miért kérdés: a két mellékelt lap (BSAVA, Zoetis / Dental Leadership) harmadik fél szerzői jogi védelem alatt álló anyaga, az alkalmazásba nem másolható.
- Alapfeltevés: az ügynök saját, sematikus SVG-ábrákat készít; később grafikussal szebbre cserélhető.
- Válasz:

## E) A kezelési lap működése

**E1. A dokumentum „a végső számlázásig” említi a folyamatot. Kell-e a rendelő saját ügyfeleinek szóló díjtételezés/számlázás?** `[BLOKKOLÓ]`
- Alapfeltevés: nem; az alkalmazás csak a szakmai lapot vezeti.
- Válasz: ✅ **Nem kell.**

**E2. Lezárás után módosítható-e a lap, és hogyan?** `[FONTOS]`
- Alapfeltevés: csak indokolt, naplózott újranyitással vagy kiegészítő bejegyzéssel.
- Válasz:

**E3. Szerkesztheti-e egyszerre az orvos és az asszisztens ugyanazt a lapot két eszközről?** `[FONTOS]`
- Alapfeltevés: igen, mezőszintű mentéssel és ütközésjelzéssel; a felület mutatja, ki van a lapon.
- Válasz:

**E4. Kell-e működnie internet nélkül (pl. gyenge wifi a műtőben)?** `[BLOKKOLÓ]`
- Alapfeltevés: nem; hálózati hiba esetén a mentés újrapróbálkozik és jelez, de teljes offline mód nincs.
- Válasz: ✅ **Teljes offline mód.** Kapcsolat nélkül is megnyithatók páciensek és indítható új lap, későbbi szinkronizálással. Ez a válaszok közül a legnagyobb fejlesztési többletet jelenti; a részletei a prompt 4.1 fejezetében és az E9–E12 kérdésekben vannak.

**E5. Új vizitnél mit vegyen át a rendszer az előző lapról?** `[RÁÉR]`
- Alapfeltevés: csak a tartós állapotokat (hiányzó, kihúzott, gyökérkezelt fog).
- Válasz:

**E6. Részletes altatási napló (szerek, monitorozás, időpontok) kell-e, vagy elég az ASA-státusz, az utolsó etetés és a vérvizsgálat összefoglalója?** `[FONTOS]`
- Alapfeltevés: csak a dokumentumban felsorolt mezők.
- Válasz:

**E7. A gyógyszerek szabad szövegként rögzülnek, vagy kell gyógyszertörzs?** `[RÁÉR]`
- Alapfeltevés: szabad szöveg szövegsablonokkal; adagszámítás nincs.
- Válasz:

**E8. Kell-e időpont-/kontrollnyilvántartás emlékeztetővel?** `[RÁÉR]`
- Alapfeltevés: a kontroll dátuma a lapon és a PDF-en szerepel, emlékeztető nincs.
- Válasz:

**E9. 🆕 Mennyi ideig használható egy eszköz internetkapcsolat nélkül?** `[FONTOS]`
- Miért kérdés: kapcsolat nélkül a rendszer nem tudja ellenőrizni, hogy a felhasználónak megvan-e még a hozzáférése és az előfizetése.
- Alapfeltevés: legfeljebb 7 nap; utána a helyi adatok zárolódnak a következő online ellenőrzésig.
- Válasz:

**E10. 🆕 Mely adatok legyenek letöltve az eszközre az offline munkához?** `[FONTOS]`
- Miért kérdés: minél több adat van az eszközön, annál több tárhely kell, és annál nagyobb a kockázat, ha a tablet elvész.
- Alapfeltevés: minden gazdi és páciens törzsadata, páciensenként az utolsó három kezelési lap és minden piszkozat; a képekből csak bélyegkép.
- Válasz:

**E11. 🆕 Közös használatúak a tabletek? Kell-e PIN-kódos zár?** `[FONTOS]`
- Alapfeltevés: igen, közösek lehetnek; 10 perc tétlenség után PIN-kód kell, kijelentkezéskor a helyi adatok törlődnek az eszközről.
- Válasz:

**E12. 🆕 Lezárható-e a kezelési lap kapcsolat nélkül?** `[RÁÉR]`
- Alapfeltevés: nem; offline csak „lezárásra kész” jelölés adható, a végleges lezárás a kapcsolat visszatérésekor történik.
- Válasz:

## F) Média, diktálás, PDF

**F1. Milyen formátumban érkeznek a röntgenfelvételek? Kell-e DICOM?** `[FONTOS]`
- Alapfeltevés: JPEG / PNG / WebP / PDF; DICOM nem.
- Válasz:

**F2. Mekkora tárhelyre lesz szükség rendelőnként, és mi a fájlméretkorlát?** `[RÁÉR]`
- Alapfeltevés: 25 MB/fájl; a csomagok tárhelykerete helykitöltő.
- Válasz:

**F3. Diktálás: elég a böngésző beépített beszédfelismerése, vagy fizetős, pontosabb szolgáltatás kell?** `[FONTOS]`
- Miért kérdés: a beépített megoldás ingyenes, de böngészőfüggő (iPaden korlátozott), a szakszavakat gyengébben ismeri fel, és a hang a böngésző gyártójához kerül. A fizetős szolgáltatás pontosabb, de használatarányos költséggel jár.
- Alapfeltevés: böngészős megoldás, cserélhető felépítéssel.
- Válasz:

**F4. Milyen tabletet használnak a rendelők (iPad, Android), és milyen böngészővel?** `[FONTOS]`
- Alapfeltevés: iPad (Safari) és androidos tablet (Chrome) egyaránt támogatott.
- Válasz:

**F5. A gazdi-PDF-en kívül kell-e szakmai PDF is (teljes lelet, kollégának / beutalóhoz)?** `[RÁÉR]`
- Alapfeltevés: első körben csak a gazdinak szóló összefoglaló.
- Válasz:

**F6. Az alkalmazás küldje e-mailben a PDF-et a gazdinak? Milyen feladó címről?** `[FONTOS]`
- Alapfeltevés: igen, a szolgáltatás közös címéről, a rendelő nevével és válaszcímével; csak ha a gazdi hozzájárulása rögzítve van.
- Válasz:

## G) Integrációk

**G1. Kell-e kapcsolat meglévő praxismenedzsment-szoftverrel (páciens- és gazdiadatok átvétele)?** `[FONTOS]`
- Alapfeltevés: nincs integráció; a törzsadatok kézzel rögzíthetők.
- Válasz:

**G2. Kell-e gazdik és páciensek tömeges importja (pl. Excel/CSV)?** `[RÁÉR]`
- Alapfeltevés: nem.
- Válasz:

**G3. Kell-e chipszám alapján külső nyilvántartásból adatot lekérni?** `[RÁÉR]`
- Alapfeltevés: nem; a chipszám csak rögzített mező.
- Válasz:

## H) Technológia és üzemeltetés

**H1. A Supabase csak adatbázisként szolgál, vagy a hitelesítést (Supabase Auth) és a fájltárolást (Supabase Storage) is rá bízzuk?** `[BLOKKOLÓ]`
- Miért kérdés: ha mindhárom egy helyen van, az adatbázis sorszintű védelme (RLS) közvetlenül a bejelentkezett felhasználóra épülhet, és kevesebb külön szolgáltatást kell üzemeltetni. Cserébe erősebb a kötődés a Supabase-hez.
- Alapfeltevés: mindhárom a Supabase-en (adatbázis + Auth + Storage).
- Válasz: ✅ **Mindhárom a Supabase-en.**

**H2. Felhős Supabase (melyik előfizetési szinten) vagy saját üzemeltetés?** `[FONTOS]`
- Alapfeltevés: felhős Supabase, EU-régióban; a fizetős szint az éles induláshoz kell (mentések, szüneteltetés nélküli működés).
- Válasz:

**H3. Hol fusson a webalkalmazás (pl. Vercel, saját szerver)?** `[FONTOS]`
- Miért kérdés: a PDF-készítés headless böngészőt használ, ami nem minden tárhelyen futtatható egyformán.
- Alapfeltevés: Vercel vagy konténeres tárhely EU-régióban; az ügynök a választáshoz igazítja a PDF-megoldást.
- Válasz:

**H4. Megfelel a javasolt keret (Next.js + TypeScript + Tailwind)?** `[FONTOS]`
- Alapfeltevés: igen.
- Válasz:

**H5. Ki küldi a rendszerleveleket (melyik levelezőszolgáltató, milyen domainről)?** `[RÁÉR]`
- Alapfeltevés: SMTP-alapú, szolgáltatófüggetlen megoldás; az éles szolgáltató később választható.
- Válasz:

**H6. Kell-e külön teszt- (staging) környezet az éles mellett?** `[RÁÉR]`
- Alapfeltevés: igen, külön Supabase-projekttel és Stripe teszt móddal.
- Válasz:

## I) Jog és adatvédelem

**I1. Ki készíti az ÁSZF-et, az adatkezelési tájékoztatót és az adatfeldolgozói szerződést?** `[FONTOS]`
- Alapfeltevés: jogász készíti; az alkalmazásban helykitöltő szöveg szerepel.
- Válasz:

**I2. Mennyi ideig kell megőrizni a kezelési dokumentációt, és törölhető-e gazdi kérésére?** `[FONTOS]`
- Miért kérdés: az állatorvosi dokumentáció megőrzési kötelezettsége és a GDPR törlési joga ütközhet; ezt jogásszal vagy a kamarával érdemes tisztázni.
- Alapfeltevés: a szakmai lap megmarad, a gazdi személyes adatai kérésre anonimizálhatók.
- Válasz:

**I3. Kell-e a gazdi hozzájárulását rögzíteni fotók készítéséhez és e-mail küldéséhez?** `[RÁÉR]`
- Alapfeltevés: az e-mail-hozzájárulás rögzített mező; a fotók a kezelési dokumentáció részei.
- Válasz:

**I4. Felhasználhatók-e a fotók és adatok anonimizálva más célra (statisztika, oktatás, marketing)?** `[RÁÉR]`
- Alapfeltevés: nem.
- Válasz:

---

## A forrásdokumentumban talált ellentmondások és hiányok (összefoglaló)

| # | Mit találtam | Hol kezeltem |
|---|---|---|
| 1 | A RES fokozata egyszer „1–4”, másszor „TR 4/5” | D1 |
| 2 | Az ínygyulladás G1–G2, a referencialapok 0–3 indexet használnak | D2 |
| 3 | Két eltérő színkódolási leírás | D7 |
| 4 | A tasakmélység „4 vagy 6 oldalon” mérendő | D4 |
| 5 | A furkáció szerepel az adatok között, de nincs gyorsgombja | D11 |
| 6 | „A végső számlázásig” – de számlázási szekció nincs leírva | E1 |
| 7 | „Pulznyitott” – feltételezhetően „pulpanyitott” (nyitott pulpa) elírása; a promptban így szerepel | – |
| 8 | A felhasználó-, jogosultság- és előfizetés-kezelésről a dokumentum nem szól; a promptban általános SaaS-gyakorlat szerint terveztem meg | B, C |
