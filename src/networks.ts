import type { NetworkConfig } from "./types.js";

export const ARKOVIA_MAINNET: NetworkConfig = Object.freeze({
  name: "mainnet",
  accountPrefix: "ARK",
  coinSymbol: "ARKOS",
  decimals: 8,
  nodes: [
    "http://147.93.138.255:4876/nxt",
    "http://217.216.64.226:4876/nxt",
  ],
});

export function customNetwork(
  nodes: readonly string[],
  overrides: Partial<Omit<NetworkConfig, "nodes">> = {},
): NetworkConfig {
  if (nodes.length === 0) {
    throw new TypeError("At least one Arkovia node URL is required.");
  }

  return {
    name: overrides.name ?? "custom",
    accountPrefix: overrides.accountPrefix ?? "ARK",
    coinSymbol: overrides.coinSymbol ?? "ARKOS",
    decimals: overrides.decimals ?? 8,
    nodes: [...nodes],
  };
}
