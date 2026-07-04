import path from 'path';
import fs from 'fs';

export const API_BASE_URL = '/api/';

export const SOURCE_TEST_DIR = path.join(__dirname, '../source');
export const DESTINATION_TEST_DIR = path.join(__dirname, '../destination');

for (const dir of [SOURCE_TEST_DIR, DESTINATION_TEST_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
