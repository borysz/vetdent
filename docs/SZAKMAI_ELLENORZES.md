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

## 2. Később ide kerül

- A leletek és beavatkozások kódtörzse (fokozatok, altípusok).
- A kódok közérthető magyarázata a gazdinak szóló összefoglalóhoz.
- A tasakmélység kiemelési küszöbe fajonként.
