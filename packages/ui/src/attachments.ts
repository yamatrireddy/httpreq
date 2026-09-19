import { createId, type FileReference } from '@httpreq/shared';

/**
 * Files chosen for binary and multipart bodies. Requests store only a `FileReference`; the bytes
 * stay in memory for this session and are never written to workspace storage.
 */
const files = new Map<string, File>();

export const rememberFile = (file: File): FileReference => {
  const reference: FileReference = {
    id: createId(),
    name: file.name,
    size: file.size,
    type: file.type,
  };
  files.set(reference.id, file);
  return reference;
};

export const hasAttachment = (reference: FileReference | null | undefined) =>
  !!reference && files.has(reference.id);

export const readAttachment = async (reference: FileReference): Promise<Uint8Array | undefined> => {
  const file = files.get(reference.id);
  return file ? new Uint8Array(await file.arrayBuffer()) : undefined;
};

export const formatBytes = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
