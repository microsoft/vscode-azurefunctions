import fs from 'fs/promises';
import path from 'path';

const readmePath = path.join(process.cwd(), 'README.md');
const contents = await fs.readFile(readmePath, 'utf8');
const updated = contents.replace(/<!-- region exclude-from-marketplace -->.*?<!-- endregion exclude-from-marketplace -->/gis, '');

if (updated !== contents) {
    await fs.writeFile(readmePath, updated, 'utf8');
}
