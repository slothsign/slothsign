// Must be the first import of the app entry: the shared signing packages read
// these globals at module load.
import "react-native-get-random-values";
import { hashes } from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { Buffer } from "buffer";

const globals = globalThis as { Buffer?: unknown };
globals.Buffer ??= Buffer;

// Hermes has no crypto.subtle, which @noble/ed25519 uses by default.
hashes.sha512Async = async (message) => sha512(message);
