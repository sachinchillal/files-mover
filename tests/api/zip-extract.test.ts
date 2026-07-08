import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { app } from '../../src/index';
import { API_BASE_URL, SOURCE_TEST_DIR, DESTINATION_TEST_DIR } from '../data/constants';
import { withPairBody, writeTestSettings } from '../utils/settings';

const resetDir = (dirPath: string): void => {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
};

const createZip = (zipPath: string, entries: Record<string, string>): void => {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(content, 'utf8'));
  }
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  zip.writeZip(zipPath);
};

describe(`POST ${API_BASE_URL}zip/extract`, () => {
  beforeEach(() => {
    resetDir(SOURCE_TEST_DIR);
    resetDir(DESTINATION_TEST_DIR);
    writeTestSettings(SOURCE_TEST_DIR, DESTINATION_TEST_DIR);
  });

  it('extracts a zip into the same folder as the archive', async () => {
    createZip(path.join(SOURCE_TEST_DIR, 'archives', 'test.zip'), {
      'inner/file.txt': 'hello zip',
      'inner/nested/readme.md': '# nested',
    });
    fs.writeFileSync(path.join(SOURCE_TEST_DIR, 'archives', 'readme.txt'), 'plain file', 'utf8');

    const res = await request(app)
      .post(`${API_BASE_URL}zip/extract`)
      .send(withPairBody({ file: 'archives/test.zip' }));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('');
    expect(res.body.file).toBe('archives/test.zip');
    expect(res.body.extractedTo).toBe('archives');
    expect(res.body.extractedFiles).toBe(2);

    expect(fs.readFileSync(path.join(SOURCE_TEST_DIR, 'archives', 'inner', 'file.txt'), 'utf8')).toBe(
      'hello zip'
    );
    expect(
      fs.readFileSync(path.join(SOURCE_TEST_DIR, 'archives', 'inner', 'nested', 'readme.md'), 'utf8')
    ).toBe('# nested');
    expect(fs.existsSync(path.join(SOURCE_TEST_DIR, 'archives', 'test.zip'))).toBe(true);
  });

  it('returns 404 when zip file is missing', async () => {
    const res = await request(app)
      .post(`${API_BASE_URL}zip/extract`)
      .send(withPairBody({ file: 'missing/archive.zip' }));

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Source not found');
  });

  it('returns 400 for a non-zip file', async () => {
    fs.writeFileSync(path.join(SOURCE_TEST_DIR, 'notes.txt'), 'not a zip', 'utf8');

    const res = await request(app)
      .post(`${API_BASE_URL}zip/extract`)
      .send(withPairBody({ file: 'notes.txt' }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Not a zip file');
  });

  it('returns 400 for path traversal', async () => {
    const res = await request(app)
      .post(`${API_BASE_URL}zip/extract`)
      .send(withPairBody({ file: '../outside.zip' }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Incorrect path');
  });

  it('returns 404 for an invalid pair id', async () => {
    const res = await request(app)
      .post(`${API_BASE_URL}zip/extract`)
      .send({ pairId: 'missing-pair', file: 'archive.zip' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Directory pair not found');
  });

  it('returns 400 when zip contains a zip-slip entry', async () => {
    const fixturePath = path.join(__dirname, '../data/zip-slip.zip');
    fs.copyFileSync(fixturePath, path.join(SOURCE_TEST_DIR, 'unsafe.zip'));

    const res = await request(app)
      .post(`${API_BASE_URL}zip/extract`)
      .send(withPairBody({ file: 'unsafe.zip' }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid zip entry path');
    expect(fs.existsSync(path.join(SOURCE_TEST_DIR, 'escape.txt'))).toBe(false);
    expect(fs.existsSync(path.join(path.dirname(SOURCE_TEST_DIR), 'escape.txt'))).toBe(false);
  });

  it('returns 400 when no zip file is provided', async () => {
    const res = await request(app).post(`${API_BASE_URL}zip/extract`).send(withPairBody({ file: '  ' }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('No zip file selected');
  });

  it('renames a single root folder when renameFolder is provided', async () => {
    createZip(path.join(SOURCE_TEST_DIR, 'archives', 'test.zip'), {
      'inner/file.txt': 'hello zip',
      'inner/nested/readme.md': '# nested',
    });

    const res = await request(app)
      .post(`${API_BASE_URL}zip/extract`)
      .send(withPairBody({ file: 'archives/test.zip', renameFolder: 'output' }));

    expect(res.status).toBe(200);
    expect(res.body.renamedFolder).toBe('output');
    expect(res.body.renameMode).toBe('replace');
    expect(fs.existsSync(path.join(SOURCE_TEST_DIR, 'archives', 'inner'))).toBe(false);
    expect(fs.readFileSync(path.join(SOURCE_TEST_DIR, 'archives', 'output', 'file.txt'), 'utf8')).toBe(
      'hello zip'
    );
    expect(
      fs.readFileSync(path.join(SOURCE_TEST_DIR, 'archives', 'output', 'nested', 'readme.md'), 'utf8')
    ).toBe('# nested');
  });

  it('wraps loose files when renameFolder is provided', async () => {
    createZip(path.join(SOURCE_TEST_DIR, 'flat.zip'), {
      'readme.txt': 'plain',
      'notes.md': '# notes',
    });

    const res = await request(app)
      .post(`${API_BASE_URL}zip/extract`)
      .send(withPairBody({ file: 'flat.zip', renameFolder: 'bundle' }));

    expect(res.status).toBe(200);
    expect(res.body.renamedFolder).toBe('bundle');
    expect(res.body.renameMode).toBe('wrap');
    expect(fs.readFileSync(path.join(SOURCE_TEST_DIR, 'bundle', 'readme.txt'), 'utf8')).toBe('plain');
    expect(fs.readFileSync(path.join(SOURCE_TEST_DIR, 'bundle', 'notes.md'), 'utf8')).toBe('# notes');
  });

  it('wraps multiple root folders when renameFolder is provided', async () => {
    createZip(path.join(SOURCE_TEST_DIR, 'multi.zip'), {
      'alpha/a.txt': 'alpha',
      'beta/b.txt': 'beta',
    });

    const res = await request(app)
      .post(`${API_BASE_URL}zip/extract`)
      .send(withPairBody({ file: 'multi.zip', renameFolder: 'bundle' }));

    expect(res.status).toBe(200);
    expect(res.body.renameMode).toBe('wrap');
    expect(fs.readFileSync(path.join(SOURCE_TEST_DIR, 'bundle', 'alpha', 'a.txt'), 'utf8')).toBe('alpha');
    expect(fs.readFileSync(path.join(SOURCE_TEST_DIR, 'bundle', 'beta', 'b.txt'), 'utf8')).toBe('beta');
  });

  it('returns 400 for an invalid rename folder name', async () => {
    createZip(path.join(SOURCE_TEST_DIR, 'test.zip'), {
      'inner/file.txt': 'hello',
    });

    const res = await request(app)
      .post(`${API_BASE_URL}zip/extract`)
      .send(withPairBody({ file: 'test.zip', renameFolder: 'bad/name' }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid folder name');
  });

  it('returns 400 when the target rename folder already exists', async () => {
    createZip(path.join(SOURCE_TEST_DIR, 'test.zip'), {
      'inner/file.txt': 'hello',
    });
    fs.mkdirSync(path.join(SOURCE_TEST_DIR, 'output'), { recursive: true });

    const res = await request(app)
      .post(`${API_BASE_URL}zip/extract`)
      .send(withPairBody({ file: 'test.zip', renameFolder: 'output' }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Folder already exists');
  });
});
