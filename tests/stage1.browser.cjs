// Offline browser smoke tests using an existing Playwright installation.
// No production Supabase connection is made. Every browser request is intercepted.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = process.env.MYPROTOCOLS_TEST_ROOT || path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true, timeout: 20000 });
    try {
        const context = await browser.newContext({ serviceWorkers: 'block' });
        const errors = [];
        const unexpectedRequests = [];
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.dismiss());
        await context.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.hostname === 'cdn.jsdelivr.net') {
                await route.fulfill({ contentType: 'application/javascript', body: '// SDK replaced by an offline test double.' });
                return;
            }
            if (url.origin === 'http://myprotocols.test') {
                const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
                const target = path.resolve(root, relative);
                if (target.startsWith(path.resolve(root) + path.sep) && fs.existsSync(target)) {
                    const contentType = target.endsWith('.js') ? 'application/javascript' : target.endsWith('.css') ? 'text/css' : 'text/html';
                    await route.fulfill({ body: fs.readFileSync(target), contentType });
                    return;
                }
            }
            unexpectedRequests.push(url.origin);
            await route.abort();
        });
        await context.addInitScript(() => {
            const user = { id: 'u1', email: 'user@example.test' };
            let listener;
            window.testState = {
                reads: 0, signOutError: false, holdLogout: false, releaseLogout: null,
                payload: 'X" onclick="window.compromised=1" &#39;);window.compromised=1;// <img src=x onerror="window.compromised=1">'
            };
            const client = {
                auth: {
                    onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
                    getSession: async () => ({ data: { session: null }, error: null }),
                    signInWithPassword: async () => {
                        listener('SIGNED_IN', { user });
                        return { data: { user, session: { user } }, error: null };
                    },
                    signOut: async () => {
                        if (window.testState.holdLogout) await new Promise(resolve => { window.testState.releaseLogout = resolve; });
                        if (window.testState.signOutError) return { error: { message: '<offline>' } };
                        listener('SIGNED_OUT', null);
                        return { error: null };
                    }
                },
                from(table) {
                    const query = {
                        select() { return query; }, eq() { return query; },
                        maybeSingle: async () => ({ data: { id: user.id, role: 'admin' }, error: null }),
                        order: async () => {
                            if (table !== 'protocols') return { data: [], error: null };
                            window.testState.reads++;
                            return { data: [
                                { id: 'p1', title: 'Viešas protokolas', category: window.testState.payload, content: 'Viešas turinys', access_level: 'public' },
                                { id: 'r1', title: 'Ribotas protokolas', category: 'Ribota grupė', content: 'Ribotas turinys', access_level: 'restricted' }
                            ], error: null };
                        }
                    };
                    return query;
                }
            };
            window.supabase = { createClient: () => client };
            window.emitTestAuth = (event, session) => listener(event, session);
        });

        await page.goto('http://myprotocols.test/');
        await page.waitForFunction(() => !authLoading && !protocolsLoading);
        assert.equal(await page.locator('.protocol').count(), 1);
        assert.equal(await page.getByText('Ribotas protokolas', { exact: true }).count(), 0);
        const category = page.locator('.category-button').nth(1);
        assert.equal(await category.getAttribute('onclick'), null);
        assert.equal(await category.textContent(), await page.evaluate(() => window.testState.payload));
        await category.click();
        assert.equal(await page.evaluate(() => window.compromised), undefined);
        assert.equal(await page.locator('#app img, #app script').count(), 0);
        console.log('PASS: actual browser treats category payloads as text and filters restricted rows');

        const beforeLogin = await page.evaluate(() => window.testState.reads);
        await page.getByRole('button', { name: 'Prisijungti', exact: true }).click();
        await page.locator('#email').fill('user@example.test');
        await page.locator('#password').fill('test-only');
        await page.locator('#loginButton').click();
        await page.waitForFunction(() => !authLoading && currentUser && isAdmin());
        assert.equal(await page.evaluate(() => window.testState.reads), beforeLogin + 1);
        assert.equal(await page.getByText('Ribotas protokolas', { exact: true }).count(), 0);
        console.log('PASS: login refreshes protocols and admin receives no restricted read access');

        await page.locator('.protocol').click();
        assert.equal(await page.locator('.detail-content').textContent(), 'Viešas turinys');
        await page.evaluate(() => {
            window.testState.holdLogout = true;
            protocols.push({ id: 'old', access_level: 'restricted', content: 'Senas ribotas turinys' });
            void logout();
        });
        assert.equal(await page.evaluate(() => protocols.length), 0);
        assert.equal(await page.locator('.detail-content').count(), 0);
        assert.equal(await page.evaluate(() => currentProfile), null);
        await page.evaluate(() => window.testState.releaseLogout());
        await page.waitForFunction(() => !authLoading && !logoutPending && protocols.length === 1);
        console.log('PASS: logout clears data and detail synchronously before network completion');

        await page.evaluate(() => {
            window.testState.holdLogout = false;
            window.testState.signOutError = true;
            void logout();
        });
        await page.waitForFunction(() => logoutFailed && !authLoading);
        assert.match(await page.locator('[role="alert"]').textContent(), /Sesija gali būti likusi aktyvi/);
        assert.equal(await page.getByRole('button', { name: 'Bandyti atsijungti dar kartą' }).count(), 1);
        assert.equal(await page.evaluate(() => currentUser), null);
        await page.evaluate(() => { window.testState.signOutError = false; });
        await page.getByRole('button', { name: 'Bandyti atsijungti dar kartą' }).click();
        await page.waitForFunction(() => !logoutFailed && !authLoading);
        console.log('PASS: failed logout visibly fails closed and supports retry');

        await page.evaluate(() => window.emitTestAuth('SIGNED_IN', { user: { id: 'u2', email: 'other@example.test' } }));
        await page.waitForFunction(() => !authLoading && currentUser?.id === 'u2');
        await page.evaluate(() => window.emitTestAuth('SIGNED_OUT', null));
        await page.waitForFunction(() => !authLoading && !currentUser);
        assert.deepEqual(errors, []);
        assert.deepEqual(unexpectedRequests, []);
        console.log('PASS: external auth events synchronize without browser errors; no external network access');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
