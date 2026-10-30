const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'public/main-banners/creative-v2');
const campaigns = [
  { key: 'home', eyebrow: 'THE HOME EDIT', lines: ['Big little', 'home upgrades.'], sub: 'Good finds for the way you live.', cta: 'Explore the home sale', bg: '#f1f4d6', ink: '#163f29', button: '#fbd141', buttonInk: '#163f29', font: 'Arial', size: 64 },
  { key: 'bags', eyebrow: 'BAGS FOR EVERY DAY', lines: ['Carry a little', 'more you.'], sub: 'From everyday errands to your next escape.', cta: 'Find your everyday bag', bg: '#f9eee0', ink: '#623c2d', button: '#633f2e', buttonInk: '#fff8ee', font: 'Georgia', size: 65, reverse: true },
  { key: 'technology', eyebrow: 'WORK / PLAY / EVERYDAY', lines: ['Plug into', 'possibilities.'], sub: 'Small tech. A world of possibilities.', cta: 'Upgrade your everyday', bg: '#061e30', ink: '#f4fbff', button: '#b9ed4c', buttonInk: '#092335', font: 'Arial', size: 64 },
  { key: 'health', eyebrow: 'SASSIEST · HEALTH CARE', lines: ['A moment,', 'just for you.'], sub: 'Make a little room for everyday care.', cta: 'Find your feel-good', bg: '#f6e8e5', ink: '#67464b', button: '#38594d', buttonInk: '#fff8f0', font: 'Georgia', size: 67 },
  { key: 'kitchen', eyebrow: 'THE JOY OF COOKING', lines: ['Good food.', 'Great company.'], sub: 'Bring something good to the table.', cta: 'Make room for flavour', bg: '#fff0bf', ink: '#354c28', button: '#315434', buttonInk: '#fff6d8', font: 'Georgia', size: 63 },
];
const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (x, y, size, content, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" ${extra}>${escape(content)}</text>`;

async function build() {
  const logo = `data:image/png;base64,${(await fs.readFile(path.join(root, 'public/oweg_logo.png'))).toString('base64')}`;
  for (const c of campaigns) for (const variant of ['desktop', 'mobile']) {
    const m = variant === 'mobile';
    const width = m ? 800 : 1920, height = m ? 400 : 360;
    const art = `data:image/jpeg;base64,${(await sharp(path.join(target, 'art', `${c.key}-${variant}.webp`)).jpeg({ quality: 93 }).toBuffer()).toString('base64')}`;
    const x = m ? (c.reverse ? 459 : 34) : (c.reverse ? 1275 : 156);
    const photo = m ? (c.reverse ? 'M0 0H421Q469 170 416 400H0Z' : 'M402 0H800V400H379Q450 205 402 0Z')
      : (c.reverse ? 'M0 0H1160L1090 360H0Z' : c.key === 'health' ? 'M920 0H1920V360H885Q968 160 920 0Z' : 'M840 0H1920V360H800Z');
    const imageX = c.reverse ? 0 : m ? 374 : 795;
    const imageWidth = m ? (c.reverse ? 469 : 426) : c.reverse ? 1160 : 1125;
    const photoMarkup = `<defs><clipPath id="photo"><path d="${photo}"/></clipPath></defs><image href="${art}" x="${imageX}" y="0" width="${imageWidth}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)"/>`;
    const f = m ? (c.key === 'technology' ? 47 : 48) : c.size;
    const weight = c.font === 'Georgia' ? 400 : 750;
    const ctaW = m ? 292 : 280, ctaY = m ? 319 : 280;
    let copy = `<image href="${logo}" x="${x}" y="${m ? 26 : 25}" width="${m ? 136 : 152}" height="${m ? 36 : 40}"/>`;
    copy += text(x, m ? 105 : 103, m ? (c.key === 'health' ? 15 : 17) : 15, c.eyebrow, `font-family="Arial" font-weight="700" letter-spacing="${m ? 1.1 : 2.8}" fill="${c.key === 'technology' ? '#bcf46d' : c.ink}"`);
    copy += text(x, m ? 170 : 165, f, c.lines[0], `font-family="${c.font}" font-weight="${weight}" letter-spacing="-2"`);
    copy += text(x, m ? 224 : 228, f, c.lines[1], `font-family="${c.font}" font-weight="${weight}" letter-spacing="-2"`);
    if (!m) copy += text(x, 261, 18, c.sub, 'font-family="Arial" opacity=".8"');
    else if (c.key !== 'home') copy += text(x, 263, c.reverse ? 15 : 17, c.key === 'technology' ? 'Connect. Create. Go further.' : c.key === 'bags' ? 'For wherever life takes you.' : c.key === 'health' ? 'Your everyday care ritual.' : 'Made for everyday cooking.', 'font-family="Arial" opacity=".85"');
    copy += `<rect x="${x}" y="${ctaY}" width="${ctaW}" height="48" rx="${c.key === 'technology' ? 8 : 24}" fill="${c.button}"/>`;
    copy += text(x + 22, ctaY + 30, m ? 19 : 18, c.cta, `font-family="Arial" font-weight="700" fill="${c.buttonInk}"`);
    copy += `<path d="M${x + ctaW-28} ${ctaY+17}l7 7-7 7" fill="none" stroke="${c.buttonInk}" stroke-width="2.5" stroke-linecap="round"/>`;
    if (c.key === 'home') copy += m
      ? `<rect x="${x}" y="249" width="270" height="47" rx="7" fill="#163f29"/>${text(x+15,279,23,'UP TO 80% OFF','font-family="Arial" font-weight="800" fill="#fbd141"')}`
      : `<g transform="rotate(9 716 123)"><path d="M650 58H786V182H650L632 120Z" fill="#fbd141"/>${text(666,91,16,'UP TO','font-family="Arial" font-weight="700"')}${text(655,139,47,'80%','font-family="Arial" font-weight="800"')}${text(677,164,18,'OFF','font-family="Arial" font-weight="700"')}</g>`;
    const decoration = c.key === 'technology'
      ? '<path d="M0 330L220 270H700M0 344L225 284H620" fill="none" stroke="#83d03d" stroke-opacity=".22" stroke-width="2"/>'
      : c.key === 'kitchen' ? `<path d="M${x} ${m ? 239 : 239}q95 -12 186 -2" fill="none" stroke="#cc633b" stroke-width="3"/>`
      : c.key === 'health' ? `<circle cx="${m ? 350 : 740}" cy="${m ? 350 : 190}" r="140" fill="#caa4aa" opacity=".13"/>` : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>OWEG ${escape(c.eyebrow)} — ${escape(c.lines.join(' '))}</title><rect width="100%" height="100%" fill="${c.bg}"/>${photoMarkup}${decoration}<g fill="${c.ink}">${copy}</g></svg>`;
    const filename = path.join(target, `${c.key}-${variant}`);
    await fs.writeFile(filename+'.svg', svg);
    await sharp(Buffer.from(svg)).webp({ quality: 91 }).toFile(filename+'.webp');
    console.log(`${c.key}-${variant} ${width}x${height}`);
  }
}
build().catch(e => { console.error(e); process.exitCode = 1; });
