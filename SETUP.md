# PowerPaths 2.0 · Setup guide (විනාඩි 30ක් විතර)

Folder එකේ තියෙන්නේ:
- `apps-script/Code.gs`: Google Sheet එකට දාන backend එක
- `public/`: Cloudflare Pages එකට දාන website එක
- `test/`: local testing (deploy කරන්න ඕන නෑ)

---

## 1. Apps Script backend එක (විනාඩි 10)
1. Form එකේ **Responses → Link to Sheets** කරලා තියෙන Sheet එක open කරන්න
2. **Extensions → Apps Script** → තියෙන code එක මකලා `Code.gs` එකේ ඔක්කොම paste කරන්න
3. උඩම තියෙන `CONFIG` එකේ:
   - `COMMUNITY_URL`: WhatsApp community invite link එක
   - `SITE_URL`: දැනට එහෙමම තියන්න, step 2ට පස්සේ හරි link එක දාන්න
   - Column names (`'Name'`, `'WhatsApp / Mobile Number'`...) Sheet එකේ headers එක්ක **හරියටම** ගැළපෙනවද බලන්න
4. 💾 Save → උඩ function list එකෙන් **`setup`** තෝරලා ▶ **Run**
   - Permission ඉල්ලයි → ඔයාගේ account එක → **Advanced → Go to (unsafe)** → Allow (ඔයාගේම script එක නිසා ඒක ආරක්ෂිතයි)
   - දැන් Sheet එකේ **Questions**, **Answers**, **Registrants**, **Visits** tabs හැදිලා, දැනට ඉන්න හැමෝටම **PP2-001...** IDs ලැබිලා තියෙයි ✅
5. **Deploy → New deployment** → ⚙️ → **Web app**
   - Execute as: **Me** · Who has access: **Anyone**
   - **Deploy** → **Web app URL** එක copy කරන්න (`.../exec` වලින් ඉවර වෙන එක)

## 2. Website එක (Cloudflare Pages, විනාඩි 10)
1. `public/config.js` open කරලා 3 දේ දාන්න: `SCRIPT_URL` (step 1.5), `FORM_URL` (form එකේ Send link එක), `COMMUNITY_URL`
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Upload assets**
   - Project name: **`powerpaths`** → `public` folder එක drag & drop කරන්න → **Deploy**
   - (Juice bar site එක වගේ GitHub එකෙනුත් කරන්න පුළුවන්: repo එකට push කරලා, Build output directory = `public`)
3. ඔයාගේ link එක: `https://powerpaths.pages.dev` (ඒ නම ගන්න බැරි වුණොත් වෙන නමක් එයි)
   - link එක වෙනස් නම්: `public/index.html` එකේ `og:image` එකේ link එකත් ඒකට වෙනස් කරලා ආයේ upload කරන්න
4. Apps Script එකේ `SITE_URL` එකට ඒ link එක දාලා Save → **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**
   (මේ විදිහට update කරාම URL එක වෙනස් වෙන්නේ නෑ)
5. Sheet එක refresh කරන්න → **⚡ PowerPaths → Rebuild WhatsApp links**

## ⚠️ Emails on/off switch (Chair approval එකට කලින්)
- Code.gs එකේ `SEND_EMAILS: false` තියෙනකම් **කාටවත් email එකක් යන්නේ නෑ** (form submit වුණත්, menu button එක ඔබුවත්). IDs සහ WhatsApp links හැදෙනවා.
- **⚡ PowerPaths → Send a test email to me (preview)**: email එක ඔයාට විතරක් යනවා (chair ට පෙන්නන්න).
- Approve වුණාම: `SEND_EMAILS: true` → Save → **Deploy → Manage deployments → Edit → New version** → ඊට පස්සේ පහළ step 3.

## 3. පළවෙනි දවසේ (approval එකෙන් පස්සේ)
- **⚡ PowerPaths → Send welcome email to everyone not emailed yet**: දැනට ඉන්න හැමෝටම email එක යනවා.
  (Gmail එකකින් දවසකට 100යි. ඉතුරු වුණොත් හෙට ආයේ run කරන්න.)
- **Registrants** tab එක → හැම row එකකම **📲 Send** tap කරන්න → WhatsApp open වෙනවා → Send → **Sent ✓** tick කරන්න (row එක කොළ පාට වෙනවා)
- මෙතැන් ඉඳන් form එක fill කරන හැම කෙනෙක්ම **ඉබේම** Registrants එකට ID එකක් එක්ක එකතු වෙනවා, email එකත් ඉබේම යනවා. Team එකට කරන්න තියෙන්නේ 📲 Send ඔබලා ✓ tick කරන එක විතරයි.

## 4. හැම දවසකම
- **Questions** tab: අලුත් row එකක් → `ID` (1, 2, 3...), `Webinar` (1), `Question`, **Active ✓**, `Opens`, `Closes` (ලංකා වෙලාව, cell එක double-click කරාම calendar එකක් එනවා)
  - Site එකේ පේන්නේ **Active ✓** + Opens වෙලාව පහු වෙලා + Closes වෙලාව තාම නැති ඒවා විතරයි → සතියේ questions ඔක්කොම අද්දම දාලා තියන්න පුළුවන්, ඒවා ඉබේම open/close වෙනවා
  - Opens/Closes හිස් නම් = සීමාවක් නෑ (Active ✓ තියෙනකම් පේනවා)
  - හදිස්සියේ නවත්තන්න ඕන නම්: Active untick
  - ⚠️ ID එකක් ආයේ පාවිච්චි කරන්න එපා
- **Answers** tab: `Stars` (0–5) දාන්න · **Best** ✓ = resource person තෝරපු එක · 0 = spam (points නෑ)
  - Filter: Data → Create a filter → Question ID / Stars → හොඳ ඒවා resource person ට යවන්න
  - කවුරු හරි answer එක edit කළොත් Stars ආයේ හිස් වෙනවා (ආයේ rate කරන්න)
- Community එකට flyer එක + `https://powerpaths.pages.dev` link එක post කරන්න

## Flyer එක WhatsApp එකේ පේන්න
`wa.me` links වලට image attach කරන්න බෑ. ඒත් message එකේ තියෙන site link එකේ **preview image එක** WhatsApp පෙන්නනවා.
ඔයාලගේ flyer එක **1200×630** size එකට export කරලා `public/og.png` වෙනුවට දාලා upload කළොත්, හැම message එකකම ඒ flyer එක පේනවා.

## Points (Code.gs → `CONFIG.POINTS`)
Answer 5 · ⭐ එකකට 4 · Best idea +50 · Invite link එක කෙනෙක් open කළාම 1 (phone එකකට එක පාරයි, තමන්ගේම click ගණන් නෑ) · ඒ කෙනා ඊට පස්සේ register වුණොත් +10 · Spam (0⭐) = 0

Register නොවුණ අයගේ answers: team එක ⭐1+ දුන්නාම ඒ points ඒ අය තෝරපු **university** එකට විතරක් යනවා (නම leaderboard එකේ නෑ).

**Visits** tab: invite link එකෙන් ආපු හැම phone එකක්ම (කාගේ link එකද, පස්සේ හඳුනගත්තද). අතින් වෙනස් කරන්න ඕන නෑ.

## Local test (optional)
```
cd test && node unit.js        # backend tests
node server.js                 # http://localhost:8899 (fake data)
```
