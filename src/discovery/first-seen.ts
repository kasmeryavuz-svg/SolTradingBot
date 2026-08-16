export type FirstSeenTracker = {
  has(tokenMint: string): boolean;
  remember(tokenMints: readonly string[]): string[];
};

export function createFirstSeenTracker(): FirstSeenTracker {
  const seen = new Set<string>();

  return {
    has: (tokenMint) => seen.has(tokenMint),
    remember: (tokenMints) => {
      const firstSeen: string[] = [];
      for (const tokenMint of tokenMints) {
        if (!seen.has(tokenMint)) {
          seen.add(tokenMint);
          firstSeen.push(tokenMint);
        }
      }
      return firstSeen;
    },
  };
}
