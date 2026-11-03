// 静态检查：WXML 里绑定的事件处理函数是否在对应页面 JS 中存在
const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, '..', 'pages');
let problems = 0;

for (const page of fs.readdirSync(pagesDir)) {
  const dir = path.join(pagesDir, page);
  if (!fs.statSync(dir).isDirectory()) continue;
  const wxml = path.join(dir, page + '.wxml');
  const js = path.join(dir, page + '.js');
  if (!fs.existsSync(wxml) || !fs.existsSync(js)) {
    console.log('MISSING FILE', page);
    problems++;
    continue;
  }
  const tpl = fs.readFileSync(wxml, 'utf8');
  const code = fs.readFileSync(js, 'utf8');
  const handlers = new Set();
  const re = /(?:bind|catch)(?:tap|input|change|confirm|longpress|blur|focus)="([A-Za-z0-9_]+)"/g;
  let m;
  while ((m = re.exec(tpl))) handlers.add(m[1]);

  for (const h of handlers) {
    if (!new RegExp('(^|\\s)' + h + '\\s*[(:]').test(code)) {
      console.log('MISSING HANDLER', page + ':', h);
      problems++;
    }
  }
}

console.log(problems ? problems + ' problem(s)' : 'BINDINGS OK');
process.exit(problems ? 1 : 0);
