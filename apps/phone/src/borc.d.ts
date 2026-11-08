declare module "borc" {
  export function encode(value: unknown): Buffer;
  export function decode(value: Uint8Array): unknown;
}
