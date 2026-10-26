# MyProtocols: darbo taisyklės

Šios taisyklės taikomos visam projektui. Konkrečios naudotojo užduoties
apimtis turi pirmenybę: prašymas tik analizuoti nesuteikia leidimo keisti,
kurti commit ar siųsti pakeitimų.

## Kalba ir dokumentacija

- Bendravimą su naudotoju, Codex ataskaitas, dokumentaciją ir naudotojo
  sąsajos tekstus rašyk taisyklinga lietuvių kalba.
- Neįterpk atsitiktinių kitų kalbų žodžių ar rašto sistemų. Išimtys: programinis
  kodas, API pavadinimai, failų keliai, techniniai terminai, oficialūs
  pavadinimai ir būtinos citatos.
- Prieš pateikdamas ataskaitą patikrink, ar joje nėra netyčinių svetimos
  kalbos fragmentų.

## Prieš pakeitimus

1. Perskaityk `PROJECT.md`, `TASKS.md` ir aktualius šaltinio failus.
2. Patikrink `git status --short --branch`, `git diff`, šakas, paskutinius
   commitus ir `git remote -v`. Neįtrauk, netrink ir nepaslėpk svetimų pakeitimų.
3. Kai užduotis apima GitHub sinchronizavimą, atlik `git fetch origin` ir
   sutikrink vietinę bei nuotolinę būklę. Nustatyk tikrąją bazinę šaką;
   nelaikyk, kad ji būtinai vadinasi `main` ar `master`.
4. Naujam darbui kurk atskirą `codex/<trumpas-pavadinimas>` šaką nuo
   suderintos bazės. Esamą užduoties šaką tęsk, jei to prašo naudotojas.
   Nekeisk numatytosios šakos nustatymo ir nepervadink šakų savo iniciatyva.
5. Jei būtina autentifikacija ar trūksta prieigos, aiškiai nurodyk konkretų
   naudotojo veiksmą. Niekada neprašyk slaptažodžių ar tokenų pokalbyje.

## Įgyvendinimas ir saugumas

- Išlaikyk paprastą HTML/CSS/JavaScript programą. Karkaso, priklausomybių,
  dizaino ir funkcijų plėtra turi atitikti užduoties apimtį.
- Supabase schemą, RLS, funkcijas, trigerius ar produkcinius duomenis keisk
  tik pagal atskirai suderintą konkretų pakeitimą. SQL audito užklausa nėra
  leidimas vykdyti migraciją. Be tokio leidimo tik analizuok metaduomenis.
- Kliento filtrai ir `isAdmin()` nėra serverio prieigos apsaugos įrodymas.
  Auditoriaus ir administratoriaus teisės nepriklausomos. Kol auditoriaus
  teisė neįgyvendinta, klientas leidžia tik aiškiai `public` protokolus.
- Neišsaugok slaptų raktų, sesijų, slaptažodžių, realių pacientų duomenų,
  duomenų bazės eksportų ar nesuredaguotų audito rezultatų Git istorijoje.
  Testuose naudok imitacinius duomenis.
- `js/config.js` yra sekama vieša naršyklės konfigūracija. Joje leidžiamas
  Supabase URL ir publishable raktas, bet niekada secret/service-role raktas.
  `.gitignore` neapsaugo jau sekamų failų ir nepašalina duomenų iš istorijos.
- Dinaminių duomenų neįterpk į vykdomus HTML įvykių atributus. Naudok
  `textContent`, DOM metodus ir įvykių klausytojus arba tinkamą HTML kodavimą.
- Nekeisk kitų projektų, ypač MedManager failų ar jo Git konfigūracijos.
  Projekto Git autoriaus konfigūraciją keisk tik lokaliai ir tik kai reikia.

## Patikra

- Paleisk esamą nepriklausomų testų rinkinį iš projekto šaknies:
  `node --test tests/stage1.test.cjs`.
- Keičiant sąsają, autentifikaciją ar dinaminį HTML papildomai paleisk
  `node tests/stage1.browser.cjs`, jei prieinami esami Playwright ir Edge.
  Prireikus nustatyk `NODE_PATH` į jau įdiegtą paketų vietą; neįrašyk savo
  kompiuterio kelių į programos kodą. Jei testas neprieinamas, tai nurodyk.
- Dokumentacijos užduotims patikrink aprašų atitiktį kodui, vietines
  nuorodas ir `.gitignore` elgesį per `git check-ignore --no-index`.
- Atlik `git diff --check`, peržiūrėk visą diff ir į commit patenkančius
  failus dėl paslapčių bei netyčinių pakeitimų.
- Aiškiai atskirk kodo analizę, imitacinius testus, naršyklės testus ir
  tikro Supabase bandymus. Nevadink RLS saugiu be serverio patikros.

## Commit, GitHub ir peržiūra

1. Įtrauk tik užduoties failus, naudodamas aiškius kelius. Kurk prasmingą
   commit po atitinkamų patikrų. Nenaudok istorijos perrašymo, `--amend`,
   destruktyvaus reset ar force push be atskiro aiškaus leidimo.
2. Įgyvendinimo užduoties pakeitimus sinchronizuok į jos GitHub šaką:
   `git push --set-upstream origin <darbo-šaka>`, nebent naudotojas nurodė
   nekurti commitų, nekelti pakeitimų arba dirbti tik lokaliai.
3. Patikrink nuotolinį commit SHA ir šakų sutapimą. Git autentifikacijos
   sėkmė savaime nepatvirtina ChatGPT GitHub jungties prieigos.
4. Pateik peržiūros nuorodą: užduoties apimtį atitinkantį draft PR arba
   šakų palyginimą. Jungti PR ar aktyvuoti automatinį sujungimą galima tik
   gavus aiškų naudotojo nurodymą. Nekeisk saugyklos matomumo ar App leidimų
   kaip įprasto sinchronizavimo dalies.
5. Atnaujink `PROJECT.md` ir `TASKS.md`, kai pasikeičia architektūra,
   patvirtinti rezultatai ar darbų būsena. Planų nežymėk kaip atliktų.
6. Galutinėje ataskaitoje nurodyk pakeistus failus, patikrų rezultatus,
   likusius apribojimus, šaką, commit ir GitHub peržiūros nuorodą. Jei push
   ar testai nepavyko, tiksliai įvardyk nesėkmę, o ne deklaruok užbaigimą.
