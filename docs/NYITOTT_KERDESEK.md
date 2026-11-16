# Menet közben felmerült kérdések

A fejlesztés közben felmerült kérdések gyűjtőhelye. Egyik sem állította meg a munkát: mindegyiknél ott van, mivel számoltam addig is. Ha egy válasz megszületik, a „Válasz” sorba kerül, és a kód ahhoz igazodik.

A projekt indulása előtti kérdések a [`referencia/TISZTAZANDO_KERDESEK.md`](../referencia/TISZTAZANDO_KERDESEK.md) fájlban vannak.

## Döntést igényel

**1. Hol legyen a kód biztonsági mentése?**
- Miért kérdés: a projekt a `C:\Users\borosn\dev\vetdent` mappában van, a OneDrive-on kívül, és a Git-tároló csak ezen a gépen létezik. Ha a géppel történik valami, a munka elvész.
- Addig is: minden lépés helyi Git-commitba kerül.
- Javaslat: privát távoli tároló (pl. GitHub) létrehozása; a feltöltést egy paranccsal be tudom állítani.
- Válasz:

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

## Tudnivaló, teendő nélkül is rendben van

**8. Az `npm audit` 7 közepes súlyosságú sérülékenységet jelez a függőségekben.**
- Fejlesztői eszközöket érintenek (pl. a kódellenőrző egy régebbi verzióját); még nem néztem át tételesen. Élesítés előtt át kell nézni.

**9. A törölt felhasználó munkamenete a lejáratáig (legfeljebb kb. egy óráig) érvényes marad.**
- Adathoz nem fér hozzá, mert a tagságai és a profilja törlődtek, de a felületen bejelentkezettnek látszik. Ha ez gond, a felhasználó törlésekor a munkameneteit is azonnal vissza kell vonni.

**10. A Supabase-projekt a parancssori eszközben „production” jelöléssel szerepel.**
- Ez a Supabase fő ágának neve, nem azt jelenti, hogy éles rendszer. Élesítéshez külön projekt kell (a kérdéslista H6 pontja); az integrációs teszteket éles projekten soha nem szabad futtatni.

## A 2. fázisból nyitva maradt

| Tétel | Mi kell hozzá |
|---|---|
| Meghívó és rendszerlevelek küldése, magyar sablonok | 2. kérdés |
| Fióktörlés és adatexport | 6. kérdés |
| Kétlépcsős azonosítás kötelezővé tétele rendelőnként | 7. kérdés |
| Aktív munkamenetek listája | Saját adatbázis-függvény; nem sürgős |
