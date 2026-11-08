import type { Wallet } from "@slothsign/signing";
import * as SecureStore from "expo-secure-store";
import { EMPTY_REGISTRY, parseRegistry, type Registry } from "../lib/registry";

const REGISTRY_KEY = "registry";
const REGISTRY_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: "slothsigner.registry",
};

// Secrets live under their own Keystore key, which needs a biometric unlock for
// every read and write.
const SECRET_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: "slothsigner.secrets",
  requireAuthentication: true,
  authenticationPrompt: "Unlock SlothSigner",
};

function secretKey(id: string): string {
  return `wallet.${id}`;
}

export function canUseBiometrics(): boolean {
  return SecureStore.canUseBiometricAuthentication();
}

export async function loadRegistry(): Promise<Registry> {
  const raw = await SecureStore.getItemAsync(REGISTRY_KEY, REGISTRY_OPTIONS);
  return raw ? parseRegistry(raw) : EMPTY_REGISTRY;
}

export async function saveRegistry(registry: Registry): Promise<void> {
  await SecureStore.setItemAsync(REGISTRY_KEY, JSON.stringify(registry), REGISTRY_OPTIONS);
}

export async function saveSecret(wallet: Wallet): Promise<void> {
  await SecureStore.setItemAsync(secretKey(wallet.id), JSON.stringify(wallet), SECRET_OPTIONS);
}

export async function readSecret(id: string): Promise<Wallet> {
  const raw = await SecureStore.getItemAsync(secretKey(id), SECRET_OPTIONS);
  if (!raw) throw new Error("Wallet key not found");
  return JSON.parse(raw) as Wallet;
}

export async function deleteSecret(id: string): Promise<void> {
  await SecureStore.deleteItemAsync(secretKey(id), SECRET_OPTIONS);
}
