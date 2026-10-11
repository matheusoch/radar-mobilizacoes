export type PosterZipPoster = {
  sha256: string;
  file: string;
  source_index: number;
  source_filename: string;
  source_indices: number[];
  source_filenames: string[];
  bytes: number;
  width: number | null;
  height: number | null;
  duplicate_indices: number[];
  is_duplicate: boolean;
  event_count_matched: number;
};

export type PosterZipManifest = {
  version: number;
  matches: Array<{
    event_id: string;
    file: string;
    sha256: string;
    source_index: number;
    source_filename: string;
    reason: string;
    confidence: string;
  }>;
  posters: PosterZipPoster[];
  source_images: number;
  unique_files: number;
  matched_events: number;
  catalog_only: boolean;
  note: string;
};

export function unzipPosterPackage(file: File, depth?: number): Promise<Map<string, Blob>>;
export function createCatalogOnlyManifest(archive: Map<string, Blob>): Promise<PosterZipManifest>;
export function posterIndexUpsertOptions(catalogOnly?: boolean): {
  onConflict: 'sha256';
  ignoreDuplicates: boolean;
};
export function posterMimeType(path: string): string;
export function createPosterUploadBlob(blob: Blob, path: string): Blob;
