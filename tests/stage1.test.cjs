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
    const calls = { reads: [], copied: [], alerts: [], subscriptions: 0, inserts: [], updates: [], deletes: [] };
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
            signOut: () => options.signOut?.(emit) || Promise.resolve({ error: null })
        },
        from(table) {
            const query = { table, columns: null, filters: [] };
            const builder = {
                select(columns) { query.columns = columns; return builder; },
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
                    if (table === 'contacts') return options.contacts?.(query) || Promise.resolve({ data: [], error: null });
                    return options.suggestions?.(query) || Promise.resolve({ data: [], error: null });
                },
                maybeSingle() {
                    calls.reads.push(query);
                    return options.profile?.(query) || Promise.resolve({ data: { id: user.id, role: 'user' }, error: null });
                },
                insert(value) {
                    calls.inserts.push({ table, ...value });
                    const result = options.insert?.(value) || Promise.resolve({ data: [{ id: 'new1' }], error: null });
                    return Object.assign(result, { select: () => result });
                },
                delete() { query.delete = true; return builder; },
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
        supabaseClient: options.client === null ? null : client,
        supabaseInitializationError: 'Nepavyko įkelti prisijungimo bibliotekos.'
    });
    for (const file of ['utils', 'auth', 'protocols', 'contacts', 'home', 'admin', 'admin-protocols', 'suggestions']) {
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

test('contacts load for a guest, are grouped by department and searchable', async () => {
    const h = harness({ contacts: async () => ({ data: sampleContacts, error: null }) });
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
    const h = harness({ contacts: async () => ({ data: sampleContacts, error: null }) });
    await h.run('startApp()');
    await h.run('showContacts()');
    const links = h.document.getElementById('contactList').all().filter(el => el.className === 'contact-link');
    const hrefs = links.map(el => el.getAttribute('href')).filter(Boolean);
    assert.deepEqual(hrefs.sort(), ['mailto:ona@example.test', 'tel:+37060000002']);
    assert.equal(h.document.getElementById('contactList').all().some(el => el.tagName === 'img'), false);
});

test('auth refresh keeps the user in the contacts section', async () => {
    const h = harness({ contacts: async () => ({ data: sampleContacts, error: null }) });
    await h.run('startApp()');
    await h.run('showContacts()');
    h.emit('TOKEN_REFRESHED', null);
    await h.settle();
    assert.ok(h.document.getElementById('contactList'));
    assert.equal(h.document.getElementById('protocolList'), null);
});

test('contacts section shows a failed logout error instead of hiding it', async () => {
    const h = harness({ session, signOut: async () => ({ error: { message: 'tinklo klaida' } }) });
    await h.run('startApp()');
    await h.run('showContacts()');
    await h.run('logout()');
    assert.ok(h.document.getElementById('contactList'));
    assert.match(h.app.innerHTML, /Atsijungti nepavyko/);
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
    const tiles = h.document.getElementById('homeGrid').children;
    assert.equal(tiles.length, 7);
    const locked = tiles.filter(tile => tile.className.includes('locked')).map(tile => tile.getAttribute('data-section'));
    assert.deepEqual(locked, ['suggestions', 'documents']);
});

test('home tiles open sections and the back button returns home', async () => {
    const h = harness({ home: true, contacts: async () => ({ data: [], error: null }) });
    await h.run('startApp()');
    await h.settle();
    const tile = key => h.document.getElementById('homeGrid').children.find(el => el.getAttribute('data-section') === key);
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
    assert.deepEqual(h.calls.inserts[0], { table: 'protocols', title: 'Naujas', category: 'Grupė', content: 'Tekstas', access_level: 'public' });
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
