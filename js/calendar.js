// Calendar: announcements by date and monthly duty schedules (PDF/image).
// Logged-in staff only. Server protection: RLS on announcements and
// duty_schedules (read: authenticated, write: admin) and storage policies
// on the private "schedules" bucket.

const MONTHS = ["Sausis", "Vasaris", "Kovas", "Balandis", "Gegužė", "Birželis",
    "Liepa", "Rugpjūtis", "Rugsėjis", "Spalis", "Lapkritis", "Gruodis"];
const MONTHS_OF = ["sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio",
    "liepos", "rugpjūčio", "rugsėjo", "spalio", "lapkričio", "gruodžio"];
const SCHEDULE_TYPES = ["application/pdf", "image/png", "image/jpeg"];

let announcements = [];
let schedules = [];
let calendarLoaded = false;
let calendarLoading = false;
let calendarError = "";
let calendarMonth = null;   // Date at the first day of the shown month
let selectedDate = null;    // "YYYY-MM-DD"
let calendarSavePending = false;

function ymd(date) {
    const pad = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseYmd(value) {
    const [y, m, d] = String(value).split("-").map(Number);
    return new Date(y, m - 1, d);
}

function dayLabel(value) {
    const date = parseYmd(value);
    return `${MONTHS_OF[date.getMonth()]} ${date.getDate()} d.`;
}

function announcementsOn(day) {
    return announcements.filter(a => a.start_date <= day && day <= a.end_date)
        .sort((a, b) => Number(Boolean(b.important)) - Number(Boolean(a.important)));
}

function clearCalendar() {
    announcements = [];
    schedules = [];
    calendarLoaded = false;
    calendarError = "";
}

async function loadCalendar() {
    calendarLoading = true;
    calendarError = "";
    const version = authVersion;
    const since = new Date();
    since.setDate(since.getDate() - 120);
    try {
        const [ann, sch] = await Promise.all([
            supabaseClient.from("announcements")
                .select("id,body,start_date,end_date,important")
                .gte("end_date", ymd(since))
                .order("start_date"),
            supabaseClient.from("duty_schedules")
                .select("id,month,title,file_path")
                .order("month")
        ]);
        if (version !== authVersion) return;
        if (ann.error) throw ann.error;
        if (sch.error) throw sch.error;
        announcements = ann.data || [];
        schedules = (sch.data || []).slice().reverse();
        calendarLoaded = true;
    } catch (error) {
        if (version !== authVersion) return;
        clearCalendar();
        calendarError = "Nepavyko gauti kalendoriaus: " + errorText(error);
    } finally {
        if (version === authVersion) calendarLoading = false;
    }
}

async function showCalendar() {
    if (!currentUser || authLoading || logoutPending || logoutFailed) {
        clearCalendar();
        if (!currentUser) {
            currentSection = "home";
            showHome();
            return;
        }
    }
    currentSection = "calendar";
    const today = new Date();
    if (!selectedDate) selectedDate = ymd(today);
    if (!calendarMonth) calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    document.getElementById("app").innerHTML = `
        <div class="topbar">${userAreaHtml()}</div>
        ${authErrorHtml()}
        <nav class="sections" id="sectionNav"></nav>
        <div id="calendarBody"></div>
    `;
    renderSectionNav();
    if (isAdmin()) {
        const nav = document.getElementById("sectionNav");
        const addNote = document.createElement("button");
        addNote.className = "primary";
        addNote.textContent = "+ Skelbimas";
        addNote.addEventListener("click", showAnnouncementForm);
        const addSchedule = document.createElement("button");
        addSchedule.textContent = "+ Grafikas";
        addSchedule.addEventListener("click", showScheduleForm);
        nav.append(addNote, addSchedule);
    }
    renderCalendar();

    if (!calendarLoaded && !calendarLoading) {
        await loadCalendar();
        if (currentSection === "calendar" && document.getElementById("calendarBody")) renderCalendar();
    }
}

function renderCalendar() {
    const body = document.getElementById("calendarBody");
    if (!body) return;
    if (calendarLoading || (!calendarLoaded && !calendarError)) {
        body.innerHTML = '<div class="empty" role="status">Kraunama...</div>';
        return;
    }
    if (calendarError) {
        body.innerHTML = `<div class="message" role="alert">${escapeHtml(calendarError)}</div>`;
        const retry = document.createElement("button");
        retry.textContent = "Bandyti dar kartą";
        retry.addEventListener("click", () => { calendarLoaded = false; calendarError = ""; showCalendar(); });
        body.append(retry);
        return;
    }

    body.innerHTML = `
        <div class="calendar-layout">
            <div>
                <div class="cal-box"><h3 id="dayHeading"></h3><div id="dayList"></div></div>
                <div class="cal-box"><h3>Artimiausi</h3><div id="upcomingList"></div></div>
            </div>
            <div>
                <div class="cal-box" id="monthBox"></div>
                <div class="cal-box"><h3>Budėjimų grafikai</h3><div id="scheduleList"></div></div>
            </div>
        </div>
    `;
    const todayKey = ymd(new Date());
    document.getElementById("dayHeading").textContent =
        (selectedDate === todayKey ? "Šiandien, " : "") + dayLabel(selectedDate);

    const dayList = document.getElementById("dayList");
    const todays = announcementsOn(selectedDate);
    if (!todays.length) appendText(dayList, "div", "cal-empty", "Skelbimų nėra.");
    for (const item of todays) dayList.append(announcementCard(item));

    const upcoming = announcements
        .filter(a => a.start_date > selectedDate)
        .slice(0, 5);
    const upcomingList = document.getElementById("upcomingList");
    if (!upcoming.length) appendText(upcomingList, "div", "cal-empty", "Artimiausių įvykių nėra.");
    for (const item of upcoming) {
        const row = document.createElement("div");
        row.className = "cal-row";
        appendText(row, "span", "", dayLabel(item.start_date));
        appendText(row, "span", "cal-muted", item.body);
        upcomingList.append(row);
    }

    renderMonth(document.getElementById("monthBox"), todayKey);
    renderSchedules(document.getElementById("scheduleList"));
}

function appendText(parent, tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
}

function announcementCard(item) {
    const card = document.createElement("div");
    card.className = "announcement" + (item.important ? " important" : "");
    appendText(card, "div", "announcement-text", item.body);
    if (item.start_date !== item.end_date) {
        appendText(card, "div", "cal-muted", `${dayLabel(item.start_date)} – ${dayLabel(item.end_date)}`);
    }
    if (isAdmin()) {
        const remove = document.createElement("button");
        remove.className = "link-button";
        remove.textContent = "Ištrinti";
        remove.addEventListener("click", () => deleteAnnouncement(item.id));
        card.append(remove);
    }
    return card;
}

function renderMonth(box, todayKey) {
    const head = document.createElement("div");
    head.className = "month-head";
    const prev = document.createElement("button");
    prev.textContent = "‹";
    prev.setAttribute("aria-label", "Ankstesnis mėnuo");
    prev.addEventListener("click", () => shiftMonth(-1));
    const next = document.createElement("button");
    next.textContent = "›";
    next.setAttribute("aria-label", "Kitas mėnuo");
    next.addEventListener("click", () => shiftMonth(1));
    const title = document.createElement("strong");
    title.textContent = `${calendarMonth.getFullYear()} m. ${MONTHS[calendarMonth.getMonth()].toLowerCase()}`;
    head.append(prev, title, next);
    box.append(head);

    const grid = document.createElement("div");
    grid.className = "month-grid";
    grid.setAttribute("id", "monthGrid");
    for (const name of ["Pr", "An", "Tr", "Kt", "Pn", "Š", "S"]) appendText(grid, "span", "dow", name);
    const first = new Date(calendarMonth);
    const offset = (first.getDay() + 6) % 7;
    for (let i = 0; i < offset; i++) grid.append(document.createElement("span"));
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
        const key = ymd(new Date(first.getFullYear(), first.getMonth(), d));
        const cell = document.createElement("button");
        cell.className = "day" +
            (announcementsOn(key).length ? " has" : "") +
            (key === todayKey ? " today" : "") +
            (key === selectedDate ? " selected" : "");
        cell.setAttribute("data-date", key);
        cell.textContent = String(d);
        cell.addEventListener("click", () => { selectedDate = key; renderCalendar(); });
        grid.append(cell);
    }
    box.append(grid);
}

function shiftMonth(delta) {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + delta, 1);
    renderCalendar();
}

function renderSchedules(list) {
    if (!schedules.length) {
        appendText(list, "div", "cal-empty", "Grafikų dar nėra.");
        return;
    }
    for (const item of schedules) {
        const row = document.createElement("div");
        row.className = "cal-row";
        appendText(row, "span", "", item.title);
        const actions = document.createElement("span");
        const open = document.createElement("button");
        open.className = "link-button";
        open.textContent = "Atidaryti";
        open.addEventListener("click", () => openSchedule(item));
        actions.append(open);
        if (isAdmin()) {
            const remove = document.createElement("button");
            remove.className = "link-button";
            remove.textContent = "Ištrinti";
            remove.addEventListener("click", () => deleteSchedule(item));
            actions.append(remove);
        }
        row.append(actions);
        list.append(row);
    }
}

async function openSchedule(item) {
    // Open the window during the click so popup blockers allow it.
    const win = window.open("about:blank", "_blank");
    try {
        const { data, error } = await supabaseClient.storage
            .from("schedules")
            .createSignedUrl(item.file_path, 300);
        if (error || !data?.signedUrl) throw error || new Error("Nuoroda negauta.");
        if (win) {
            win.opener = null;
            win.location.href = data.signedUrl;
        }
    } catch (error) {
        if (win) win.close();
        alert("Nepavyko atidaryti grafiko: " + errorText(error));
    }
}

// ---------- admin: announcements ----------

function showAnnouncementForm() {
    if (!isAdmin()) return showCalendar();
    document.getElementById("app").innerHTML = `
        <div class="detail-buttons"><button id="calendarCancel">← Atšaukti</button></div>
        <form id="announcementForm" class="suggestion-box" novalidate>
            <h2>Naujas skelbimas</h2>
            <textarea id="announcementBody" placeholder="Skelbimo tekstas"></textarea>
            <label class="form-row">Nuo <input id="announcementStart" type="date"></label>
            <label class="form-row">Iki <input id="announcementEnd" type="date"></label>
            <label class="form-row"><input id="announcementImportant" type="checkbox"> Svarbu (rodoma geltonai, viršuje)</label>
            <button id="announcementSave" type="submit" class="primary">Išsaugoti</button>
            <div id="announcementMessage" class="message" role="alert"></div>
        </form>
    `;
    document.getElementById("announcementStart").value = selectedDate;
    document.getElementById("announcementEnd").value = selectedDate;
    document.getElementById("calendarCancel").addEventListener("click", showCalendar);
    document.getElementById("announcementForm").addEventListener("submit", event => {
        event.preventDefault();
        return saveAnnouncement();
    });
}

async function saveAnnouncement() {
    if (!isAdmin() || calendarSavePending) return;
    const message = document.getElementById("announcementMessage");
    const button = document.getElementById("announcementSave");
    const values = {
        body: document.getElementById("announcementBody").value.trim(),
        start_date: document.getElementById("announcementStart").value,
        end_date: document.getElementById("announcementEnd").value || document.getElementById("announcementStart").value,
        important: Boolean(document.getElementById("announcementImportant").checked)
    };
    if (!values.body) { message.textContent = "Įrašykite skelbimo tekstą."; return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.start_date)) { message.textContent = "Nurodykite datą."; return; }
    if (values.end_date < values.start_date) { message.textContent = "Pabaigos data negali būti ankstesnė už pradžią."; return; }

    calendarSavePending = true;
    if (button) button.disabled = true;
    message.textContent = "Saugoma...";
    const version = authVersion;
    let data;
    let error;
    try {
        ({ data, error } = await supabaseClient.from("announcements").insert(values).select("id"));
    } catch (requestError) {
        error = requestError;
    } finally {
        calendarSavePending = false;
        if (button) button.disabled = false;
    }
    if (version !== authVersion || !isAdmin() || document.getElementById("announcementMessage") !== message) return;
    if (error || !Array.isArray(data) || !data.length) {
        message.textContent = "Nepavyko išsaugoti: " + (error ? errorText(error) : "neturite teisės.");
        return;
    }
    selectedDate = values.start_date;
    const start = parseYmd(values.start_date);
    calendarMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    calendarLoaded = false;
    await showCalendar();
}

async function deleteAnnouncement(id) {
    if (!isAdmin() || !confirm("Ištrinti skelbimą?")) return;
    const version = authVersion;
    let data;
    let error;
    try {
        ({ data, error } = await supabaseClient.from("announcements").delete().eq("id", id).select("id"));
    } catch (requestError) {
        error = requestError;
    }
    if (version !== authVersion) return;
    if (error || !Array.isArray(data) || !data.length) {
        alert("Nepavyko ištrinti: " + (error ? errorText(error) : "įrašas nerastas arba neturite teisės."));
        return;
    }
    calendarLoaded = false;
    await showCalendar();
}

// ---------- admin: duty schedules ----------

function showScheduleForm() {
    if (!isAdmin()) return showCalendar();
    document.getElementById("app").innerHTML = `
        <div class="detail-buttons"><button id="calendarCancel">← Atšaukti</button></div>
        <form id="scheduleForm" class="suggestion-box" novalidate>
            <h2>Budėjimų grafikas</h2>
            <label class="form-row">Mėnuo <input id="scheduleMonth" type="month"></label>
            <label class="form-row">Failas (PDF, PNG arba JPG, iki 10 MB) <input id="scheduleFile" type="file" accept=".pdf,.png,.jpg,.jpeg"></label>
            <button id="scheduleSave" type="submit" class="primary">Įkelti</button>
            <div id="scheduleMessage" class="message" role="alert"></div>
        </form>
    `;
    document.getElementById("scheduleMonth").value = ymd(calendarMonth || new Date()).slice(0, 7);
    document.getElementById("calendarCancel").addEventListener("click", showCalendar);
    document.getElementById("scheduleForm").addEventListener("submit", event => {
        event.preventDefault();
        return saveSchedule();
    });
}

async function saveSchedule() {
    if (!isAdmin() || calendarSavePending) return;
    const message = document.getElementById("scheduleMessage");
    const button = document.getElementById("scheduleSave");
    const month = document.getElementById("scheduleMonth").value;
    const file = document.getElementById("scheduleFile").files?.[0];
    if (!/^\d{4}-\d{2}$/.test(month)) { message.textContent = "Pasirinkite mėnesį."; return; }
    if (!file) { message.textContent = "Pasirinkite failą."; return; }
    if (!SCHEDULE_TYPES.includes(file.type)) { message.textContent = "Leidžiami tik PDF, PNG ir JPG failai."; return; }
    if (file.size > 10 * 1024 * 1024) { message.textContent = "Failas per didelis (daugiau nei 10 MB)."; return; }

    const [y, m] = month.split("-").map(Number);
    const extension = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" }[file.type];
    const path = `${month}/${Date.now()}.${extension}`;
    calendarSavePending = true;
    if (button) button.disabled = true;
    message.textContent = "Įkeliama...";
    const version = authVersion;
    let failure = null;
    try {
        const upload = await supabaseClient.storage.from("schedules")
            .upload(path, file, { contentType: file.type, upsert: false });
        if (upload.error) throw upload.error;
        const { data, error } = await supabaseClient.from("duty_schedules")
            .insert({ month: `${month}-01`, title: `${MONTHS[m - 1]} ${y}`, file_path: path })
            .select("id");
        if (error || !Array.isArray(data) || !data.length) {
            // Do not leave an orphaned file when the row was not written.
            await supabaseClient.storage.from("schedules").remove([path]);
            throw error || new Error("neturite teisės.");
        }
    } catch (error) {
        failure = error;
    } finally {
        calendarSavePending = false;
        if (button) button.disabled = false;
    }
    if (version !== authVersion || !isAdmin() || document.getElementById("scheduleMessage") !== message) return;
    if (failure) {
        message.textContent = "Nepavyko įkelti: " + errorText(failure);
        return;
    }
    calendarLoaded = false;
    await showCalendar();
}

async function deleteSchedule(item) {
    if (!isAdmin() || !confirm(`Ištrinti grafiką „${item.title}“?`)) return;
    const version = authVersion;
    let data;
    let error;
    try {
        ({ data, error } = await supabaseClient.from("duty_schedules").delete().eq("id", item.id).select("id"));
        if (!error && Array.isArray(data) && data.length) {
            await supabaseClient.storage.from("schedules").remove([item.file_path]);
        }
    } catch (requestError) {
        error = requestError;
    }
    if (version !== authVersion) return;
    if (error || !Array.isArray(data) || !data.length) {
        alert("Nepavyko ištrinti: " + (error ? errorText(error) : "įrašas nerastas arba neturite teisės."));
        return;
    }
    calendarLoaded = false;
    await showCalendar();
}
