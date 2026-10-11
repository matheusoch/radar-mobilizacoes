const hex = buffer => Array.from(new Uint8Array(buffer)).map(value => value.toString(16).padStart(2, '0')).join('');

export async function unzipPosterPackage(file, depth = 0) {
  if (depth > 2) throw new Error('O pacote contém mais de dois ZIPs aninhados. Extraia o ZIP interno e selecione-o diretamente.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const u16 = index => view.getUint16(index, true);
  const u32 = index => view.getUint32(index, true);
  const floor = Math.max(0, bytes.length - 65557);
  let end = -1;
  for (let index = bytes.length - 22; index >= floor; index--) {
    if (u32(index) === 0x06054b50) { end = index; break; }
  }
  if (end < 0) throw new Error('O ZIP não tem um diretório válido. Confira se o arquivo terminou de ser enviado.');
  const total = u16(end + 10);
  let position = u32(end + 16);
  const decoder = new TextDecoder();
  const files = new Map();
  if (total > 2000) throw new Error('O ZIP tem entradas demais.');

  for (let entry = 0; entry < total; entry++) {
    if (position + 46 > bytes.length || u32(position) !== 0x02014b50) {
      throw new Error('Diretório central do ZIP inválido ou arquivo incompleto.');
    }
    const flags = u16(position + 8);
    const method = u16(position + 10);
    const packed = u32(position + 20);
    const size = u32(position + 24);
    const nameLength = u16(position + 28);
    const extraLength = u16(position + 30);
    const commentLength = u16(position + 32);
    const local = u32(position + 42);
    const rawName = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength)).replace(/\\/g, '/');
    position += 46 + nameLength + extraLength + commentLength;
    if (!rawName || rawName.endsWith('/')) continue;

    const cleanName = rawName.replace(/^\.\//, '').replace(/^\/+/, '');
    const parts = cleanName.split('/').filter(Boolean);
    const basename = (parts[parts.length - 1] || '').toLowerCase();
    const isManifest = basename === 'poster-import-manifest.json';
    const imageMarker = parts.map(part => part.toLowerCase()).lastIndexOf('images');
    const isImage = /\.(jpe?g|jfif|png|webp|gif|avif|bmp|svg)$/i.test(basename);
    let name = '';
    if (isManifest) name = 'poster-import-manifest.json';
    else if (isImage) name = imageMarker >= 0 && imageMarker < parts.length - 1 ? 'images/' + parts.slice(imageMarker + 1).join('/') : 'images/' + parts[parts.length - 1];
    else if (basename.endsWith('.zip')) name = '__nested__/' + cleanName;
    else continue;

    if (name.startsWith('images/') && size > 8 * 1024 * 1024) throw new Error('Imagem acima de 8 MB no pacote: ' + name);
    if (name === 'poster-import-manifest.json' && size > 8 * 1024 * 1024) throw new Error('Manifesto acima de 8 MB no pacote.');
    if (name.startsWith('__nested__/') && size > 256 * 1024 * 1024) throw new Error('O ZIP interno excede o limite de 256 MB. Selecione o pacote completo diretamente.');
    if (flags & 1) throw new Error('O ZIP está protegido por senha: ' + name);
    if (local + 30 > bytes.length || u32(local) !== 0x04034b50) throw new Error('Cabeçalho de arquivo inválido: ' + name);

    const dataStart = local + 30 + u16(local + 26) + u16(local + 28);
    const raw = bytes.slice(dataStart, dataStart + packed);
    let blob;
    if (method === 0) blob = new Blob([raw]);
    else if (method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador não oferece descompactação ZIP compatível. Abra o painel no Chrome/Edge atualizado e use o pacote completo sem compressão.');
      try {
        blob = await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
      } catch {
        throw new Error('Não foi possível descompactar ' + name + '. Use o arquivo posters-index-complete.zip, preparado para evitar incompatibilidade de compactação.');
      }
    } else throw new Error('Método de compactação ZIP não suportado (' + method + ') em ' + name);

    if (blob.size !== size) throw new Error('Tamanho incorreto para ' + name);
    let storedName = name;
    if (name.startsWith('images/') && files.has(storedName)) {
      const relative = cleanName.split('/').filter(Boolean);
      const leaf = relative.pop() || 'poster.jpg';
      const parent = relative.filter(part => part.toLowerCase() !== 'images').join('__');
      const dot = leaf.lastIndexOf('.');
      const stem = dot > 0 ? leaf.slice(0, dot) : leaf;
      const ext = dot > 0 ? leaf.slice(dot) : '';
      const prefix = parent ? parent + '__' : '';
      let suffix = 2;
      storedName = 'images/' + prefix + stem + '__' + suffix + ext;
      while (files.has(storedName)) { suffix++; storedName = 'images/' + prefix + stem + '__' + suffix + ext; }
    }
    files.set(storedName, blob);
  }

  if (!files.has('poster-import-manifest.json')) {
    const nested = Array.from(files.entries()).filter(([name]) => name.startsWith('__nested__/'));
    let nestedImages = null;
    for (const [name, blob] of nested) {
      try {
        const inner = await unzipPosterPackage(new File([blob], name.split('/').pop() || 'poster-index.zip'), depth + 1);
        if (inner.has('poster-import-manifest.json')) return inner;
        if (Array.from(inner.keys()).some(key => key.startsWith('images/'))) nestedImages = inner;
      } catch (innerError) {
        if (depth >= 2) throw innerError;
      }
    }
    if (nestedImages) return nestedImages;
    if (Array.from(files.keys()).some(name => name.startsWith('images/'))) return files;
    const detected = Array.from(files.keys()).filter(name => !name.startsWith('__nested__/')).slice(0, 8).join(', ') || 'nenhum manifesto ou arquivo de imagem reconhecido';
    const nestedHint = nested.length ? ' Foi encontrado um ZIP interno, mas ele também não apresentou um manifesto válido.' : '';
    throw new Error('Não consegui localizar poster-import-manifest.json e não encontrei imagens importáveis. Entradas reconhecidas: ' + detected + '. Selecione o pacote de índice ou um ZIP contendo imagens.' + nestedHint);
  }
  return files;
}

export async function createCatalogOnlyManifest(archive) {
  const imageEntries = Array.from(archive.entries()).filter(([path, blob]) => path.startsWith('images/') && blob.size > 0);
  if (!imageEntries.length) throw new Error('O ZIP não contém manifesto nem imagens compatíveis para catalogar.');
  const byHash = new Map();
  for (let index = 0; index < imageEntries.length; index++) {
    const [file, blob] = imageEntries[index];
    const sha256 = hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
    const filename = file.split('/').pop() || file;
    const current = byHash.get(sha256);
    if (current) {
      current.source_indices.push(index + 1);
      current.source_filenames.push(filename);
      current.duplicate_indices.push(index + 1);
      current.is_duplicate = true;
    } else {
      byHash.set(sha256, {
        sha256, file, source_index: index + 1, source_filename: filename,
        source_indices: [index + 1], source_filenames: [filename], bytes: blob.size,
        width: null, height: null, duplicate_indices: [], is_duplicate: false, event_count_matched: 0
      });
    }
  }
  const posters = Array.from(byHash.values());
  return {
    version: 2, matches: [], posters, source_images: imageEntries.length,
    unique_files: posters.length, matched_events: 0, catalog_only: true,
    note: 'ZIP sem manifesto: catalogação de imagens sem associações automáticas a eventos.'
  };
}

/**
 * In catalog-only mode the ZIP has no trustworthy event associations.
 * Ignore SHA conflicts so cataloging cannot clear an existing poster_index
 * row's matched_event_ids or overwrite metadata attached to an already-linked poster.
 */
export function posterIndexUpsertOptions(catalogOnly = false) {
  return { onConflict: 'sha256', ignoreDuplicates: catalogOnly === true };
}
