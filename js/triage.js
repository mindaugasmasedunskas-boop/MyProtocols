// Adult emergency care triage categories (public, no login, no data sent).
// Source: Būtinosios medicinos pagalbos teikimo tvarkos ir masto aprašo
// 2 priedas „Suaugusiųjų skubiosios medicinos pagalbos mastas“.
// The text follows the document word for word; do not shorten it.

const TRIAGE_SOURCE = "Būtinosios medicinos pagalbos teikimo tvarkos ir masto aprašo 2 priedas „Suaugusiųjų skubiosios medicinos pagalbos mastas“.";

const TRIAGE = [
    {
        level: 1, time: "Nedelsiant",
        when: "Pacientui pagalba teikiama nedelsiant, tuo pat metu vertinama paciento būklė ir atliekami gydymo veiksmai.",
        items: [
            "Esamas ar gresiantis širdies ir (ar) kvėpavimo sustojimas. Pacientas po gaivinimo be akivaizdžių negrįžtamų mirties požymių.",
            "Kvėpavimo dažnis (toliau – KD) < 10 kartų per minutę arba KD > 29 kartai per minutę su aiškiais kvėpavimo distreso požymiais.",
            "Šokas / nestabili hemodinamika: sistolinis arterinis kraujo spaudimas (toliau – AKS) < 80 mmHg ir (ar) širdies susitraukimų dažnis > 140 k./min. ar < 40 k./min. ir (ar) klinikiniai hipoperfuzijos požymiai ir kt.",
            "Ūminis sąmonės sutrikimas pagal Glazgo komų skalę (toliau – GCS) < 9 balai.",
            "Esamuoju momentu vykstantys kūno traukuliai.",
            "Ūminis cheminis akių pažeidimas."
        ]
    },
    {
        level: 2, time: "Ne vėliau kaip per 10 min.",
        when: "Pacientui skubiąją medicinos pagalbą siekiama pradėti teikti ne vėliau kaip per 10 min. nuo atvykimo į asmens sveikatos priežiūros įstaigą.",
        items: [
            "Naujai atsiradęs sąmonės sutrikimas kai GCS 9–13 balai.",
            "Ūmus didelio kraujo kiekio (25 procentų cirkuliuojančio kraujo kiekio arba daugiau) netekimas.",
            "Labai stiprus / nepakeliamas skausmas dėl įvairių priežasčių, kai skausmo intensyvumas vertinamas 9–10 balų pagal dešimties balų skalę su objektyviais skausmui būdingais klinikiniais požymiais.",
            "Gyvybei pavojingas apsinuodijimas.",
            "Anafilaksija.",
            "Sunki trauma.",
            { text: "Psichikos ir elgesio sutrikimai:", sub: [
                "agresija arba smurtas, keliantys grėsmę pačiam pacientui ir aplinkiniams;",
                "intensyvus psichomotorinis sujaudinimas, kai reikalingas fizinis asmens laisvės suvaržymas dėl grėsmės sau ar aplinkiniams."
            ] },
            "Ūmi židininė neurologinė simptomatika, atsiradusi prieš < 24 val.",
            "Ūminis koronarinis sindromas įtariant miokardo infarktą, kai ST segmentas pakilęs, ar ST segmento pakilimą atitinkanti būklė.",
            "Ūmus visiškas regėjimo netekimas."
        ]
    },
    {
        level: 3, time: "Ne vėliau kaip per 60 min.",
        when: "Pacientui skubiąją medicinos pagalbą siekiama pradėti teikti ne vėliau kaip per 60 min. nuo atvykimo į asmens sveikatos priežiūros įstaigą.",
        items: [
            "Hipoksemija, kai SpO2 < 92 procentų kvėpuojant aplinkos oru.",
            "Tipiniai krūtinės anginos požymiai, nesant ST segmento pakilimo, užtrukę ilgiau nei 20 min. arba besikartojantys krūtinės anginos požymiai dažniau nei kas 24 val.",
            "Ūmus galūnės arterinės kraujotakos sutrikimas.",
            "Atviri kaulų lūžiai ar sąnarių išnirimai.",
            "Hipoglikemija arba hiperglikemija, kai gresia pavojus išsivystyti hipoglikeminei komai, diabetinei ketoacidozei arba hiperosmoliarinei hiperglikemijai.",
            "Karščiavimas, kai yra klinikinių sepsio požymių (ne mažiau kaip du iš šių požymių: KD > 22 kartai per minutę, AKS < 100 mmHg, bet kokio lygio sąmonės sutrikimas) ir (arba) imunosupresija, ir (arba) bėrimas.",
            "Bendras kūno atšalimas, kai temperatūra < 35 °C.",
            { text: "Psichikos ir elgesio sutrikimai:", sub: [
                "mėginimas nusižudyti ar tokio poelgio grėsmė;",
                "ūmios psichozės;",
                "sunki psichologinė trauma, sukelianti elgesio sutrikimus;",
                "sunki depresija;",
                "ryškus psichomotorinis sujaudinimas."
            ] },
            "Stiprus skausmas, kai skausmo intensyvumas vertinamas 7–8 balais pagal dešimties balų skalę, su objektyviais skausmui būdingais klinikiniais požymiais."
        ]
    },
    {
        level: 4, time: "Ne vėliau kaip per 120 min.",
        when: "Pacientui skubiąją medicinos pagalbą siekiama pradėti teikti ne vėliau kaip per 120 min. nuo atvykimo į asmens sveikatos priežiūros įstaigą.",
        items: [
            "Aktyvaus kraujavimo epizodas dėl bet kokios priežasties, kai reikalinga medicininė intervencija.",
            "Ūmus per pastarąsias 24 valandas atsiradęs širdies ritmo (supraventrikulinė tachikardija, prieširdžių virpėjimas, prieširdžių plazdėjimas, plačių kompleksų tachikardija) ar laidumo (II–III laipsnio AV blokada, atrioventrikulinis ritmas) sutrikimas.",
            "Šlapimo susilaikymas, anurija, dializuojamo paciento komplikacijos: arterioveninės jungties trombozė, dializinio kateterio iškritimas / trombozė / disfunkcija.",
            "Pasiutusių ar galimai pasiutusių gyvūnų įkandimai, įdrėskimai, apseilėjimai.",
            "Sunki abstinencijos būklė, galinti komplikuotis dėl rizikos veiksnių (anamnezėje būta psichozių, traukulių; gali komplikuotis dėl gretutinių ūmių ir lėtinių ligų; kompulsyvus psichoaktyviųjų medžiagų potraukis).",
            "Kitos traumos (nenurodytos 2 ir 3 kategorijose) ir nelaimingi atsitikimai, įvykę per pastarąsias 48 valandas, esant didėjančiam tinimui, stiprėjančiam funkcijos sutrikimui.",
            "Veido ir žandikaulių srities abscesas, reikalaujantis neatidėliotinos chirurginės intervencijos.",
            "Dirbtinai suformuotų stomų ar įvestų kateterių sutrikimai (kai reikia juos pakeisti ar atkimšti).",
            "Įtariamos su nėštumo patologija susijusios komplikacijos (hipertenzija, preeklampsija, kraujavimas iš makšties, pilvo skausmas ar kt.).",
            "Komplikacijos po medicininės intervencijos (iširusi siūlė, pūlingos išskyros, didėjantis tinimas, nepakankama imobilizacija), atsiradusios iki 48 val. po procedūros arba išrašymo iš stacionarinės asmens sveikatos priežiūros įstaigos.",
            "Svetimkūniai audiniuose arba natūraliose kūno angose / kūno ertmėse, atsiradę per pastarąsias 48 valandas.",
            "Hipertenzinė krizė.",
            "Ūminė neurologinė židininė simptomatika, atsiradusi prieš > 24 val.",
            "Besikartojantys traukuliai, užfiksuoti per pastarąsias 12 valandų.",
            "Ūminė dehidratacija su klinikiniais gyvybinių parametrų pokyčiais."
        ]
    }
];

let triageQuery = "";

function triageItemText(item) {
    return typeof item === "string" ? item : [item.text, ...item.sub].join(" ");
}

function showTriage() {
    currentSection = "codes";
    document.getElementById("app").innerHTML = `
        <div class="topbar">${userAreaHtml()}</div>
        ${authErrorHtml()}
        <nav class="sections" id="sectionNav"></nav>
        <input id="triageSearch" class="search" type="text" placeholder="Ieškoti būklės, pvz., hipoglikemija...">
        <div id="triageBody"></div>
        <p class="cal-muted triage-source" id="triageSource"></p>
    `;
    renderSectionNav();
    const search = document.getElementById("triageSearch");
    search.value = triageQuery;
    search.addEventListener("input", () => { triageQuery = search.value; renderTriage(); });
    document.getElementById("triageSource").textContent = "Šaltinis: " + TRIAGE_SOURCE;
    renderTriage();
}

function renderTriage() {
    const body = document.getElementById("triageBody");
    if (!body) return;
    body.innerHTML = "";
    const query = normalizeSearchText(triageQuery.trim());
    let found = 0;
    for (const category of TRIAGE) {
        const numbered = category.items.map((item, index) => ({ item, number: index + 1 }));
        const shown = query
            ? numbered.filter(({ item }) => normalizeSearchText(triageItemText(item)).includes(query))
            : numbered;
        if (!shown.length) continue;
        found += shown.length;
        const card = document.createElement("section");
        card.className = `triage-card triage-${category.level}`;
        const head = document.createElement("div");
        head.className = "triage-head";
        appendText(head, "strong", "", `${category.level} kategorija`);
        appendText(head, "span", "triage-time", category.time);
        card.append(head);
        appendText(card, "p", "cal-muted", category.when);
        const list = document.createElement("ol");
        list.className = "triage-list";
        for (const { item, number } of shown) {
            const li = document.createElement("li");
            li.setAttribute("value", String(number));
            if (typeof item === "string") {
                li.textContent = item;
            } else {
                appendText(li, "span", "", item.text);
                const subList = document.createElement("ol");
                subList.className = "triage-sub";
                item.sub.forEach((text, subIndex) => {
                    appendText(subList, "li", "", `${number}.${subIndex + 1}. ${text}`);
                });
                li.append(subList);
            }
            list.append(li);
        }
        card.append(list);
        body.append(card);
    }
    if (!found) appendText(body, "div", "empty", "Nieko nerasta.");
}
