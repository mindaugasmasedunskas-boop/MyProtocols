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
    const calls = { reads: [], copied: [], alerts: [], subscriptions: 0, inserts: [], updates: [] };
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
                    if (query.update) {
                        calls.updates.push(query);
                        return options.update?.(query) || Promise.resolve({ error: null });
                    }
                    return builder;
                },
                order() {
                    calls.reads.push(query);
                    if (table === 'protocols') return options.protocols?.(query) || Promise.resolve({ data: [publicProtocol], error: null });
                    return options.suggestions?.(query) || Promise.resolve({ data: [], error: null });
                },
                maybeSingle() {
                    calls.reads.push(query);
                    return options.profile?.(query) || Promise.resolve({ data: { id: user.id, role: 'user' }, error: null });
                },
                insert(value) { calls.inserts.push(value); return options.insert?.(value) || Promise.resolve({ error: null }); },
                update(value) { query.update = value; return builder; }
            };
            return builder;
        }
    };
    const context = vm.createContext({
        document, console, setTimeout, clearTimeout,
        navigator: { clipboard: { writeText: async value => { calls.copied.push(value); } } },
        alert: value => calls.alerts.push(value),
        supabaseClient: options.client === null ? null : client,
        supabaseInitializationError: 'Nepavyko įkelti prisijungimo bibliotekos.'
    });
    for (const file of ['utils', 'auth', 'protocols', 'admin', 'admin-protocols', 'suggestions']) {
        vm.runInContext(fs.readFileSync(path.join(sourceRoot, 'js', file + '.js'), 'utf8'), context, { filename: file + '.js' });
    }
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
