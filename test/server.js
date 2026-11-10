// Local test server: serves ../public and runs Code.gs (mocked) at /exec
const http = require('http'), fs = require('fs'), path = require('path');
const { load } = require('./mock-gas');
const env = load(require('./seed')());
env.ctx.setup();
env.sheets['Questions'].data.push([1, 1, 'Sri Lanka wants 70% renewable electricity. What creative idea would help us get there faster?', true, '', '', 'opinion']);
env.sheets['Questions'].data.push([2, 1, 'Which source generated the most electricity in Sri Lanka in 2025?', true, '', '', 'poll', 'Hydro | Coal | Solar | Wind', 'Coal']);
env.sheets['Questions'].data.push([3, 1, 'What would you like to ask the resource person about Electricity Generation Lanka?', true, '', '', 'ask']);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/exec') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const out = req.method === 'POST' ? env.ctx.doPost({ postData: { contents: body } }) : env.ctx.doGet({ parameter: Object.fromEntries(u.searchParams) });
      setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(out.body); }, 300);
    });
    return;
  }
  if (u.pathname === '/config.js') {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    return res.end(`window.PP={SCRIPT_URL:"/exec",FORM_URL:"https://docs.google.com/forms/d/e/TEST/viewform",COMMUNITY_URL:"https://chat.whatsapp.com/TEST"}`);
  }
  if (u.pathname === '/__state') { res.writeHead(200); return res.end(JSON.stringify({ answers: env.sheets['Answers'].data, visits: env.sheets['Visits'].data, tokens: env.ctx.members_().list.map(m => [m.name, m.token, m.ref]) })); }
  const f = path.join(__dirname, '../public', u.pathname === '/' ? 'index.html' : u.pathname);
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(data);
  });
}).listen(8899, () => console.log('http://localhost:8899'));
