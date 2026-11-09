// PNG-Icons aus logo.svg rendern (headless Edge): node scripts/render-icons.js
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(f => fs.existsSync(f));
const svg = fs.readFileSync(path.join(root, 'logo.svg'), 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-icons-'));
for (const [name, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180], ['favicon-32.png', 32]]) {
  const html = path.join(tmp, 'i.html');
  fs.writeFileSync(html, `<!doctype html><style>html,body{margin:0;background:#000;overflow:hidden}svg{display:block;width:512px;height:512px}</style>${svg}`);
  execFileSync(edge, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=' + size / 512, '--window-size=512,512',
    '--screenshot=' + path.join(root, name), 'file:///' + html.split(path.sep).join('/')], { stdio: 'ignore' });
  console.log(name);
}
