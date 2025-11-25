const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, 'data.json');

try {
    const raw = fs.readFileSync(p, 'utf8'); // ensures UTF-8 reading
    const data = JSON.parse(raw);
    console.log('Loaded inventory items:', data.inventory.length);
    console.log(data.inventory);
} catch (err) {
    console.error('Error reading/parsing data.json:', err.message);
    process.exit(1);
}