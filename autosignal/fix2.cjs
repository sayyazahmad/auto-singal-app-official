const fs = require('fs');
['app.html', 'app.js', 'app.css', 'index.html'].forEach(f => {
  try {
    let c = fs.readFileSync(f, 'utf8');
    let o = c;
    c = c.replace(/Ã¢â€ â‚¬/g, '─');
    c = c.replace(/Ã¢â‚¬â€ /g, '— ');
    c = c.replace(/Ã¢â‚¬â€/g, '—');
    c = c.replace(/Ã‚Â·/g, '·');
    c = c.replace(/Ã¢Å“â€œ/g, '✓');
    c = c.replace(/Ã¢â€ â€™/g, '→');
    c = c.replace(/Ã¢â‚¬Â¢/g, '•');
    if(c !== o) {
      fs.writeFileSync(f, c);
      console.log('Fixed', f);
    }
  } catch(e){}
});
