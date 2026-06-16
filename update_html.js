const fs = require('fs');
const path = require('path');
const dir = './frontend/public';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace <title>...
  content = content.replace(/<title>.*<\/title>/g, '<title>Octocraft</title>\n    <link rel="icon" href="images/logo.png" type="image/png">');
  
  fs.writeFileSync(filePath, content);
  console.log(`Updated ${file}`);
});
