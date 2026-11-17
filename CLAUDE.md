# VetDent – átadási jegyzet új munkamenethez

Ezt a fájlt a Claude Code minden új munkamenet elején automatikusan beolvassa. Olvasd el végig, mielőtt bármihez nyúlsz. A részletek a megjelölt dokumentumokban vannak; itt csak az van, ami nélkül rossz irányba indulnál.

## Mi ez a projekt

Tabletre tervezett, előfizetéses (SaaS) webalkalmazás **kutyák és macskák fogászati kezelési lapjának** vezetéséhez: interaktív fogképlet (Triadan-számozás), gyorsbevitel, műtéti napló, gazdinak szóló PDF, offline működés. A felhasználó nem fejlesztő; a közös nyelv a **magyar**, a kód, azonosítók és commit-üzenetek angolul készülnek, a felület és a `docs/` magyarul.

- Teljes igény: [`referencia/PROJEKT_PROMPT.md`](referencia/PROJEKT_PROMPT.md) (a forrás; a 12 megválaszolt blokkoló kérdés már átvezetve).
- Kérdések és válaszok: [`referencia/TISZTAZANDO_KERDESEK.md`](referencia/TISZTAZANDO_KERDESEK.md).
- Menet közben felmerült kérdések, megoldandó hibák: [`docs/NYITOTT_KERDESEK.md`](docs/NYITOTT_KERDESEK.md) (**itt van a nyitott tételek listája, kezdd ezzel**).
- Meghozott döntések és indokaik: [`docs/DONTESEK.md`](docs/DONTESEK.md).
- Állatorvosi jóváhagyásra váró szakmai adatok: [`docs/SZAKMAI_ELLENORZES.md`](docs/SZAKMAI_ELLENORZES.md).
- Fázisok állapota: [`README.md`](README.md).

## Technológia

Next.js 16 (App Router, Turbopack, `cacheComponents` + `partialPrefetching`), React 19, TypeScript **strict** (a teljes forráskód TypeScript), Tailwind 4 + shadcn/ui (`base-nova`), next-intl (egyetlen nyelv: `hu`), Supabase (Postgres + Auth + Storage, **felhős** projekt, nincs Docker), Dexie (IndexedDB), zod, Vitest.

**A Next.js 16 eltér attól, amit tudhatsz.** Kódírás előtt olvasd el a csomaggal szállított dokumentációt: `node_modules/next/dist/docs/` (lásd `AGENTS.md`). Példák: a middleware neve `proxy` (`src/proxy.ts`); `cacheComponents` mellett a kérésidejű adat (süti, munkamenet) csak `<Suspense>` mögött olvasható, és `await connection()` kell az időfüggő olvasásokhoz; a Next az elhagyott oldalakat **elrejti (Activity), nem szünteti meg** – az uncontrolled űrlapok megőrzik az értékeiket, ezért az „új” űrlapokat mentés után `form.reset()`-tel ürítjük.

## Futtatás, ellenőrzés

```bash
npm install
npm run dev            # http://localhost:3000
npm run check          # lint + typecheck + egységtesztek (mindig zöldnek kell lennie commit előtt)
npm run check:tablet       # AUTOMATIKUS álló-tablet ellenőrzés (768×1024, 810×1080, 834×1194): valódi böngészőben, minden fő oldalon; előtte `npm run build && npm run start`. Új oldalt vegyél fel a `tests/tablet/check-tablet.mjs` listájába. Minden UI-változtatás után futtasd.
npm run test:integration   # a VALÓDI fejlesztői Supabase-projekten fut, saját tesztadattal; éles projekten SOHA
npm run build
```

A `.env.local` **nincs a Gitben** (Supabase URL, publishable és secret kulcs); a `.env.example` mutatja a szükséges változókat. Kulcsot soha ne olvass ki, ne írj ki, ne kérd el a csevegésben.

## Szerkezet

| Hely | Tartalom |
|---|---|
| `src/app/` | Oldalak. `(auth)` belépés/regisztráció, `app/` a bejelentkezett terület (`gazdik`, `paciensek`, `munkatarsak`, `fiok`, `elofizetes`, `szerepkorok`, `naplo`, `profil`), `meghivo/[token]`, `arak`, `kezdes`, `ketlepcsos`, `auth/*` route-ok |
| `src/lib/auth/` | Azonosítás: `dal.ts` (a **single source of truth**: `requireUser`, `requireActiveMembership`, `requirePermission`, `getEntitlements`), szerepkörök, jogosultságkulcsok, MFA, tartalékkódok |
| `src/lib/offline/` | Az offline réteg – lásd lent |
| `src/lib/supabase/` | Kliensek (`client`, `server`, `admin` = secret key, **csak szerveren, csak webhookra/admin feladatra**), `proxy.ts`, generált `database.types.ts` |
| `src/domain/teeth/catalog.ts` | Fogkatalógus (kutya 42, macska 30 fog, képernyősorrend, gyökérszám) |
| `supabase/migrations/` | A séma változásai; minden táblán RLS |
| `tests/integration/` | Valódi adatbázison futó tesztek (izoláció, szabályok, MFA, jogosultság, napló, csomagok, szinkron, páciensek) |
| `messages/hu.json` | **Minden** felületi szöveg itt van; típusellenőrzött kulcsok |

## Szabályok, amelyeket be kell tartani

- **KIEMELTEN FONTOS (a felhasználó kérése): minden oldalnak és felületnek tökéletesen kell megjelennie egy átlagos tablet ÁLLÓ nézetében** (kb. 768–834 px széles, 1024–1194 px magas; a fekvő nézet és az asztali gép mellett is). Nincs vízszintes oldalgörgetés, nincs levágott vagy takart elem, minden gomb elérhető, a tartalom olvasható. Minden új felületet és minden változtatást ellenőrizz ezen a méreten is (automatikusan: `npm run check:tablet`; a billentyűzet hatását és a vizuális kinézetet kézzel is) (`resize_window` `tablet` előbeállítás vagy 768×1024 és 834×1194), mielőtt késznek mondod; ami ott nem tökéletes, az nincs kész. A teljes fogsor (a fogképlet) kivétel nélkül is megjelenjen értelmesen: ha nem fér el egy sorban, azt a felületnek kell megoldania, nem a felhasználónak keresgélnie.
- **Felületi szöveg csak `messages/hu.json`-ból.** Magázó megszólítás. Szín/méret csak tokenekből (`globals.css`), 44 px-es érintési célfelületek, 16 px-es beviteli mezők.
- **Ár, keret, titok, belépési adat nem kerül a kódba.** A csomagok és a számlázási beállítások az adatbázisban vannak.
- **Üzleti szabály adatbázis-függvényben** (`SECURITY DEFINER`, `set search_path = ''`), a táblákra közvetlen írási jog nincs. Hibakódot dobnak (`last_owner`, `read_only`, …), amelyet az alkalmazás fordít (`dbErrors` a szövegfájlban).
- **A kód jogosultságot ellenőriz, nem szerepkört** (`members.manage`, `clients.write`, …); a mátrix az adatbázisban él (`permissions`, `role_permissions`), kulcsai a `src/lib/auth/permissions.ts`-ben, egy teszt őrzi az egyezést.
- **Az igazság az adatbázisban van:** hogy egy fiók teljes értékű vagy csak olvasható, azt egy függvény dönti el (`private.organization_access`); az alkalmazás csak megjeleníti.
- **Adat csendben nem veszhet el.** Minden szerkesztés előbb az eszközre kerül; a szerver mezőszinten fésül össze; a felülírt érték a `sync_conflicts`-ba kerül.
- A szakmai tartalmat (gyökérszámok, kódmagyarázatok, színek) **állatorvosnak kell jóváhagynia**; ne találj ki szakmai adatot, a bizonytalant a `docs/SZAKMAI_ELLENORZES.md`-be írd.
- A két referencia kép (`referencia/*.jpg`, BSAVA/Zoetis) szerzői jogi védelem alatt áll: **nem másolható és nem rajzolható át**, a Gitben sincs benne; a fogábrák saját készítésűek lesznek.

## Az offline réteg röviden (`src/lib/offline/`)

- `record-model.ts`: tiszta, általános szabálykészlet („szerveroldali másolat + függő szerkesztések”); `clients-model.ts`, `patients-model.ts` ennek kötései. **Új adattípus = egy leírás (`RecordSpec`) + egy szerveroldali `sync_push_*` függvény + egy tábla a `local-db.ts`-ben + egy bejegyzés a `sync-engine.ts`-ben.**
- A szerver nem teljes rekordot, hanem **változásokat** kap (csak a szerkesztett mezők + az a revízió, amelyről a szerkesztés indult); a rekordok azonosítóját (UUID) az eszköz adja.
- `sync-engine.ts`: küldés (régebbi szerkesztés előbb, 100-as kötegek), lehívás a `seq` szerint 100 tételes átfedéssel, idempotens; közben végzett szerkesztés nem vész el; a páciens kivárja, amíg a gazdija ismert a szervernek.
- `pin.ts` + `device-security.ts`: eszköz-PIN (PBKDF2), 10 perc tétlenség után zár, 5 szabad próba után várakozás, 10 hibánál törlés és kijelentkeztetés; 7 napnál régebbi szerverkapcsolat esetén zárolás.
- A felület **mindig a helyi adatbázisból** olvas/ír (`useLiveQuery`), a feltöltés a háttérben megy (`OfflineProvider`).

## Állapot (2026-11-16)

Kész: 1. alapozás · 2. felhasználók/fiókok/meghívók/profil/MFA+tartalékkódok · 3. jogosultságok és napló · 4. előfizetés **alapja** (csomagok, próbaidő, keretek, csak olvasható mód, árazási oldal) · 5. offline réteg (helyi adatbázis, szinkron, PIN-zár, **service worker** a `public/sw.js`-ben; az ütközések megjelenítése hátravan) · 6. gazdik, páciensek, irányítópult · 7. **kezelési lap váza** (`visits` tábla, `sync_push_visits`, `finalize_visit`/`reopen_visit`, `/app/vizitek/[id]`) · 10. **gazdi-PDF kész** (`src/lib/summary/pdf.ts`, `/app/vizitek/[id]/osszefoglalo` és `.../pdf`; az e-mail küldés későbbre marad) · 9. **csatolmányok** (privát bucket, feltöltési sor offline: `src/lib/offline/upload-queue.ts`, `attachments-store.ts`), **sablonok** (`templates`, `src/domain/dental/template.ts`), **diktálás** (`src/domain/dictation/`, `src/lib/dictation/speech.ts`) · 8. **odontogram** (foganként egy rekord: `visit_teeth`, `sync_push_visit_teeth`; kódtörzs és szabályok: `src/domain/dental/`; felület: `src/components/dental/`; döntések: `docs/DONTESEK.md`).

**Elhalasztva a demó utánra** (a demó ingyenes): Stripe-fizetés, Számlázz.hu-számlázás, platform-admin felület.

Hátravan, javasolt sorrendben:
1. A **service worker és a kezelési lap valódi böngészős próbája** (offline indítás, offline szerkesztés a vizit lapján), az **ütközések megjelenítése** a felületen. (A korábbi „betöltési hiba” megoldva: a böngészőpanel nem rajzol képkockát fókusz nélkül, ezért a React nem fedi fel a streamelt tartalmat; teljes betöltés után a panelben egy képernyőkép vagy kattintás elég. Lásd `NYITOTT_KERDESEK.md` 18. pont.)
2. **A 10. fázis maradéka:** a gazdi-PDF elkészült és élőben kipróbált (lásd `NYITOTT_KERDESEK.md` 23. pont). Hátravan: a laikus magyarázatok (`summary.lay.*`) állatorvosi jóváhagyása (`docs/SZAKMAI_ELLENORZES.md` 4. pont), a nyomtatási nézet és a PDF valódi táblagépen, a `check:tablet` futtatása (a gépen a böngésző nem indult), a logó (nincs logófeltöltés), az e-mail küldés (SMTP-fiók kell; külső szolgáltatás, előbb kérdezz).
3. A 8. fázis maradéka (`NYITOTT_KERDESEK.md` 20. pont): szervezeti beállítások (színek, gombok, küszöb), 4 pontos mód, telefonos kvadráns-nézet, korábbi fogképletek idővonala.
4. 10. fázis e-mail része (SMTP-fiók kell, külső szolgáltatás: előbb kérdezz) · 11. lezárás (adatexport, biztonsági átnézés).
A 2. fázis maradéka: levélküldés és magyar levélsablonok, fióktörlés/adatexport, kötelező MFA rendelőnként (kérdéseik a `NYITOTT_KERDESEK.md`-ben).

## A felhasználóval való együttműködés

- **Kérdésekre egyelőre nem válaszol:** ne állj meg kérdésért; válaszd az indokolt alapértelmezést, írd a `docs/DONTESEK.md`-be, a kérdést pedig a `docs/NYITOTT_KERDESEK.md`-be.
- Kifelé ható vagy nehezen visszavonható dolog (kulcs, fizetés, külső szolgáltatás, törlés) előtt kérdezz. Kérésre dolgozz az 5 órás limit ~90%-áig (`mcp__ccd_session_mgmt__get_usage`, ToolSearch-csel tölthető be), a végén **töltsd fel Gitre** (`git push`).
- Minden fázis végén: `npm run check`, build, commit, push, és őszinte összefoglaló arról, mi van ellenőrizve és mi nincs.

## Gépfüggő tudnivalók (Windows, céges gép, nincs rendszergazdai jog)

- A Node.js 24 LTS, a Git és a GitHub CLI felhasználói szinten, `winget`-tel van telepítve. Az eszközshell nem örökli a friss PATH-t: parancsok előtt `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`, és `npm.cmd` / `npx.cmd`.
- A **commit-üzenet nem tartalmazhat idézőjelet** PowerShell here-stringben (a parancs szétesik). Zárd a commit-üzenetet a `Co-Authored-By: …` sorral a mindenkori utasítás szerint.
- A projekt a OneDrive-on kívül, a `C:\Users\borosn\dev\vetdent` mappában volt; a távoli tároló: privát GitHub `borysz/vetdent`, ág: `main`. Új gépen: `git clone`, majd a `.env.local` kézzel (a `.env.example` alapján).
- **Adatbázis-migráció:** `npm run db:push`, ha a közvetlen Postgres-kapcsolat működik. A céges hálózati védelem (Sophos) ezt időnként megszakítja; **a tanúsítvány-ellenőrzést ilyenkor sem szabad kikapcsolni.** Működő kerülő út (HTTPS): `npx supabase db query --remote --yes --file supabase/migrations/<fájl>.sql`, majd `insert into supabase_migrations.schema_migrations (version, name) values ('<verzió>', '<név>')`. A típusok: `npm run db:types` (a `gen types --remote` mindkét esetben megy). Új migráció után mindig frissítsd a `database.types.ts`-t.
- A Supabase CLI be van jelentkezve és összekötve (`supabase link`); új gépen: `npx supabase login`, `npx supabase link --project-ref vinupzxgclcaanubqngn`.
- **Böngészős próbák:** a panelben gyakran a felhasználó saját, élő munkamenete fut – **soha ne léptesd ki**. Ideiglenes tesztfelhasználót az admin API-val hozz létre (`e2e-…@vetdent.test`, előre megerősítve, véletlen jelszóval), és utána töröld; a felhasználó saját fiókját ne érintsd. A tesztek `itest-…@vetdent.test` felhasználókat hoznak létre és maguk törlik. A panel `launch.json`-ja a munkamenet mappájában van, nem a projektben.
- Böngészős próba a panelben: **teljes oldalbetöltés után az `/app` oldalak „Betöltés…”-en állnak, amíg az oldal nem kap képkockát** (nincs fókusz, a requestAnimationFrame nem fut). Kérj egy képernyőképet (`computer` screenshot) vagy kattints, és az oldal felfedi magát; vagy navigálj kliensoldalon: `window.next.router.push("/app/…")`. Az offline szerkesztés szimulált offline móddal (fetch + navigator.onLine felülírása) ki van próbálva.
- **Git push (megoldva, 2026-11-17):** a távoli tároló SSH-s (`git@github.com:borysz/vetdent.git`). A felhasználó saját kulcsa jelszavas, azt nem használjuk. Ehhez a repóhoz külön, jelszó nélküli **deploy kulcs** van (`~/.ssh/vetdent_deploy_ed25519`, a felhasználó felvette a GitHubon írási joggal), a használatát a közös repó-konfig `core.sshCommand` beállítása adja, ezért **minden munkafán és új beszélgetésben `git push origin <ág>` működik ezen a gépen**. Csak a munkaágra pusholj, `--force` nélkül, `main`-re csak kérésre. Új gépen a kulcsot és a beállítást újra el kell készíteni.
- Tanulság: a böngészős próba kétszer is olyan hibát talált, amit a tesztek nem (űrlap-állapot, szerveroldali jogosultság). Adatbázis-jogok vagy a PostgREST előszűrő (`private.enforce_mfa`) módosítása után külön, friss folyamatból is ellenőrizd a szerver titkos kulcsos kéréseit.
