// Compose generated product photography with the exact transparent brand logo.
// Run after copying the ten product cutouts to public/main-banners/generated/art.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'public/main-banners/generated');
const campaigns = [
  { key: 'home', category: 'HOME & EVERYDAY', line: 'Good finds. Everyday living.', cta: 'Shop home appliances', start: '#fffdf2', end: '#dceebc' },
  { key: 'bags', category: 'BAGS FOR EVERY DAY', line: 'Carry your everyday, beautifully.', cta: 'Explore bags', start: '#fffaf0', end: '#e8edcc' },
  { key: 'technology', category: 'COMPUTER & MOBILE ACCESSORIES', line: 'Work. Play. Stay connected.', cta: 'Explore accessories', start: '#f6fbf4', end: '#d8e8ce' },
  { key: 'health', category: 'SASSIEST · HEALTH CARE', line: 'A little care. A better everyday.', cta: 'Explore health care', start: '#fffaf0', end: '#e2edd8' },
  { key: 'kitchen', category: 'KITCHEN APPLIANCES', line: 'Cook better. Enjoy every day.', cta: 'Shop kitchen essentials', start: '#fffdf3', end: '#dcebbb' },
];
const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function build() {
  await fs.mkdir(target, { recursive: true });
  const logo = `data:image/png;base64,${(await fs.readFile(path.join(root, 'public/oweg_logo.png'))).toString('base64')}`;
  for (const c of campaigns) {
    for (const variant of ['desktop', 'mobile']) {
      const mobile = variant === 'mobile';
      const width = mobile ? 800 : 1920, height = mobile ? 400 : 360;
      const art = `data:image/webp;base64,${(await fs.readFile(path.join(target, 'art', `${c.key}-${variant}.webp`))).toString('base64')}`;
      const copy = mobile ? `
        <image href="${logo}" x="34" y="24" width="146" height="39"/>
        <text x="34" y="99" font-size="${c.key === 'technology' ? 16 : 21}" letter-spacing="1.3" font-weight="700">${escape(c.category)}</text>
        <text x="34" y="145" font-size="24" font-weight="600">UP TO</text>
        <text x="26" y="240" font-size="112" font-weight="800" letter-spacing="-5">80<tspan font-size="67" letter-spacing="-3">%</tspan></text>
        <text x="37" y="276" font-size="28" font-weight="700" letter-spacing="6">OFF</text>
        <text x="34" y="305" font-size="19" fill="#52644b">On selected products</text>
        <rect x="34" y="326" width="290" height="48" rx="24" fill="#ffcf42"/>
        <text x="57" y="357" font-size="${c.cta.length > 21 ? 19 : 21}" font-weight="700">${escape(c.cta)}</text>
        <path d="M296 344l7 7-7 7" fill="none" stroke="#143d29" stroke-width="3" stroke-linecap="round"/>
        <image href="${art}" x="349" y="73" width="440" height="303" preserveAspectRatio="xMidYMid meet"/>` : `
        <image href="${logo}" x="156" y="25" width="152" height="40"/>
        <text x="156" y="103" font-size="18" letter-spacing="3" font-weight="700">${escape(c.category)}</text>
        <text x="149" y="201" font-size="86" font-weight="800" letter-spacing="-3">UP TO 80<tspan font-size="65">%</tspan> OFF</text>
        <text x="156" y="242" font-size="23" fill="#52644b">${escape(c.line)}</text>
        <rect x="156" y="271" width="292" height="48" rx="24" fill="#ffcf42"/>
        <text x="180" y="302" font-size="20" font-weight="700">${escape(c.cta)}</text>
        <path d="M421 288l7 7-7 7" fill="none" stroke="#143d29" stroke-width="3" stroke-linecap="round"/>
        <text x="468" y="301" font-size="15" fill="#65765c">On selected products</text>
        <image href="${art}" x="805" y="9" width="1050" height="342" preserveAspectRatio="xMidYMid meet"/>`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <title>OWEG ${escape(c.category)} — up to 80% off selected products</title>
        <defs><linearGradient id="bg"><stop stop-color="${c.start}"/><stop offset="1" stop-color="${c.end}"/></linearGradient></defs>
        <rect width="100%" height="100%" fill="url(#bg)"/>
        <circle cx="${mobile ? 690 : 1520}" cy="${mobile ? 140 : 40}" r="${mobile ? 258 : 490}" fill="#91bd60" opacity=".13"/>
        <circle cx="${mobile ? 730 : 1770}" cy="${mobile ? 280 : 300}" r="${mobile ? 210 : 310}" fill="#f9d967" opacity=".24"/>
        <path d="M0 ${height-30}Q${width/2} ${height+50} ${width} ${height-65}V${height}H0Z" fill="#8fb65d" opacity=".1"/>
        <g fill="#143d29" font-family="Arial, sans-serif">${copy}</g>
      </svg>`;
      const base = path.join(target, `${c.key}-${variant}`);
      await fs.writeFile(`${base}.svg`, svg);
      // librsvg cannot decode embedded WebP; use lossless PNG for rasterization.
      const renderArt = `data:image/png;base64,${(await sharp(path.join(target, 'art', `${c.key}-${variant}.webp`)).png().toBuffer()).toString('base64')}`;
      await sharp(Buffer.from(svg.replace(art, renderArt))).webp({ quality: 90 }).toFile(`${base}.webp`);
      console.log(`${c.key}-${variant}: ${width}x${height}`);
    }
  }
}
build().catch(error => { console.error(error); process.exitCode = 1; });
