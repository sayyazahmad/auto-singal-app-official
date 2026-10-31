const fs = require('fs');
let html = fs.readFileSync('app.html', 'utf8');
const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (match) {
    fs.writeFileSync('temp.js', match[1]);
}
