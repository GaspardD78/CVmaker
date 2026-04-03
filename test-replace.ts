import { readFileSync } from 'fs';

let content = readFileSync('resume-forge/src/lib/export-pdf.ts', 'utf-8');
console.log(content.includes('resolveOklchColors'));
