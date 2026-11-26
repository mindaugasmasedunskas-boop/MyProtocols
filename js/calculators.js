// Medical calculators. Pure client-side formulas, no data is stored or sent.
// Each calculator: inputs (number | select | check) and compute(v), which
// returns { value, note, level } or null while required inputs are missing.
// Formulas follow the original publications; verify before clinical use.

const CALC_GROUPS = ["Inkstai ir skysčiai", "Širdis ir krešėjimas", "Infekcijos ir būklės sunkumas", "Kita"];

const yesNo = (key, label, points = 1) => ({ key, label, type: "check", points });
const num = (key, label, unit, extra = {}) => ({ key, label, type: "number", unit, ...extra });
const sel = (key, label, options) => ({ key, label, type: "select", options });
const sex = sel("sex", "Lytis", [["m", "Vyras"], ["f", "Moteris"]]);
const round = (value, digits = 0) => {
    const f = 10 ** digits;
    return String(Math.round(value * f) / f).replace(".", ",");
};
const sumPoints = (inputs, v) => inputs.reduce((total, input) => {
    if (input.type === "check") return total + (v[input.key] ? input.points : 0);
    if (input.type === "select") {
        const points = Number(v[input.key]);
        return Number.isFinite(points) ? total + points : total;
    }
    return total;
}, 0);
const needNumbers = (v, keys) => keys.every(key => Number.isFinite(v[key]));

const CALCULATORS = [
    // ---------- Inkstai ir skysčiai ----------
    {
        id: "cockcroft", group: CALC_GROUPS[0], title: "Kreatinino klirensas (Cockcroft-Gault)",
        info: "Inkstų funkcijos įvertinimas vaistų dozėms parinkti (antibiotikai, antikoaguliantai, metforminas).",
        inputs: [num("age", "Amžius", "m."), num("weight", "Svoris", "kg"), sex, num("creat", "Kreatininas", "µmol/l")],
        compute(v) {
            if (!needNumbers(v, ["age", "weight", "creat"]) || v.creat <= 0) return null;
            const crcl = (140 - v.age) * v.weight * (v.sex === "f" ? 0.85 : 1) / (0.8145 * v.creat);
            return {
                value: round(crcl) + " ml/min",
                note: crcl < 30 ? "Sunkus funkcijos sutrikimas: koreguoti vaistų dozes." :
                    crcl < 60 ? "Vidutinis sutrikimas: tikrinti vaistų dozes." : "",
                level: crcl < 30 ? "high" : crcl < 60 ? "mid" : "low"
            };
        }
    },
    {
        id: "ckdepi", group: CALC_GROUPS[0], title: "GFG (CKD-EPI 2021)",
        info: "Lėtinės inkstų ligos stadijai nustatyti pagal kreatininą.",
        inputs: [num("age", "Amžius", "m."), sex, num("creat", "Kreatininas", "µmol/l")],
        compute(v) {
            if (!needNumbers(v, ["age", "creat"]) || v.creat <= 0) return null;
            const female = v.sex === "f";
            const k = female ? 0.7 : 0.9;
            const a = female ? -0.241 : -0.302;
            const r = (v.creat / 88.4) / k;
            const gfr = 142 * Math.min(r, 1) ** a * Math.max(r, 1) ** -1.2 * 0.9938 ** v.age * (female ? 1.012 : 1);
            const stage = gfr >= 90 ? "G1" : gfr >= 60 ? "G2" : gfr >= 45 ? "G3a" : gfr >= 30 ? "G3b" : gfr >= 15 ? "G4" : "G5";
            return { value: round(gfr) + " ml/min/1,73 m²", note: "Stadija " + stage, level: gfr < 30 ? "high" : gfr < 60 ? "mid" : "low" };
        }
    },
    {
        id: "calcium", group: CALC_GROUPS[0], title: "Koreguotas kalcis",
        info: "Tikrasis kalcio lygis, kai albuminas sumažėjęs ar padidėjęs.",
        inputs: [num("ca", "Bendras kalcis", "mmol/l"), num("alb", "Albuminas", "g/l")],
        compute(v) {
            if (!needNumbers(v, ["ca", "alb"])) return null;
            const ca = v.ca + 0.02 * (40 - v.alb);
            return {
                value: round(ca, 2) + " mmol/l",
                note: ca < 2.15 ? "Mažesnis nei norma (2,15–2,55)." : ca > 2.55 ? "Didesnis nei norma (2,15–2,55)." : "Norma 2,15–2,55.",
                level: ca < 2.15 || ca > 2.55 ? "mid" : "low"
            };
        }
    },
    {
        id: "sodium", group: CALC_GROUPS[0], title: "Natrio pokytis nuo 1 l tirpalo (Adrogué-Madias)",
        info: "Kiek pakis natris nuo 1 l pasirinkto tirpalo: saugiai koreguoti hipo- ar hipernatremiją.",
        inputs: [
            num("na", "Natris serume", "mmol/l"), num("weight", "Svoris", "kg"),
            sel("tbw", "Paciento grupė", [["0.6", "Vyras <65 m."], ["0.5", "Moteris <65 m. arba vyras ≥65 m."], ["0.45", "Moteris ≥65 m."]]),
            sel("fluid", "Tirpalas", [["154", "0,9 % NaCl"], ["513", "3 % NaCl"], ["130", "Ringerio laktatas"], ["0", "5 % gliukozė"]])
        ],
        compute(v) {
            if (!needNumbers(v, ["na", "weight"])) return null;
            const tbw = v.weight * Number(v.tbw || 0.6);
            const change = (Number(v.fluid ?? 154) - v.na) / (tbw + 1);
            return {
                value: (change > 0 ? "+" : "") + round(change, 1) + " mmol/l nuo 1 l",
                note: "Nekeisti Na daugiau kaip 8–10 mmol/l per 24 val. (osmosinės demielinizacijos rizika). Tikrinti Na kas 2–4 val.",
                level: Math.abs(change) > 8 ? "high" : "mid"
            };
        }
    },
    {
        id: "osmol", group: CALC_GROUPS[0], title: "Apskaičiuotas osmoliariškumas",
        info: "Hiperosmolinės būklės, apsinuodijimo (alkoholiai) ar hiponatremijos priežasčių vertinimui.",
        inputs: [num("na", "Natris", "mmol/l"), num("glu", "Gliukozė", "mmol/l"), num("urea", "Šlapalas", "mmol/l")],
        compute(v) {
            if (!needNumbers(v, ["na", "glu", "urea"])) return null;
            const osm = 2 * v.na + v.glu + v.urea;
            return { value: round(osm) + " mOsm/l", note: "Norma 275–295.", level: osm < 275 || osm > 295 ? "mid" : "low" };
        }
    },
    {
        id: "aniongap", group: CALC_GROUPS[0], title: "Anijonų tarpas",
        info: "Metabolinės acidozės priežasčiai nustatyti (laktatas, ketonai, toksinai, inkstai).",
        inputs: [num("na", "Natris", "mmol/l"), num("cl", "Chloridai", "mmol/l"), num("hco3", "Bikarbonatai", "mmol/l"), num("alb", "Albuminas (nebūtina)", "g/l", { optional: true })],
        compute(v) {
            if (!needNumbers(v, ["na", "cl", "hco3"])) return null;
            const ag = v.na - (v.cl + v.hco3);
            const corrected = Number.isFinite(v.alb) ? ag + 0.25 * (40 - v.alb) : null;
            const shown = corrected ?? ag;
            return {
                value: round(ag) + " mmol/l" + (corrected !== null ? `, koreguotas ${round(corrected)}` : ""),
                note: shown > 12 ? "Padidėjęs (norma apie 8–12): ieškoti laktato, ketonų, toksinų, inkstų nepakankamumo." : "Norma apie 8–12.",
                level: shown > 12 ? "mid" : "low"
            };
        }
    },

    // ---------- Širdis ir krešėjimas ----------
    {
        id: "chadsvasc", group: CALC_GROUPS[1], title: "CHA₂DS₂-VASc",
        info: "Insulto rizika esant prieširdžių virpėjimui: ar skirti antikoaguliantus.",
        inputs: [
            yesNo("chf", "Širdies nepakankamumas"), yesNo("htn", "Arterinė hipertenzija"),
            sel("age", "Amžius", [["0", "<65 m."], ["1", "65–74 m."], ["2", "≥75 m."]]),
            yesNo("dm", "Cukrinis diabetas"), yesNo("stroke", "Insultas, TIA ar tromboembolija", 2),
            yesNo("vasc", "Kraujagyslių liga (MI, periferinė, aortos plokštelės)"), yesNo("female", "Moteris")
        ],
        compute(v) {
            const s = sumPoints(this.inputs, v);
            const male = s - (v.female ? 1 : 0);
            const note = male >= 2 ? "Antikoaguliantai rekomenduojami." : male === 1 ? "Antikoaguliantus svarstyti." : "Antikoaguliantų nereikia.";
            return { value: s + " balai", note: note + " (Moters lytis vertinama tik kartu su kitais veiksniais.)", level: male >= 2 ? "high" : male === 1 ? "mid" : "low" };
        }
    },
    {
        id: "hasbled", group: CALC_GROUPS[1], title: "HAS-BLED",
        info: "Kraujavimo rizika vartojant antikoaguliantus: kuriuos rizikos veiksnius koreguoti.",
        inputs: [
            yesNo("h", "Hipertenzija (SAKS >160)"), yesNo("renal", "Inkstų funkcijos sutrikimas"), yesNo("liver", "Kepenų funkcijos sutrikimas"),
            yesNo("stroke", "Insultas anamnezėje"), yesNo("bleed", "Kraujavimas ar polinkis kraujuoti"), yesNo("inr", "Nestabilus INR"),
            yesNo("elderly", "Amžius >65 m."), yesNo("drugs", "Antiagregantai ar NVNU"), yesNo("alcohol", "Alkoholis (≥8 vnt./sav.)")
        ],
        compute(v) {
            const s = sumPoints(this.inputs, v);
            return { value: s + " balai", note: s >= 3 ? "Didelė kraujavimo rizika: koreguoti pakeičiamus veiksnius, dažniau stebėti." : "Maža ar vidutinė rizika.", level: s >= 3 ? "high" : "low" };
        }
    },
    {
        id: "heart", group: CALC_GROUPS[1], title: "HEART balas (krūtinės skausmas)",
        info: "Krūtinės skausmo pacientų rizika: ar galima saugiai išleisti.",
        inputs: [
            sel("h", "Anamnezė", [["0", "Mažai įtartina"], ["1", "Vidutiniškai įtartina"], ["2", "Labai įtartina"]]),
            sel("e", "EKG", [["0", "Normali"], ["1", "Nespecifiniai repoliarizacijos pakitimai"], ["2", "Reikšminga ST depresija"]]),
            sel("a", "Amžius", [["0", "<45 m."], ["1", "45–64 m."], ["2", "≥65 m."]]),
            sel("r", "Rizikos veiksniai", [["0", "Nėra"], ["1", "1–2"], ["2", "≥3 arba žinoma aterosklerozė"]]),
            sel("t", "Troponinas", [["0", "≤ normos ribos"], ["1", "1–3 kartus virš normos"], ["2", ">3 kartus virš normos"]])
        ],
        compute(v) {
            const s = sumPoints(this.inputs, v);
            return {
                value: s + " balai",
                note: s <= 3 ? "Maža rizika (MACE apie 2 %): galima ankstyvai išleisti." : s <= 6 ? "Vidutinė rizika: stebėjimas, tolesni tyrimai." : "Didelė rizika: ankstyva invazinė taktika, kardiologas.",
                level: s <= 3 ? "low" : s <= 6 ? "mid" : "high"
            };
        }
    },
    {
        id: "wells", group: CALC_GROUPS[1], title: "Wells (plaučių embolija)",
        info: "Plaučių embolijos tikimybė: D-dimerai ar iš karto KT angiografija.",
        inputs: [
            yesNo("dvt", "Klinikiniai GVT požymiai", 3), yesNo("likely", "PATE labiausiai tikėtina diagnozė", 3),
            yesNo("hr", "ŠSD >100 k./min.", 1.5), yesNo("immob", "Imobilizacija ≥3 d. ar operacija per 4 sav.", 1.5),
            yesNo("prior", "Anksčiau GVT ar PATE", 1.5), yesNo("hemo", "Kraujo atkosėjimas"), yesNo("cancer", "Aktyvus vėžys")
        ],
        compute(v) {
            const s = sumPoints(this.inputs, v);
            return {
                value: round(s, 1) + " balo",
                note: s > 4 ? "PATE tikėtina: KT angiografija." : "PATE mažai tikėtina: D-dimerai (arba PERC).",
                level: s > 4 ? "high" : "low"
            };
        }
    },
    {
        id: "perc", group: CALC_GROUPS[1], title: "PERC (plaučių embolijos atmetimas)",
        info: "Mažos tikimybės pacientams: ar galima atmesti PATE be D-dimerų.",
        inputs: [
            yesNo("age", "Amžius ≥50 m."), yesNo("hr", "ŠSD ≥100 k./min."), yesNo("spo2", "SpO₂ <95 %"),
            yesNo("leg", "Vienos kojos patinimas"), yesNo("hemo", "Kraujo atkosėjimas"), yesNo("surg", "Operacija ar trauma per 4 sav."),
            yesNo("prior", "Anksčiau GVT ar PATE"), yesNo("hormone", "Hormonų vartojimas")
        ],
        compute(v) {
            const s = sumPoints(this.inputs, v);
            return {
                value: s === 0 ? "Visi kriterijai neigiami" : s + " teigiami",
                note: s === 0 ? "Esant mažai klinikinei tikimybei, PATE atmesta, D-dimerų nereikia." : "PERC netaikomas: tirti toliau (D-dimerai).",
                level: s === 0 ? "low" : "mid"
            };
        }
    },
    {
        id: "qtc", group: CALC_GROUPS[1], title: "Koreguotas QT (QTc)",
        info: "QT intervalas pagal ritmo dažnį: aritmijų rizika ir vaistų, ilginančių QT, saugumas.",
        inputs: [num("qt", "QT intervalas", "ms"), num("hr", "Širdies susitraukimų dažnis", "k./min."), sex],
        compute(v) {
            if (!needNumbers(v, ["qt", "hr"]) || v.hr <= 0) return null;
            const rr = 60 / v.hr;
            const bazett = v.qt / Math.sqrt(rr);
            const fridericia = v.qt / Math.cbrt(rr);
            const limit = v.sex === "f" ? 470 : 450;
            const q = fridericia;
            return {
                value: `Fridericia ${round(fridericia)} ms, Bazett ${round(bazett)} ms`,
                note: q > 500 ? "Labai pailgėjęs (>500 ms): didelė aritmijų rizika, peržiūrėti vaistus, K, Mg." :
                    q > limit ? `Pailgėjęs (>${limit} ms).` : "Norma. Esant dažnam ritmui Bazett pervertina QTc.",
                level: q > 500 ? "high" : q > limit ? "mid" : "low"
            };
        }
    },

    // ---------- Infekcijos ir būklės sunkumas ----------
    {
        id: "qsofa", group: CALC_GROUPS[2], title: "qSOFA",
        info: "Greitas sepsio ir blogos baigties rizikos įvertinimas prie lovos.",
        inputs: [yesNo("rr", "Kvėpavimo dažnis ≥22/min."), yesNo("mental", "Sąmonės pakitimai"), yesNo("sbp", "SAKS ≤100 mmHg")],
        compute(v) {
            const s = sumPoints(this.inputs, v);
            return { value: s + " balai", note: s >= 2 ? "Didelė blogos baigties rizika: vertinti sepsį." : "Maža rizika, bet sepsio neatmeta.", level: s >= 2 ? "high" : "low" };
        }
    },
    {
        id: "news2", group: CALC_GROUPS[2], title: "NEWS2",
        info: "Būklės sunkumo ir blogėjimo rizika pagal gyvybinius rodiklius: kaip skubiai vertinti.",
        inputs: [
            num("rr", "Kvėpavimo dažnis", "/min."), num("spo2", "SpO₂", "%"), yesNo("o2", "Skiriamas deguonis", 2),
            num("temp", "Temperatūra", "°C"), num("sbp", "Sistolinis AKS", "mmHg"), num("hr", "Pulsas", "k./min."),
            yesNo("cvpu", "Nauja sumišimo būsena arba reaguoja tik į balsą, skausmą ar nereaguoja", 3)
        ],
        compute(v) {
            if (!needNumbers(v, ["rr", "spo2", "temp", "sbp", "hr"])) return null;
            const parts = [
                v.rr <= 8 ? 3 : v.rr <= 11 ? 1 : v.rr <= 20 ? 0 : v.rr <= 24 ? 2 : 3,
                v.spo2 <= 91 ? 3 : v.spo2 <= 93 ? 2 : v.spo2 <= 95 ? 1 : 0,
                v.o2 ? 2 : 0,
                v.temp <= 35 ? 3 : v.temp <= 36 ? 1 : v.temp <= 38 ? 0 : v.temp <= 39 ? 1 : 2,
                v.sbp <= 90 ? 3 : v.sbp <= 100 ? 2 : v.sbp <= 110 ? 1 : v.sbp <= 219 ? 0 : 3,
                v.hr <= 40 ? 3 : v.hr <= 50 ? 1 : v.hr <= 90 ? 0 : v.hr <= 110 ? 1 : v.hr <= 130 ? 2 : 3,
                v.cvpu ? 3 : 0
            ];
            const s = parts.reduce((a, b) => a + b, 0);
            const single3 = parts.some(p => p === 3);
            return {
                value: s + " balai",
                note: s >= 7 ? "Didelė rizika: skubus įvertinimas, reanimatologas." :
                    s >= 5 ? "Vidutinė rizika: skubus gydytojo įvertinimas." :
                    single3 ? "Vienas parametras 3 balai: skubus gydytojo įvertinimas." : "Maža rizika.",
                level: s >= 7 ? "high" : s >= 5 || single3 ? "mid" : "low"
            };
        }
    },
    {
        id: "curb65", group: CALC_GROUPS[2], title: "CURB-65 (pneumonija)",
        info: "Pneumonijos sunkumas: gydyti ambulatoriškai, ligoninėje ar intensyviojoje terapijoje.",
        inputs: [yesNo("c", "Sumišimas"), yesNo("u", "Šlapalas >7 mmol/l"), yesNo("r", "Kvėpavimo dažnis ≥30/min."), yesNo("b", "SAKS <90 arba DAKS ≤60 mmHg"), yesNo("age", "Amžius ≥65 m.")],
        compute(v) {
            const s = sumPoints(this.inputs, v);
            return {
                value: s + " balai",
                note: s <= 1 ? "Maža rizika: galima gydyti ambulatoriškai." : s === 2 ? "Vidutinė rizika: svarstyti hospitalizaciją." : "Sunki pneumonija: hospitalizuoti, vertinti ITS.",
                level: s <= 1 ? "low" : s === 2 ? "mid" : "high"
            };
        }
    },

    // ---------- Kita ----------
    {
        id: "gbs", group: CALC_GROUPS[3], title: "Glasgow-Blatchford (kraujavimas iš VT)",
        info: "Kraujavimo iš viršutinio VT rizika: ar galima gydyti ambulatoriškai, ar reikia endoskopijos.",
        inputs: [
            num("urea", "Šlapalas", "mmol/l"), num("hb", "Hemoglobinas", "g/l"), sex, num("sbp", "Sistolinis AKS", "mmHg"),
            yesNo("hr", "Pulsas ≥100 k./min."), yesNo("melena", "Melena"), yesNo("syncope", "Sinkopė", 2),
            yesNo("liver", "Kepenų liga", 2), yesNo("heart", "Širdies nepakankamumas", 2)
        ],
        compute(v) {
            if (!needNumbers(v, ["urea", "hb", "sbp"])) return null;
            const urea = v.urea < 6.5 ? 0 : v.urea < 8 ? 2 : v.urea < 10 ? 3 : v.urea < 25 ? 4 : 6;
            const hb = v.sex === "f"
                ? (v.hb >= 120 ? 0 : v.hb >= 100 ? 1 : 6)
                : (v.hb >= 130 ? 0 : v.hb >= 120 ? 1 : v.hb >= 100 ? 3 : 6);
            const sbp = v.sbp >= 110 ? 0 : v.sbp >= 100 ? 1 : v.sbp >= 90 ? 2 : 3;
            const s = urea + hb + sbp + sumPoints(this.inputs, v);
            return {
                value: s + " balai",
                note: s <= 1 ? "Maža rizika: galima gydyti ambulatoriškai." : "Reikalinga hospitalizacija ir endoskopija.",
                level: s <= 1 ? "low" : s >= 7 ? "high" : "mid"
            };
        }
    },
    {
        id: "gcs", group: CALC_GROUPS[3], title: "Glasgow komos skalė",
        info: "Sąmonės sutrikimo gylis: būklės stebėjimui ir kvėpavimo takų apsaugos sprendimui.",
        inputs: [
            sel("e", "Akių atmerkimas", [["4", "Savaime (4)"], ["3", "Į balsą (3)"], ["2", "Į skausmą (2)"], ["1", "Neatmerkia (1)"]]),
            sel("v", "Kalba", [["5", "Orientuota (5)"], ["4", "Sumišusi (4)"], ["3", "Netinkami žodžiai (3)"], ["2", "Nesuprantami garsai (2)"], ["1", "Nėra (1)"]]),
            sel("m", "Motorinė reakcija", [["6", "Vykdo komandas (6)"], ["5", "Lokalizuoja skausmą (5)"], ["4", "Atitraukia (4)"], ["3", "Patologinė fleksija (3)"], ["2", "Ekstenzija (2)"], ["1", "Nėra (1)"]])
        ],
        compute(v) {
            const s = sumPoints(this.inputs, v);
            return {
                value: `${s} (A${v.e} K${v.v} M${v.m})`,
                note: s <= 8 ? "Sunkus sąmonės sutrikimas: kvėpavimo takų apsauga." : s <= 12 ? "Vidutinis sutrikimas." : "Lengvas sutrikimas arba norma.",
                level: s <= 8 ? "high" : s <= 12 ? "mid" : "low"
            };
        }
    },
    {
        id: "bmi", group: CALC_GROUPS[3], title: "KMI ir kūno paviršiaus plotas",
        info: "Kūno masės indeksas ir kūno paviršiaus plotas (kai kurių vaistų dozėms).",
        inputs: [num("weight", "Svoris", "kg"), num("height", "Ūgis", "cm")],
        compute(v) {
            if (!needNumbers(v, ["weight", "height"]) || v.height <= 0) return null;
            const bmi = v.weight / (v.height / 100) ** 2;
            const bsa = Math.sqrt(v.height * v.weight / 3600);
            return {
                value: `KMI ${round(bmi, 1)} kg/m², KPP ${round(bsa, 2)} m²`,
                note: bmi < 18.5 ? "Per mažas svoris." : bmi < 25 ? "Normalus svoris." : bmi < 30 ? "Antsvoris." : "Nutukimas.",
                level: bmi < 18.5 || bmi >= 30 ? "mid" : "low"
            };
        }
    },
    {
        id: "dose", group: CALC_GROUPS[3], title: "Vaisto dozė pagal svorį",
        info: "Vaisto dozė mg pagal svorį ir tūris ml pagal koncentraciją.",
        inputs: [num("weight", "Svoris", "kg"), num("perkg", "Dozė", "mg/kg"), num("conc", "Koncentracija (nebūtina)", "mg/ml", { optional: true })],
        compute(v) {
            if (!needNumbers(v, ["weight", "perkg"])) return null;
            const mg = v.weight * v.perkg;
            const ml = Number.isFinite(v.conc) && v.conc > 0 ? mg / v.conc : null;
            return { value: round(mg, 1) + " mg" + (ml !== null ? ` = ${round(ml, 1)} ml` : ""), note: "Patikrinti didžiausią leistiną dozę.", level: null };
        }
    }
];

let currentCalculator = null;

function showCalculators() {
    currentSection = "calculators";
    const app = document.getElementById("app");
    app.innerHTML = `
        <div class="topbar">${userAreaHtml()}</div>
        ${authErrorHtml()}
        <nav class="sections" id="sectionNav"></nav>
        <div class="message calc-warning">Skaičiuoklės padeda, bet nepakeičia klinikinio sprendimo. Rezultatus vertinkite kartu su paciento būkle.</div>
        <div id="calcBody"></div>
    `;
    renderSectionNav();
    const calc = CALCULATORS.find(c => c.id === currentCalculator);
    if (calc) renderCalculator(calc);
    else renderCalculatorList();
}

function renderCalculatorList() {
    const body = document.getElementById("calcBody");
    for (const group of CALC_GROUPS) {
        const heading = document.createElement("h3");
        heading.className = "contact-group";
        heading.textContent = group;
        const grid = document.createElement("div");
        grid.className = "calc-grid";
        for (const calc of CALCULATORS.filter(c => c.group === group)) {
            const card = document.createElement("button");
            card.className = "protocol calc-card";
            card.setAttribute("data-calc", calc.id);
            const name = document.createElement("span");
            name.className = "calc-name";
            name.textContent = calc.title;
            const about = document.createElement("span");
            about.className = "calc-info";
            about.textContent = calc.info;
            card.append(name, about);
            card.addEventListener("click", () => { currentCalculator = calc.id; showCalculators(); });
            grid.append(card);
        }
        body.append(heading, grid);
    }
}

function readCalcValues(calc) {
    const values = {};
    for (const input of calc.inputs) {
        const element = document.getElementById("calc-" + input.key);
        if (!element) continue;
        if (input.type === "check") values[input.key] = Boolean(element.checked);
        else if (input.type === "select") values[input.key] = element.value;
        else {
            const text = String(element.value || "").trim().replace(",", ".");
            values[input.key] = text === "" ? NaN : Number(text);
        }
    }
    return values;
}

function updateCalculatorResult(calc) {
    const box = document.getElementById("calcResult");
    if (!box) return;
    let result = null;
    try {
        result = calc.compute(readCalcValues(calc));
    } catch {
        result = null;
    }
    box.className = "calc-result" + (result?.level ? " level-" + result.level : "");
    document.getElementById("calcValue").textContent = result ? result.value : "Įveskite duomenis";
    document.getElementById("calcNote").textContent = result ? result.note : "";
}

function renderCalculator(calc) {
    const body = document.getElementById("calcBody");
    const back = document.createElement("button");
    back.textContent = "← Visos skaičiuoklės";
    back.addEventListener("click", () => { currentCalculator = null; showCalculators(); });

    const form = document.createElement("div");
    form.className = "suggestion-box calc-form";
    const title = document.createElement("h2");
    title.setAttribute("id", "calcTitle");
    title.textContent = calc.title;
    const about = document.createElement("p");
    about.className = "calc-info";
    about.setAttribute("id", "calcInfo");
    about.textContent = calc.info;
    form.append(title, about);

    for (const input of calc.inputs) {
        const row = document.createElement("label");
        row.className = "form-row calc-row";
        let control;
        if (input.type === "select") {
            control = document.createElement("select");
            for (const [value, label] of input.options) {
                const option = document.createElement("option");
                option.setAttribute("value", value);
                option.textContent = label;
                control.append(option);
            }
            control.value = input.options[0][0];
        } else {
            control = document.createElement("input");
            control.setAttribute("type", input.type === "check" ? "checkbox" : "text");
            if (input.type === "number") control.setAttribute("inputmode", "decimal");
        }
        control.setAttribute("id", "calc-" + input.key);
        control.addEventListener(input.type === "number" ? "input" : "change", () => updateCalculatorResult(calc));
        const label = document.createElement("span");
        label.textContent = input.type === "check" && input.points !== 1 ? `${input.label} (+${String(input.points).replace(".", ",")})` : input.label;
        if (input.type === "check") row.append(control, label);
        else {
            row.append(label, control);
            if (input.unit) {
                const unit = document.createElement("span");
                unit.className = "cal-muted";
                unit.textContent = input.unit;
                row.append(unit);
            }
        }
        form.append(row);
    }

    const result = document.createElement("div");
    result.setAttribute("id", "calcResult");
    result.className = "calc-result";
    const value = document.createElement("div");
    value.setAttribute("id", "calcValue");
    value.className = "calc-value";
    const note = document.createElement("div");
    note.setAttribute("id", "calcNote");
    result.append(value, note);
    form.append(result);

    body.append(back, form);
    updateCalculatorResult(calc);
}
