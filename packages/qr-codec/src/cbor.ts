import { Tagged, encode } from "borc";

/**
 * Structural subset of bc-ur-registry's `DataItem` that we walk while
 * encoding. We duck-type instead of importing the class so the encoder is
 * independent of which bc-ur-registry copy produced the item tree.
 */
export interface DataItemLike {
  getTag(): number | undefined;
  getData(): unknown;
}

function isDataItem(value: unknown): value is DataItemLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as DataItemLike).getTag === "function" &&
    typeof (value as DataItemLike).getData === "function"
  );
}

function isByteString(value: unknown): value is Uint8Array {
  return Object.prototype.toString.call(value) === "[object Uint8Array]";
}

function toBorc(value: unknown): unknown {
  if (isDataItem(value)) {
    const data = toBorc(value.getData());
    const tag = value.getTag();
    return tag === undefined ? data : new Tagged(tag, data);
  }
  if (isByteString(value)) return value;
  if (Array.isArray(value)) return value.map(toBorc);
  if (value !== null && typeof value === "object") {
    return new Map(
      Object.entries(value).map(([key, entry]) => {
        const numericKey = Number(key);
        return [Number.isNaN(numericKey) ? key : numericKey, toBorc(entry)] as const;
      }),
    );
  }
  return value;
}

/**
 * Encode a bc-ur-registry DataItem tree to the CBOR payload Keystone/AirGap
 * expect, replacing the buggy cbor-sync encoder bundled in bc-ur-registry.
 * Numeric map keys are kept as CBOR integers and tagged items (UUID 37,
 * CryptoKeypath 304) are emitted via borc's `Tagged`.
 */
export function encodeDataItem(dataItem: DataItemLike): Buffer {
  return encode(toBorc(dataItem));
}
