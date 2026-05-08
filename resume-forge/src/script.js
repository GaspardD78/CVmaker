import fs from 'fs';
const path = 'c:/Users/Gaspard/Documents/CVmaker/tools/ID APEC/IDs APEC';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

let out = '';

out += '\nexport const APEC_FONCTIONS_HIERARCHY: ApecFonctionCategory[] = [\n';
data.fonctions.forEach(cat => {
  let catLabel = cat.label.split("'").join("\\'");
  out += '  {\n';
  out += '    label: \'' + catLabel + '\',\n';
  out += '    id: ' + cat.id + ',\n';
  out += '    children: [\n';
  
  if (cat.children) {
      cat.children.forEach(child => {
        if (child.children) {
            let childLabel = child.label.split("'").join("\\'");
            out += '      { label: \'' + childLabel + '\', id: ' + child.id + ' },\n';
            child.children.forEach(subchild => {
                let subchildLabel = subchild.label.split("'").join("\\'");
                out += '      { label: \'' + subchildLabel + '\', id: ' + subchild.id + ' },\n';
            });
        } else {
            let childLabel = child.label.split("'").join("\\'");
            out += '      { label: \'' + childLabel + '\', id: ' + child.id + ' },\n';
        }
      });
  }

  out += '    ],\n';
  out += '  },\n';
});
out += '];\n';

fs.writeFileSync('snippet.ts', out);
console.log('Done');
