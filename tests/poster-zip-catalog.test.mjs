import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipPosterPackage, createCatalogOnlyManifest, posterIndexUpsertOptions, posterMimeType, createPosterUploadBlob } from '../src/lib/posterZip.js';

const crc32 = data => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

function makeStoredZip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30 + name.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    data.copy(local, 30 + name.length);
    locals.push(local);

    const directory = Buffer.alloc(46 + name.length);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0, 8);
    directory.writeUInt16LE(0, 10);
    directory.writeUInt16LE(0, 12);
    directory.writeUInt16LE(0, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt16LE(0, 30);
    directory.writeUInt16LE(0, 32);
    directory.writeUInt16LE(0, 34);
    directory.writeUInt16LE(0, 36);
    directory.writeUInt32LE(0, 38);
    directory.writeUInt32LE(offset, 42);
    name.copy(directory, 46);
    central.push(directory);
    offset += local.length;
  }

  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const centralOffset = offset;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...central, end]);
}

const asFile = (bytes, name = 'test.zip') => new File([bytes], name, { type: 'application/zip' });

test('image-only ZIP can be cataloged without linking any events', async () => {
  const repeated = Buffer.from('same poster bytes');
  const zip = makeStoredZip([
    { name: 'images/first.jpg', data: repeated },
    { name: 'images/second.jfif', data: repeated },
    { name: 'archive/images/third.webp', data: 'different poster bytes' }
  ]);
  const archive = await unzipPosterPackage(asFile(zip));
  const manifest = await createCatalogOnlyManifest(archive);

  assert.equal(manifest.catalog_only, true);
  assert.equal(manifest.matches.length, 0, 'catalog-only mode must never invent event matches');
  assert.equal(manifest.source_images, 3);
  assert.equal(manifest.posters.length, 2, 'byte-identical images should collapse into one unique catalog entry');
  assert.equal(manifest.unique_files, 2);
  assert.equal(manifest.matched_events, 0);
  assert.ok(manifest.posters.every(poster => /^[0-9a-f]{64}$/.test(poster.sha256)));
  assert.ok(manifest.posters.some(poster => poster.source_filenames.length === 2 && poster.is_duplicate));
});

test('manifest and images are found inside additional folders', async () => {
  const manifest = {
    version: 1,
    matches: [],
    posters: [],
    source_images: 1,
    unique_files: 1
  };
  const zip = makeStoredZip([
    { name: 'export/package/poster-import-manifest.json', data: JSON.stringify(manifest) },
    { name: 'export/package/images/poster.jpg', data: 'poster bytes' }
  ]);
  const archive = await unzipPosterPackage(asFile(zip));
  assert.ok(archive.has('poster-import-manifest.json'));
  assert.ok(archive.has('images/poster.jpg'));
  assert.equal(JSON.parse(await archive.get('poster-import-manifest.json').text()).version, 1);
});

test('nested ZIP containing only images is still recognized for cataloging', async () => {
  const inner = makeStoredZip([{ name: 'images/inside.jpg', data: 'nested poster' }]);
  const outer = makeStoredZip([{ name: 'downloaded-package.zip', data: inner }]);
  const archive = await unzipPosterPackage(asFile(outer, 'outer.zip'));
  assert.ok(archive.has('images/inside.jpg'));
  const manifest = await createCatalogOnlyManifest(archive);
  assert.equal(manifest.catalog_only, true);
  assert.equal(manifest.source_images, 1);
  assert.equal(manifest.posters.length, 1);
});

test('same image path from different folders does not overwrite the earlier file', async () => {
  const zip = makeStoredZip([
    { name: 'one/images/poster.jpg', data: 'first poster' },
    { name: 'two/images/poster.jpg', data: 'second poster' }
  ]);
  const archive = await unzipPosterPackage(asFile(zip));
  const imagePaths = [...archive.keys()].filter(name => name.startsWith('images/'));
  assert.equal(imagePaths.length, 2);
  assert.notEqual(await archive.get(imagePaths[0]).text(), await archive.get(imagePaths[1]).text());
});

test('corrupt ZIP fails with a readable error', async () => {
  await assert.rejects(
    unzipPosterPackage(asFile(Buffer.from('not a zip'))),
    /ZIP não tem um diretório válido/
  );
});


test('catalog-only index writes ignore existing SHA conflicts to preserve stored event links', () => {
  assert.deepEqual(
    posterIndexUpsertOptions(true),
    { onConflict: 'sha256', ignoreDuplicates: true }
  );
  assert.deepEqual(
    posterIndexUpsertOptions(false),
    { onConflict: 'sha256', ignoreDuplicates: false }
  );
});


test('ZIP-extracted Blob gets an explicit MIME type accepted by poster storage', () => {
  const source = new Blob([Buffer.from('poster bytes')]);
  assert.equal(source.type, '');

  const jpeg = createPosterUploadBlob(source, 'images/poster.JPEG');
  assert.equal(jpeg.type, 'image/jpeg');
  assert.equal(posterMimeType('images/poster.jfif'), 'image/jpeg');
  assert.equal(createPosterUploadBlob(source, 'images/poster.webp').type, 'image/webp');
  assert.equal(createPosterUploadBlob(source, 'images/poster.png').type, 'image/png');
  assert.equal(createPosterUploadBlob(source, 'images/poster.gif').type, 'image/gif');
  assert.throws(() => posterMimeType('images/poster.svg'), /Format|Formato/);
});


test('text reference files in the ZIP are retained for poster association recovery', async () => {
  const referenceText = 'Post: Ato pela democracia em Recife\\nImagem: https://pbs.twimg.com/media/EXAMPLE.jpg';
  const zip = makeStoredZip([
    { name: 'images/poster.jpg', data: 'poster bytes' },
    { name: 'Twitter X posts.txt', data: referenceText }
  ]);
  const archive = await unzipPosterPackage(asFile(zip));
  assert.ok(archive.has('images/poster.jpg'));
  assert.equal(await archive.get('__text__/Twitter X posts.txt').text(), referenceText);
  const manifest = await createCatalogOnlyManifest(archive);
  assert.equal(manifest.posters.length, 1, 'text references must not be counted as images');
});
