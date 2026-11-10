const { chromium, devices } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const state = async () => (await (await fetch('http://localhost:8899/__state')).json());
  const tokens = (await state()).tokens;
  const kasun = tokens.find(t => t[0] === 'Kasun Perera');

  // 1. anonymous visitor
  let ctx = await b.newContext({ ...devices['iPhone 13'] }); let p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8899/'); await p.waitForSelector('.q');
  await p.screenshot({ path: '/home/user/shot-anon.png', fullPage: true });
  ok(await p.isHidden('#invite'), 'anonymous: no invite box');
  // registered person, first time on this device
  await p.fill('.q textarea', 'Floating solar panels on hydro reservoirs to save land.');
  await p.click('.q .btn');
  await p.waitForSelector('#sheet:not(.hidden)');
  await p.fill('input[name=phone]', '077 123 4567'); await p.fill('input[name=email]', 'kasun.test@example.com');
  await p.screenshot({ path: '/home/user/shot-sheet.png' });
  await p.click('#sheet-go');
  await p.waitForSelector('.q .msg.ok');
  await p.waitForSelector('#invite:not(.hidden)');
  ok(true, 'registered first-time: answer saved, invite box shown');
  ok((await p.inputValue('#ref-link')).includes('?ref=' + kasun[2]), 'invite link uses public ref code (not token)');
  await p.reload(); await p.waitForSelector('#hello:not(.hidden)');
  ok((await p.textContent('#hello')).includes('Kasun'), 'remembered after reload: ' + await p.textContent('#hello'));
  ok((await p.inputValue('.q textarea')).includes('Floating'), 'previous answer loaded');
  await p.screenshot({ path: '/home/user/shot-member.png', fullPage: true });
  await ctx.close();

  // 2. friend arrives through invite link, not registered → guest
  ctx = await b.newContext({ ...devices['Pixel 7'] }); p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8899/?ref=' + kasun[2]); await p.waitForSelector('.q');
  ok(await p.isVisible('#invited'), 'invite banner shown');
  ok((await p.getAttribute('#hero-reg', 'href')) === 'https://docs.google.com/forms/d/e/TEST/viewform', 'Register button goes to the plain form');
  ok(!p.url().includes('ref='), 'ref hidden from address bar');
  await p.fill('.q textarea', 'Smart meters so people use power when solar is high.');
  await p.click('.q .btn');
  await p.fill('input[name=phone]', '0705556666'); await p.fill('input[name=email]', 'friend@example.com');
  await p.click('#sheet-go');
  await p.waitForSelector('#guest-fields:not(.hidden)');
  await p.fill('input[name=name]', 'Friend Test');
  await p.selectOption('#uni-select', '__other'); await p.fill('#uni-other', 'University Of Jaffna');
  await p.screenshot({ path: '/home/user/shot-guest.png' });
  await p.click('#sheet-go');
  await p.waitForSelector('#regnudge:not(.hidden)');
  await p.screenshot({ path: '/home/user/shot-nudge.png' });
  ok(true, 'guest answer saved, register nudge shown');
  const s = await state();
  ok(s.visits.length === 2 && s.visits[1][1] === kasun[2] && s.visits[1][3], 'invite visit recorded and linked to the guest: ' + JSON.stringify(s.visits[1].slice(1)));
  ok(s.answers.length === 3 && s.answers[2][5] === 'Friend Test' && s.answers[2][6] === 'University Of Jaffna', 'guest row in Answers sheet');

  // 3. personal link from the email
  ctx = await b.newContext({ ...devices['iPhone 13'] }); p = await ctx.newPage();
  await p.goto('http://localhost:8899/?t=' + kasun[1]); await p.waitForSelector('#hello:not(.hidden)');
  ok(!p.url().includes('t='), 'personal token hidden from address bar');
  ok(errs.length === 0, 'no JS errors ' + errs.join('; '));
  await b.close();
})();
