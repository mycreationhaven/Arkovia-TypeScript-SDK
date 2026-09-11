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
  UnsignedTransactionResponse,
  BroadcastTransactionResponse,
  PreparedTransaction,
  SubmittedTransaction,
} from "./types.js";
import { addressToAccountId, assertAccountIdentifier, isNumericAccountId } from "./utils/account.js";
import { arkosToAtomic, assertMinimumTransactionFee } from "./utils/amount.js";
import { getPublicKey } from "./crypto/arkoviaCrypto.js";
import {
  signTransactionBytes,
  verifyUnsignedTransaction,
} from "./transactions.js";

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

  async prepareArkosPayment(input: {
    secretPhrase: string;
    recipient: string;
    amountArkos: string | number;
    feeArkos?: string | number;
    deadline?: number;
  }, options?: RequestOptions): Promise<PreparedTransaction> {
    const recipient = assertAccountIdentifier(input.recipient);
    const recipientId = isNumericAccountId(recipient)
      ? recipient
      : addressToAccountId(recipient);
    const amountNQT = arkosToAtomic(input.amountArkos).toString();
    const feeNQT = assertMinimumTransactionFee(input.feeArkos ?? "0.01").toString();
    const deadline = input.deadline ?? 1440;
    const publicKey = await getPublicKey(input.secretPhrase);

    const response = await this.request<UnsignedTransactionResponse>(
      "sendMoney",
      { recipient, amountNQT, feeNQT, deadline, publicKey, broadcast: false },
      options,
    );
    if (!response.unsignedTransactionBytes) {
      throw new ArkoviaError("Node did not return unsigned transaction bytes.", {
        response,
      });
    }
    verifyUnsignedTransaction(response.unsignedTransactionBytes, {
      type: 0,
      subtype: 0,
      senderPublicKey: publicKey,
      recipient: recipientId,
      amountNQT,
      feeNQT,
      deadline,
    });
    return {
      unsignedTransactionBytes: response.unsignedTransactionBytes,
      ...(response.transactionJSON
        ? { transactionJSON: response.transactionJSON }
        : {}),
    };
  }

  async prepareCurrencyTransfer(input: {
    secretPhrase: string;
    recipient: string;
    currency: string;
    units: string | number | bigint;
    feeArkos?: string | number;
    deadline?: number;
  }, options?: RequestOptions): Promise<PreparedTransaction> {
    const recipient = assertAccountIdentifier(input.recipient);
    const recipientId = isNumericAccountId(recipient)
      ? recipient
      : addressToAccountId(recipient);
    const currency = BigInt(input.currency).toString();
    const units = BigInt(input.units).toString();
    if (BigInt(units) <= 0n) throw new RangeError("Currency units must be positive.");
    const feeNQT = assertMinimumTransactionFee(input.feeArkos ?? "0.01").toString();
    const deadline = input.deadline ?? 1440;
    const publicKey = await getPublicKey(input.secretPhrase);

    const response = await this.request<UnsignedTransactionResponse>(
      "transferCurrency",
      { recipient, currency, units, feeNQT, deadline, publicKey, broadcast: false },
      options,
    );
    if (!response.unsignedTransactionBytes) {
      throw new ArkoviaError("Node did not return unsigned transaction bytes.", {
        response,
      });
    }
    verifyUnsignedTransaction(response.unsignedTransactionBytes, {
      type: 5,
      subtype: 3,
      senderPublicKey: publicKey,
      recipient: recipientId,
      amountNQT: "0",
      feeNQT,
      deadline,
      currency,
      units,
    });
    return {
      unsignedTransactionBytes: response.unsignedTransactionBytes,
      ...(response.transactionJSON
        ? { transactionJSON: response.transactionJSON }
        : {}),
    };
  }

  broadcastTransaction(
    transactionBytes: string,
    options?: RequestOptions,
  ): Promise<BroadcastTransactionResponse> {
    return this.request("broadcastTransaction", { transactionBytes }, options);
  }

  async sendArkos(input: {
    secretPhrase: string;
    recipient: string;
    amountArkos: string | number;
    feeArkos?: string | number;
    deadline?: number;
  }, options?: RequestOptions): Promise<SubmittedTransaction> {
    const prepared = await this.prepareArkosPayment(input, options);
    const signed = await signTransactionBytes(
      prepared.unsignedTransactionBytes,
      input.secretPhrase,
    );
    const broadcast = await this.broadcastTransaction(signed.transactionBytes, options);
    return {
      transaction: broadcast.transaction,
      fullHash: broadcast.fullHash,
      transactionBytes: signed.transactionBytes,
      locallyCalculatedTransaction: signed.transactionId,
      locallyCalculatedFullHash: signed.fullHash,
    };
  }

  async transferCurrency(input: {
    secretPhrase: string;
    recipient: string;
    currency: string;
    units: string | number | bigint;
    feeArkos?: string | number;
    deadline?: number;
  }, options?: RequestOptions): Promise<SubmittedTransaction> {
    const prepared = await this.prepareCurrencyTransfer(input, options);
    const signed = await signTransactionBytes(
      prepared.unsignedTransactionBytes,
      input.secretPhrase,
    );
    const broadcast = await this.broadcastTransaction(signed.transactionBytes, options);
    return {
      transaction: broadcast.transaction,
      fullHash: broadcast.fullHash,
      transactionBytes: signed.transactionBytes,
      locallyCalculatedTransaction: signed.transactionId,
      locallyCalculatedFullHash: signed.fullHash,
    };
  }

  private async prepareMonetaryTransaction(
    requestType: string,
    subtype: number,
    secretPhrase: string,
    params: Record<string, ArkoviaParam>,
    intentAttachment: Partial<Parameters<typeof verifyUnsignedTransaction>[1]>,
    feeArkos: string | number = "0.01",
    deadline = 1440,
    options?: RequestOptions,
  ): Promise<PreparedTransaction> {
    const feeNQT = assertMinimumTransactionFee(feeArkos).toString();
    const publicKey = await getPublicKey(secretPhrase);
    const response = await this.request<UnsignedTransactionResponse>(
      requestType,
      { ...params, feeNQT, deadline, publicKey, broadcast: false },
      options,
    );
    if (!response.unsignedTransactionBytes) {
      throw new ArkoviaError("Node did not return unsigned transaction bytes.", {
        response,
      });
    }
    verifyUnsignedTransaction(response.unsignedTransactionBytes, {
      type: 5,
      subtype,
      senderPublicKey: publicKey,
      recipient: "0",
      amountNQT: "0",
      feeNQT,
      deadline,
      ...intentAttachment,
    });
    return {
      unsignedTransactionBytes: response.unsignedTransactionBytes,
      ...(response.transactionJSON ? { transactionJSON: response.transactionJSON } : {}),
    };
  }

  private async signAndBroadcast(
    prepared: PreparedTransaction,
    secretPhrase: string,
    options?: RequestOptions,
  ): Promise<SubmittedTransaction> {
    const signed = await signTransactionBytes(
      prepared.unsignedTransactionBytes,
      secretPhrase,
    );
    const broadcast = await this.broadcastTransaction(signed.transactionBytes, options);
    if (broadcast.transaction !== signed.transactionId || broadcast.fullHash !== signed.fullHash) {
      throw new ArkoviaError(
        "Broadcast response did not match the locally calculated transaction identity.",
        { response: broadcast },
      );
    }
    return {
      transaction: broadcast.transaction,
      fullHash: broadcast.fullHash,
      transactionBytes: signed.transactionBytes,
      locallyCalculatedTransaction: signed.transactionId,
      locallyCalculatedFullHash: signed.fullHash,
    };
  }

  prepareCurrencyBuy(input: {
    secretPhrase: string;
    currency: string;
    rateNQT: string | number | bigint;
    units: string | number | bigint;
    feeArkos?: string | number;
    deadline?: number;
  }, options?: RequestOptions): Promise<PreparedTransaction> {
    const currency = BigInt(input.currency).toString();
    const rateNQT = BigInt(input.rateNQT).toString();
    const units = BigInt(input.units).toString();
    if (BigInt(rateNQT) <= 0n || BigInt(units) <= 0n) {
      throw new RangeError("Exchange rate and units must be positive.");
    }
    return this.prepareMonetaryTransaction(
      "currencyBuy", 5, input.secretPhrase,
      { currency, rateNQT, units },
      { currency, rateNQT, units },
      input.feeArkos, input.deadline, options,
    );
  }

  prepareCurrencySell(input: {
    secretPhrase: string;
    currency: string;
    rateNQT: string | number | bigint;
    units: string | number | bigint;
    feeArkos?: string | number;
    deadline?: number;
  }, options?: RequestOptions): Promise<PreparedTransaction> {
    const currency = BigInt(input.currency).toString();
    const rateNQT = BigInt(input.rateNQT).toString();
    const units = BigInt(input.units).toString();
    if (BigInt(rateNQT) <= 0n || BigInt(units) <= 0n) {
      throw new RangeError("Exchange rate and units must be positive.");
    }
    return this.prepareMonetaryTransaction(
      "currencySell", 6, input.secretPhrase,
      { currency, rateNQT, units },
      { currency, rateNQT, units },
      input.feeArkos, input.deadline, options,
    );
  }

  prepareCurrencyMint(input: {
    secretPhrase: string;
    currency: string;
    nonce: string | number | bigint;
    units: string | number | bigint;
    counter: string | number | bigint;
    feeArkos?: string | number;
    deadline?: number;
  }, options?: RequestOptions): Promise<PreparedTransaction> {
    const currency = BigInt(input.currency).toString();
    const nonce = BigInt(input.nonce).toString();
    const units = BigInt(input.units).toString();
    const counter = BigInt(input.counter).toString();
    if ([currency, nonce, units, counter].some((v) => BigInt(v) < 0n) || BigInt(units) === 0n) {
      throw new RangeError("Mint values must be unsigned and units must be positive.");
    }
    return this.prepareMonetaryTransaction(
      "currencyMint", 7, input.secretPhrase,
      { currency, nonce, units, counter },
      { currency, nonce, units, counter },
      input.feeArkos, input.deadline, options,
    );
  }

  prepareCurrencyIssuance(input: {
    secretPhrase: string;
    name: string;
    code: string;
    description?: string;
    type: number;
    initialSupply: string | number | bigint;
    reserveSupply: string | number | bigint;
    maxSupply: string | number | bigint;
    issuanceHeight?: number;
    minReservePerUnitNQT?: string | number | bigint;
    minDifficulty?: number;
    maxDifficulty?: number;
    ruleset?: number;
    algorithm?: number;
    decimals: number;
    feeArkos?: string | number;
    deadline?: number;
  }, options?: RequestOptions): Promise<PreparedTransaction> {
    const description = input.description ?? "";
    const issuance = {
      name: input.name,
      code: input.code.toUpperCase(),
      description,
      currencyType: input.type,
      initialSupply: BigInt(input.initialSupply).toString(),
      reserveSupply: BigInt(input.reserveSupply).toString(),
      maxSupply: BigInt(input.maxSupply).toString(),
      issuanceHeight: input.issuanceHeight ?? 0,
      minReservePerUnitNQT: BigInt(input.minReservePerUnitNQT ?? 0).toString(),
      minDifficulty: input.minDifficulty ?? 0,
      maxDifficulty: input.maxDifficulty ?? 0,
      ruleset: input.ruleset ?? 0,
      algorithm: input.algorithm ?? 0,
      decimals: input.decimals,
    };
    if (!/^[a-z0-9]{3,10}$/.test(issuance.name)) {
      throw new TypeError("Currency name must contain 3–10 lowercase letters or digits.");
    }
    if (!/^[A-Z]{3,5}$/.test(issuance.code)) {
      throw new TypeError("Currency code must contain 3–5 uppercase letters.");
    }
    if (issuance.decimals < 0 || issuance.decimals > 8) {
      throw new RangeError("Currency decimals must be between 0 and 8.");
    }
    return this.prepareMonetaryTransaction(
      "issueCurrency", 0, input.secretPhrase,
      {
        name: issuance.name,
        code: issuance.code,
        description,
        type: issuance.currencyType,
        initialSupply: issuance.initialSupply,
        reserveSupply: issuance.reserveSupply,
        maxSupply: issuance.maxSupply,
        issuanceHeight: issuance.issuanceHeight,
        minReservePerUnitNQT: issuance.minReservePerUnitNQT,
        minDifficulty: issuance.minDifficulty,
        maxDifficulty: issuance.maxDifficulty,
        ruleset: issuance.ruleset,
        algorithm: issuance.algorithm,
        decimals: issuance.decimals,
      },
      { issuance },
      input.feeArkos, input.deadline, options,
    );
  }

  async buyCurrency(input: Parameters<ArkoviaClient["prepareCurrencyBuy"]>[0], options?: RequestOptions): Promise<SubmittedTransaction> {
    return this.signAndBroadcast(await this.prepareCurrencyBuy(input, options), input.secretPhrase, options);
  }

  async sellCurrency(input: Parameters<ArkoviaClient["prepareCurrencySell"]>[0], options?: RequestOptions): Promise<SubmittedTransaction> {
    return this.signAndBroadcast(await this.prepareCurrencySell(input, options), input.secretPhrase, options);
  }

  async submitCurrencyMint(input: Parameters<ArkoviaClient["prepareCurrencyMint"]>[0], options?: RequestOptions): Promise<SubmittedTransaction> {
    return this.signAndBroadcast(await this.prepareCurrencyMint(input, options), input.secretPhrase, options);
  }

  async issueCurrency(input: Parameters<ArkoviaClient["prepareCurrencyIssuance"]>[0], options?: RequestOptions): Promise<SubmittedTransaction> {
    return this.signAndBroadcast(await this.prepareCurrencyIssuance(input, options), input.secretPhrase, options);
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
