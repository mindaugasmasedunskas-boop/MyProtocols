# MyProtocols: darbų būsena

Atnaujinta 2026-10-20. Žymėjimas: `[x]` — atlikta pagal nurodytą įrodymą;
`[ ]` — nebaigta arba planuojama. Suderintas reikalavimas nėra įgyvendinimo
ar tikros duomenų bazės saugumo įrodymas.

## Patvirtinti atlikti darbai

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

- [ ] `protocols` ir `suggestions` lentelių `TRUNCATE` teisių atšaukimas
  `anon` ir `authenticated` rolėms dar nepatvirtintas; patikrinti faktines
  abiejų lentelių privilegijas. Nežymėti kaip atlikta be patvirtinimo.
- [ ] Užbaigti visą serverio saugumo auditą. Dviejų pirmiau nurodytų
  pakeitimų patvirtinimas neužbaigia toliau išvardytų patikrų.
- [ ] Gauti tikras schemas, lentelių savininkus, RLS/FORCE RLS būklę,
  stulpelių tipus, apribojimus, raktus, numatytąsias reikšmes ir indeksus.
- [ ] Gauti visas aktualias RLS politikas, efektyvias schemų, lentelių,
  stulpelių ir funkcijų teises, rolių narystę ir numatytąsias privilegijas.
- [ ] Patikrinti profilių registracijos trigerius, jų funkcijas, rodinius,
  RPC ir kitus galimus duomenų gavimo kelius.
- [ ] Patikrinti Dashboard Exposed schemas, registracijos ir anoniminių
  Auth prisijungimų nustatymus. Vien `authenticated` nebūtinai reiškia
  nuolatinį registruotą naudotoją, jei įjungti anoniminiai Auth prisijungimai.
- [ ] Patikrinti, kad `profiles.role` negalima pakeisti savarankiškai per
  INSERT, UPDATE, UPSERT ar RPC ir negalima paveikti kitų naudotojų teisių.
- [ ] Patikrinti `suggestions` autorystę, pradinę būseną, administravimo
  laukų apsaugą ir svetimų pasiūlymų duomenų neprieinamumą.
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
- [ ] Įvertinti puslapiavimą, paieškos būsenos išsaugojimą, prieinamumą ir
  tikslios Supabase CDN versijos fiksavimą.
- [ ] Pagal poreikį parengti CI ir dokumentuotą diegimo procesą.

## Dabartinis dokumentacijos pakeitimų rinkinys

Šio rinkinio apimtis: tik `AGENTS.md`, `PROJECT.md`, `TASKS.md`, `.gitignore`.
Programos veikimas, dizainas, esama istorija ir Supabase nustatymai nekeičiami.
Failų parengimas savaime nereiškia sujungimo: commit, push ir peržiūros būsena
tikrinama pagal darbo šaką bei jos PR. Numatytoji šaka automatiškai nejungiama.

Architektūra: [PROJECT.md](PROJECT.md). Darbo taisyklės: [AGENTS.md](AGENTS.md).
1 etapo įrodymai ir apribojimai: [docs/stage1-security.md](docs/stage1-security.md).
