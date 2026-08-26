declare module "borc" {
  export interface EncodeContext {
    _pushTag(tag: number): unknown;
    pushAny(value: unknown): unknown;
  }
  export class Tagged {
    constructor(tag: number, value: unknown);
    readonly tag: number;
    readonly value: unknown;
    encodeCBOR(context: EncodeContext): unknown;
  }
  export function encode(value: unknown): Buffer;
  export function decode(value: Uint8Array): unknown;
}
