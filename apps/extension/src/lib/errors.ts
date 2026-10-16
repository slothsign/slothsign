/**
 * Turn a thrown value into a user-facing message. viem errors carry a
 * `shortMessage` that is far clearer than the full stack-bearing `message`.
 */
export function readableError(error: unknown): string {
  if (error instanceof Error) {
    const msg =
      "shortMessage" in error
        ? String((error as Record<string, unknown>).shortMessage)
        : error.message;
    return msg.replace(/^SlothSign: /, "");
  }
  return String(error);
}
