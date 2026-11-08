// Must be the first import of the app entry: the shared signing packages read
// these globals at module load.
import "react-native-get-random-values";
import { Buffer } from "buffer";

const globals = globalThis as { Buffer?: unknown };
globals.Buffer ??= Buffer;
