import fs from 'fs';
const p='tests/evals/runner.test.ts';
let c=fs.readFileSync(p,'utf8').replace(/\r?\n$/, '\n');
fs.writeFileSync(p,c,'utf8');
console.log('eof-fixed');
