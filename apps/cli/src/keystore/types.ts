export type KeystoreMode = "age" | "keychain";

export interface KeystoreBackend {
  mode: KeystoreMode;
  hasWallets(): boolean;
  encryptWallets(plaintext: string): void;
  decryptWallets(): string;
  ensureIdentity(): void;
  lastModified(): number | null;
  describe(): string;
}
