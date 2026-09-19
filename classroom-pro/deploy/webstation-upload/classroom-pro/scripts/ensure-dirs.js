import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = process.env.DATA_DIR || path.join(root, 'server', 'data');
fs.mkdirSync(data, { recursive: true });
console.log('data dir ready:', data);
