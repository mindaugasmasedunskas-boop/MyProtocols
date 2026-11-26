// Vacation planning. Logged-in staff only.
// Server protection (supabase/sql/vacations.sql): RLS shows own rows, rows of
// colleagues with the same position sharing a department, and all rows to an
// admin. A trigger fills owner, name, position and departments from the
// profile. Limits per department and position live in app_settings
// ("vacation_limits") and only produce a warning; the admin decides.

const VACATION_STATUS = { planned: "Planuojama", approved: "Patvirtinta", rejected: "Atmesta" };

let vacationsList = [];
let vacationLimits = {};
let vacationGroups = [];
let vacationsLoadedFor = 0;     // authVersion the data belongs to
let vacationsLoading = false;
let vacationsError = "";
let vacationMonth = null;
let vacationSavePending = false;

function clearVacations() {
    vacationsList = [];
    vacationLimits = {};
    vacationsLoadedFor = 0;
    vacationsError = "";
}

function vacationDays(item) {
    return Math.round((parseYmd(item.end_date) - parseYmd(item.start_date)) / 86400000) + 1;
}

function vacationLimit(department, group) {
    const value = vacationLimits?.[department]?.[group];
    return Number.isInteger(value) && value > 0 ? value : 0;
}

// Colleagues of the same position away on a day in a department.
function vacationCount(day, department, group, list = vacationsList) {
    return list.filter(v => v.status !== "rejected" && v.staff_group === group &&
        Array.isArray(v.departments) && v.departments.includes(department) &&
        v.start_date <= day && day <= v.end_date).length;
}

// First department whose limit is exceeded during the entry, or "".
function vacationOverLimit(entry, list = vacationsList) {
    if (!entry.staff_group || !Array.isArray(entry.departments)) return "";
    for (const department of entry.departments) {
        const limit = vacationLimit(department, entry.staff_group);
        if (!limit) continue;
        for (let d = parseYmd(entry.start_date); ymd(d) <= entry.end_date; d.setDate(d.getDate() + 1)) {
            if (vacationCount(ymd(d), department, entry.staff_group, list) > limit) return department;
        }
    }
    return "";
}

async function loadVacations() {
    vacationsLoading = true;
    vacationsError = "";
    const version = authVersion;
    try {
        const [rows, limits, groups] = await Promise.all([
            supabaseClient.from("vacations")
                .select("id,user_id,full_name,staff_group,departments,start_date,end_date,status,note")
                .order("start_date"),
            supabaseClient.from("app_settings").select("value").eq("key", "vacation_limits").maybeSingle(),
            supabaseClient.from("app_settings").select("value").eq("key", "staff_groups").maybeSingle()
        ]);
        await ensureDepartments();
        if (version !== authVersion) return;
        if (rows.error) throw rows.error;
        vacationsList = rows.data || [];
        vacationLimits = limits.data?.value && typeof limits.data.value === "object" && !Array.isArray(limits.data.value)
            ? limits.data.value : {};
        vacationGroups = Array.isArray(groups.data?.value)
            ? groups.data.value.filter(g => typeof g === "string" && g.trim())
            : DEFAULT_STAFF_GROUPS.slice();
        vacationsLoadedFor = version;
    } catch (error) {
        if (version !== authVersion) return;
        clearVacations();
        vacationsError = "Nepavyko gauti atostogų: " + errorText(error);
    } finally {
        if (version === authVersion) vacationsLoading = false;
    }
}

async function showVacations() {
    if (!currentUser || authLoading || logoutPending || logoutFailed) {
        clearVacations();
        if (!currentUser) {
            currentSection = "home";
            showHome();
            return;
        }
    }
    currentSection = "vacations";
    if (!vacationMonth) {
        const today = new Date();
        vacationMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    }
    document.getElementById("app").innerHTML = `
        <div class="topbar">${userAreaHtml()}</div>
        ${authErrorHtml()}
        <nav class="sections" id="sectionNav"></nav>
        <div id="vacationsBody"></div>
    `;
    renderSectionNav();
    const nav = document.getElementById("sectionNav");
    const add = document.createElement("button");
    add.className = "primary";
    add.textContent = "+ Planuoti atostogas";
    add.addEventListener("click", showVacationForm);
    nav.append(add);
    if (isAdmin()) {
        const limits = document.createElement("button");
        limits.textContent = "Ribos";
        limits.addEventListener("click", showVacationLimits);
        nav.append(limits);
    }
    renderVacations();

    if (vacationsLoadedFor !== authVersion && !vacationsLoading) {
        await loadVacations();
        if (currentSection === "vacations" && document.getElementById("vacationsBody")) renderVacations();
    }
}

function renderVacations() {
    const body = document.getElementById("vacationsBody");
    if (!body) return;
    if (vacationsLoading || (vacationsLoadedFor !== authVersion && !vacationsError)) {
        body.innerHTML = '<div class="empty" role="status">Kraunama...</div>';
        return;
    }
    if (vacationsError) {
        body.innerHTML = `<div class="message" role="alert">${escapeHtml(vacationsError)}</div>`;
        const retry = document.createElement("button");
        retry.textContent = "Bandyti dar kartą";
        retry.addEventListener("click", () => { clearVacations(); showVacations(); });
        body.append(retry);
        return;
    }
    body.innerHTML = "";
    const box = document.createElement("div");
    box.className = "cal-box";
    body.append(box);

    if (!isAdmin() && (!currentProfile?.staff_group || !currentProfile?.departments?.length)) {
        appendText(box, "p", "cal-muted",
            "Administratorius dar nepriskyrė jums pareigų ar skyriaus, todėl kolegų atostogų nematysite.");
    }

    const head = document.createElement("div");
    head.className = "month-head";
    const prev = document.createElement("button");
    prev.textContent = "‹";
    prev.setAttribute("aria-label", "Ankstesnis mėnuo");
    prev.addEventListener("click", () => shiftVacationMonth(-1));
    const next = document.createElement("button");
    next.textContent = "›";
    next.setAttribute("aria-label", "Kitas mėnuo");
    next.addEventListener("click", () => shiftVacationMonth(1));
    const title = document.createElement("strong");
    title.textContent = `${vacationMonth.getFullYear()} m. ${MONTHS[vacationMonth.getMonth()].toLowerCase()}`;
    head.append(prev, title, next);
    box.append(head);

    const first = ymd(vacationMonth);
    const last = ymd(new Date(vacationMonth.getFullYear(), vacationMonth.getMonth() + 1, 0));
    const shown = vacationsList
        .filter(v => v.start_date <= last && v.end_date >= first)
        .filter(v => v.user_id === currentUser.id || matchesDepartments(v));
    if (!shown.length) appendText(box, "div", "cal-empty", "Šį mėnesį atostogų nesuplanuota.");
    for (const item of shown) box.append(vacationRow(item));
}

function vacationRow(item) {
    const row = document.createElement("div");
    row.className = "vacation-row status-" + (VACATION_STATUS[item.status] ? item.status : "planned");
    const who = document.createElement("div");
    appendText(who, "strong", "", item.full_name || "—");
    if (isAdmin() && item.staff_group) appendText(who, "div", "cal-muted", item.staff_group);
    const when = document.createElement("div");
    appendText(when, "div", "", `${item.start_date} – ${item.end_date}`);
    appendText(when, "div", "cal-muted", `${vacationDays(item)} d.${item.note ? " · " + item.note : ""}`);
    const state = document.createElement("div");
    appendText(state, "span", "vacation-status", VACATION_STATUS[item.status] || item.status);
    const over = item.status !== "rejected" ? vacationOverLimit(item) : "";
    if (over) appendText(state, "div", "vacation-warning", `Viršyta riba: ${over}`);
    const actions = document.createElement("div");
    actions.className = "vacation-actions";
    const action = (text, handler) => {
        const button = document.createElement("button");
        button.className = "link-button";
        button.textContent = text;
        button.addEventListener("click", handler);
        actions.append(button);
    };
    if (isAdmin()) {
        if (item.status !== "approved") action("Patvirtinti", () => setVacationStatus(item, "approved"));
        if (item.status !== "rejected") action("Atmesti", () => setVacationStatus(item, "rejected"));
        action("Ištrinti", () => deleteVacation(item));
    } else if (item.user_id === currentUser?.id && item.status === "planned") {
        action("Atšaukti", () => deleteVacation(item));
    }
    row.append(who, when, state, actions);
    return row;
}

function shiftVacationMonth(delta) {
    vacationMonth = new Date(vacationMonth.getFullYear(), vacationMonth.getMonth() + delta, 1);
    renderVacations();
}

function showVacationForm() {
    const body = document.getElementById("vacationsBody");
    if (!body || !currentUser) return;
    body.innerHTML = `
        <div class="suggestion-box" id="vacationForm">
            <h3>Planuoti atostogas</h3>
            <label class="field-label" for="vacationStart">Nuo</label>
            <input id="vacationStart" type="date">
            <label class="field-label" for="vacationEnd">Iki (imtinai)</label>
            <input id="vacationEnd" type="date">
            <label class="field-label" for="vacationNote">Pastaba (nebūtina)</label>
            <input id="vacationNote" type="text" maxlength="300">
            <button id="vacationSave" class="primary">Pateikti</button>
            <button id="vacationCancel">Atšaukti</button>
            <div id="vacationMessage" class="message" role="alert"></div>
        </div>
    `;
    document.getElementById("vacationSave").addEventListener("click", () => saveVacation());
    document.getElementById("vacationCancel").addEventListener("click", () => renderVacations());
}

async function saveVacation() {
    if (vacationSavePending || !currentUser) return;
    const message = document.getElementById("vacationMessage");
    const start = document.getElementById("vacationStart").value;
    const end = document.getElementById("vacationEnd").value;
    const note = document.getElementById("vacationNote").value.trim().slice(0, 300);
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(start) || !datePattern.test(end)) { message.textContent = "Nurodykite abi datas."; return; }
    if (end < start) { message.textContent = "Pabaiga negali būti anksčiau už pradžią."; return; }
    const draft = {
        start_date: start, end_date: end, status: "planned",
        staff_group: currentProfile?.staff_group || "",
        departments: Array.isArray(currentProfile?.departments) ? currentProfile.departments : []
    };
    if (vacationDays(draft) > 93) { message.textContent = "Ilgiausias laikotarpis – 93 dienos."; return; }
    const over = vacationOverLimit(draft, [...vacationsList, draft]);
    if (over && !confirm(`Skyriuje „${over}“ tomis dienomis jau pasiekta atostogaujančių riba. Vis tiek pateikti?`)) return;

    vacationSavePending = true;
    message.textContent = "Saugoma...";
    const version = authVersion;
    try {
        const { data, error } = await supabaseClient.from("vacations")
            .insert({ start_date: start, end_date: end, note })
            .select("id");
        if (error) throw error;
        if (!Array.isArray(data) || !data.length) throw new Error("neturite teisės.");
    } catch (error) {
        if (version === authVersion && document.getElementById("vacationMessage") === message) {
            message.textContent = "Nepavyko išsaugoti: " + errorText(error);
        }
        return;
    } finally {
        vacationSavePending = false;
    }
    if (version !== authVersion) return;
    vacationMonth = new Date(parseYmd(start).getFullYear(), parseYmd(start).getMonth(), 1);
    clearVacations();
    await showVacations();
}

async function setVacationStatus(item, status) {
    if (!isAdmin() || vacationSavePending) return;
    vacationSavePending = true;
    try {
        const { data, error } = await supabaseClient.from("vacations")
            .update({ status }).eq("id", item.id).select("id");
        if (error) throw error;
        if (!Array.isArray(data) || !data.length) throw new Error("neturite teisės.");
    } catch (error) {
        alert("Nepavyko pakeisti būsenos: " + errorText(error));
        return;
    } finally {
        vacationSavePending = false;
    }
    clearVacations();
    await showVacations();
}

async function deleteVacation(item) {
    if (vacationSavePending) return;
    if (!confirm(`Pašalinti atostogas ${item.start_date} – ${item.end_date}?`)) return;
    vacationSavePending = true;
    try {
        const { data, error } = await supabaseClient.from("vacations")
            .delete().eq("id", item.id).select("id");
        if (error) throw error;
        if (!Array.isArray(data) || !data.length) throw new Error("neturite teisės.");
    } catch (error) {
        alert("Nepavyko pašalinti: " + errorText(error));
        return;
    } finally {
        vacationSavePending = false;
    }
    clearVacations();
    await showVacations();
}

function showVacationLimits() {
    const body = document.getElementById("vacationsBody");
    if (!body || !isAdmin()) return;
    body.innerHTML = "";
    const box = document.createElement("div");
    box.className = "suggestion-box";
    box.setAttribute("id", "vacationLimits");
    appendText(box, "h3", "", "Kiek vienu metu gali atostogauti");
    appendText(box, "p", "cal-muted", "Tuščias laukas arba 0 – riba netaikoma. Viršijus ribą rodomas įspėjimas.");
    if (!departmentsList.length) {
        appendText(box, "p", "", "Pirmiausia skiltyje „Personalas“ įveskite skyrių sąrašą.");
    }
    const draft = JSON.parse(JSON.stringify(vacationLimits || {}));
    const select = document.createElement("select");
    select.setAttribute("id", "vacationLimitDepartment");
    select.setAttribute("aria-label", "Skyrius");
    for (const name of departmentsList) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        select.append(option);
    }
    const fields = document.createElement("div");
    fields.setAttribute("id", "vacationLimitFields");
    const renderFields = () => {
        fields.innerHTML = "";
        const department = select.value;
        for (const group of vacationGroups) {
            const row = document.createElement("label");
            row.className = "form-row";
            appendText(row, "span", "limit-name", group);
            const input = document.createElement("input");
            input.setAttribute("type", "number");
            input.setAttribute("min", "0");
            input.setAttribute("max", "99");
            input.setAttribute("data-group", group);
            input.value = draft[department]?.[group] ? String(draft[department][group]) : "";
            input.addEventListener("input", () => {
                const value = parseInt(input.value, 10);
                draft[department] = draft[department] || {};
                if (value > 0) draft[department][group] = Math.min(value, 99);
                else delete draft[department][group];
                if (!Object.keys(draft[department]).length) delete draft[department];
            });
            row.append(input);
            fields.append(row);
        }
    };
    if (departmentsList.length) select.value = departmentsList[0];
    select.addEventListener("change", renderFields);
    if (departmentsList.length) {
        box.append(select, fields);
        renderFields();
    }
    const message = document.createElement("div");
    message.className = "message";
    message.setAttribute("id", "vacationLimitMessage");
    const save = document.createElement("button");
    save.className = "primary";
    save.textContent = "Išsaugoti ribas";
    save.addEventListener("click", () => saveVacationLimits(draft, message, save));
    const back = document.createElement("button");
    back.textContent = "Grįžti";
    back.addEventListener("click", () => renderVacations());
    box.append(save, back, message);
    body.append(box);
}

async function saveVacationLimits(draft, message, button) {
    if (!isAdmin() || vacationSavePending) return;
    vacationSavePending = true;
    button.disabled = true;
    message.textContent = "Saugoma...";
    try {
        const { data, error } = await supabaseClient.from("app_settings")
            .upsert({ key: "vacation_limits", value: draft, updated_at: new Date().toISOString() })
            .select("key");
        if (error || !Array.isArray(data) || !data.length) throw error || new Error("neturite teisės.");
        vacationLimits = JSON.parse(JSON.stringify(draft));
        message.textContent = "Išsaugota.";
    } catch (error) {
        message.textContent = "Nepavyko išsaugoti: " + errorText(error);
    } finally {
        vacationSavePending = false;
        button.disabled = false;
    }
}
