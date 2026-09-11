import {
  ArkoviaError,
  ArkoviaNetworkError,
  ArkoviaTimeoutError,
} from "./errors.js";
import { ARKOVIA_MAINNET } from "./networks.js";
import type {
  Account,
  ArkoviaClientOptions,
  ArkoviaParam,
  Balance,
  BlockchainStatus,
  Block,
  Currency,
  CurrencyTransfers,
  MintingTarget,
  PaginatedBlocks,
  PaginatedCurrencies,
  PaginatedTransactions,
  RequestOptions,
  Transaction,
} from "./types.js";
import { assertAccountIdentifier } from "./utils/account.js";

const DEFAULT_TIMEOUT_MS = 12_000;

function cleanNodeUrl(value: string): string {
  const url = value.trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new TypeError(`Invalid Arkovia node URL: ${value}`);
  }
  return url.replace(/\/$/, "");
}

function encodeParams(
  requestType: string,
  params: Record<string, ArkoviaParam>,
): URLSearchParams {
  const body = new URLSearchParams({ requestType });
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      body.set(key, String(value));
    }
  }
  return body;
}

function apiError(payload: Record<string, unknown>): ArkoviaError | null {
  const code =
    typeof payload.errorCode === "number" ? payload.errorCode : undefined;
  const description =
    typeof payload.errorDescription === "string"
      ? payload.errorDescription
      : typeof payload.error === "string"
        ? payload.error
        : undefined;

  if (code === undefined && description === undefined) return null;

  return new ArkoviaError(
    description ?? `Arkovia API error ${code ?? "unknown"}`,
    { code, description, response: payload },
  );
}

export class ArkoviaClient {
  readonly network;
  readonly nodes: readonly string[];
  readonly timeoutMs: number;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(options: ArkoviaClientOptions = {}) {
    this.network = options.network ?? ARKOVIA_MAINNET;
    this.nodes = (options.nodes ?? this.network.nodes).map(cleanNodeUrl);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (this.nodes.length === 0) {
      throw new TypeError("At least one Arkovia node URL is required.");
    }

    const fetchFn = options.fetch ?? globalThis.fetch;
    if (!fetchFn) {
      throw new TypeError("A Fetch API implementation is required.");
    }
    this.fetchFn = fetchFn;
  }

  async request<T>(
    requestType: string,
    params: Record<string, ArkoviaParam> = {},
    options: RequestOptions = {},
  ): Promise<T> {
    const nodes = options.node ? [cleanNodeUrl(options.node)] : this.nodes;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    let lastError: unknown;

    for (const node of nodes) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const abortFromCaller = () => controller.abort();
      options.signal?.addEventListener("abort", abortFromCaller, { once: true });

      try {
        const response = await this.fetchFn(node, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            Accept: "application/json",
          },
          body: encodeParams(requestType, params),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new ArkoviaError(
            `Arkovia node returned HTTP ${response.status}: ${node}`,
          );
        }

        const payload = (await response.json()) as Record<string, unknown>;
        const error = apiError(payload);
        if (error) throw error;
        return payload as T;
      } catch (error) {
        if (error instanceof ArkoviaError) throw error;
        lastError =
          controller.signal.aborted && !options.signal?.aborted
            ? new ArkoviaTimeoutError(node, timeoutMs, error)
            : error;
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abortFromCaller);
      }
    }

    throw new ArkoviaNetworkError(
      "Every configured Arkovia node failed.",
      nodes,
      lastError,
    );
  }

  getBlockchainStatus(options?: RequestOptions): Promise<BlockchainStatus> {
    return this.request("getBlockchainStatus", {}, options);
  }

  getState(options?: RequestOptions): Promise<Record<string, unknown>> {
    return this.request("getState", {}, options);
  }

  getBlock(
    query: { block?: string; height?: number; includeTransactions?: boolean },
    options?: RequestOptions,
  ): Promise<Block> {
    if (query.block === undefined && query.height === undefined) {
      throw new TypeError("getBlock requires a block ID or height.");
    }
    return this.request("getBlock", query, options);
  }

  getBlocks(
    query: {
      firstIndex?: number;
      lastIndex?: number;
      includeTransactions?: boolean;
    } = {},
    options?: RequestOptions,
  ): Promise<PaginatedBlocks> {
    return this.request("getBlocks", query, options);
  }

  getTransaction(
    query: { transaction?: string; fullHash?: string },
    options?: RequestOptions,
  ): Promise<Transaction> {
    if (!query.transaction && !query.fullHash) {
      throw new TypeError("getTransaction requires a transaction ID or full hash.");
    }
    return this.request("getTransaction", query, options);
  }

  getAccount(
    account: string,
    query: { height?: number } = {},
    options?: RequestOptions,
  ): Promise<Account> {
    return this.request(
      "getAccount",
      { account: assertAccountIdentifier(account), ...query },
      options,
    );
  }

  getBalance(
    account: string,
    query: { height?: number } = {},
    options?: RequestOptions,
  ): Promise<Balance> {
    return this.request(
      "getBalance",
      { account: assertAccountIdentifier(account), ...query },
      options,
    );
  }

  getAccountTransactions(
    account: string,
    query: {
      firstIndex?: number;
      lastIndex?: number;
      type?: number;
      subtype?: number;
      numberOfConfirmations?: number;
    } = {},
    options?: RequestOptions,
  ): Promise<PaginatedTransactions> {
    return this.request(
      "getAccountTransactions",
      { account: assertAccountIdentifier(account), ...query },
      options,
    );
  }

  getAllCurrencies(
    query: {
      firstIndex?: number;
      lastIndex?: number;
      includeCounts?: boolean;
    } = {},
    options?: RequestOptions,
  ): Promise<PaginatedCurrencies> {
    return this.request("getAllCurrencies", query, options);
  }

  getCurrency(
    query: { currency?: string; code?: string },
    options?: RequestOptions,
  ): Promise<Currency> {
    if (!query.currency && !query.code) {
      throw new TypeError("getCurrency requires a currency ID or code.");
    }
    return this.request("getCurrency", query, options);
  }

  getCurrencyTransfers(
    currency: string,
    query: { firstIndex?: number; lastIndex?: number } = {},
    options?: RequestOptions,
  ): Promise<CurrencyTransfers> {
    return this.request(
      "getCurrencyTransfers",
      { currency, ...query },
      options,
    );
  }

  getMintingTarget(
    query: { currency: string; account: string; units: string | number | bigint },
    options?: RequestOptions,
  ): Promise<MintingTarget> {
    return this.request(
      "getMintingTarget",
      {
        ...query,
        account: assertAccountIdentifier(query.account),
      },
      options,
    );
  }
}
