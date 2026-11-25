# MyProtocols: darbų būsena

Atnaujinta 2026-11-25. Žymėjimas: `[x]` — atlikta pagal nurodytą įrodymą;
`[ ]` — nebaigta arba planuojama. Suderintas reikalavimas nėra įgyvendinimo
ar tikros duomenų bazės saugumo įrodymas.

## Patvirtinti atlikti darbai

- [x] Codex audito P2 pataisymai (šaka `codex/audit-fixes`): kontaktų
  skiltyje rodomos autentifikacijos ir atsijungimo klaidos; administratoriaus
  išsaugojimas tikrina pakeistas eilutes (`.select("id")`) ir nerodo
  „Išsaugota“, kai niekas nepakeista; pasiūlymo siuntimas blokuoja dvigubą
  paspaudimą. Patikra: 38 izoliuoti testai praėjo (3 nauji regresijos).

- [x] Kontaktų skiltis (šaka `codex/contacts`): `js/contacts.js`, skyrių
  meniu „Algoritmai / Kontaktai“, paieška, grupavimas pagal skyrių, saugios
  `tel:` ir `mailto:` nuorodos. Patikra: 35 izoliuoti testai praėjo.
  2026-11-25 naudotojas paleido suderintą `contacts` SQL (RLS: SELECT visiems,
  keitimas tik admin); svečio API užklausa grąžina 200. Paskelbta svetainėje.
  Kontaktų redagavimas programoje neįgyvendintas (kol kas per Table Editor),
  kontaktai po užkrovimo neatnaujinami be puslapio perkrovimo.

- [x] 2026-11-25 Supabase metaduomenų auditas (skaitomosios užklausos,
  vykdė naudotojas; rezultatai Git nesaugomi). Nustatyta:
  - RLS įjungta `profiles`, `protocols`, `suggestions` (FORCE RLS išjungta);
  - nė viena lentelė neturi `TRUNCATE` teisės `anon` ir `authenticated`
    rolėms;
  - `protocols` SELECT tik `access_level = 'public'`; INSERT, UPDATE ir
    DELETE tik `profiles.role = 'admin'`;
  - `profiles` turi tik SELECT savo eilutei, todėl rolės pakeisti per API
    negalima;
  - `handle_new_user()` (SECURITY DEFINER, `search_path` nustatytas) visada
    priskiria rolę `user`;
  - `suggestions`: INSERT ir SELECT tik savo įrašams, administravimas tik
    adminui.
- [x] 2026-11-25 Auth nustatymai: naudotojas išjungė savarankišką
  registraciją. `/auth/v1/settings` patvirtina `disable_signup: true` ir
  `anonymous_users: false`. Naudotojus kuria administratorius per Dashboard.
- [x] Įdiegiama programa: `manifest.webmanifest`, ikonos `icons/`, nuorodos
  `index.html`. Sujungta į `codex/stage1-auth-security`. 2026-11-25 paskelbta
  per GitHub Pages: https://mindaugasmasedunskas-boop.github.io/MyProtocols/
  (saugykla padaryta vieša). Naudotojas įdiegė programą Chrome naršyklėje,
  ir ikona darbalaukyje atsirado. Service worker ir veikimas be interneto
  neįgyvendinti.

- [x] Greitieji pataisymai (šaka `codex/quick-fixes`): prisijungimas veikia
  paspaudus Enter (forma su `submit`), antraštė be žodžio „Klinikiniai“,
  Supabase SDK užfiksuotas `2.119.0` su SRI, paieška nejautri lietuviškoms
  raidėms ir didžiosioms raidėms. Patikra: 31 izoliuotas testas praėjo;
  Edge naršyklės testas nepaleistas, nes Playwright šiame kompiuteryje nerastas.

- [x] Šioje darbo šakoje naudotojui matomas pavadinimas pakeistas iš
  MedProtocols į MyProtocols: `index.html` kortelės pavadinime ir antraštėje.
  Katalogo, saugyklos ir Supabase objektų pavadinimai nekeičiami.
- [x] Esamo HTML, CSS ir septynių JavaScript failų statinė analizė atlikta;
  pradinės išvados pateiktos projekto pokalbyje.
- [x] Pradiniai devyni failai išsaugoti Git commitu `b6aea14`.
- [x] 1 etapo kliento pataisymai išsaugoti commitu `6982521`: protokolų
  perkrovimas, duomenų išvalymas, pasenusių atsakymų atmetimas,
  autentifikacijos sinchronizavimas, saugus dinaminis HTML ir aiškios klaidos.
- [x] 1 etape praėjo 28 izoliuoti regresijos testai ir penkios Edge
  scenarijų grupės su imitaciniu Supabase klientu. Realus serveris nebandytas.
- [x] Sukurta privati GitHub saugykla, prijungtas `origin`, išsiųsta 1 etapo
  šaka su abiem commitais ir 12 sekamų failų; nuotolinė istorija sutikrinta.
- [x] Šios dokumentacijos rengimo metu GitHub jungtis sėkmingai perskaito
  saugyklos metaduomenis; anksčiau stebėtas 404 dabar nepasikartojo.
- [x] 2 etapo vietinė analizė atlikta ir pokalbyje parengtos skaitomosios
  SQL katalogų užklausos schemai, politikoms bei privilegijoms surinkti.
  Tai nėra įvykdytas tikro serverio RLS auditas. SQL failų projekte dar nėra.

## Patvirtinti Supabase saugumo pakeitimai

Šių dviejų veiksmų atlikimą patvirtino naudotojas. Šioje dokumentacijos
pataisoje Supabase užklausos nevykdytos ir nustatymai nekeisti; tai nėra
nepriklausomas pakartotinis visos serverio apsaugos patikrinimas.

- [x] `protocols_authenticated_read` SELECT RLS politika pakeista į
  `access_level = 'public'` — patvirtinta.
- [x] `profiles` lentelės `TRUNCATE` teisės `anon` ir `authenticated`
  rolėms atšauktos — patvirtinta.

Šie patvirtinti pakeitimai neįrodo kitų politikų, privilegijų ar viso
serverio saugumo. Likę nepatikrinti klausimai pateikti toliau.

## Suderinti reikalavimai, bet nepatvirtinta serverio realizacija

- Viešus protokolus gali skaityti svečiai ir registruoti naudotojai.
- Registruoti naudotojai gali teikti pasiūlymus.
- Ribotų protokolų skaitymui reikia atskirai suteikiamos auditoriaus teisės.
- Administratoriaus ir auditoriaus teisės nepriklausomos. Admin rolė savaime
  nesuteikia riboto turinio skaitymo; administratorius valdo sistemos teises.
- Kol auditoriaus teisė neįgyvendinta, dabartinis klientas rodo tik `public`
  visiems naudotojams, įskaitant administratorių.
- Supabase schemai ar RLS pakeisti reikia atskiro konkretaus suderinimo.

## Pirmas prioritetas: neužbaigtas Supabase saugumo auditas

- [ ] Smulkūs audito radiniai (ne kritiniai, keisti tik suderinus):
  - pasikartojančios politikos (`profiles` ×2 SELECT, `suggestions` admin
    ×2, `protocols` public SELECT ×2);
  - `suggestions` INSERT leidžia autoriui pačiam nustatyti `status`,
    `admin_comment` ir `email`;
  - `anon` turi nereikalingas INSERT, UPDATE ir DELETE lentelių teises
    (RLS jas blokuoja, bet jas verta atšaukti).
- [ ] Tiesioginėmis API užklausomis su tikromis paskyromis patikrinti
  paprasto naudotojo ir administratoriaus prieigą.
- [x] 2026-11-25 metaduomenų auditu gauta: RLS/FORCE RLS būklė, stulpeliai
  ir numatytosios reikšmės, visos `public` politikos, `anon` ir
  `authenticated` lentelių teisės, `public` funkcijos ir trigeriai,
  `handle_new_user()` kodas, Auth registracijos ir anoniminių prisijungimų
  nustatymai. Rolės savarankiškai pakeisti per API negalima (nėra `profiles`
  INSERT/UPDATE politikų, trigeris rolę nustato `user`). Svetimų pasiūlymų
  skaityti negalima.
- [ ] Dar negauta: `CHECK` apribojimai (pvz., ar `suggestions.status`
  leidžia `reviewing`, kurį siūlo sąsaja), indeksai, savininkai, rolių
  narystė, numatytosios privilegijos, Exposed schemas.
- [ ] Į saugyklą įtraukti schemos ir RLS aprašą (be duomenų), kad TEST
  aplinką būtų galima atkurti.
- [ ] Tiesioginėmis API užklausomis patvirtinti svečio, paprasto naudotojo
  ir administratoriaus be auditoriaus teisės prieigą prie public/restricted.
- [ ] Patikrinti konkretaus restricted ID užklausą, užklausą be filtro,
  nežinomus/NULL lygius ir alternatyvius rodinius/RPC.
- [ ] Atskirai patikrinti tikras sesijas, atsijungimą, galiojimo pabaigą ir
  kelių skirtukų sinchronizaciją. Imitaciniai testai to nepatvirtina.

Audito rezultatų su realiais duomenimis nelaikyk Git. Vietiniai katalogai
`audit-results/`, `exports/`, `dumps/`, `backups/` ignoruojami. Į repozitoriją
galima įtraukti tik peržiūrėtas, paslapčių neturinčias išvadas ar migracijas.

## Planas po audito ir atskiro suderinimo

- [ ] Pasirinkti auditoriaus teisės saugojimą. `profiles.is_auditor` su
  pradine `false` yra pasiūlymas, ne esamas patvirtintas laukas.
- [ ] Apibrėžti saugų administracinį teisių suteikimą ir atšaukimą.
  Paprastas naudotojas negali suteikti teisės sau; atskirai sutarti, ar
  administratorius gali auditoriaus teisę suteikti sau, ar reikia kito admin.
- [ ] Suderinti ir taikyti serverio taisykles: public visiems, restricted
  tik auditoriui, nepriklausomai nuo admin rolės. Peržiūrėti ir senas politikas.
- [ ] Tik patvirtinus DB apsaugą prijungti auditoriaus skaitymą kliente.
- [ ] Suprojektuoti teisių administravimą ir prijungti protokolų prieigos
  valdymą, nesuteikiant admin automatinio restricted turinio skaitymo.
- [ ] Patvirtinti paveiktą eilutę administravimo atnaujinimuose.
- [ ] Sutvarkyti pasiūlymų dubliavimą ir prireikus autoriaus atsakymų peržiūrą.
- [ ] Įvertinti puslapiavimą, paieškos būsenos išsaugojimą ir prieinamumą.
- [ ] Pagal poreikį parengti CI ir dokumentuotą diegimo procesą.

## Dabartinis dokumentacijos pakeitimų rinkinys

Šio rinkinio apimtis: tik `AGENTS.md`, `PROJECT.md`, `TASKS.md`, `.gitignore`.
Programos veikimas, dizainas, esama istorija ir Supabase nustatymai nekeičiami.
Failų parengimas savaime nereiškia sujungimo: commit, push ir peržiūros būsena
tikrinama pagal darbo šaką bei jos PR. Numatytoji šaka automatiškai nejungiama.

Architektūra: [PROJECT.md](PROJECT.md). Darbo taisyklės: [AGENTS.md](AGENTS.md).
1 etapo įrodymai ir apribojimai: [docs/stage1-security.md](docs/stage1-security.md).
