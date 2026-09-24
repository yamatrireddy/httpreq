/** A problem with an import source, worded for the person importing it. */
export class ImportError extends Error {
  override name = 'ImportError';
}

/** A readable message for anything thrown while importing. */
export const importErrorMessage = (error: unknown): string =>
  error instanceof ImportError
    ? error.message
    : `The file could not be processed${error instanceof Error && error.message ? `: ${error.message}` : '.'}`;
