const { load } = require('./mock-gas');
let post0;
const seed = require('./seed');
const env = load(seed());
const g = env.ctx;
g.setup();
// Questions
env.sheets['Questions'].data.push([1, 1, 'What creative ideas can help Sri Lanka generate more electricity from renewables?', true]);
env.sheets['Questions'].data.push([2, 1, 'Inactive question', false]);
const H = 3600e3, now = Date.now();
env.sheets['Questions'].data.push([3, 1, 'Future question', true, new Date(now + H), new Date(now + 5 * H)]);
env.sheets['Questions'].data.push([4, 1, 'Closed question', true, new Date(now - 5 * H), new Date(now - H)]);
env.sheets['Questions'].data.push([5, 1, 'Open timed question', true, new Date(now - H), new Date(now + H)]);
// make Nimali referred by Kasun
const M = g.members_();
const kasun = M.list.find(m => m.name === 'Kasun Perera'), nimali = M.list.find(m => m.name === 'nimali silva');
// invite visits
post0 = (b) => JSON.parse(g.doPost({ postData: { contents: JSON.stringify(b) } }).body);
post0({ a: 'visit', ref: kasun.ref, v: 'device-nimali-1' });            // Nimali opens Kasun's link (she registered earlier)
post0({ a: 'visit', ref: kasun.ref, v: 'device-nimali-1' });            // refresh: not counted again
post0({ a: 'visit', ref: kasun.ref, v: 'device-kasun-01', t: kasun.token }); // Kasun opens own link: ignored
post0({ a: 'visit', ref: 'zzzzzz', v: 'device-random-1' });             // unknown code: ignored

// the team edits the Sheet directly in these tests → forget the 60-second cache first (in real life: shows within a minute)
const getCached = (t) => JSON.parse(g.doGet({ parameter: { a: 'init', t } }).body);
const get = (t) => { for (const k in env.cache) delete env.cache[k]; return getCached(t); };
const post = (b) => JSON.parse(g.doPost({ postData: { contents: JSON.stringify(b) } }).body);
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

let r = get('');
ok(r.ok && r.questions.map(q => q.id).join(',') === '1,5' && r.me === null, 'only active + currently-open questions shown: ' + r.questions.map(q => q.id).join(','));
ok(r.questions[1].closes && !r.questions[0].closes, 'closing time sent for timed question');
ok(M.list.length === 3, 'duplicate phone ignored (3 members)');
ok(r.unisList.join('|') === 'University Of Moratuwa|University Of Ruhuna', 'university spelling merged: ' + r.unisList.join('|'));
ok(!JSON.stringify(r).includes('0771234567') && !JSON.stringify(r).includes('94771234567') && !JSON.stringify(r).includes('@'), 'no phone/email in public response');

r = post({ a: 'login', phone: '0771234567', email: 'wrong@example.com' });
ok(!r.ok, 'login with wrong email refused');
ok(env.sheets['Visits'].data.length === 2, 'visits: 1 row (refresh, own link, unknown ignored)');
r = post({ a: 'login', phone: '0712345678', email: 'nimali.test@example.com', v: 'device-nimali-1' });
ok(env.sheets['Visits'].data[1][3] === nimali.token, 'visit linked to Nimali after she identifies');
r = post({ a: 'login', phone: '0771234567', email: 'KASUN.test@example.com ' });
ok(r.ok && r.registered && r.token === kasun.token, 'login phone+email works (case-insensitive)');
r = post({ a: 'login', phone: '0700000000', email: 'x@example.com' });
ok(r.ok && r.registered === false, 'unknown number => registered:false');

r = post({ a: 'answer', t: kasun.token, qid: '1', text: 'short' });
ok(!r.ok, 'too-short answer rejected');
r = post({ a: 'answer', t: kasun.token, qid: '2', text: 'This is a long enough answer text' });
ok(!r.ok, 'inactive question rejected');
r = post({ a: 'answer', t: kasun.token, qid: '4', text: 'This is a long enough answer text' });
ok(!r.ok, 'closed (past Closes time) question rejected');
r = post({ a: 'answer', t: kasun.token, qid: '3', text: 'This is a long enough answer text' });
ok(!r.ok, 'not-yet-open question rejected');
r = post({ a: 'answer', t: kasun.token, qid: '1', text: 'Floating solar panels on reservoirs like Victoria.' });
ok(r.ok && r.registered, 'registered answer saved');
r = post({ a: 'answer', t: kasun.token, qid: '1', text: 'Floating solar on hydro reservoirs + battery storage.' });
ok(!r.ok && r.locked && env.sheets['Answers'].data.length === 2 && String(env.sheets['Answers'].data[1][7]).startsWith('Floating solar panels'), 'quiz opinion locked after first submit (no change)');

// guest who came through Kasun's link
post({ a: 'visit', ref: kasun.ref, v: 'device-guest-01' });
r = post({ a: 'answer', phone: '0709998888', email: 'guest@example.com', qid: '1', text: 'Rooftop solar for every university building.' });
ok(!r.ok && r.needDetails, 'guest without name asked for details');
r = post({ a: 'answer', phone: '0709998888', email: 'guest@example.com', name: 'Guest Person', uni: 'University Of Jaffna', qid: '1', text: 'Rooftop solar for every university building.', v: 'device-guest-01' });
ok(r.ok && r.registered === false && r.token, 'guest answer saved');
const guestToken = r.token;
r = get(guestToken);
ok(r.me && r.me.registered === false && r.myAnswers['1'], 'guest remembered on device');
ok(!r.top.some(x => x.name.startsWith('Guest')), 'guest not on leaderboard');

// guest registers later with same number
env.sheets['Form Responses 1'].data.push([new Date(Date.now() + 1000), 'guest@example.com', 'Guest Person', 'guest@example.com', '0709998888', 'University Of Jaffna', 'No', 'Friend', '']);
r = get(guestToken);
ok(r.me && r.me.registered && r.me.points === 10 + 5, 'after registering, guest answer counts (10 register + 5): ' + r.me.points);

// stars + best
env.sheets['Answers'].data[1][8] = 4; env.sheets['Answers'].data[1][9] = true;
r = get(kasun.token);
ok(r.me.points === 10 + 5 + 16 + 50 + 2 + 10, 'kasun points = register10 + answer5 + stars16 + best50 + 2 visits + 1 join(10) => ' + r.me.points);
ok(r.me.visits === 2 && r.me.joins === 1, 'Nimali (registered before click) = visit only; guest who registered after = visit + join');
ok(r.top[0].name === 'Kasun P.', 'short name on leaderboard: ' + r.top[0].name);
env.sheets['Answers'].data[1][8] = 0;
r = get(kasun.token);
ok(r.me.points === 22, 'spam (0 stars) => register + invite points: ' + r.me.points);
ok(r.unis[0].uni === 'University Of Ruhuna', 'university ranking');
// not-registered answer → university points only after ⭐1+
post({ a: 'answer', phone: '0701112233', email: 'g2@example.com', name: 'Guest Two', uni: 'University Of Kelaniya', qid: '1', text: 'Community solar farms owned by villages.' });
r = get('');
ok(!r.unis.some(u => u.uni === 'University Of Kelaniya'), 'unrated guest answer: no university points');
const gi = env.sheets['Answers'].data.findIndex(x => x[5] === 'Guest Two');
env.sheets['Answers'].data[gi][8] = 3;
r = get('');
const kel = r.unis.find(u => u.uni === 'University Of Kelaniya');
ok(kel && kel.points === 5 + 12 && kel.students === 0, 'rated guest answer (⭐3): university gets 17 pts');
ok(!r.top.some(x => x.name.startsWith('Guest T')), 'guest still not on student leaderboard');
env.sheets['Answers'].data[gi][8] = 0;
r = get('');
ok(!(r.unis.find(u => u.uni === 'University Of Kelaniya') || {}).points, 'guest spam (⭐0): no university points');

// ---- question types: poll + ask ----
const Qs = env.sheets['Questions'].data;
ok(Qs[0].slice(6, 9).join(',') === 'Type,Options,Correct', 'Questions tab has Type/Options/Correct columns');
Qs.push([10, 1, 'Which source made most of our electricity in 2025?', true, '', '', 'poll', 'Hydro | Coal | Solar', 'Coal']);
Qs.push([11, 1, 'Poll without right answer', true, '', '', 'poll', 'Yes | No', '']);
Qs.push([12, 1, 'Ask the resource person', true, '', '', 'ask']);
Qs.push([13, 1, 'Broken poll (1 option)', true, '', '', 'poll', 'Only', '']);
r = get('');
const pq = r.questions.find(q => q.id === '10');
ok(pq && pq.type === 'poll' && pq.options.join(',') === 'Hydro,Coal,Solar', 'poll sent with options');
ok(!JSON.stringify(r.questions).includes('"correct"'), 'right answer NOT sent to the site');
ok(!r.questions.find(q => q.id === '13'), 'poll with <2 options hidden');
ok(r.questions.find(q => q.id === '1').type === 'opinion', 'empty Type = opinion');
const amal = M.list.find(m => m.name === 'Amal Fernando');
let base = get(amal.token).me.points;
ok(base === 10, 'registered, nothing done = 10: ' + base);
r = post({ a: 'answer', t: amal.token, qid: '10', text: 'Wind' });
ok(!r.ok, 'poll: answer not in options rejected');
r = post({ a: 'answer', t: amal.token, qid: '10', text: 'hydro' });
ok(r.ok && r.correct === 'Coal' && get(amal.token).me.points === 12, 'poll wrong answer = +2, right answer sent back at once');
r = post({ a: 'answer', t: amal.token, qid: '10', text: 'Coal' });
ok(!r.ok && r.locked && r.answer === 'Hydro' && get(amal.token).me.points === 12, 'quiz answer LOCKED: cannot change to the right one');
ok(env.sheets['Answers'].data.filter(x => x[3] === amal.token && String(x[2]) === '10').length === 1, 'still one row');
ok(get(amal.token).myResults['10'] === 'Coal' && get('').myResults && !Object.keys(get('').myResults).length, 'right answer only for people who answered');
ok(!get(amal.token).myResults['11'], 'no right answer for unanswered poll');
Qs[Qs.length - 4][8] = 3;   // team writes Correct as a number
ok(get(amal.token).me.points === 12, 'Correct as number (3 = Solar) works');
Qs[Qs.length - 4][8] = 'Coal';
post({ a: 'answer', t: amal.token, qid: '11', text: 'Yes' });
ok(get(amal.token).me.points === 14, 'poll with no right answer = +2 only');
r = post({ a: 'answer', t: amal.token, qid: '11', text: 'No' });
ok(r.locked && r.correct === '', 'no-answer poll also locked, no correct sent');
r = post({ a: 'answer', t: amal.token, qid: '12', text: 'short' });
ok(!r.ok, 'ask: too short rejected');
r = post({ a: 'answer', t: amal.token, qid: '12', text: 'How will EGL buy solar power?' });
ok(r.ok && get(amal.token).me.points === 17, 'ask = +3');
r = post({ a: 'answer', t: amal.token, qid: '12', text: 'How will EGL buy rooftop solar power?' });
ok(r.ok && !('correct' in r), 'ask can still be edited');
const ai = env.sheets['Answers'].data.findIndex(x => x[3] === amal.token && String(x[2]) === '12');
ok(env.sheets['Answers'].data[ai][10] === 'ask', 'Answers row has Type = ask');
env.sheets['Answers'].data[ai][9] = true;
ok(get(amal.token).me.points === 37, 'ask picked for webinar = +20');
env.sheets['Answers'].data[ai][8] = 0;
ok(get(amal.token).me.points === 14, 'ask marked spam (0 stars) = 0');
r = get('');
ok(r.top.every(x => x.points > 10), 'leaderboard only shows people who did something');
const rua = r.unis.find(u => u.uni === 'University Of Ruhuna');
ok(rua.points >= 20 && rua.students === 2, 'university total includes register points of each student: ' + rua.points);

// ---- speed cache ----
get('');
Qs.push([20, 1, 'Cached?', true, '', '', 'opinion']);
ok(!getCached('').questions.find(q => q.id === '20'), 'cache: sheet edit not seen within the cache time');
post({ a: 'answer', t: amal.token, qid: '1', text: 'A long enough opinion for the cache test.' });
ok(getCached('').questions.find(q => q.id === '20'), 'cache: cleared after a new answer');
ok(getCached(amal.token).me.points === 19, 'own points fresh right after answering: ' + getCached(amal.token).me.points);
ok(!JSON.stringify(getCached('')).includes(amal.token), 'tokens never sent to other visitors');
Qs.pop();

// ---- correct poll answer shown after the poll closes (only if SHOW_POLL_ANSWER_DAYS > 0) ----
require('vm').runInContext('CONFIG.SHOW_POLL_ANSWER_DAYS = 3', g);
Qs.push([21, 1, 'Closed poll', true, new Date(now - 5 * H), new Date(now - H), 'poll', 'A | B', 'B']);
Qs.push([22, 1, 'Closed poll no answer', true, new Date(now - 5 * H), new Date(now - H), 'poll', 'A | B', '']);
Qs.push([23, 1, 'Old closed poll', true, new Date(now - 10 * 24 * H), new Date(now - 9 * 24 * H), 'poll', 'A | B', 'A']);
r = get('');
ok(r.closedPolls.length === 1 && r.closedPolls[0].id === '21' && r.closedPolls[0].correct === 'B', 'closed poll with Correct shown (not open, not old, not without answer)');
ok(!r.questions.find(q => q.id === '21'), 'closed poll no longer answerable');

// registrants + emails
const W = () => env.sheets['Registrants'].data;
ok(W().length === 4 && W()[1][0] === 'PP2-001' && W()[3][0] === 'PP2-003', 'setup synced existing registrants with IDs: ' + W().slice(1).map(r => r[0]).join(','));
ok(String(W()[1][7]).startsWith('https://wa.me/94771234567?text='), 'one-tap WhatsApp link');
ok(decodeURIComponent(W()[1][7]).includes('/?t=' + kasun.token), 'WhatsApp text has personal link');
g.syncRegistrants();
ok(W().length === 5 && W()[4][0] === 'PP2-004', 'guest who registered later added as PP2-004');
g.sendWelcomeToAll();
ok(env.mail.length === 0 && W().slice(1).every(r => !r[6]), 'SEND_EMAILS false: nothing sent');
g.onFormSubmit({ namedValues: { 'WhatsApp / Mobile Number': ['0771234567'] } });
ok(env.mail.length === 0, 'SEND_EMAILS false: form submit sends nothing');
g.sendTestEmailToMe();
ok(env.mail.length === 1 && env.mail[0].to === 'me@example.com' && env.mail[0].subject.startsWith('[TEST]'), 'test email only to me');
env.mail.length = 0;
require('vm').runInContext('CONFIG.SEND_EMAILS = true', g);
g.sendWelcomeToAll();
ok(env.mail.length === 4 && W().slice(1).every(r => r[6]), 'welcome email to all 4, Email sent filled: ' + env.mail.length);
g.sendWelcomeToAll();
ok(env.mail.length === 4, 'no duplicate emails on re-run');
ok(env.mail[0].htmlBody.includes('/?t=' + kasun.token), 'email has personal link');
env.sheets['Form Responses 1'].data.push([new Date(), 'new@example.com', 'New One', 'new@example.com', '0712223333', 'University Of Peradeniya', 'No', 'Friend', '']);
g.onFormSubmit({ namedValues: { 'WhatsApp / Mobile Number': ['0712223333'] } });
ok(env.mail.length === 5 && W()[5][0] === 'PP2-005' && W()[5][6], 'form submit => new row PP2-005 + auto email');
console.log('WhatsApp link length:', W()[1][7].length);
require('vm').runInContext('CONFIG.TOP_STUDENTS = 1', g);
const tb = get('');
ok(tb.top.length === 1, 'leaderboard shows only TOP_STUDENTS students: ' + tb.top.length);
ok(tb.unis.length >= 2, 'universities: all shown');
require('vm').runInContext('CONFIG.TOP_STUDENTS = 10', g);
