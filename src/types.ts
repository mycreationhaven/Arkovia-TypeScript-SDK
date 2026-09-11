export type ArkoviaParam = string | number | bigint | boolean | null | undefined;

export interface NetworkConfig {
  readonly name: string;
  readonly accountPrefix: string;
  readonly coinSymbol: string;
  readonly decimals: number;
  readonly nodes: readonly string[];
}

export interface ArkoviaClientOptions {
  network?: NetworkConfig;
  nodes?: readonly string[];
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export interface RequestOptions {
  node?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface BlockchainStatus {
  application?: string;
  version?: string;
  time?: number;
  lastBlock?: string;
  cumulativeDifficulty?: string;
  numberOfBlocks?: number;
  lastBlockchainFeeder?: string;
  lastBlockchainFeederHeight?: number;
  isScanning?: boolean;
  isDownloading?: boolean;
  blockchainState?: string;
  [key: string]: unknown;
}

export interface Block {
  block: string;
  height: number;
  timestamp: number;
  generator?: string;
  generatorRS?: string;
  totalAmountNQT?: string;
  totalFeeNQT?: string;
  numberOfTransactions?: number;
  transactions?: Transaction[] | string[];
  [key: string]: unknown;
}

export interface Transaction {
  transaction: string;
  fullHash?: string;
  type: number;
  subtype: number;
  timestamp: number;
  sender?: string;
  senderRS?: string;
  recipient?: string;
  recipientRS?: string;
  amountNQT?: string;
  feeNQT?: string;
  confirmations?: number;
  attachment?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Account {
  account: string;
  accountRS?: string;
  balanceNQT?: string;
  unconfirmedBalanceNQT?: string;
  forgedBalanceNQT?: string;
  name?: string;
  description?: string;
  publicKey?: string;
  [key: string]: unknown;
}

export interface Balance {
  balanceNQT: string;
  unconfirmedBalanceNQT?: string;
  forgedBalanceNQT?: string;
  guaranteedBalanceNQT?: string;
  [key: string]: unknown;
}

export interface Currency {
  currency: string;
  name: string;
  code: string;
  description?: string;
  type: number;
  decimals: number;
  issuer?: string;
  issuerRS?: string;
  initialSupplyQNT?: string;
  currentSupplyQNT?: string;
  maxSupplyQNT?: string;
  algorithm?: number;
  minDifficulty?: number;
  maxDifficulty?: number;
  [key: string]: unknown;
}

export interface MintingTarget {
  currency: string;
  difficulty: string;
  targetBytes: string;
  counter: number;
  [key: string]: unknown;
}

export interface PaginatedTransactions {
  transactions: Transaction[];
  [key: string]: unknown;
}

export interface PaginatedBlocks {
  blocks: Block[];
  [key: string]: unknown;
}

export interface PaginatedCurrencies {
  currencies: Currency[];
  [key: string]: unknown;
}

export interface CurrencyTransfers {
  transfers: Array<Record<string, unknown>>;
  [key: string]: unknown;
}
