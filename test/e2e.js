const { chromium, devices } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const state = async () => (await (await fetch('http://localhost:8899/__state')).json());
  const tokens = (await state()).tokens;
  const kasun = tokens.find(t => t[0] === 'Kasun Perera');

  // 1. anonymous visitor
  let ctx = await b.newContext({ ...devices['iPhone 13'] }); let p = await ctx.newPage(); p.on('dialog', d => d.accept());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8899/'); await p.waitForSelector('.q');
  await p.screenshot({ path: '/home/user/shot-anon.png', fullPage: true });
  ok(await p.isHidden('#invite'), 'anonymous: no invite box');
  // registered person, first time on this device: poll + opinion with ONE button
  ok(await p.isVisible('.result') && (await p.textContent('.result')).includes('Victoria'), 'closed poll shows the correct answer');
  ok((await p.$$('.q-main .qfoot .btn')).length === 1 && await p.isVisible('.q-main .q-poll') && await p.isVisible('.q-main .q-opinion'), 'poll + opinion in one card with one button');
  await p.click('.q-main .qfoot .btn');
  ok((await p.textContent('.q-main .qfoot .msg')).includes('at least one'), 'nothing filled: asks to answer');
  await p.fill('.q-opinion textarea', 'short');
  await p.click('.q-main .qfoot .btn');
  ok((await p.textContent('.q-opinion .msg')).includes('at least'), 'too-short opinion: error under the question');
  await p.fill('.q-opinion textarea', 'Floating solar panels on hydro reservoirs to save land.');
  await p.click('.q-poll .opt:nth-child(2)');
  await p.click('.q-main .qfoot .btn');
  await p.waitForSelector('#sheet:not(.hidden)');
  await p.fill('input[name=phone]', '077 123 4567'); await p.fill('input[name=email]', 'kasun.test@example.com');
  await p.click('#sheet-go');
  await p.waitForSelector('.q-opinion .msg.ok'); await p.waitForSelector('.q-poll .opt.right');
  await p.waitForSelector('#invite:not(.hidden)');
  ok(true, 'registered first-time: BOTH answers saved with one click, invite box shown');
  await p.fill('.q-ask textarea', 'How will EGL buy power from rooftop solar owners?');
  await p.click('.q-ask-card .btn'); await p.waitForSelector('.q-ask .msg.ok');
  ok(await p.isHidden('#sheet'), 'second submit: phone not asked again');
  let st = await state();
  ok(st.answers.some(a => a[7] === 'Coal' && a[10] === 'poll') && st.answers.some(a => a[10] === 'ask') && st.answers.length === 4, 'poll + opinion + ask saved (3 rows): ' + (st.answers.length - 1));
  await p.waitForFunction(() => document.querySelector('#me-points').textContent === String(10 + 5 + 2 + 3 + 3));
  ok(true, 'points on site = register10 + opinion5 + poll2 + correct3 + ask3 = 23');
  ok((await p.textContent('.q-poll .msg')).includes('Correct'), 'right answer: green ✓ + "Correct!"');
  ok((await p.textContent('.q-main .qfoot .btn')).includes('You have submitted') && await p.isDisabled('.q-main .qfoot .btn'), 'button becomes "You have submitted" (no update): ' + await p.textContent('.q-main .qfoot .btn') + await p.isDisabled('.q-main .qfoot .btn'));
  ok(await p.isDisabled('.q-poll .opt input >> nth=0') && (await p.getAttribute('.q-opinion textarea', 'readonly')) !== null, 'quiz locked after submit');
  ok((await p.textContent('.q-main .qfoot .msg')).includes('1 / 1 correct'), 'score line: ' + await p.textContent('.q-main .qfoot .msg'));
  await p.locator('.q-main').screenshot({ path: '/home/user/pp2/preview-quiz-right.png' });
  ok(await p.isVisible('#dots button'), 'carousel dots shown');
  const sl0 = await p.$eval('#series', e => e.scrollLeft);
  await p.waitForTimeout(4600);
  ok((await p.$eval('#series', e => e.scrollLeft)) > sl0, 'carousel auto-slides');
  await p.reload(); await p.waitForSelector('#hello:not(.hidden)');
  ok((await p.textContent('#hello')).includes('Kasun'), 'remembered after reload: ' + await p.textContent('#hello'));
  ok((await p.inputValue('.q-opinion textarea')).includes('Floating'), 'previous answer loaded');
  ok(await p.isChecked('.q-poll .opt:nth-child(2) input') && await p.isVisible('.q-poll .opt.right'), 'after reload: still locked with ✓ result');
  ok((await p.textContent('.q-main .qfoot .btn')).includes('You have submitted'), 'after reload: "You have submitted"');
  await p.screenshot({ path: '/home/user/shot-member.png', fullPage: true });
  await ctx.close();

  // 2. friend arrives through invite link, not registered → guest
  ctx = await b.newContext({ ...devices['Pixel 7'] }); p = await ctx.newPage(); p.on('dialog', d => d.accept()); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8899/?ref=' + kasun[2]); await p.waitForSelector('.q');
  ok(await p.isVisible('#invited'), 'invite banner shown');
  ok((await p.getAttribute('#hero-reg', 'href')) === 'https://docs.google.com/forms/d/e/TEST/viewform', 'Register button goes to the plain form');
  ok(!p.url().includes('ref='), 'ref hidden from address bar');
  await p.fill('.q-opinion textarea', 'Smart meters so people use power when solar is high.');
  await p.click('.q-poll .opt:nth-child(1)');
  await p.click('.q-main .qfoot .btn');
  await p.fill('input[name=phone]', '0705556666'); await p.fill('input[name=email]', 'friend@example.com');
  await p.click('#sheet-go');
  await p.waitForSelector('#guest-fields:not(.hidden)');
  await p.fill('input[name=name]', 'Friend Test');
  await p.selectOption('#uni-select', '__other'); await p.fill('#uni-other', 'University Of Jaffna');
  await p.screenshot({ path: '/home/user/shot-guest.png' });
  await p.click('#sheet-go');
  await p.waitForSelector('.q-poll .opt.wrong');
  ok(await p.isVisible('.q-poll .opt.answer') && (await p.textContent('.q-poll .msg')).includes('right answer is Coal'), 'wrong answer: red ✗ and the right one shown');
  await p.waitForTimeout(500);
  await p.locator('.q-main').screenshot({ path: '/home/user/pp2/preview-quiz-wrong.png' });
  await p.waitForSelector('#regnudge:not(.hidden)');
  await p.screenshot({ path: '/home/user/shot-nudge.png' });
  ok(true, 'guest answer saved, register nudge shown');
  const s = await state();
  ok(s.visits.length === 2 && s.visits[1][1] === kasun[2] && s.visits[1][3], 'invite visit recorded and linked to the guest: ' + JSON.stringify(s.visits[1].slice(1)));
  ok(s.answers.length === 6 && s.answers[5][5] === 'Friend Test' && s.answers[5][6] === 'University Of Jaffna', 'guest row in Answers sheet');

  // 3. personal link from the email
  ctx = await b.newContext({ ...devices['iPhone 13'] }); p = await ctx.newPage();
  await p.goto('http://localhost:8899/?t=' + kasun[1]); await p.waitForSelector('#hello:not(.hidden)');
  ok(!p.url().includes('t='), 'personal token hidden from address bar');
  ok(errs.length === 0, 'no JS errors ' + errs.join('; '));
  await b.close();
})();
