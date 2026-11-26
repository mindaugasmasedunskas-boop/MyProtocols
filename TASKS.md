# MyProtocols: darbų būsena

Atnaujinta 2026-11-25. Žymėjimas: `[x]` — atlikta pagal nurodytą įrodymą;
`[ ]` — nebaigta arba planuojama. Suderintas reikalavimas nėra įgyvendinimo
ar tikros duomenų bazės saugumo įrodymas.

## Patvirtinti atlikti darbai

- [x] Personalas (šaka `codex/personnel`): prisijungimas nickname'u
  (`minmas` → `minmas@vmkl.local`, el. paštas veikia kaip anksčiau);
  administratoriaus skyrelis „Personalas“ (`js/staff.js`): naujo darbuotojo
  paskyra su laikinu slaptažodžiu, pareigos, keli skyriai, slaptažodžio
  atstatymas, pareigų ir skyrių sąrašų redagavimas. Paskyras kuria tik
  Edge Function `admin-users` (`supabase/functions/admin-users/index.ts`),
  kuri tikrina, kad kviečia administratorius; service-role raktas lieka
  Supabase aplinkoje. Pirmą kartą prisijungus privaloma pasikeisti
  slaptažodį (`must_change_password`, `clear_password_flag()`). Darbuotojo
  skyriai tampa numatytuoju filtru. Patikra: 78 izoliuoti testai praėjo.
  SQL paleistas, funkcija įdiegta; naudotojas patvirtino su tikra paskyra:
  kūrimas, privalomas slaptažodžio pakeitimas, automatinis skyrius.
- [x] „Mano paskyra“ (šaka `codex/staff-form-fix`): paspaudus savo vardą
  darbuotojas mato savo duomenis ir keičia slaptažodį. Naudotojas patvirtino.
- [ ] Dokumentai, 2 etapas (šaka `codex/documents-ack`, `supabase/sql/document-acks.sql`):
  „Reikia susipažinti“ su adresatais (pareigos, skyriai; tuščia = visi),
  darbuotojas atsidaro failą, uždeda varnelę ir patvirtina; įrašas
  `document_acks` susietas su versija (sha256), keisti ar trinti negalima;
  nauja versija reikalauja susipažinti iš naujo; admin mato, kas susipažino;
  priminimas pradžios ekrane. Tai vidinis įrašas, ne el. parašas; ar jis
  pakeičia popierinius lapus, turi patvirtinti ligoninės teisininkas ar DAP.
  Patikra: 90 izoliuotų testų. Reikia naudotojo SQL ir tikros patikros.
- [ ] Skubios pagalbos kategorijos (šaka `codex/triage`, `js/triage.js`):
  suaugusiųjų skubiosios pagalbos mastas (1–4 kategorijos, 6/10/9/15 būklių)
  pažodžiui iš aprašo 2 priedo nuotraukų, vieša skiltis su paieška.
  Patikra: 85 izoliuoti testai. Reikia naudotojo patikrinti tekstą.
- [ ] Atostogos (šaka `codex/vacations`): `js/vacations.js`,
  `supabase/sql/vacations.sql`. Darbuotojas planuoja datas; mato tik tų
  pačių pareigų ir bendro skyriaus kolegų atostogas (RLS); ribos pagal skyrių
  ir pareigas (`app_settings.vacation_limits`) tik įspėja; admin tvirtina,
  atmeta, trina ir nustato ribas. Įrašas saugo pareigų ir skyrių kopiją
  kūrimo metu. Patikra: 84 izoliuoti testai. Reikia naudotojo SQL ir tikros
  patikros su keliomis paskyromis.

- [x] Skyrių filtras, 1 ir 2 žingsniai (šaka `codex/departments`,
  `js/departments.js`). Tai patogumo filtras, ne prieigos kontrolė. Skyrių
  sąrašas (`app_settings.departments`) redaguojamas lange „Darbuotojai“.
  Viršuje rodomas pasirinkimas „Skyrius: …“ (vienas, keli ar visi):
  prisijungus saugomas `user_preferences`, neprisijungus naršyklėje.
  Algoritmai žymimi skyriais (`protocols.departments`, tuščias = visiems).
  Patikra: 71 izoliuotas testas praėjo; vaizdas patikrintas naršyklėje.
  [ ] Reikia naudotojo SQL. [ ] 3 žingsnis: dokumentai, skelbimai,
  kontaktai.

- [x] Darbuotojų grupės (šaka `codex/staff-groups`, `js/staff.js`):
  administratoriaus langas „Darbuotojai“ (mygtukas administratoriaus bloke).
  Visų naudotojų sąrašas, grupės priskyrimas (`profiles.staff_group`),
  grupių sąrašo redagavimas (`app_settings.staff_groups`). Rolės keisti
  negalima. Patikra: 68 izoliuoti testai praėjo; vaizdas patikrintas
  naršyklėje. [ ] Reikia naudotojo SQL: `staff_group` stulpelis,
  `public.is_admin()` (SECURITY DEFINER), admin skaitymo politika, UPDATE
  teisė tik `staff_group` ir `full_name` stulpeliams.

- [x] Dokumentų biblioteka, 1 etapas (šaka `codex/documents-library`,
  `js/documents.js`), tik prisijungus: sąrašas, kategorijos, paieška,
  atidarymas per 5 min. pasirašytą nuorodą. Administratorius įkelia PDF,
  Word, Excel (iki 20 MB) ir trina; failo SHA-256 saugomas 2 etapui.
  Nepavykus įrašyti eilutės, įkeltas failas pašalinamas. Patikra: 64
  izoliuoti testai praėjo; vaizdas patikrintas naršyklėje su imituotais
  duomenimis. [ ] Reikia naudotojo SQL: lentelė `documents` ir privati
  saugykla `documents`. Be jo šios versijos skelbti negalima.
- [ ] Dokumentai, 2 etapas: „Susipažinau“ (kas, kada, kuri failo versija;
  nekeičiamas žurnalas), priminimas, vadovybės vaizdas. Reikia asmeninių
  darbuotojų paskyrų.
- [ ] Dokumentai, 3 etapas: gavėjai (visi, skyrius, konkretūs žmonės).

- [x] Skaičiuoklės (šaka `codex/calculators`, `js/calculators.js`), viešos,
  skaičiuojama tik naršyklėje, duomenys niekur nesiunčiami. 19 skaičiuoklių:
  Cockcroft-Gault, CKD-EPI 2021, koreguotas kalcis, Na pokytis
  (Adrogué-Madias), osmoliariškumas, anijonų tarpas, CHA₂DS₂-VASc, HAS-BLED,
  HEART, Wells (PATE), PERC, QTc (Fridericia, Bazett), qSOFA, NEWS2,
  CURB-65, Glasgow-Blatchford, GKS, KMI ir KPP, dozė pagal svorį. Patikra:
  58 izoliuoti testai praėjo, formulės sutikrintos su žinomomis
  reikšmėmis; naršyklėje patikrinta. Klinikinis turinys nepatvirtintas
  ligoninės; nereikalingas naudotojas išmes.

- [x] Kalendorius (šaka `codex/calendar`, `js/calendar.js`), tik prisijungus:
  šios dienos skelbimai (svarbūs viršuje, geltoni), artimiausi įvykiai,
  mėnesio kalendorius su pažymėtomis dienomis, budėjimų grafikai (PDF, PNG,
  JPG iki 10 MB, atidaromi per 5 min. galiojančią pasirašytą nuorodą).
  Administratorius prideda ir trina skelbimus bei grafikus. Patikra: 56
  izoliuoti testai praėjo; vaizdas patikrintas vietinėje naršyklėje su
  imituotais duomenimis. [ ] Reikia naudotojo SQL: lentelės `announcements`,
  `duty_schedules` ir privati saugykla `schedules`. Be jo šios versijos
  skelbti negalima.
- [x] Sutarta: viena bendra „Dokumentų“ skiltis (dokumentai skaityti ir
  dokumentai su „Susipažinau“). El. pašto nuoroda atidėta, kol bus žinomas
  ligoninės pašto adresas.

- [x] Pagrindinis ekranas padalintas į dvi eilutes (šaka `codex/home-groups`):
  viešos skiltys (Algoritmai, Skubios pagalbos kodai, Skaičiuoklės,
  Statistikos pildymas) ir „Prisijungusiems darbuotojams“ (Kontaktai,
  Pasiūlymai, Dokumentai). Neprisijungus jos pilkos, paspaudus atsidaro
  prisijungimas. Kontaktai programoje tik prisijungus; atsijungus kontaktai
  pašalinami iš atminties. Patikra: 51 izoliuotas testas praėjo.
  [ ] Serverio pusė: `contacts` skaitymą apriboti `authenticated` rolei
  (SQL pateiktas naudotojui).

- [x] Administratoriaus tvarkos keitimas tempiant (šaka `codex/admin-reorder`):
  pagrindinio ekrano mygtukai („Keisti mygtukų tvarką“, saugoma
  `app_settings.home_tile_order`) ir algoritmai pasirinktoje kategorijoje
  („Keisti tvarką“, saugoma `protocols.sort_order`). Kategorijų tvarka lieka
  fiksuota. Patikra: 50 izoliuotų testų praėjo; vietinėje naršyklėje
  tempimas patikrintas su imituota admin būsena. [ ] Reikia naudotojo
  paleisto SQL: `protocols.sort_order` stulpelis ir `app_settings` lentelė
  (skaito visi, rašo tik admin). Be jo šios versijos skelbti negalima.

- [x] 2026-11-25 įkelta 21 terapinio priėmimo algoritmo juodraštis (SQL
  vykdė naudotojas; failas `exports/` neįtraukiamas į Git). Pavadinimuose
  žymė „[Juodraštis]“; turinys nepatvirtintas ligoninės. Algoritmo įrašymą
  per programą naudotojas patvirtino su tikra admin paskyra.
- [x] Fiksuota algoritmų kategorijų tvarka (šaka `codex/category-order`):
  Širdis ir kraujotaka, Medžiagų apykaita ir inkstai, Kvėpavimas ir
  infekcinės ligos, Neurologija, kitos naujos, „Kitos“ paskutinė. Patikra:
  46 izoliuoti testai praėjo.

- [x] Algoritmų administravimas programoje (šaka `codex/admin-protocols`):
  administratorius mato „+ Pridėti algoritmą“, o algoritmo peržiūroje
  „Redaguoti“ ir „Ištrinti“ (su patvirtinimu). Įrašymas tikrina grąžintas
  eilutes. Nauji įrašai visada `public`. Serverio apsauga: esamos
  `protocols_admin_*` RLS politikos. Patikra: 45 izoliuoti testai praėjo;
  formos vietinėje naršyklėje patikrintos su imituota admin būsena. Su tikra
  admin paskyra nebandyta.

- [x] Pagrindinis ekranas (šaka `codex/home-screen`): `js/home.js`, dideli
  skilčių mygtukai (Algoritmai, Skubios pagalbos kodai, Skaičiuoklės,
  Statistikos pildymas, Kontaktai, Pasiūlymai, Dokumentai). Pasiūlymai ir
  Dokumentai pažymėti „Reikia prisijungti“; dar nesukurtos skiltys rodo
  „Ruošiama“. Kiekviena skiltis turi mygtuką „← Pradžia“. Programa kol kas
  skirta kompiuteriams. Patikra: 41 izoliuotas testas praėjo; vietinėje
  naršyklėje ekranas ir perėjimai patikrinti.

## Pilotas (VMKL ligoninė): naudotojo išvardyti poreikiai

1. Patvirtinti algoritmai tam tikrų susirgimų atvejais.
2. Statistikos pildymo pavyzdžiai įvairiais variantais.
3. Skubios pagalbos kodai, pritaikyti priėmimo skyriui.
4. Pagrindiniai kontaktai.
5. Skaičiuoklės (pvz., kreatinino klirensas).
6. Pasiūlymai darbui gerinti.
7. Pasirašymų ir informavimo sistema („Susipažinau“, priminimai).

Prieš suvedant tikrus darbuotojų duomenis reikia suderinimo su ligoninės
duomenų apsaugos pareigūnu ir IT skyriumi. Pacientų duomenų programoje nėra.

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
