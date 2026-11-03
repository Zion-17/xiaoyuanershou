// 静态检查：相对 require 目标是否存在、app.json 页面四件套是否齐全
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let problems = 0;

const walk = dir => {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.' || name === '..') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
};

for (const file of walk(root)) {
  const code = fs.readFileSync(file, 'utf8');
  const re = /require\(['"](\.[^'"]+)['"]\)/g;
  let m;
  while ((m = re.exec(code))) {
    const target = path.resolve(path.dirname(file), m[1]);
    const ok = fs.existsSync(target) || fs.existsSync(target + '.js') || fs.existsSync(path.join(target, 'index.js'));
    if (!ok) {
      console.log('MISSING REQUIRE', path.relative(root, file), '->', m[1]);
      problems++;
    }
  }
}

const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
for (const page of app.pages) {
  for (const ext of ['.js', '.wxml', '.json', '.wxss']) {
    if (!fs.existsSync(path.join(root, page + ext))) {
      console.log('MISSING PAGE FILE', page + ext);
      problems++;
    }
  }
}

console.log(problems ? problems + ' problem(s)' : 'REFS OK');
process.exit(problems ? 1 : 0);
