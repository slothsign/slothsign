import { URDecoder } from "@ngraveio/bc-ur";
import { decodeRequest, REQUEST_PREFIX, type SignerRequest } from "@slothsign/core";
import { decodeSlothRequestUr, SLOTH_REQUEST_UR } from "@slothsign/qr-codec/sloth";

export type ScanProgress =
  | { status: "scanning"; percent: number }
  | { status: "complete"; request: SignerRequest }
  | { status: "error"; message: string };

const NOT_A_REQUEST = "This QR code isn't a SlothSign signing request.";
const UNREADABLE = "This request couldn't be read. Create a new one and try again.";

/**
 * Assembles a signing request from scanned QR frames. Cameras report the same
 * frame many times per second, so repeats return undefined and cost nothing.
 */
export class RequestScanner {
  private decoder = new URDecoder();
  private seen = new Set<string>();

  accept(text: string): ScanProgress | undefined {
    const value = text.trim();
    if (value.startsWith(REQUEST_PREFIX)) return this.decodeTransport(value);
    const part = value.toLowerCase();
    if (!part.startsWith(`ur:${SLOTH_REQUEST_UR}/`)) {
      return { status: "error", message: NOT_A_REQUEST };
    }
    if (this.seen.has(part)) return undefined;
    this.seen.add(part);
    try {
      this.decoder.receivePart(part);
      if (!this.decoder.isComplete()) {
        const percent = Math.round(this.decoder.estimatedPercentComplete() * 100);
        return { status: "scanning", percent };
      }
      if (!this.decoder.isSuccess()) return { status: "error", message: UNREADABLE };
      return { status: "complete", request: decodeSlothRequestUr(this.decoder.resultUR()) };
    } catch {
      return { status: "error", message: UNREADABLE };
    }
  }

  private decodeTransport(value: string): ScanProgress {
    try {
      return { status: "complete", request: decodeRequest(value) };
    } catch {
      return { status: "error", message: UNREADABLE };
    }
  }
}
