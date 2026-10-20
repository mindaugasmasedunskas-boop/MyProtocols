# MyProtocols: 1 etapo pakeitimai

## Apimtis

Sutvarkytas kliento autentifikacijos būsenos valdymas, protokolų duomenų
išvalymas ir perkrovimas, dinaminio HTML saugumas bei klaidų rodymas.
Supabase schema, RLS politikos, projekto URL ir viešas publishable raktas
nepakeisti. Dizaino CSS ir pagrindinis HTML nepakeisti. Auditoriaus modulis,
teisės laukai ir teisių administravimo sąsaja nekurti.

Pradinė devynių failų versija išsaugota commitu `b6aea14` prieš pakeitimus.
Git autoriaus duomenys paimti iš MedManager lokalios konfigūracijos ir
nustatyti tik šiai saugyklai. MedManager failai ir konfigūracija nekeisti.
Prieš pradinį commit peržiūrėti visi failai ir atlikta tipinių paslapčių
paieška. Rastas Supabase publishable raktas yra viešas kliento raktas.
Slaptažodžių reikšmių, slaptų API raktų ar privačių raktų pradiniuose
failuose nerasta. Automatinė paieška nėra visų galimų paslapčių aptikimo garantija.

## Esamas prieigos elgesys

- Programa prašo tik `access_level = public` protokolų ir tik reikalingų stulpelių.
- Atsakyme papildomai atmetami restricted, trūkstamo ar nežinomo prieigos lygio įrašai.
- Kol individuali auditoriaus teisė neįgyvendinta, restricted protokolai
  nerodomi niekam, įskaitant administratorių. Admin rolė nesuteikia skaitymo teisės.
- Prisijungę naudotojai gali teikti pasiūlymus; admin rolė leidžia esamą
  pasiūlymų administravimo sąsają. Serverio leidimai šiame etape nepatvirtinti.
- Prieš autentifikacijos užklausų laukimą išvalomi naudotojas/profilis pagal
  naują sesiją, protokolų masyvas, pasirinkta kategorija ir ankstesnis langas.
- Pasenę profilio ir protokolų atsakymai negali atkurti ankstesnės sesijos duomenų.
- Nepavykus atsijungti rodoma, kad serverio sesija gali būti aktyvi,
  pasiūlomas pakartojimas ir negrąžinamos ankstesnės kliento teisės.

Kategorijos ir protokolų veiksmai susiejami DOM įvykių klausytojais.
Duomenys neįterpiami į vykdomus onclick atributus. Esami statiniai onclick
su pastoviais funkcijų pavadinimais palikti. Administravimo ID atributai
koduojami HTML kontekstui; išsaugojimas susiejamas klausytojais.

## Patikra

Izoliuotų regresijos testų paleidimas su Node.js, be papildomų priklausomybių:

```powershell
node --test tests/stage1.test.cjs
```

Testuose naudojami imitaciniai DOM ir Supabase klientai. Jie tikrina
teisių atskyrimą, klaidas, užklausų persidengimą ir sesijų kaitą.

Papildomas testas tikroje headless Edge naršyklėje:

```powershell
node tests/stage1.browser.cjs
```

Jam reikia jau prieinamų Playwright ir Edge. Audito aplinkoje naudotas
esamas Codex Playwright paketas per NODE_PATH; nieko nediegta.
Visos puslapio užklausos perimamos. Programa ir CSS skaitomi lokaliai,
Supabase SDK pakeičiamas imitaciniu klientu. Tikro Supabase integracija
šiuo testu nepatvirtinama.

Naršyklės scenarijai: kenksminga kategorija lieka tekstu; admin negauna
restricted turinio; prisijungimas perkrauna protokolus; atsijungimas
nedelsiant pašalina atvertą turinį ir masyvą; nepavykusį atsijungimą galima
pakartoti; išoriniai autentifikacijos įvykiai atnaujina programą.

## Dar būtina patikrinti Supabase

Kliento filtravimas nėra prieigos apsaugos riba. Turint viešą projekto raktą
galima siųsti kitas užklausas nei siunčia ši sąsaja. Kol RLS nepatikrintos,
restricted duomenų saugumas serverio pusėje laikomas nepatvirtintu.

1. Anoniminė tiesioginė API užklausa gauna public, bet negauna restricted
   protokolų, jų turinio ar metaduomenų. Kartoti be access_level filtro ir
   užklausus konkretų restricted ID.
2. Paprasto registruoto naudotojo užklausa taip pat negauna restricted.
3. Admin rolė savaime nesuteikia restricted skaitymo. Individuali auditoriaus
   teisė dar neįgyvendinta ir jai reikės atskiro schemos/RLS suderinimo.
4. NULL ir nežinomi access_level nesuteikia numanomos viešos prieigos.
5. profiles SELECT leidžia gauti savo id ir role. Naudotojas negali sau
   suteikti admin ar pakeisti kito naudotojo teisių.
6. suggestions INSERT reikalauja prisijungimo ir user_id = auth.uid();
   negalima suklastoti autoriaus, nustatyti administracinės būsenos ar komentaro.
7. Paprastas naudotojas negauna kitų naudotojų pasiūlymų, el. paštų ir
   administratoriaus komentarų. Administravimo keitimai leidžiami tik admin.
8. Tikros sesijos prisijungimas, atsijungimas, galiojimo pabaiga ir pokyčiai
   kitame skirtuke atnaujina sąsają; patikrinti ir lėto bei nutrūkusio ryšio atvejus.
9. Patikrinti, ar visiems esamiems viešiems protokolams access_level aiškiai
   nustatytas public. Trūkstamos reikšmės šiame etape neskelbiamos viešai.

Šiame etape tiesioginės užklausos į tikrą Supabase projektą nesiųstos,
nenaudotos tikros naudotojų paskyros ir duomenys nekurti/nekeisti.

## Liko vėlesniems etapams

Individualus auditoriaus leidimas ir jo RLS; teisių administravimas;
admin-protocols.js prijungimas prie sąsajos; pakeistos eilutės patvirtinimas
administravimo UPDATE rezultatuose; pasiūlymų siuntimo dubliavimo kontrolė;
puslapiavimas ir tikslios CDN versijos fiksavimas. Pavadinimas pagrindiniame
puslapyje šiame etape nekeistas.
