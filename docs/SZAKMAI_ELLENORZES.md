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

## 3. Az odontogram kódtörzse és szabályai (8. fázis)

A kódokat, fokozatokat és szabályokat a PROJEKT_PROMPT 8.4–8.6 pontja alapján vittem át, szakmai tartalmat magam nem találtam ki. Állatorvosnak kell jóváhagynia:

- **Kódok és fokozatok** (a felület szövegei a `messages/hu.json` `dental.levels` alatt): T1–T3, G1–G2, PD1–PD4, Mob1–Mob3, Fur1–Fur3, FX-C / FX-NC / FX-R, TR1–TR5 (csak macska), M (hiányzik / korábban kihúzták / impaktált), EXT-S / EXT-SURG, ENDO (zárt / nyitott), U, POL, RX. Hiányzik-e valami, helyes-e a magyar megnevezés?
- **Fur-érintettség** csak többgyökerű fogon rögzíthető; ez a fogkatalógus gyökérszámaitól függ (1. pont, jóváhagyásra vár).
- **Színek és prioritás**: piros (kihúzandó/kihúzott) › kék (gyökérkezelt/tervezett) › narancs (G, PD, FX, RES, Mob, Fur) › sárga (csak fogkő) › zöld (egészséges) › szürke (hiányzó). Megfelel-e a klinikai logikának, hogy a tervezett kihúzás is pirosra színez?
- **„Egészséges” (0)** kizár minden más leletet ugyanazon a fogon, és a **hiányzó fog** nem visel más jelölést. Van-e olyan eset, amikor ez korlátozó (pl. hiányzó fog + reszorpciós gyökérmaradvány)?
- **Áthozatal** az új vizitre: hiányzó fog, elvégzett kihúzás (→ „korábban kihúzták”), elvégzett gyökérkezelés. Szükséges-e más tartós állapot (pl. koronapótlás, ha lesz ilyen kód)?
- **Tasakmélység**: 6 mérési pont; a küszöb **4 mm felett** (a prompt alapértelmezése, fajonként állítható lenne; a beállítás még nem készült el). **PD-javaslat** a legmélyebb pontból: 3–4 mm PD2, 4–6 mm PD3, 6 mm felett PD4. **3 mm alatt nem javasol**, mert a prompt PD1-et „3 mm alatti tasaknak” írja, de ez normális sulcus is lehet. Kell-e PD1 javaslat?
- **Gyökérkezelt fog** a „kék” állapot már tervezett kezelésre is; a **POL felajánlása** az U után kötelező lépésként szerepel (a prompt szerint).

## 4. Később ide kerül

- Szervezeti kiegészítések a kódtörzshöz (a rendszerszintű alapkészlet jóváhagyása a 3. pontban).
- A kódok közérthető magyarázata a gazdinak szóló összefoglalóhoz.
- A tasakmélység kiemelési küszöbe fajonként.
