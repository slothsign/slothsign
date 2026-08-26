import type { WalletConfig } from "@/lib/config";

export function pathRank(path: string | undefined): number[] {
  return (path ?? "")
    .replace(/^[mM]\/?/, "")
    .split("/")
    .filter(Boolean)
    .map((s) => Number.parseInt(s, 10) || 0);
}

export function groupByXpub(wallets: WalletConfig[]): WalletConfig[][] {
  const groups: WalletConfig[][] = [];
  const indexByXpub = new Map<string, number>();
  for (const w of wallets) {
    const key = w.chain === "ethereum" && w.signer === "keystone-qr" && w.xpub ? w.xpub : null;
    const existing = key ? indexByXpub.get(key) : undefined;
    if (existing !== undefined) {
      groups[existing]!.push(w);
    } else {
      if (key) indexByXpub.set(key, groups.length);
      groups.push([w]);
    }
  }
  for (const group of groups) {
    if (group.length > 1) {
      group.sort((a, b) => {
        const rankA = pathRank(a.path);
        const rankB = pathRank(b.path);
        const len = Math.min(rankA.length, rankB.length);
        for (let i = 0; i < len; i++) {
          const a = rankA[i];
          const b = rankB[i];
          if (a !== b) return (a ?? 0) - (b ?? 0);
        }
        return rankA.length - rankB.length;
      });
    }
  }
  return groups;
}
