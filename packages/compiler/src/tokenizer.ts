import { getEncoding, type TiktokenEncoding } from "js-tiktoken";

// Cache encoder instances by encoding name to avoid repeated WASM init overhead
const encodingCache = new Map<string, ReturnType<typeof getEncoding>>();

function getEncoder(encoding: TiktokenEncoding) {
  if (!encodingCache.has(encoding)) {
    encodingCache.set(encoding, getEncoding(encoding));
  }
  return encodingCache.get(encoding)!;
}

export function countTokens(
  text: string,
  encoding: TiktokenEncoding = "cl100k_base"
): number {
  const enc = getEncoder(encoding);
  return enc.encode(text).length;
}
