// Acknowledgement report: for every document that requires acknowledgement,
// who has acknowledged the current version and who has not.
// Admin sees all departments. A person with "Mato ataskaitas"
// (profiles.can_view_reports) sees only people sharing a department; the
// server enforces this with RLS (supabase/sql/ack-reports.sql). Read only.

let ackReportDepartment = "";
let ackReportGroup = "";
let ackReportOpen = new Set();
let ackReportData = null;      // { version, docs, people, acks }

function canViewReports() {
    if (isAdmin()) return true;
    return Boolean(currentUser && !authLoading && !logoutPending && !logoutFailed &&
        currentProfile?.can_view_reports && !currentProfile?.must_change_password);
}

async function loadAckReport() {
    const version = authVersion;
    const [docs, people, acks] = await Promise.all([
        supabaseClient.from("documents").select(DOCUMENT_COLUMNS).order("title"),
        supabaseClient.from("profiles").select("id,full_name,username,staff_group,departments").order("full_name"),
        supabaseClient.from("document_acks").select("document_id,user_id,version_key,acknowledged_at").order("acknowledged_at")
    ]);
    if (docs.error) throw docs.error;
    if (people.error) throw people.error;
    if (acks.error) throw acks.error;
    return {
        version,
        docs: (docs.data || []).filter(d => d.requires_ack),
        people: people.data || [],
        acks: acks.data || []
    };
}

async function showAckReport() {
    if (!canViewReports()) {
        currentSection = "home";
        showHome();
        return;
    }
    currentSection = "ackreport";
    document.getElementById("app").innerHTML = `
        <div class="topbar">${userAreaHtml()}</div>
        ${authErrorHtml()}
        <nav class="sections" id="sectionNav"></nav>
        <h2>Susipažinimo ataskaita</h2>
        <div class="report-filters" id="reportFilters"></div>
        <div id="reportBody"><div class="empty" role="status">Kraunama...</div></div>
    `;
    renderSectionNav();
    const nav = document.getElementById("sectionNav");
    const expand = document.createElement("button");
    expand.textContent = "Išskleisti visus";
    expand.addEventListener("click", () => {
        ackReportOpen = new Set((ackReportData?.docs || []).map(d => d.id));
        renderAckReport();
    });
    const print = document.createElement("button");
    print.textContent = "Spausdinti / PDF";
    print.addEventListener("click", () => window.print?.());
    nav.append(expand, print);

    if (!ackReportData || ackReportData.version !== authVersion) {
        try {
            const data = await loadAckReport();
            if (data.version !== authVersion) return;
            ackReportData = data;
        } catch (error) {
            const body = document.getElementById("reportBody");
            if (body) body.innerHTML = `<div class="message" role="alert">${escapeHtml("Nepavyko gauti ataskaitos: " + errorText(error))}</div>`;
            return;
        }
    }
    if (currentSection === "ackreport") renderAckReport();
}

// Departments the viewer may choose: all for admin, own for a reporter.
function ackReportDepartments() {
    if (isAdmin()) return departmentsList.length ? departmentsList : [...new Set(ackReportData.people.flatMap(p => p.departments || []))];
    return Array.isArray(currentProfile?.departments) ? currentProfile.departments : [];
}

function ackReportPeople() {
    const allowed = ackReportDepartments();
    return ackReportData.people.filter(p => {
        const own = Array.isArray(p.departments) ? p.departments : [];
        if (!isAdmin() && !own.some(d => allowed.includes(d))) return false;
        if (ackReportDepartment && !own.includes(ackReportDepartment)) return false;
        if (ackReportGroup && (p.staff_group || "") !== ackReportGroup) return false;
        return true;
    });
}

function renderAckReport() {
    const filters = document.getElementById("reportFilters");
    const body = document.getElementById("reportBody");
    if (!filters || !body || !ackReportData) return;

    const departments = ackReportDepartments();
    if (ackReportDepartment && !departments.includes(ackReportDepartment)) ackReportDepartment = "";
    const groups = [...new Set(ackReportData.people.map(p => p.staff_group).filter(Boolean))].sort((a, b) => a.localeCompare(b, "lt"));
    filters.replaceChildren();
    const makeSelect = (id, label, allText, values, current, onChange) => {
        const select = document.createElement("select");
        select.setAttribute("id", id);
        select.setAttribute("aria-label", label);
        for (const [value, text] of [["", allText], ...values.map(v => [v, v])]) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = text;
            select.append(option);
        }
        select.value = current;
        select.addEventListener("change", () => { onChange(select.value); renderAckReport(); });
        filters.append(select);
    };
    makeSelect("reportDepartment", "Skyrius", isAdmin() ? "Visi skyriai" : "Visi mano skyriai", departments,
        ackReportDepartment, value => { ackReportDepartment = value; });
    makeSelect("reportGroup", "Pareigos", "Visos pareigos", groups, ackReportGroup, value => { ackReportGroup = value; });

    body.replaceChildren();
    if (!isAdmin() && !departments.length) {
        appendText(body, "div", "message", "Jums nepriskirtas nė vienas skyrius, todėl ataskaitos nėra.");
        return;
    }
    if (!ackReportData.docs.length) {
        appendText(body, "div", "empty", "Dokumentų, su kuriais reikia susipažinti, nėra.");
        return;
    }
    const people = ackReportPeople();
    for (const doc of ackReportData.docs) {
        const key = documentVersionKey(doc);
        const done = new Map(ackReportData.acks
            .filter(a => a.document_id === doc.id && a.version_key === key)
            .map(a => [a.user_id, a]));
        const recipients = people.filter(p => documentForProfile(doc, p));
        const count = recipients.filter(p => done.has(p.id)).length;
        const percent = recipients.length ? Math.round(count * 100 / recipients.length) : 0;

        const card = document.createElement("div");
        card.className = "report-doc";
        card.setAttribute("data-document", String(doc.id));
        const head = document.createElement("button");
        head.className = "report-head";
        appendText(head, "strong", "", doc.title || "");
        appendText(head, "span", "report-count" + (recipients.length && count === recipients.length ? " complete" : ""),
            recipients.length ? `${count} iš ${recipients.length} (${percent} %)` : "nėra adresatų");
        head.addEventListener("click", () => {
            if (ackReportOpen.has(doc.id)) ackReportOpen.delete(doc.id);
            else ackReportOpen.add(doc.id);
            renderAckReport();
        });
        card.append(head);
        const bar = document.createElement("div");
        bar.className = "report-bar";
        const fill = document.createElement("span");
        fill.setAttribute("style", `width: ${percent}%`);
        bar.append(fill);
        card.append(bar);

        if (ackReportOpen.has(doc.id)) {
            const list = document.createElement("div");
            list.className = "report-people";
            const sorted = [...recipients].sort((a, b) => Number(done.has(a.id)) - Number(done.has(b.id)));
            for (const person of sorted) {
                const ack = done.get(person.id);
                const row = document.createElement("div");
                row.className = "ack-row " + (ack ? "done" : "pending");
                appendText(row, "span", "", person.full_name || person.username || "—");
                appendText(row, "span", "cal-muted", [person.staff_group, (person.departments || []).join(", ")].filter(Boolean).join(" · "));
                appendText(row, "span", "", ack ? `Susipažino ${formatDateTime(ack.acknowledged_at)}` : "Nesusipažino");
                list.append(row);
            }
            if (!sorted.length) appendText(list, "div", "cal-empty", "Pagal pasirinktus filtrus adresatų nėra.");
            card.append(list);
        }
        body.append(card);
    }
}
