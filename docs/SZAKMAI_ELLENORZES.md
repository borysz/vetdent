# Szakmai ellenőrzésre váró adatok

Ezeket az adatokat élesítés előtt állatorvosnak kell jóváhagynia. A forrásuk a `src/domain/teeth/catalog.ts` fájl; ha egy érték hibás, ott kell javítani.

## 1. Gyökérszámok foganként

A gyökérszámot a rendszer arra használja, hogy **furkáció-érintettséget csak többgyökerű fogon lehessen rögzíteni**. A számozás a Triadan-rendszer szerinti; a táblázat a pozíciót mutatja (a szám utolsó két jegye), mind a jobb, mind a bal oldalra érvényes.

### Kutya (42 fog)

| Pozíció | Fog | Felső állcsont (1xx, 2xx) | Alsó állkapocs (3xx, 4xx) |
|---|---|:-:|:-:|
| 01–03 | metszőfogak | 1 | 1 |
| 04 | szemfog | 1 | 1 |
| 05 | 1. előzápfog | 1 | 1 |
| 06 | 2. előzápfog | 2 | 2 |
| 07 | 3. előzápfog | 2 | 2 |
| 08 | 4. előzápfog | 3 | 2 |
| 09 | 1. zápfog | 3 | 2 |
| 10 | 2. zápfog | 3 | 2 |
| 11 | 3. zápfog | – (nincs) | 1 |

### Macska (30 fog)

| Pozíció | Fog | Felső állcsont (1xx, 2xx) | Alsó állkapocs (3xx, 4xx) |
|---|---|:-:|:-:|
| 01–03 | metszőfogak | 1 | 1 |
| 04 | szemfog | 1 | 1 |
| 06 | 2. előzápfog | 1 ⚠ | – (nincs) |
| 07 | 3. előzápfog | 2 | 2 |
| 08 | 4. előzápfog | 3 | 2 |
| 09 | 1. zápfog | 2 ⚠ | 2 |

⚠ **Bizonytalan értékek:**
- **Macska 106 / 206** – 1 gyökérrel szerepel; előfordulhat két (részben összenőtt) gyökérrel is. Ha furkációt kell tudni rögzíteni rajta, az értéket 2-re kell állítani.
- **Macska 109 / 209** – 2 gyökérrel szerepel (a megengedőbb érték, hogy a furkáció rögzíthető legyen); a gyökerek gyakran összenőttek.

## 2. A kezelési lap (7. fázis) szakmai tartalma

Állatorvosnak kell jóváhagynia (a kezelési lap szövegeit és választékát a PROJEKT_PROMPT 8.2 pontja alapján állítottam össze, magam nem találtam ki szakmai adatot):

- **Fő panasz gyorsválasztó címkéi:** bűzös lehelet (halitosis), fogkő, nyálzás, táplálkozási nehézség, fájdalom jelzése. Hiányzik-e valami?
- **Helyi érzéstelenítő blokkok:** az ideg neve szabad szöveg (pl. n. infraorbitalis, n. alveolaris inferior), mellette oldal (bal / jobb / mindkét oldal), készítmény és adag. Kell-e zárt lista (infraorbitalis, mentalis, alveolaris inferior, maxillaris)?
- **ASA-státusz:** I–V, számmal (ASA 1…ASA 5). Kell-e hozzá rövid magyarázat?
- **Kontroll időpont javaslata:** 12 nap a vizit után (a prompt „10–14 napot” ír varrat esetén). A felület a varratmező kitöltésekor figyelmeztet is. Jó-e a 12 nap, és legyen-e javaslat varrat nélkül?
- **Lezárás kötelező mezői:** kezelőorvos és ASA-státusz (a vizit dátuma mindig megvan). A „nyilvánvaló hiányokra” (pl. tervezett, de el nem végzett beavatkozás) figyelmeztetés az odontogram után készül, mert addig nincs mihez viszonyítani.
- **Gyógyszeres terápia:** készítmény, adag, gyakoriság, időtartam szabad szövegként; adagellenőrzés nincs.

## 3. Később ide kerül

- A leletek és beavatkozások kódtörzse (fokozatok, altípusok).
- A kódok közérthető magyarázata a gazdinak szóló összefoglalóhoz.
- A tasakmélység kiemelési küszöbe fajonként.
