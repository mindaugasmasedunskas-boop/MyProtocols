// Offline regression tests. No SDK is imported and no network requests are made.
// Run: node --test tests/stage1.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sourceRoot = process.env.MYPROTOCOLS_TEST_ROOT || path.resolve(__dirname, '..');
const publicProtocol = { id: 'p1', title: 'Viešas', category: 'Grupė', content: 'Viešas tekstas', access_level: 'public' };
const restrictedProtocol = { id: 'r1', title: 'Ribotas', category: 'Slapta grupė', content: 'Ribotas tekstas', access_level: 'restricted' };
const user = { id: 'u1', email: 'user@example.test' };
const session = { user };
const decode = s => s.replaceAll('&quot;', '"').replaceAll('&#039;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

// A deliberately small DOM double, sufficient for node identity, text insertion,
// listeners and view replacement. This is not a browser rendering/XSS test.
class Element {
    constructor(tag = 'div') {
        this.tagName = tag;
        this.attributes = {};
        this.children = [];
        this.listeners = {};
        this.value = '';
        this.disabled = false;
        this._html = '';
        this._text = '';
    }
    set innerHTML(value) {
        this._html = String(value);
        this._text = '';
        this.children = [];
        for (const match of this._html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
            const child = new Element(match[1]);
            for (const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
                child.setAttribute(attr[1], decode(attr[2] || ''));
            }
            this.children.push(child);
        }
    }
    get innerHTML() { return this._html || this._text; }
    set textContent(value) { this._text = String(value); this._html = ''; this.children = []; }
    get textContent() { return this._text || this._html.replace(/<[^>]*>/g, ''); }
    setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'disabled') this.disabled = true; }
    getAttribute(key) { return this.attributes[key] ?? null; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this._html = ''; this._text = ''; this.children = children; }
    addEventListener(event, handler) { (this.listeners[event] ||= []).push(handler); }
    async dispatch(event, extra = {}) {
        for (const handler of this.listeners[event] || []) await handler({ preventDefault() {}, ...extra });
    }
    all() { return [this, ...this.children.flatMap(child => child.all())]; }
    querySelectorAll(selector) {
        const key = selector.match(/^\[([\w-]+)\]$/)?.[1];
        return this.all().slice(1).filter(el => key ? key in el.attributes : el.tagName === selector);
    }
}

function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function harness(options = {}) {
    const app = new Element();
    app.setAttribute('id', 'app');
    const document = {
        getElementById: id => app.all().find(el => el.getAttribute('id') === id) || null,
        createElement: tag => new Element(tag)
    };
    const calls = { reads: [], copied: [], alerts: [], subscriptions: 0, inserts: [], updates: [], deletes: [], upserts: [], uploads: [], signed: [], removed: [], opened: [], userUpdates: [], rpcs: [], invokes: [] };
    let listener;
    const emit = (event, value) => listener?.(event, value);
    const client = {
        auth: {
            onAuthStateChange(callback) {
                listener = callback;
                calls.subscriptions++;
                if (options.initialEvent) callback('INITIAL_SESSION', options.session || null);
                return { data: { subscription: { unsubscribe() {} } } };
            },
            getSession: () => options.getSession?.() || Promise.resolve({ data: { session: options.session || null }, error: null }),
            signInWithPassword: credentials => options.signIn?.(credentials, emit) || Promise.resolve({ data: { user, session }, error: null }),
            signOut: () => options.signOut?.(emit) || Promise.resolve({ error: null }),
            updateUser: value => { calls.userUpdates.push(value); return options.updateUser?.(value) || Promise.resolve({ data: {}, error: null }); }
        },
        rpc: name => { calls.rpcs.push(name); return options.rpc?.(name) || Promise.resolve({ data: null, error: null }); },
        functions: {
            invoke: (name, opts) => { calls.invokes.push({ name, body: opts?.body }); return options.invoke?.(name, opts) || Promise.resolve({ data: { ok: true }, error: null }); }
        },
        storage: {
            from: bucket => ({
                upload: (p, file, opts) => { calls.uploads.push({ bucket, path: p, type: opts?.contentType }); return options.upload?.(p) || Promise.resolve({ data: { path: p }, error: null }); },
                createSignedUrl: p => { calls.signed.push(p); return Promise.resolve({ data: { signedUrl: 'https://signed.example.test/' + p }, error: null }); },
                remove: paths => { calls.removed.push(...paths); return Promise.resolve({ data: [], error: null }); }
            })
        },
        from(table) {
            const query = { table, columns: null, filters: [] };
            const builder = {
                select(columns) { query.columns = columns; return builder; },
                gte(key, value) { query.filters.push([key + '>=', value]); return builder; },
                lte(key, value) { query.filters.push([key + '<=', value]); return builder; },
                eq(key, value) {
                    query.filters.push([key, value]);
                    if (query.delete) {
                        calls.deletes.push(query);
                        const result = options.delete?.(query) || Promise.resolve({ data: [{ id: value }], error: null });
                        return Object.assign(result, { select: () => result });
                    }
                    if (query.update) {
                        calls.updates.push(query);
                        const result = options.update?.(query) || Promise.resolve({ data: [{ id: value }], error: null });
                        return Object.assign(result, { select: () => result });
                    }
                    return builder;
                },
                order() {
                    calls.reads.push(query);
                    if (table === 'protocols') return options.protocols?.(query) || Promise.resolve({ data: [publicProtocol], error: null });
                    if (table === 'profiles') return options.profiles?.(query) || Promise.resolve({ data: [], error: null });
                    if (table === 'documents') return options.documents?.(query) || Promise.resolve({ data: [], error: null });
                    if (table === 'announcements') return options.announcements?.(query) || Promise.resolve({ data: [], error: null });
                    if (table === 'duty_schedules') return options.schedules?.(query) || Promise.resolve({ data: [], error: null });
                    if (table === 'contacts') return options.contacts?.(query) || Promise.resolve({ data: [], error: null });
                    if (table === 'vacations') return options.vacations?.(query) || Promise.resolve({ data: [], error: null });
                    return options.suggestions?.(query) || Promise.resolve({ data: [], error: null });
                },
                maybeSingle() {
                    calls.reads.push(query);
                    if (table === 'app_settings') return options.settings?.(query) || Promise.resolve({ data: null, error: null });
                    if (table === 'user_preferences') return options.prefs?.(query) || Promise.resolve({ data: null, error: null });
                    return options.profile?.(query) || Promise.resolve({ data: { id: user.id, role: 'user' }, error: null });
                },
                insert(value) {
                    calls.inserts.push({ table, ...value });
                    const result = options.insert?.(value) || Promise.resolve({ data: [{ id: 'new1' }], error: null });
                    return Object.assign(result, { select: () => result });
                },
                delete() { query.delete = true; return builder; },
                upsert(value) {
                    calls.upserts.push({ table, ...value });
                    const result = options.upsert?.(value) || Promise.resolve({ data: [{ key: value.key }], error: null });
                    return Object.assign(result, { select: () => result });
                },
                update(value) { query.update = value; return builder; }
            };
            return builder;
        }
    };
    const context = vm.createContext({
        document, console, setTimeout, clearTimeout,
        navigator: { clipboard: { writeText: async value => { calls.copied.push(value); } } },
        alert: value => calls.alerts.push(value),
        confirm: () => options.confirm ?? true,
        window: { open: url => { const win = { location: { href: url }, close() { win.closed = true; } }; calls.opened.push(win); return win; } },
        supabaseClient: options.client === null ? null : client,
        supabaseInitializationError: 'Nepavyko įkelti prisijungimo bibliotekos.'
    });
    for (const file of ['utils', 'departments', 'auth', 'protocols', 'contacts', 'home', 'calendar', 'calculators', 'documents', 'vacations', 'staff', 'admin', 'admin-protocols', 'suggestions']) {
        vm.runInContext(fs.readFileSync(path.join(sourceRoot, 'js', file + '.js'), 'utf8'), context, { filename: file + '.js' });
    }
    // Most tests exercise the protocol list; home-screen tests set this back.
    if (!options.home) vm.runInContext('currentSection = "protocols"', context);
    const run = code => vm.runInContext(code, context);
    const settle = async () => {
        for (let i = 0; i < 4; i++) {
            await new Promise(resolve => setTimeout(resolve, 1));
            await run('authSyncPromise');
        }
    };
    return { app, document, calls, context, run, emit, settle, client };
}

test('all application scripts parse', () => {
    for (const file of fs.readdirSync(path.join(sourceRoot, 'js')).filter(name => name.endsWith('.js'))) {
        new vm.Script(fs.readFileSync(path.join(sourceRoot, 'js', file), 'utf8'), { filename: file });
    }
});

test('guest requests only public rows and discards restricted/unknown rows in an unexpected response', async () => {
    const h = harness({ protocols: async () => ({ data: [publicProtocol, restrictedProtocol, { ...restrictedProtocol, access_level: null }], error: null }) });
    await h.run('startApp()');
    assert.deepEqual(h.calls.reads.find(q => q.table === 'protocols').filters, [['access_level', 'public']]);
    assert.equal(h.run('protocols.length'), 1);
    assert.equal(h.run('protocols[0].id'), 'p1');
    assert.equal(h.run('isAdmin()'), false);
});

test('login reloads profile and public protocols without requiring page reload', async () => {
    const h = harness();
    await h.run('startApp()');
    const before = h.calls.reads.length;
    h.run('showLogin()');
    h.document.getElementById('email').value = user.email;
    h.document.getElementById('password').value = 'test-only';
    await h.run('login()');
    assert.equal(h.run('currentUser.id'), user.id);
    assert.equal(h.calls.reads.slice(before).filter(q => q.table === 'protocols').length, 1);
    assert.equal(h.calls.reads.slice(before).filter(q => q.table === 'profiles').length, 1);
});

test('login event plus signIn response does not start duplicate protocol refreshes', async () => {
    const h = harness({ signIn: async (_credentials, emit) => { emit('SIGNED_IN', session); return { data: { user, session }, error: null }; } });
    await h.run('startApp()');
    h.run('showLogin()');
    h.document.getElementById('email').value = user.email;
    h.document.getElementById('password').value = 'test-only';
    const before = h.calls.reads.filter(q => q.table === 'protocols').length;
    await h.run('login()');
    assert.equal(h.calls.reads.filter(q => q.table === 'protocols').length - before, 1);
});

test('admin role does not grant restricted protocol read or copy access', async () => {
    const h = harness({ session, profile: async () => ({ data: { id: user.id, role: 'admin' }, error: null }) });
    await h.run('startApp()');
    assert.equal(h.run('isAdmin()'), true);
    h.context.sample = restrictedProtocol;
    h.run('protocols.push(sample); showProtocol("r1")');
    await h.run('copyProtocol("r1")');
    assert.equal(h.app.innerHTML.includes(restrictedProtocol.content), false);
    assert.equal(h.calls.copied.length, 0);
});

test('logout immediately clears memory, profile, categories and open detail before signOut resolves', async () => {
    const pending = deferred();
    const h = harness({ session, signOut: () => pending.promise });
    await h.run('startApp()');
    h.run('showProtocol("p1")');
    h.context.sample = restrictedProtocol;
    h.run('protocols.push(sample); currentCategory="Slapta grupė"');
    const logout = h.run('logout()');
    assert.equal(h.run('protocols.length'), 0);
    assert.equal(h.run('currentUser'), null);
    assert.equal(h.run('currentProfile'), null);
    assert.equal(h.run('currentCategory'), 'Visi');
    assert.equal(h.app.innerHTML.includes(publicProtocol.content), false);
    pending.resolve({ error: null });
    await logout;
    assert.equal(h.run('protocols.length'), 1);
    assert.equal(h.run('protocols.every(canReadProtocol)'), true);
});

test('a protocol read started before logout cannot repopulate memory', async () => {
    const oldRead = deferred();
    let first = true;
    const h = harness({ protocols: () => first ? (first = false, oldRead.promise) : Promise.resolve({ data: [publicProtocol], error: null }) });
    const pending = h.run('loadProtocols()');
    await h.run('logout()');
    oldRead.resolve({ data: [restrictedProtocol, { ...publicProtocol, title: 'Pasenęs' }], error: null });
    await pending;
    assert.equal(h.run('protocols.length'), 1);
    assert.equal(h.run('protocols[0].title'), publicProtocol.title);
});

test('old admin profile response cannot restore privileges after logout', async () => {
    const profile = deferred();
    const h = harness({ profile: () => profile.promise });
    const pending = h.run('queueAuthSync({user:{id:"u1"}})');
    await new Promise(resolve => setTimeout(resolve, 5));
    await h.run('logout()');
    profile.resolve({ data: { id: user.id, role: 'admin' }, error: null });
    await pending;
    assert.equal(h.run('currentProfile'), null);
    assert.equal(h.run('isAdmin()'), false);
});

test('failed logout is explicit, preserves no privileges, and can be retried', async () => {
    let attempts = 0;
    const h = harness({ session, signOut: async () => ++attempts === 1 ? { error: { message: 'Ryšio klaida' } } : { error: null } });
    await h.run('startApp()');
    await h.run('logout()');
    assert.equal(h.run('currentUser'), null);
    assert.equal(h.run('logoutFailed'), true);
    assert.match(h.run('authError'), /Sesija gali būti likusi aktyvi/);
    assert.match(h.app.innerHTML, /Bandyti atsijungti dar kartą/);
    h.emit('TOKEN_REFRESHED', session);
    assert.equal(h.run('currentUser'), null);
    await h.run('logout()');
    assert.equal(h.run('logoutFailed'), false);
    assert.equal(h.run('authError'), '');
});

test('thrown logout exception also fails closed', async () => {
    const h = harness({ session, signOut: async () => { throw new Error('offline'); } });
    await h.run('startApp()');
    await h.run('logout()');
    assert.equal(h.run('currentUser'), null);
    assert.equal(h.run('isAdmin()'), false);
    assert.match(h.run('authError'), /offline/);
});

test('logout error and retry are visible before a slow public reload finishes', async () => {
    const pending = deferred();
    const h = harness({ signOut: async () => ({ error: { message: 'offline' } }), protocols: () => pending.promise });
    const logout = h.run('logout()');
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.match(h.app.innerHTML, /Sesija gali būti likusi aktyvi/);
    assert.match(h.app.innerHTML, /Bandyti atsijungti dar kartą/);
    assert.equal(h.run('logoutPending'), false);
    pending.resolve({ data: [publicProtocol], error: null });
    await logout;
});

test('external sign-in, user update, token refresh and sign-out synchronize the application', async () => {
    const h = harness();
    await h.run('startApp()');
    for (const event of ['SIGNED_IN', 'USER_UPDATED', 'TOKEN_REFRESHED']) {
        const before = h.calls.reads.filter(q => q.table === 'protocols').length;
        const callbackReturn = h.emit(event, session);
        assert.equal(callbackReturn, undefined, 'SDK callback remains synchronous');
        await h.settle();
        assert.equal(h.run('currentUser.id'), user.id);
        assert.equal(h.calls.reads.filter(q => q.table === 'protocols').length, before + 1);
    }
    h.emit('SIGNED_OUT', null);
    assert.equal(h.run('currentUser'), null);
    assert.equal(h.run('protocols.length'), 0);
    await h.settle();
    assert.equal(h.run('currentProfile'), null);
});

test('late initial getSession response cannot overwrite a newer auth event', async () => {
    const initial = deferred();
    const h = harness({ getSession: () => initial.promise });
    const starting = h.run('startApp()');
    h.emit('SIGNED_IN', session);
    initial.resolve({ data: { session: null }, error: null });
    await starting;
    await h.settle();
    assert.equal(h.run('currentUser.id'), user.id);
});

test('retrying startup does not install a second auth subscription', async () => {
    const h = harness({ initialEvent: true });
    await h.run('startApp()');
    await h.run('startApp()');
    assert.equal(h.calls.subscriptions, 1);
});

test('session read error is visible and old data is cleared', async () => {
    const h = harness({ getSession: async () => ({ data: { session: null }, error: { message: '<sesijos klaida>' } }) });
    await h.run('startApp()');
    assert.equal(h.run('protocols.length'), 0);
    assert.match(h.app.innerHTML, /&lt;sesijos klaida&gt;/);
    assert.equal(h.run('authLoading'), false);
});

test('profile failure leaves public protocols available and denies admin access', async () => {
    const h = harness({ session, profile: async () => ({ data: null, error: { message: 'profilis nepasiekiamas' } }) });
    await h.run('startApp()');
    assert.equal(h.run('isAdmin()'), false);
    assert.equal(h.run('protocols.length'), 1);
    assert.match(h.app.innerHTML, /profilis nepasiekiamas/);
});

test('missing profile is explicit and does not grant admin privileges', async () => {
    const h = harness({ session, profile: async () => ({ data: null, error: null }) });
    await h.run('startApp()');
    assert.equal(h.run('isAdmin()'), false);
    assert.match(h.app.innerHTML, /profilis nerastas/);
});

test('protocol query failures are distinguished from an empty list and allow retry', async () => {
    let fail = true;
    const h = harness({ protocols: async () => fail ? { data: null, error: { message: '<užklausos klaida>' } } : { data: [publicProtocol], error: null } });
    await h.run('startApp()');
    assert.match(h.document.getElementById('protocolList').innerHTML, /&lt;užklausos klaida&gt;/);
    assert.doesNotMatch(h.document.getElementById('protocolList').innerHTML, /Protokolų nerasta/);
    fail = false;
    await h.run('reloadProtocols()');
    assert.equal(h.run('protocols.length'), 1);
    assert.equal(h.run('protocolsError'), '');
});

test('thrown protocol exception is caught and shown', async () => {
    const h = harness({ protocols: async () => { throw new Error('offline'); } });
    await h.run('startApp()');
    assert.match(h.run('protocolsError'), /offline/);
    assert.equal(h.run('protocols.length'), 0);
});

test('category payloads remain text and exact data passed to click listeners', async () => {
    const payload = 'X" onclick="globalThis.compromised=1" &#39;);globalThis.compromised=1;// <img src=x onerror=alert(1)>';
    const h = harness({ protocols: async () => ({ data: [{ ...publicProtocol, category: payload }], error: null }) });
    await h.run('startApp()');
    const button = h.document.getElementById('categoryButtons').children.find(el => el.textContent === payload);
    assert.ok(button);
    assert.equal(button.getAttribute('onclick'), null);
    assert.equal(button.children.length, 0);
    await button.dispatch('click');
    assert.equal(h.run('currentCategory'), payload);
    assert.equal(h.context.compromised, undefined);
});

test('protocol IDs and text are not inserted into executable attributes', async () => {
    const malicious = { ...publicProtocol, id: '\");globalThis.compromised=1;//', title: '<img onerror=alert(1)>', content: '<script>alert(1)</script>' };
    const h = harness({ protocols: async () => ({ data: [malicious], error: null }) });
    await h.run('startApp()');
    const card = h.document.getElementById('protocolList').children[0];
    assert.equal(card.getAttribute('onclick'), null);
    assert.equal(card.children[1].textContent, malicious.title);
    await card.dispatch('click');
    assert.match(h.app.innerHTML, /&lt;script&gt;/);
    assert.equal(h.document.getElementById('copyProtocolButton').getAttribute('onclick'), null);
    await h.document.getElementById('copyProtocolButton').dispatch('click');
    assert.deepEqual(h.calls.copied, [malicious.content]);
});

test('admin suggestions response cannot reappear after logout', async () => {
    const pending = deferred();
    const h = harness({ session, profile: async () => ({ data: { id: user.id, role: 'admin' }, error: null }), suggestions: () => pending.promise });
    await h.run('startApp()');
    const read = h.run('showAdminSuggestions()');
    await h.run('logout()');
    pending.resolve({ data: [{ id: 's1', content: 'private suggestion' }], error: null });
    await read;
    assert.equal(h.document.getElementById('adminSuggestions'), null);
    assert.doesNotMatch(h.app.innerHTML, /private suggestion/);
});

test('admin suggestions response is discarded after navigating away', async () => {
    const pending = deferred();
    const h = harness({ session, profile: async () => ({ data: { id: user.id, role: 'admin' }, error: null }), suggestions: () => pending.promise });
    await h.run('startApp()');
    const read = h.run('showAdminSuggestions()');
    h.run('showProtocolList()');
    pending.resolve({ data: [], error: null });
    await read;
    assert.equal(h.document.getElementById('adminSuggestions'), null);
});

test('admin save uses a listener and cannot update a replaced view after logout', async () => {
    const pending = deferred();
    const id = 's" onclick="globalThis.compromised=1';
    const h = harness({
        session,
        profile: async () => ({ data: { id: user.id, role: 'admin' }, error: null }),
        suggestions: async () => ({ data: [{ id, title: 'Test', content: 'Text', status: 'new' }], error: null }),
        update: () => pending.promise
    });
    await h.run('startApp()');
    await h.run('showAdminSuggestions()');
    const container = h.document.getElementById('adminSuggestions');
    const button = container.querySelectorAll('[data-save-suggestion]')[0];
    assert.equal(button.getAttribute('onclick'), null);
    h.document.getElementById('status-' + id).value = 'accepted';
    h.document.getElementById('comment-' + id).value = 'Komentaras';
    const save = button.dispatch('click');
    assert.equal(h.calls.updates[0].update.status, 'accepted');
    await h.run('logout()');
    pending.resolve({ error: null });
    await save;
    assert.equal(h.document.getElementById('adminSuggestions'), null);
    assert.equal(h.context.compromised, undefined);
});

test('late suggestion submit response does not touch a replaced form after logout', async () => {
    const pending = deferred();
    const h = harness({ session, insert: () => pending.promise });
    await h.run('startApp()');
    h.run('showSuggestionForm()');
    h.document.getElementById('suggestionTitle').value = 'Pasiūlymas';
    h.document.getElementById('suggestionText').value = 'Tekstas';
    const send = h.run('sendSuggestion()');
    await h.run('logout()');
    pending.resolve({ error: null });
    await send;
    assert.equal(h.document.getElementById('suggestionMessage'), null);
    assert.equal(h.calls.inserts.length, 1);
});

test('guest cannot submit suggestions while registered user can', async () => {
    const h = harness();
    await h.run('startApp()');
    await h.run('sendSuggestion()');
    assert.equal(h.calls.inserts.length, 0);
    await h.run('queueAuthSync({user:{id:"u1",email:"user@example.test"}})');
    h.run('showSuggestionForm()');
    h.document.getElementById('suggestionTitle').value = 'Pasiūlymas';
    h.document.getElementById('suggestionText').value = 'Tekstas';
    await h.run('sendSuggestion()');
    assert.equal(h.calls.inserts.length, 1);
    assert.equal(h.calls.inserts[0].user_id, user.id);
});

test('failed login shows a text error and allows another attempt', async () => {
    const h = harness({ signIn: async () => ({ data: null, error: { message: '<blogi duomenys>' } }) });
    await h.run('startApp()');
    h.run('showLogin()');
    h.document.getElementById('email').value = user.email;
    h.document.getElementById('password').value = 'test-only';
    await h.run('login()');
    assert.match(h.document.getElementById('loginMessage').textContent, /<blogi duomenys>/);
    assert.equal(h.document.getElementById('loginButton').disabled, false);
    assert.equal(h.run('currentUser'), null);
});

test('missing CDN library results in a visible initialization error', async () => {
    const h = harness({ client: null });
    await h.run('startApp()');
    assert.match(h.app.innerHTML, /Nepavyko įkelti prisijungimo bibliotekos/);
    assert.equal(h.run('authLoading'), false);
    const configContext = vm.createContext({ window: {} });
    vm.runInContext(fs.readFileSync(path.join(sourceRoot, 'js/config.js'), 'utf8'), configContext);
    assert.equal(vm.runInContext('supabaseClient', configContext), null);
    assert.match(vm.runInContext('supabaseInitializationError', configContext), /Nepavyko įkelti/);
});

test('login form submit (Enter key) signs in without reloading the page', async () => {
    let signIns = 0;
    const h = harness({ signIn: async () => { signIns++; return { data: { user, session }, error: null }; } });
    await h.run('startApp()');
    h.run('showLogin()');
    h.document.getElementById('email').value = user.email;
    h.document.getElementById('password').value = 'test-only';
    let prevented = false;
    await h.document.getElementById('loginForm').dispatch('submit', { preventDefault() { prevented = true; } });
    await h.settle();
    assert.equal(prevented, true);
    assert.equal(signIns, 1);
    assert.equal(h.run('currentUser?.id'), user.id);
});

test('search ignores Lithuanian diacritics and letter case', async () => {
    const h = harness({ protocols: async () => ({ data: [
        { ...publicProtocol, id: 'a', title: 'Šoko gydymas', content: 'Skysčių įvedimas' },
        { ...publicProtocol, id: 'b', title: 'Kitas', content: 'Nieko bendro' }
    ], error: null }) });
    await h.run('startApp()');
    await h.settle();
    const titles = query => {
        h.document.getElementById('searchInput').value = query;
        h.run('renderProtocols()');
        return h.document.getElementById('protocolList').children
            .filter(card => card.className === 'protocol')
            .map(card => card.children[1].textContent);
    };
    assert.deepEqual(titles('soko'), ['Šoko gydymas']);
    assert.deepEqual(titles('SKYSCIU IVEDIMAS'), ['Šoko gydymas']);
    assert.deepEqual(titles('šoko'), ['Šoko gydymas']);
    assert.deepEqual(titles('zzz'), []);
});

test('index.html pins the Supabase SDK to an exact version with SRI', () => {
    const html = fs.readFileSync(path.join(sourceRoot, 'index.html'), 'utf8');
    const tag = html.match(/<script[^>]+supabase-js[^>]*>/s)?.[0] || '';
    assert.match(tag, /supabase-js@\d+\.\d+\.\d+\//);
    assert.match(tag, /integrity="sha384-[A-Za-z0-9+/=]{64}"/);
    assert.match(tag, /crossorigin="anonymous"/);
});

test('app is installable: manifest is linked and its icons exist', () => {
    const html = fs.readFileSync(path.join(sourceRoot, 'index.html'), 'utf8');
    assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
    const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'manifest.webmanifest'), 'utf8'));
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, './');
    const sizes = manifest.icons.map(icon => icon.sizes);
    assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
    assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
    for (const icon of manifest.icons) {
        const file = path.join(sourceRoot, icon.src);
        assert.ok(fs.existsSync(file), icon.src + ' missing');
        const png = fs.readFileSync(file);
        const [w, h] = icon.sizes.split('x').map(Number);
        assert.equal(png.readUInt32BE(16), w, icon.src + ' width');
        assert.equal(png.readUInt32BE(20), h, icon.src + ' height');
    }
});

const sampleContacts = [
    { id: 2, department: 'Registratūra', name: 'Ona', job_title: 'Registratorė', phone: '+370 600 00002', email: 'ona@example.test', note: '', sort_order: 1 },
    { id: 1, department: 'Administracija', name: '<img src=x onerror=alert(1)>', job_title: '', phone: 'javascript:alert(1)', email: 'x@y" onclick="z', note: 'Pastaba', sort_order: 0 }
];

test('contacts load for a logged-in user, are grouped by department and searchable', async () => {
    const h = harness({ session, contacts: async () => ({ data: sampleContacts, error: null }) });
    await h.run('startApp()');
    await h.run('showContacts()');
    assert.ok(h.calls.reads.some(q => q.table === 'contacts'));
    const list = h.document.getElementById('contactList');
    const groups = list.children.filter(el => el.className === 'contact-group').map(el => el.textContent);
    assert.deepEqual(groups, ['Administracija', 'Registratūra']);
    h.document.getElementById('contactSearch').value = 'REGISTRATURA';
    h.run('renderContacts()');
    assert.deepEqual(list.children.filter(el => el.className === 'contact').map(el => el.children[0].textContent), ['Ona']);
});

test('contact links accept only safe tel/mailto values and text is not parsed as HTML', async () => {
    const h = harness({ session, contacts: async () => ({ data: sampleContacts, error: null }) });
    await h.run('startApp()');
    await h.run('showContacts()');
    const links = h.document.getElementById('contactList').all().filter(el => el.className === 'contact-link');
    const hrefs = links.map(el => el.getAttribute('href')).filter(Boolean);
    assert.deepEqual(hrefs.sort(), ['mailto:ona@example.test', 'tel:+37060000002']);
    assert.equal(h.document.getElementById('contactList').all().some(el => el.tagName === 'img'), false);
});

test('auth refresh keeps the user in the contacts section', async () => {
    const h = harness({ session, contacts: async () => ({ data: sampleContacts, error: null }) });
    await h.run('startApp()');
    await h.settle();
    await h.run('showContacts()');
    h.emit('TOKEN_REFRESHED', session);
    await h.settle();
    assert.ok(h.document.getElementById('contactList'));
    assert.equal(h.document.getElementById('protocolList'), null);
});

test('contacts section shows a failed logout error instead of hiding it', async () => {
    const h = harness({ session, signOut: async () => ({ error: { message: 'tinklo klaida' } }) });
    await h.run('startApp()');
    await h.run('showContacts()');
    await h.run('logout()');
    // Logged out: contacts are closed, the error stays visible on the home screen.
    assert.equal(h.document.getElementById('contactList'), null);
    assert.match(h.app.innerHTML, /Atsijungti nepavyko/);
});

test('guest cannot open contacts and cached contacts are dropped on logout', async () => {
    const h = harness({ home: true, session, contacts: async () => ({ data: sampleContacts, error: null }) });
    await h.run('startApp()');
    await h.settle();
    await h.run('showContacts()');
    assert.equal(h.run('contacts.length'), 2);
    await h.run('logout()');
    await h.settle();
    await h.run('showContacts()');
    assert.equal(h.document.getElementById('contactList'), null);
    assert.ok(h.document.getElementById('homeGrid'));
    assert.equal(h.run('contacts.length'), 0);
});

test('admin save with zero changed rows does not report success', async () => {
    const id = 's1';
    const h = harness({
        session,
        profile: async () => ({ data: { id: user.id, role: 'admin' }, error: null }),
        suggestions: async () => ({ data: [{ id, title: 'Test', content: 'Text', status: 'new' }], error: null }),
        update: async () => ({ data: [], error: null })
    });
    await h.run('startApp()');
    await h.run('showAdminSuggestions()');
    const button = h.document.getElementById('adminSuggestions').querySelectorAll('[data-save-suggestion]')[0];
    await button.dispatch('click');
    const message = h.document.getElementById('message-' + id).textContent;
    assert.doesNotMatch(message, /^Išsaugota/);
    assert.match(message, /Nepavyko išsaugoti/);
});

test('double click on suggestion submit sends only one insert', async () => {
    const pending = deferred();
    const h = harness({ session, insert: () => pending.promise });
    await h.run('startApp()');
    h.run('showSuggestionForm()');
    h.document.getElementById('suggestionTitle').value = 'Pasiūlymas';
    h.document.getElementById('suggestionText').value = 'Tekstas';
    const first = h.run('sendSuggestion()');
    const second = h.run('sendSuggestion()');
    pending.resolve({ error: null });
    await Promise.all([first, second]);
    assert.equal(h.calls.inserts.length, 1);
});

test('home screen shows section tiles and locks login-only sections for guests', async () => {
    const h = harness({ home: true });
    await h.run('startApp()');
    await h.settle();
    const first = h.document.getElementById('homeGrid').children.map(t => t.getAttribute('data-section'));
    const second = h.document.getElementById('homeGridLogin').children;
    assert.deepEqual(first, ['protocols', 'codes', 'calculators', 'statistics']);
    assert.deepEqual(second.map(t => t.getAttribute('data-section')), ['calendar', 'contacts', 'suggestions', 'documents', 'vacations']);
    assert.ok(second.every(t => t.className.includes('locked')));
    await second[0].dispatch('click');
    assert.ok(h.document.getElementById('loginForm'));
});

test('home tiles open sections and the back button returns home', async () => {
    const h = harness({ home: true, session, contacts: async () => ({ data: [], error: null }) });
    await h.run('startApp()');
    await h.settle();
    const tile = key => [...h.document.getElementById('homeGrid').children, ...h.document.getElementById('homeGridLogin').children]
        .find(el => el.getAttribute('data-section') === key);
    await tile('codes').dispatch('click');
    assert.equal(h.document.getElementById('comingSoonTitle').textContent, 'Skubios pagalbos kodai');
    await h.document.getElementById('sectionNav').children[0].dispatch('click');
    assert.ok(h.document.getElementById('homeGrid'));
    await tile('protocols').dispatch('click');
    assert.ok(h.document.getElementById('protocolList'));
    await h.document.getElementById('sectionNav').children[0].dispatch('click');
    await tile('contacts').dispatch('click');
    assert.ok(h.document.getElementById('contactList'));
});

test('auth refresh keeps the user on the home screen', async () => {
    const h = harness({ home: true });
    await h.run('startApp()');
    await h.settle();
    h.emit('TOKEN_REFRESHED', session);
    await h.settle();
    assert.ok(h.document.getElementById('homeGrid'));
    assert.equal(h.document.getElementById('protocolList'), null);
});

const adminProfile = async () => ({ data: { id: user.id, role: 'admin' }, error: null });

test('only admin sees add, edit and delete controls for algorithms', async () => {
    const plain = harness({ session });
    await plain.run('startApp()');
    await plain.settle();
    assert.doesNotMatch(plain.app.innerHTML + plain.document.getElementById('sectionNav').children.map(b => b.textContent).join(), /Pridėti algoritmą/);
    plain.run('showProtocol("p1")');
    assert.equal(plain.document.getElementById('editProtocolButton'), null);

    const admin = harness({ session, profile: adminProfile });
    await admin.run('startApp()');
    await admin.settle();
    assert.ok(admin.document.getElementById('sectionNav').children.some(b => b.textContent === '+ Pridėti algoritmą'));
    admin.run('showProtocol("p1")');
    assert.ok(admin.document.getElementById('editProtocolButton'));
    assert.ok(admin.document.getElementById('deleteProtocolButton'));
});

test('admin adds an algorithm as public and the form validates required fields', async () => {
    const h = harness({ session, profile: adminProfile });
    await h.run('startApp()');
    await h.settle();
    h.run('showProtocolForm()');
    await h.document.getElementById('protocolForm').dispatch('submit');
    assert.equal(h.calls.inserts.length, 0);
    assert.match(h.document.getElementById('protocolFormMessage').textContent, /pavadinimą/);
    h.document.getElementById('protocolTitle').value = 'Naujas';
    h.document.getElementById('protocolCategory').value = 'Grupė';
    h.document.getElementById('protocolContent').value = 'Tekstas';
    await h.document.getElementById('protocolForm').dispatch('submit');
    assert.equal(JSON.stringify(h.calls.inserts[0]), JSON.stringify({ table: 'protocols', title: 'Naujas', category: 'Grupė', content: 'Tekstas', departments: [], access_level: 'public' }));
});

test('admin edit that changes no rows shows an error, not success', async () => {
    const h = harness({ session, profile: adminProfile, update: async () => ({ data: [], error: null }) });
    await h.run('startApp()');
    await h.settle();
    h.run('showProtocolForm("p1")');
    assert.equal(h.document.getElementById('protocolTitle').value, publicProtocol.title);
    await h.document.getElementById('protocolForm').dispatch('submit');
    assert.equal(h.calls.updates[0].update.title, publicProtocol.title);
    assert.match(h.document.getElementById('protocolFormMessage').textContent, /Nepavyko išsaugoti/);
});

test('admin delete asks for confirmation before deleting', async () => {
    const cancelled = harness({ session, profile: adminProfile, confirm: false });
    await cancelled.run('startApp()');
    await cancelled.settle();
    await cancelled.run('deleteProtocol("p1")');
    assert.equal(cancelled.calls.deletes.length, 0);

    const h = harness({ session, profile: adminProfile });
    await h.run('startApp()');
    await h.settle();
    await h.run('deleteProtocol("p1")');
    assert.equal(h.calls.deletes.length, 1);
    assert.deepEqual(h.calls.deletes[0].filters, [['id', 'p1']]);
    assert.equal(h.calls.alerts.length, 0);
});

test('algorithm categories follow the agreed order with "Kitos" last', async () => {
    const rows = ['Kitos', 'Neurologija', 'Zeta grupė', 'Širdis ir kraujotaka', '', 'Kvėpavimas ir infekcinės ligos', 'Medžiagų apykaita ir inkstai']
        .map((category, i) => ({ id: 'c' + i, title: 'A' + i, category, content: 'x', access_level: 'public' }));
    const h = harness({ protocols: async () => ({ data: rows, error: null }) });
    await h.run('startApp()');
    await h.settle();
    const buttons = h.document.getElementById('categoryButtons').children.map(b => b.textContent);
    assert.deepEqual(buttons, ['Visi', 'Širdis ir kraujotaka', 'Medžiagų apykaita ir inkstai', 'Kvėpavimas ir infekcinės ligos', 'Neurologija', 'Zeta grupė', 'Kitos']);
    const listed = h.document.getElementById('protocolList').children.map(card => card.children[0].textContent);
    assert.deepEqual(listed, ['Širdis ir kraujotaka', 'Medžiagų apykaita ir inkstai', 'Kvėpavimas ir infekcinės ligos', 'Neurologija', 'Zeta grupė', 'Kitos', '']);
});

test('home tiles use the saved order and admin can drag and save a new order', async () => {
    const saved = ['contacts', 'protocols'];
    const h = harness({ home: true, session, profile: adminProfile, settings: async () => ({ data: { value: saved }, error: null }) });
    await h.run('startApp()');
    await h.settle();
    const keys = id => h.document.getElementById(id).children.map(t => t.getAttribute('data-section'));
    assert.deepEqual(keys('homeGrid').slice(0, 2), ['protocols', 'codes']);
    assert.deepEqual(keys('homeGridLogin'), ['contacts', 'calendar', 'suggestions', 'documents', 'vacations']);
    await h.document.getElementById('homeTools').children[0].dispatch('click');
    const tile = key => [...h.document.getElementById('homeGrid').children, ...h.document.getElementById('homeGridLogin').children]
        .find(t => t.getAttribute('data-section') === key);
    await tile('documents').dispatch('dragstart');
    await tile('contacts').dispatch('drop');
    assert.equal(keys('homeGridLogin')[0], 'documents');
    const bar = h.document.getElementById('homeTools').children[0];
    await bar.children[1].dispatch('click');
    assert.equal(h.calls.upserts[0].key, 'home_tile_order');
    assert.equal(h.calls.upserts[0].value[0], 'documents');
    assert.ok(h.document.getElementById('homeTools').children[0].textContent.includes('Keisti'));
});

test('non-admin cannot see reorder controls on home or algorithms', async () => {
    const h = harness({ home: true, session });
    await h.run('startApp()');
    await h.settle();
    assert.equal(h.document.getElementById('homeTools').children.length, 0);
    h.run('currentSection = "protocols"; showProtocolList()');
    assert.equal(h.document.getElementById('sectionNav').children.some(b => b.textContent === 'Keisti tvarką'), false);
});

test('admin reorders algorithms within a category and saves sort_order', async () => {
    const rows = [
        { id: 'a', title: 'Alfa', category: 'Neurologija', content: 'x', access_level: 'public', sort_order: 0 },
        { id: 'b', title: 'Beta', category: 'Neurologija', content: 'x', access_level: 'public', sort_order: 0 },
        { id: 'c', title: 'Gama', category: 'Neurologija', content: 'x', access_level: 'public', sort_order: 0 }
    ];
    const h = harness({ session, profile: adminProfile, protocols: async () => ({ data: rows, error: null }) });
    await h.run('startApp()');
    await h.settle();
    await h.run('startProtocolReorder()');
    assert.equal(h.calls.alerts.length, 1);
    h.run('selectCategory("Neurologija")');
    await h.run('startProtocolReorder()');
    const cards = () => h.document.getElementById('protocolList').children;
    await cards()[2].dispatch('dragstart');
    await cards()[0].dispatch('drop');
    assert.deepEqual(cards().map(c => c.children[1].textContent), ['Gama', 'Alfa', 'Beta']);
    const bar = h.document.getElementById('sectionNav').children.find(el => el.className === 'reorder-bar');
    await bar.children[1].dispatch('click');
    assert.deepEqual(h.calls.updates.map(u => [u.filters[0][1], u.update.sort_order]), [['c', 1], ['a', 2], ['b', 3]]);
});

test('algorithms are listed by sort_order within a category', async () => {
    const rows = [
        { id: 'a', title: 'Alfa', category: 'Neurologija', content: 'x', access_level: 'public', sort_order: 2 },
        { id: 'b', title: 'Beta', category: 'Neurologija', content: 'x', access_level: 'public', sort_order: 1 }
    ];
    const h = harness({ protocols: async () => ({ data: rows, error: null }) });
    await h.run('startApp()');
    await h.settle();
    assert.deepEqual(h.document.getElementById('protocolList').children.map(c => c.children[1].textContent), ['Beta', 'Alfa']);
});

const ymdLocal = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const todayKey = ymdLocal(new Date());
const futureKey = (() => { const d = new Date(); d.setDate(d.getDate() + 3); return ymdLocal(d); })();
const sampleAnnouncements = [
    { id: 1, body: 'KT neveikia <b>iki 14</b>', start_date: todayKey, end_date: todayKey, important: true },
    { id: 2, body: 'Mokymai', start_date: futureKey, end_date: futureKey, important: false }
];

test('guest cannot open the calendar', async () => {
    const h = harness({ home: true });
    await h.run('startApp()');
    await h.settle();
    await h.run('showCalendar()');
    assert.ok(h.document.getElementById('homeGrid'));
    assert.equal(h.calls.reads.some(q => q.table === 'announcements'), false);
});

test('calendar shows today announcements as text, upcoming events and marked days', async () => {
    const h = harness({ session, announcements: async () => ({ data: sampleAnnouncements, error: null }) });
    await h.run('startApp()');
    await h.settle();
    await h.run('showCalendar()');
    const day = h.document.getElementById('dayList').children;
    assert.equal(day.length, 1);
    assert.equal(day[0].children[0].textContent, 'KT neveikia <b>iki 14</b>');
    assert.ok(day[0].className.includes('important'));
    assert.match(h.document.getElementById('dayHeading').textContent, /^Šiandien/);
    assert.equal(h.document.getElementById('upcomingList').children[0].children[1].textContent, 'Mokymai');
    const today = h.document.getElementById('monthGrid').children.find(c => c.getAttribute('data-date') === todayKey);
    assert.ok(today.className.includes('has') && today.className.includes('today'));
    assert.equal(h.document.getElementById('sectionNav').children.some(b => b.textContent === '+ Skelbimas'), false);
});

test('admin adds an announcement with validated dates', async () => {
    const h = harness({ session, profile: adminProfile });
    await h.run('startApp()');
    await h.settle();
    await h.run('showCalendar()');
    h.run('showAnnouncementForm()');
    h.document.getElementById('announcementBody').value = 'Remontas';
    h.document.getElementById('announcementStart').value = '2026-12-05';
    h.document.getElementById('announcementEnd').value = '2026-12-01';
    await h.document.getElementById('announcementForm').dispatch('submit');
    assert.equal(h.calls.inserts.length, 0);
    assert.match(h.document.getElementById('announcementMessage').textContent, /Pabaigos data/);
    h.document.getElementById('announcementEnd').value = '2026-12-07';
    h.document.getElementById('announcementImportant').checked = true;
    await h.document.getElementById('announcementForm').dispatch('submit');
    assert.deepEqual(h.calls.inserts[0], { table: 'announcements', body: 'Remontas', start_date: '2026-12-05', end_date: '2026-12-07', important: true });
});

test('opening a schedule uses a short-lived signed link', async () => {
    const h = harness({ session, schedules: async () => ({ data: [{ id: 9, month: '2026-11-01', title: 'Lapkritis 2026', file_path: '2026-11/1.pdf' }], error: null }) });
    await h.run('startApp()');
    await h.settle();
    await h.run('showCalendar()');
    await h.run('openSchedule(schedules[0])');
    assert.deepEqual(h.calls.signed, ['2026-11/1.pdf']);
    assert.equal(h.calls.opened[0].location.href, 'https://signed.example.test/2026-11/1.pdf');
    assert.equal(h.calls.opened[0].opener, null);
});

test('admin uploads a schedule file and wrong file types are rejected', async () => {
    const h = harness({ session, profile: adminProfile });
    await h.run('startApp()');
    await h.settle();
    await h.run('showCalendar()');
    h.run('showScheduleForm()');
    h.document.getElementById('scheduleMonth').value = '2026-12';
    h.document.getElementById('scheduleFile').files = [{ type: 'application/x-msdownload', size: 100 }];
    await h.document.getElementById('scheduleForm').dispatch('submit');
    assert.equal(h.calls.uploads.length, 0);
    h.document.getElementById('scheduleFile').files = [{ type: 'application/pdf', size: 1000 }];
    await h.document.getElementById('scheduleForm').dispatch('submit');
    assert.equal(h.calls.uploads[0].bucket, 'schedules');
    assert.match(h.calls.uploads[0].path, /^2026-12\/\d+\.pdf$/);
    assert.equal(h.calls.inserts[0].table, 'duty_schedules');
    assert.equal(h.calls.inserts[0].title, 'Gruodis 2026');
    assert.equal(h.calls.inserts[0].month, '2026-12-01');
});

test('calculator formulas give reference values', async () => {
    const h = harness();
    const calc = (id, v) => h.run(`CALCULATORS.find(c => c.id === ${JSON.stringify(id)}).compute(${JSON.stringify(v)})`);
    assert.equal(calc('cockcroft', { age: 70, weight: 70, sex: 'm', creat: 100 }).value, '60 ml/min');
    assert.equal(calc('cockcroft', { age: 70, weight: 70, sex: 'f', creat: 100 }).value, '51 ml/min');
    assert.equal(calc('ckdepi', { age: 60, sex: 'm', creat: 100 }).value, '74 ml/min/1,73 m²');
    assert.equal(calc('ckdepi', { age: 50, sex: 'f', creat: 70 }).value, '91 ml/min/1,73 m²');
    assert.equal(calc('calcium', { ca: 2.0, alb: 30 }).value, '2,2 mmol/l');
    assert.equal(calc('sodium', { na: 120, weight: 70, tbw: '0.6', fluid: '513' }).value, '+9,1 mmol/l nuo 1 l');
    assert.equal(calc('osmol', { na: 140, glu: 5, urea: 5 }).value, '290 mOsm/l');
    assert.equal(calc('aniongap', { na: 140, cl: 100, hco3: 24, alb: 20 }).value, '16 mmol/l, koreguotas 21');
    assert.equal(calc('chadsvasc', { female: true, age: '2', htn: true }).value, '4 balai');
    assert.equal(calc('chadsvasc', { female: true }).level, 'low');
    assert.equal(calc('qtc', { qt: 400, hr: 60, sex: 'm' }).value, 'Fridericia 400 ms, Bazett 400 ms');
    assert.equal(calc('news2', { rr: 16, spo2: 98, temp: 37, sbp: 120, hr: 70 }).value, '0 balai');
    assert.equal(calc('news2', { rr: 25, spo2: 98, temp: 37, sbp: 120, hr: 70 }).level, 'mid');
    assert.equal(calc('news2', { rr: 25, spo2: 90, o2: true, temp: 39.5, sbp: 85, hr: 135 }).level, 'high');
    assert.equal(calc('gbs', { urea: 9, hb: 110, sex: 'm', sbp: 95, hr: true }).value, '9 balai');
    assert.equal(calc('gcs', { e: '4', v: '5', m: '6' }).value, '15 (A4 K5 M6)');
    assert.equal(calc('wells', { hr: true, prior: true }).value, '3 balo');
    assert.equal(calc('curb65', { c: true, u: true, age: true }).level, 'high');
    assert.equal(calc('bmi', { weight: 80, height: 180 }).value, 'KMI 24,7 kg/m², KPP 2 m²');
    assert.equal(calc('dose', { weight: 70, perkg: 1, conc: 100 }).value, '70 mg = 0,7 ml');
    assert.equal(calc('cockcroft', { age: 70, weight: NaN, sex: 'm', creat: 100 }), null);
});

test('calculators open from home without login and update the result while typing', async () => {
    const h = harness({ home: true });
    await h.run('startApp()');
    await h.settle();
    const tile = h.document.getElementById('homeGrid').children.find(t => t.getAttribute('data-section') === 'calculators');
    assert.equal(tile.children.some(el => el.textContent === 'Ruošiama'), false);
    await tile.dispatch('click');
    const card = h.document.getElementById('calcBody').all().find(el => el.getAttribute('data-calc') === 'cockcroft');
    await card.dispatch('click');
    assert.equal(h.document.getElementById('calcValue').textContent, 'Įveskite duomenis');
    for (const [key, value] of [['age', '70'], ['weight', '70'], ['creat', '100']]) {
        const input = h.document.getElementById('calc-' + key);
        input.value = value;
        await input.dispatch('input');
    }
    assert.equal(h.document.getElementById('calcValue').textContent, '60 ml/min');
    h.document.getElementById('calc-weight').value = '70,5';
    await h.document.getElementById('calc-weight').dispatch('input');
    assert.equal(h.document.getElementById('calcValue').textContent, '61 ml/min');
});

test('every calculator explains what it is for, in the list and in the form', async () => {
    const h = harness();
    assert.equal(h.run('CALCULATORS.every(c => typeof c.info === "string" && c.info.length > 20)'), true);
    h.run('currentSection = "calculators"; currentCalculator = null; showCalculators()');
    const card = h.document.getElementById('calcBody').all().find(el => el.getAttribute('data-calc') === 'news2');
    assert.match(card.children[1].textContent, /gyvybinius rodiklius/);
    await card.dispatch('click');
    assert.match(h.document.getElementById('calcInfo').textContent, /gyvybinius rodiklius/);
});

const sampleDocuments = [
    { id: 1, title: 'Slaugytojo pareigybinė instrukcija', category: 'Pareigybinės instrukcijos', file_path: '2026/1.pdf', file_name: 'slauga.pdf', created_at: '2026-11-20T10:00:00Z' },
    { id: 2, title: 'Infekcijų kontrolės tvarka', category: 'Tvarkos', file_path: '2026/2.pdf', file_name: 'infekcijos.pdf', created_at: '2026-11-21T10:00:00Z' }
];

test('guest cannot open documents', async () => {
    const h = harness({ home: true });
    await h.run('startApp()');
    await h.settle();
    await h.run('showDocuments()');
    assert.ok(h.document.getElementById('homeGrid'));
    assert.equal(h.calls.reads.some(q => q.table === 'documents'), false);
});

test('documents tile is no longer marked as coming soon', async () => {
    const h = harness({ home: true, session });
    await h.run('startApp()');
    await h.settle();
    const tile = h.document.getElementById('homeGridLogin').children.find(t => t.getAttribute('data-section') === 'documents');
    assert.equal(tile.children.some(el => el.textContent === 'Ruošiama'), false);
});

test('documents are listed, filtered by category and search, and open by signed link', async () => {
    const h = harness({ session, documents: async () => ({ data: sampleDocuments, error: null }) });
    await h.run('startApp()');
    await h.settle();
    await h.run('showDocuments()');
    const titles = () => h.document.getElementById('documentList').children
        .filter(c => c.className.includes('document-card')).map(c => c.children[1].textContent);
    assert.equal(titles().length, 2);
    const tvarkos = h.document.getElementById('documentCategories').children.find(b => b.textContent === 'Tvarkos');
    await tvarkos.dispatch('click');
    assert.deepEqual(titles(), ['Infekcijų kontrolės tvarka']);
    h.run('documentCategory = "Visi"');
    h.document.getElementById('documentSearch').value = 'PAREIGYBINE';
    h.run('renderDocuments()');
    assert.deepEqual(titles(), ['Slaugytojo pareigybinė instrukcija']);
    await h.run('openDocument(documentsList[0])');
    assert.deepEqual(h.calls.signed, ['2026/1.pdf']);
    assert.equal(h.calls.opened[0].opener, null);
    assert.equal(h.document.getElementById('sectionNav').children.some(b => b.textContent === '+ Įkelti dokumentą'), false);
});

test('admin uploads a document, wrong types are rejected and the row stores the file', async () => {
    const h = harness({ session, profile: adminProfile });
    await h.run('startApp()');
    await h.settle();
    await h.run('showDocuments()');
    h.run('showDocumentForm()');
    const fileInput = h.document.getElementById('documentFile');
    fileInput.files = [{ name: 'virusas.exe', type: 'application/x-msdownload', size: 10 }];
    await h.document.getElementById('documentForm').dispatch('submit');
    assert.equal(h.calls.uploads.length, 0);
    fileInput.files = [{ name: 'Tvarka 2026.pdf', type: 'application/pdf', size: 1000 }];
    await fileInput.dispatch('change');
    assert.equal(h.document.getElementById('documentTitle').value, 'Tvarka 2026');
    h.document.getElementById('documentCategory').value = 'Tvarkos';
    await h.document.getElementById('documentForm').dispatch('submit');
    assert.equal(h.calls.uploads[0].bucket, 'documents');
    assert.match(h.calls.uploads[0].path, /^\d{4}\/\d+\.pdf$/);
    const row = h.calls.inserts[0];
    assert.equal(row.table, 'documents');
    assert.equal(row.title, 'Tvarka 2026');
    assert.equal(row.category, 'Tvarkos');
    assert.equal(row.file_name, 'Tvarka 2026.pdf');
});

test('failed document row insert removes the uploaded file', async () => {
    const h = harness({ session, profile: adminProfile, insert: async () => ({ data: [], error: null }) });
    await h.run('startApp()');
    await h.settle();
    h.run('showDocumentForm()');
    h.document.getElementById('documentFile').files = [{ name: 'a.pdf', type: 'application/pdf', size: 10 }];
    h.document.getElementById('documentTitle').value = 'A';
    await h.document.getElementById('documentForm').dispatch('submit');
    assert.equal(h.calls.removed.length, 1);
    assert.match(h.document.getElementById('documentMessage').textContent, /Nepavyko įkelti/);
});

const sampleProfiles = [
    { id: 'u1', email: 'admin@example.test', full_name: 'Admin', role: 'admin', staff_group: null },
    { id: 'u2', email: 'ona@example.test', full_name: 'Ona Onaitė', role: 'user', staff_group: 'Slaugytojai' }
];

test('non-admin cannot open the staff view', async () => {
    const h = harness({ home: true, session });
    await h.run('startApp()');
    await h.settle();
    await h.run('showStaff()');
    assert.ok(h.document.getElementById('homeGrid'));
    assert.equal(h.calls.reads.some(q => q.table === 'profiles' && q.columns?.includes('email')), false);
});

test('admin assigns a staff group and only staff_group is updated', async () => {
    const h = harness({ session, profile: adminProfile, profiles: async () => ({ data: structuredClone(sampleProfiles), error: null }) });
    await h.run('startApp()');
    await h.settle();
    await h.run('showStaff()');
    const rows = h.document.getElementById('staffTable').children;
    assert.equal(rows.length, 2);
    const select = rows[1].children[1];
    assert.equal(select.value, 'Slaugytojai');
    select.value = 'Gydytojai';
    await select.dispatch('change');
    assert.equal(JSON.stringify(h.calls.updates[0].update), JSON.stringify({ staff_group: 'Gydytojai' }));
    assert.deepEqual(h.calls.updates[0].filters, [['id', 'u2']]);
    assert.equal(rows[1].children[3].textContent, 'Išsaugota');
});

test('failed group update restores the previous value', async () => {
    const h = harness({ session, profile: adminProfile, profiles: async () => ({ data: structuredClone(sampleProfiles), error: null }), update: async () => ({ data: [], error: null }) });
    await h.run('startApp()');
    await h.settle();
    await h.run('showStaff()');
    const row = h.document.getElementById('staffTable').children[1];
    row.children[1].value = 'Gydytojai';
    await row.children[1].dispatch('change');
    assert.equal(row.children[1].value, 'Slaugytojai');
    assert.match(row.children[3].textContent, /Nepavyko/);
});

test('admin saves the staff group list', async () => {
    const h = harness({ session, profile: adminProfile, profiles: async () => ({ data: structuredClone(sampleProfiles), error: null }) });
    await h.run('startApp()');
    await h.settle();
    await h.run('showStaff()');
    h.document.getElementById('staffGroupsInput').value = 'Gydytojai\n Slaugytojai \n\nPadėjėjai\nGydytojai';
    const save = h.document.getElementById('staffBody').all().find(el => el.textContent === 'Išsaugoti sąrašus');
    await save.dispatch('click');
    assert.equal(h.calls.upserts[0].key, 'staff_groups');
    assert.equal(JSON.stringify(h.calls.upserts[0].value), JSON.stringify(['Gydytojai', 'Slaugytojai', 'Padėjėjai']));
});

const deptSettings = async query => query.filters.some(f => f[1] === 'departments')
    ? { data: { value: ['Priėmimo', 'Terapinis'] }, error: null }
    : { data: null, error: null };
const deptProtocols = [
    { id: 'd1', title: 'Bendras', category: 'Kitos', content: 'x', access_level: 'public', sort_order: 0, departments: [] },
    { id: 'd2', title: 'Priėmimui', category: 'Kitos', content: 'x', access_level: 'public', sort_order: 0, departments: ['Priėmimo'] },
    { id: 'd3', title: 'Terapijai', category: 'Kitos', content: 'x', access_level: 'public', sort_order: 0, departments: ['Terapinis'] }
];
const listedTitles = h => h.document.getElementById('protocolList').children.map(c => c.children[1].textContent);

test('department filter hides other departments but always shows common algorithms', async () => {
    const h = harness({ settings: deptSettings, protocols: async () => ({ data: deptProtocols, error: null }) });
    await h.run('startApp()');
    await h.settle();
    assert.deepEqual(listedTitles(h), ['Bendras', 'Priėmimui', 'Terapijai']);
    await h.document.getElementById('departmentToggle').dispatch('click');
    const panel = h.document.getElementById('departmentPanel');
    panel.all().find(el => el.getAttribute('data-department') === 'Terapinis').checked = true;
    await panel.children.find(el => el.textContent === 'Rodyti').dispatch('click');
    assert.deepEqual(listedTitles(h), ['Bendras', 'Terapijai']);
    assert.match(h.document.getElementById('departmentToggle').textContent, /Terapinis/);
    await h.document.getElementById('departmentToggle').dispatch('click');
    await h.document.getElementById('departmentPanel').children.find(el => el.textContent === 'Visi skyriai').dispatch('click');
    assert.equal(listedTitles(h).length, 3);
});

test('logged-in user starts with saved departments and a new choice is stored', async () => {
    const h = harness({ session, settings: deptSettings, prefs: async () => ({ data: { departments: ['Priėmimo'] }, error: null }),
        protocols: async () => ({ data: deptProtocols, error: null }) });
    await h.run('startApp()');
    await h.settle();
    assert.deepEqual(listedTitles(h), ['Bendras', 'Priėmimui']);
    await h.run('saveDepartmentChoice(["Terapinis"])');
    const saved = h.calls.upserts.find(u => u.table === 'user_preferences');
    assert.equal(saved.user_id, user.id);
    assert.equal(JSON.stringify(saved.departments), JSON.stringify(['Terapinis']));
    assert.deepEqual(listedTitles(h), ['Bendras', 'Terapijai']);
});

test('admin tags an algorithm with departments', async () => {
    const h = harness({ session, profile: adminProfile, settings: deptSettings });
    await h.run('startApp()');
    await h.settle();
    h.run('showProtocolForm()');
    h.document.getElementById('protocolTitle').value = 'Naujas';
    h.document.getElementById('protocolContent').value = 'Tekstas';
    h.document.getElementById('protocolDepartments').all().find(el => el.getAttribute('data-department') === 'Priėmimo').checked = true;
    await h.document.getElementById('protocolForm').dispatch('submit');
    assert.equal(JSON.stringify(h.calls.inserts[0].departments), JSON.stringify(['Priėmimo']));
});

test('staff form shows each list directly under its own heading', async () => {
    const h = harness({ session, profile: adminProfile, profiles: async () => ({ data: structuredClone(sampleProfiles), error: null }) });
    await h.run('startApp()');
    await h.settle();
    await h.run('showStaff()');
    const box = h.document.getElementById('staffBody').children.find(el => el.className.includes('staff-groups'));
    const order = box.children.map(el => el.getAttribute('id') || el.textContent);
    assert.ok(order.indexOf('Pareigos') < order.indexOf('staffGroupsInput'));
    assert.ok(order.indexOf('staffGroupsInput') < order.indexOf('Skyriai'));
    assert.ok(order.indexOf('Skyriai') < order.indexOf('departmentsInput'));
});

test('login accepts a nickname and maps it to the internal address, email stays as is', async () => {
    const seen = [];
    const h = harness({ signIn: async credentials => { seen.push(credentials.email); return { data: { user, session }, error: null }; } });
    await h.run('startApp()');
    h.run('showLogin()');
    h.document.getElementById('email').value = ' MinMas ';
    h.document.getElementById('password').value = 'test-only';
    await h.run('login()');
    assert.equal(seen[0], 'minmas@vmkl.local');
    assert.equal(h.run('loginEmail("user@example.test")'), 'user@example.test');
});

test('temporary password must be changed before anything else', async () => {
    const h = harness({ home: true, session, profile: async () => ({ data: { id: user.id, role: 'admin', must_change_password: true }, error: null }) });
    await h.run('startApp()');
    await h.settle();
    assert.ok(h.document.getElementById('passwordForm'));
    assert.equal(h.run('isAdmin()'), false);
    h.run('currentSection = "protocols"; showProtocolList()');
    assert.ok(h.document.getElementById('passwordForm'));
    h.document.getElementById('newPassword').value = 'naujas123';
    h.document.getElementById('newPassword2').value = 'kitas1234';
    await h.document.getElementById('passwordForm').dispatch('submit');
    assert.match(h.document.getElementById('passwordMessage').textContent, /nesutampa/);
    assert.equal(h.calls.userUpdates.length, 0);
    h.document.getElementById('newPassword2').value = 'naujas123';
    await h.document.getElementById('passwordForm').dispatch('submit');
    assert.equal(h.calls.userUpdates[0].password, 'naujas123');
    assert.deepEqual(h.calls.rpcs, ['clear_password_flag']);
    assert.equal(h.document.getElementById('passwordForm'), null);
    assert.equal(h.run('isAdmin()'), true);
});

test('employee opens own account, sees escaped details and changes the password', async () => {
    const h = harness({ home: true, session, profile: async () => ({ data: { id: user.id, role: 'user', full_name: '<b>Ona</b>', username: 'onaona', staff_group: 'Slaugytojai', departments: ['Priėmimas'], must_change_password: false }, error: null }) });
    await h.run('startApp()');
    await h.settle();
    h.run('showAccount()');
    const form = h.document.getElementById('passwordForm');
    assert.ok(form);
    assert.match(h.document.getElementById("app").innerHTML, /Mano paskyra/);
    assert.match(h.document.getElementById("app").innerHTML, /&lt;b&gt;Ona&lt;\/b&gt;/);
    assert.match(h.document.getElementById("app").innerHTML, /Priėmimas/);
    h.document.getElementById('newPassword').value = 'naujas123';
    h.document.getElementById('newPassword2').value = 'naujas123';
    await form.dispatch('submit');
    assert.equal(h.calls.userUpdates[0].password, 'naujas123');
    assert.equal(h.document.getElementById('passwordForm'), form);
    assert.match(h.document.getElementById('passwordMessage').textContent, /pakeistas/);
});

test('account view is not available without login', async () => {
    const h = harness({ home: true });
    await h.run('startApp()');
    await h.settle();
    h.run('showAccount()');
    assert.equal(h.document.getElementById('passwordForm'), null);
});

const vacationRows = [
    { id: 'v1', user_id: user.id, full_name: 'Aš', staff_group: 'Gydytojai', departments: ['Priėmimas'], start_date: '2030-07-01', end_date: '2030-07-10', status: 'planned', note: '' },
    { id: 'v2', user_id: 'other1', full_name: '<img src=x onerror=alert(1)>', staff_group: 'Gydytojai', departments: ['Priėmimas'], start_date: '2030-07-05', end_date: '2030-07-08', status: 'approved', note: '' },
    { id: 'v3', user_id: 'other2', full_name: 'Jonas', staff_group: 'Gydytojai', departments: ['Priėmimas'], start_date: '2030-07-06', end_date: '2030-07-07', status: 'planned', note: '' }
];
const vacationSettings = async query => {
    const key = query.filters.find(([k]) => k === 'key')?.[1];
    if (key === 'vacation_limits') return { data: { value: { 'Priėmimas': { 'Gydytojai': 2 } } }, error: null };
    if (key === 'departments') return { data: { value: ['Priėmimas', 'Chirurgija'] }, error: null };
    return { data: null, error: null };
};
const doctorProfile = async () => ({ data: { id: user.id, role: 'user', full_name: 'Aš', staff_group: 'Gydytojai', departments: ['Priėmimas'] }, error: null });

test('guest cannot open vacations and reads nothing', async () => {
    const h = harness({ home: true });
    await h.run('startApp()');
    await h.settle();
    await h.run('showVacations()');
    assert.equal(h.run('currentSection'), 'home');
    assert.equal(h.calls.reads.filter(q => q.table === 'vacations').length, 0);
});

test('employee sees colleagues safely, own cancel only, and a limit warning', async () => {
    const h = harness({ home: true, session, profile: doctorProfile, settings: vacationSettings, vacations: async () => ({ data: structuredClone(vacationRows), error: null }) });
    await h.run('startApp()');
    await h.settle();
    h.run('vacationMonth = new Date(2030, 6, 1)');
    await h.run('showVacations()');
    const rows = h.document.getElementById('vacationsBody').all().filter(el => (el.className || '').startsWith('vacation-row'));
    assert.equal(rows.length, 3);
    assert.equal(rows[1].children[0].children[0].textContent, '<img src=x onerror=alert(1)>');
    assert.equal(rows[0].children[3].children.map(b => b.textContent).join(), 'Atšaukti');
    assert.equal(rows[1].children[3].children.length, 0);
    assert.ok(rows[0].all().some(el => el.textContent === 'Viršyta riba: Priėmimas'));
    assert.equal(h.document.getElementById('sectionNav').all().some(el => el.textContent === 'Ribos'), false);
});

test('vacation form validates dates and inserts only dates and note', async () => {
    const h = harness({ home: true, session, profile: doctorProfile, settings: vacationSettings });
    await h.run('startApp()');
    await h.settle();
    await h.run('showVacations()');
    h.run('showVacationForm()');
    h.document.getElementById('vacationStart').value = '2030-08-10';
    h.document.getElementById('vacationEnd').value = '2030-08-01';
    await h.run('saveVacation()');
    assert.match(h.document.getElementById('vacationMessage').textContent, /anksčiau/);
    assert.equal(h.calls.inserts.length, 0);
    h.document.getElementById('vacationEnd').value = '2030-08-20';
    h.document.getElementById('vacationNote').value = 'Kelionė';
    await h.run('saveVacation()');
    assert.equal(JSON.stringify(h.calls.inserts[0]), JSON.stringify({ table: 'vacations', start_date: '2030-08-10', end_date: '2030-08-20', note: 'Kelionė' }));
});

test('admin approves a vacation and saves limits', async () => {
    const h = harness({ home: true, session, profile: adminProfile, settings: vacationSettings, vacations: async () => ({ data: structuredClone(vacationRows), error: null }) });
    await h.run('startApp()');
    await h.settle();
    h.run('vacationMonth = new Date(2030, 6, 1)');
    await h.run('showVacations()');
    const row = h.document.getElementById('vacationsBody').all().find(el => (el.className || '').startsWith('vacation-row'));
    await row.children[3].children.find(b => b.textContent === 'Patvirtinti').dispatch('click');
    assert.equal(JSON.stringify(h.calls.updates[0].update), JSON.stringify({ status: 'approved' }));
    h.run('showVacationLimits()');
    const input = h.document.getElementById('vacationLimitFields').all().find(el => el.getAttribute('data-group') === 'Slaugytojai');
    input.value = '3';
    await input.dispatch('input');
    await h.document.getElementById('vacationLimits').all().find(el => el.textContent === 'Išsaugoti ribas').dispatch('click');
    const saved = h.calls.upserts.find(u => u.key === 'vacation_limits');
    assert.equal(JSON.stringify(saved.value), JSON.stringify({ 'Priėmimas': { 'Gydytojai': 2, 'Slaugytojai': 3 } }));
});

test('admin creates a staff account through the admin-users function', async () => {
    const h = harness({ session, profile: adminProfile, settings: deptSettings, profiles: async () => ({ data: structuredClone(sampleProfiles), error: null }) });
    await h.run('startApp()');
    await h.settle();
    await h.run('showStaff()');
    await h.document.getElementById('sectionNav').children.find(b => b.textContent === '+ Naujas darbuotojas').dispatch('click');
    const name = h.document.getElementById('newStaffName');
    name.value = 'Mindaugas Masedunskas';
    await name.dispatch('input');
    assert.equal(h.document.getElementById('newStaffLogin').value, 'minmas');
    const form = h.document.getElementById('newStaffForm');
    const create = form.children.find(el => el.textContent === 'Sukurti paskyrą');
    h.document.getElementById('newStaffPassword').value = 'trumpas';
    await create.dispatch('click');
    assert.equal(h.calls.invokes.length, 0);
    h.document.getElementById('newStaffPassword').value = 'Laikinas123';
    h.document.getElementById('newStaffGroup').value = 'Gydytojai';
    h.document.getElementById('newStaffDepartments').all().find(el => el.getAttribute('data-department') === 'Terapinis').checked = true;
    await create.dispatch('click');
    const call = h.calls.invokes[0];
    assert.equal(call.name, 'admin-users');
    assert.equal(JSON.stringify(call.body), JSON.stringify({ action: 'create', full_name: 'Mindaugas Masedunskas', username: 'minmas', password: 'Laikinas123', staff_group: 'Gydytojai', departments: ['Terapinis'] }));
    assert.match(h.document.getElementById('staffDone').textContent, /minmas/);
});

test('admin resets a password and assigns several departments', async () => {
    const h = harness({ session, profile: adminProfile, settings: deptSettings, profiles: async () => ({ data: structuredClone(sampleProfiles), error: null }) });
    await h.run('startApp()');
    await h.settle();
    await h.run('showStaff()');
    const row = () => h.document.getElementById('staffTable').children[1];
    await row().children[2].children.find(b => b.textContent === 'Keisti skyrius').dispatch('click');
    for (const box of row().all().filter(el => el.getAttribute('data-department'))) box.checked = true;
    await row().all().find(el => el.textContent === 'Išsaugoti skyrius').dispatch('click');
    assert.equal(JSON.stringify(h.calls.updates[0].update), JSON.stringify({ departments: ['Priėmimo', 'Terapinis'] }));
    assert.match(row().children[2].children[0].textContent, /Priėmimo, Terapinis/);
    await row().children[2].children.find(b => b.textContent === 'Atstatyti slaptažodį').dispatch('click');
    h.document.getElementById('resetPassword-u2').value = 'Naujas12345';
    await row().all().find(el => el.textContent === 'Nustatyti slaptažodį').dispatch('click');
    assert.equal(JSON.stringify(h.calls.invokes[0].body), JSON.stringify({ action: 'reset_password', user_id: 'u2', password: 'Naujas12345' }));
    assert.match(h.document.getElementById('staffDone').textContent, /Slaptažodis pakeistas/);
});

test('function errors are shown to the admin', async () => {
    const h = harness({ session, profile: adminProfile, profiles: async () => ({ data: structuredClone(sampleProfiles), error: null }),
        invoke: async () => ({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: 'Toks prisijungimo vardas jau yra.' }) } } }) });
    await h.run('startApp()');
    await h.settle();
    await h.run('showStaff()');
    h.run('staffCreating = true; renderStaff()');
    h.document.getElementById('newStaffName').value = 'Jonas Jonaitis';
    h.document.getElementById('newStaffLogin').value = 'jonjon';
    h.document.getElementById('newStaffPassword').value = 'Laikinas123';
    await h.document.getElementById('newStaffForm').children.find(el => el.textContent === 'Sukurti paskyrą').dispatch('click');
    assert.match(h.document.getElementById('newStaffMessage').textContent, /jau yra/);
});

test('employee starts with the departments assigned by the admin', async () => {
    const h = harness({ session, settings: deptSettings, profile: async () => ({ data: { id: user.id, role: 'user', departments: ['Terapinis'] }, error: null }),
        protocols: async () => ({ data: deptProtocols, error: null }) });
    await h.run('startApp()');
    await h.settle();
    assert.deepEqual(listedTitles(h), ['Bendras', 'Terapijai']);
});
