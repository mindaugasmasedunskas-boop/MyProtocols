# MyProtocols

Būklė dokumentuota 2026-10-20 pagal esamą kodą ir patikrintus GitHub
duomenis. Darbinis katalogas: `C:\Projects\medprotocols`.
Naudotojui matomas produkto pavadinimas yra MyProtocols: `index.html`
`<title>` ir `<h1>` elementuose. Ankstesnis pavadinimas buvo MedProtocols;
2026-10-20 dokumentavimo metu jis dar buvo rodomas programoje.

## Technologijos ir paleidimas

- Statinė lietuviška vieno puslapio programa: HTML, CSS ir įprastas
  JavaScript. Nėra karkaso, bundlerio, build etapo ar `package.json`.
- Supabase JavaScript biblioteka gaunama iš jsDelivr, užfiksuota versija
  `2.119.0` (`dist/umd/supabase.js`) su SRI `integrity` maiša. Atnaujinant
  versiją būtina kartu perskaičiuoti ir pakeisti `integrity` reikšmę.
- `index.html` pateikia `#app`, įkelia stilius ir JS failus, tada kviečia
  `startApp()`. Vietiniam paleidimui naudok įprastą statinį HTTP serverį.
- Produkcinis adresas: GitHub Pages iš šakos `codex/stage1-auth-security`,
  šaknies aplanko: https://mindaugasmasedunskas-boop.github.io/MyProtocols/
  Kiekvienas push į šią šaką automatiškai atnaujina svetainę.
- Kopijavimas priklauso nuo naršyklės Clipboard API ir jos suteiktų teisių.

## Failai ir ryšiai

| Failas | Atsakomybė |
| --- | --- |
| `index.html` | Karkasas, skriptų įkėlimo seka ir paleidimas. |
| `manifest.webmanifest` | Įdiegiamos programos (PWA) aprašas: pavadinimas, spalvos, ikonos, atskiras langas. |
| `icons/` | Programos ikonos: SVG šaltiniai ir iš jų sugeneruoti PNG (192, 512, maskable 512, Apple 180). |
| `css/style.css` | Bendri, administravimo ir mobiliųjų ekranų stiliai. |
| `js/config.js` | Vieša Supabase konfigūracija ir kliento inicializavimas. |
| `js/utils.js` | HTML kodavimas ir klaidos teksto parinkimas. |
| `js/auth.js` | Sesija, prisijungimas, atsijungimas, profilis, admin patikra. |
| `js/protocols.js` | Užklausa, vieša prieiga, kategorijos, paieška, peržiūra, kopijavimas. |
| `js/home.js` | Pagrindinis ekranas: skilčių mygtukai, „Ruošiama“ vaizdas, skilčių atidarymas. |
| `js/calendar.js` | Kalendorius (tik prisijungus): skelbimai pagal datas, mėnesio vaizdas, budėjimų grafikų įkėlimas ir atidarymas. |
| `js/calculators.js` | 19 medicininių skaičiuoklių (tik naršyklėje, be duomenų siuntimo). |
| `js/documents.js` | Dokumentų biblioteka (tik prisijungus): sąrašas, kategorijos, paieška, admin įkėlimas ir trynimas. |
| `js/staff.js` | Administratoriui: darbuotojų sąrašas ir grupių priskyrimas. |
| `js/departments.js` | Skyrių filtras: sąrašas, pasirinkimas viršuje, įsiminimas (`user_preferences` arba naršyklė). |
| `js/contacts.js` | Kontaktų knyga (tik prisijungus): užklausa, paieška, grupavimas, `tel:`/`mailto:` nuorodos. |
| `js/suggestions.js` | Prisijungusio naudotojo pasiūlymo forma ir siuntimas. |
| `js/admin.js` | Pasiūlymų sąrašas, būsenos ir administratoriaus komentarai. |
| `js/admin-protocols.js` | Administratoriaus algoritmų pridėjimas, redagavimas ir trynimas (nauji įrašai visada `public`). |
| `tests/stage1.test.cjs` | Izoliuoti Node.js testai su DOM ir Supabase imitacijomis. |
| `tests/stage1.browser.cjs` | Tikros Edge naršyklės testas su imitaciniu SDK. |

Skriptai bendradarbiauja per globalius kintamuosius ir funkcijas; ES moduliai
nenaudojami. Autentifikacija kviečia protokolų rodymą, o protokolų sąsaja
naudoja autentifikacijos būseną ir pasiūlymų funkcijas.

## Autentifikacija ir prieiga: patvirtinta kode

- Prisijungimas: Supabase `signInWithPassword()`, el. paštas ir slaptažodis.
- Paleidžiant tikrinama esama sesija. `onAuthStateChange()` sinchronizuoja
  autentifikacijos įvykius; užklausos atidedamos už sinchroninio callback ribų.
- Keičiasi `authVersion`; išvalomi ankstesni protokolai, profilis ir langas.
  Pasenę profilio ir protokolų atsakymai atmetami pagal užklausų versijas.
- Po prisijungimo ir atsijungimo užkraunamas naujas viešų protokolų rinkinys.
  Nepavykęs atsijungimas rodomas aiškiai, negrąžinant ankstesnių kliento teisių.
- `profiles.role === "admin"` leidžia esamą pasiūlymų administravimo sąsają.
  Tai kliento sąsajos, o ne duomenų bazės teisių patikra.
- `restricted`, nežinomo ir tuščio prieigos lygio įrašai klientui neleidžiami.
  Tai taikoma ir administratoriui. Individuali auditoriaus teisė neįgyvendinta.
- Registracijos, slaptažodžio atkūrimo, auditoriaus ir naudotojų teisių
  administravimo sąsajų nėra.

## Supabase integracija: naudojimas, ne schemos garantija

Klientas jungiasi tiesiogiai iš naršyklės. `js/config.js` yra sekamas ir
turi viešą projekto URL bei publishable raktą; serverio paslapčių jame neturi būti.
Programa nenustato kitos API schemos, todėl remiasi numatytąja kliento schema.
Tikroji lentelių struktūra ir Dashboard Exposed schemas dar nepatikrintos.

| Objektas | Kliento operacijos ir laukai |
| --- | --- |
| `protocols` | SELECT `id,title,category,content,access_level`, filtras `access_level = public`, rūšiavimas pagal `title`. Neprijungta admin funkcija numato UPDATE `access_level` pagal `id`. |
| `profiles` | SELECT `id,role` pagal prisijungusio naudotojo ID. Admin: SELECT visų (`is_admin()`), UPDATE tik `staff_group`, `full_name`. Rolės klientas nekeičia. |
| `app_settings` | SELECT `value` pagal `key` (`home_tile_order`); admin UPSERT. Skaito visi, rašo tik admin. |
| `announcements` | SELECT pagal `end_date`; admin INSERT ir DELETE. Skaito tik prisijungę. |
| `duty_schedules` + saugykla `schedules` | SELECT; admin įkelia failą ir INSERT, DELETE. Failai privatūs, atidaromi pasirašyta nuoroda. |
| `documents` + saugykla `documents` | SELECT; admin įkelia failą, INSERT ir DELETE. Failai privatūs, atidaromi pasirašyta nuoroda; saugomas SHA-256. |
| `contacts` | SELECT `id,department,name,job_title,phone,email,note,sort_order`, rūšiavimas `sort_order`. Skaito tik prisijungę (`authenticated`); keisti gali tik admin. |
| `suggestions` | INSERT `title,content,status,user_id,email`; admin SELECT visų stulpelių pagal `created_at`; UPDATE `status,admin_comment,updated_at` pagal `id`. |

Kode naudojami laukai neįrodo jų tipų, apribojimų ar serverio privilegijų.
Repozitorijoje nėra schemos migracijų, RLS, GRANT, serverio funkcijų ar
trigerių aprašų. Saugumo auditui dar reikia šių metaduomenų ir tikrų
naudotojų prieigos bandymų. Kliento filtras neapsaugo nuo tiesioginės API
užklausos. RLS saugumas nepatvirtintas; jokių DB pakeitimų nesuderinta.

## Testavimas

```powershell
node --test tests/stage1.test.cjs
```

Šiam rinkiniui pakanka Node.js, papildomų paketų nereikia. Esamo rinkinio
71 testas praėjo (28 iš 1 etapo, 3 greitųjų pataisymų, 1 PWA, 3 kontaktų, 3 audito pataisymų, 3 pagrindinio ekrano, 4 algoritmų administravimo, 1 kategorijų tvarkos, 4 tvarkos keitimo, 1 kontaktų prieigos, 5 kalendoriaus, 3 skaičiuoklių, 5 dokumentų, 4 darbuotojų grupių, 3 skyrių filtro). Tai imitaciniai,
ne tikro Supabase testai.

```powershell
node tests/stage1.browser.cjs
```

Naršyklės testui reikia jau įdiegtų Playwright ir Microsoft Edge. Jei
paketas yra kitoje vietoje, toje PowerShell sesijoje nustatyk `NODE_PATH`
į esamą `node_modules` katalogą. Projekte paketas neįdiegtas. Testas perima
puslapio užklausas ir naudoja imitacinį Supabase SDK; 1 etape praėjo penkios
scenarijų grupės. Produkcinės integracijos rezultatai iš to neišplaukia.

## Git ir GitHub

- Vieša saugykla (nuo 2026-11-25): https://github.com/mindaugasmasedunskas-boop/MyProtocols
- `origin` naudoja tos saugyklos HTTPS adresą.
- Pradinė versija: `b6aea14`; 1 etapo pataisymai: `6982521`.
- Šio aprašo rengimo metu GitHub numatytoji šaka yra
  `codex/stage1-auth-security`, ne `main` ir ne vietinė `master`.
- GitHub jungties skaitymas šio aprašo rengimo metu sėkmingas. Ankstesnis
  404 nebelaikomas esamu blokuojančiu faktu. App diegimo nustatymų turinys
  ir visi jos leidimai atskirai nepatvirtinti.
- Darbo tvarka aprašyta [AGENTS.md](AGENTS.md), darbų būsena — [TASKS.md](TASKS.md).

## Žinomi apribojimai

- Neužbaigtas serverio prieigos auditas ir nepriklausoma auditoriaus teisė.
- Administratorius negali keisti algoritmo prieigos lygio (`restricted` niekam nematomas, kol nėra auditoriaus teisės).
- Administravimo UPDATE nepatvirtina faktiškai pakeistos eilutės.
- Pasiūlymų siuntimas neturi lygiagrečių paspaudimų/dubliavimo kontrolės;
  nėra pasiūlymo autoriaus atsakymų peržiūros.
- Nėra sąrašų puslapiavimo; keičiant langą ar kategoriją paieška atkuriama tuščia.
- Dalis pastovių veiksmų tebenaudoja statinius inline įvykių atributus.
- Nėra aprašyto CI, produkcinio diegimo ar visos sistemos integracijos testų.
- `.gitignore` tik neleidžia įprastai įtraukti naujų lokalių failų. Jis
  nešifruoja duomenų, neapsaugo jau sekamų failų ir neišvalo istorijos.

Išsamesni 1 etapo rezultatai: [docs/stage1-security.md](docs/stage1-security.md).
