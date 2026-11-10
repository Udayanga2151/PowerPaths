const { load } = require('./mock-gas');
const vm = require('vm');
const env = load(require('./seed')());
env.ctx.setup();
const m = { name: 'Kasun Perera', token: 'abcd1234xy', emails: ['x'] };
vm.runInContext("CONFIG.COMMUNITY_URL='https://chat.whatsapp.com/your-community'", env.ctx);
const html = env.ctx.welcomeHtml_(m), text = env.ctx.welcomeText_(m);
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 420, height: 600 }, deviceScaleFactor: 2 });
  await p.setContent(`<body style="margin:0;background:#f2f2f2;padding:16px;font-family:Arial">
   <div style="background:#fff;border-radius:10px;padding:12px;margin-bottom:12px;font-size:13px;color:#333">
   <b>From:</b> PowerPaths 2.0<br><b>Subject:</b> ⚡ Welcome to PowerPaths 2.0 · your personal link</div>${html}</body>`);
  await p.screenshot({ path: '/mnt/project-files/powerpaths-site/preview-email.png', fullPage: true });
  const esc = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\*(.+?)\*/g,'<b>$1</b>').replace(/_(.+?)_/g,'<i>$1</i>').replace(/\n/g,'<br>');
  await p.setViewportSize({ width: 420, height: 700 });
  await p.setContent(`<body style="margin:0;background:#efe7dd;padding:16px;font-family:Arial">
   <div style="background:#d9fdd3;border-radius:10px;padding:0;max-width:340px;margin-left:auto;font-size:14px;color:#111;overflow:hidden;box-shadow:0 1px 1px rgba(0,0,0,.15)">
   <div style="background:#c5ecbf;margin:4px;border-radius:8px;overflow:hidden"><img src="data:image/png;base64,${require("fs").readFileSync("/home/user/pp2/public/og.png").toString("base64")}" style="width:100%;display:block">
   <div style="padding:6px 8px;font-size:12px"><b>PowerPaths 2.0 · Webinar Series</b><br><span style="color:#555">Answer the daily question, share your ideas with industry experts and climb the leaderboard. ⚡</span><br><span style="color:#777">powerpaths.pages.dev</span></div></div>
   <div style="padding:6px 10px 10px">${esc}</div></div></body>`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: '/mnt/project-files/powerpaths-site/preview-whatsapp.png', fullPage: true });
  await b.close();
})();
