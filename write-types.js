const fs = require('fs');
const types = require('./types-temp.json').types;
fs.writeFileSync('src/types/supabase.ts', types);
console.log('Types written successfully');
