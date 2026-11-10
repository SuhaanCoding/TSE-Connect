import { ENCODER } from "./config";
import type { MatchDocument } from "./documents";
export interface PackedDocument extends MatchDocument {
  vector: string;
}
export interface MatchCacheRecord {
  modelVersion: string;
  sourceHash: string;
  profileId: string;
  documents: PackedDocument[];
}
export function packVector(values: number[]): string {
  if (
    values.length !== ENCODER.dimensions ||
    values.some((value) => !Number.isFinite(value))
  )
    throw new Error("Invalid embedding");
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function unpackVector(value: string): number[] {
  if (value.length !== (ENCODER.dimensions * 4 * 4) / 3) return [];
  try {
    const binary = atob(value);
    if (binary.length !== ENCODER.dimensions * 4) return [];
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const result = Array.from({ length: ENCODER.dimensions }, (_, i) =>
      view.getFloat32(i * 4, true),
    );
    return result.every(Number.isFinite) ? result : [];
  } catch {
    return [];
  }
}
