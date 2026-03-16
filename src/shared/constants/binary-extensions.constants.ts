/**
 * Binary File Extensions Constants
 *
 * List of file extensions that represent binary files.
 * These should NOT be opened in the text editor.
 */

export const BINARY_FILE_EXTENSIONS = [
  'dll', 'exe', 'bin', 'dat', 'pak', 'pck',
  'zip', 'rar', '7z', 'tar', 'gz',
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp',
  'mp3', 'wav', 'ogg', 'flac',
  'mp4', 'avi', 'mkv', 'mov', 'wmv',
  'pdf', 'doc', 'docx', 'xls', 'xlsx',
  'so', 'dylib', 'a', 'lib', 'obj', 'o',
] as const;

export type BinaryFileExtension = typeof BINARY_FILE_EXTENSIONS[number];
