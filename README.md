# Arkovia TypeScript SDK

Official TypeScript and JavaScript SDK for building applications on the Arkovia Blockchain—accounts, transactions, ARKOS, custom currencies, minting, and secure local signing.

[Developer Center](https://arkovia.base44.app/developers) · [GitHub Repository](https://github.com/mycreationhaven/Arkovia-TypeScript-SDK)

> **Status:** Early developer preview. The read-only API foundation is available. Transaction construction and local signing are planned for the next development phase.

## Features

- Fully typed TypeScript API
- JavaScript, Node.js, React, and Next.js compatible
- Mainnet defaults with automatic node failover
- Custom node and network support
- Blockchain, block, transaction, account, and currency queries
- Scrypt currency minting-target queries
- BigInt-safe ARKOS conversions
- Arkovia's minimum transaction-fee validation
- Structured API, network, and timeout errors
- Injectable Fetch API for testing and custom runtimes

## Install

The package is not yet published to npm. During development:

```bash
git clone https://github.com/mycreationhaven/Arkovia-TypeScript-SDK.git
cd Arkovia-TypeScript-SDK
npm install
npm run build
```

After its first npm release:

```bash
npm install @arkovia/sdk
```

## Quick start

```ts
import { ArkoviaClient, atomicToArkos } from "@arkovia/sdk";

const arkovia = new ArkoviaClient();

const status = await arkovia.getBlockchainStatus();
console.log("Block height:", status.numberOfBlocks);

const balance = await arkovia.getBalance("ARK-XXXX-XXXX-XXXX-XXXXX");
console.log("Balance:", atomicToArkos(balance.balanceNQT), "ARKOS");

const velorium = await arkovia.getCurrency({ code: "VELR" });
console.log(velorium);
```

## Currency minting target

The SDK can retrieve the current target required by an external currency miner:

```ts
const target = await arkovia.getMintingTarget({
  currency: "CURRENCY_ID",
  account: "ARK-XXXX-XXXX-XXXX-XXXXX",
  units: 1,
});

console.log(target.targetBytes, target.counter);
```

This method does not mine or submit a minting transaction. Those capabilities belong to the upcoming transaction and minting modules.

## Custom nodes

```ts
import { ArkoviaClient, customNetwork } from "@arkovia/sdk";

const network = customNetwork(
  ["https://node-one.example/nxt", "https://node-two.example/nxt"],
  { name: "my-network" },
);

const arkovia = new ArkoviaClient({ network, timeoutMs: 15_000 });
```

You can also override nodes without defining a complete network:

```ts
const arkovia = new ArkoviaClient({
  nodes: ["http://127.0.0.1:4876/nxt"],
});
```

## ARKOS amounts

Never use ordinary floating-point arithmetic for blockchain balances.

```ts
import {
  arkosToAtomic,
  atomicToArkos,
  assertMinimumTransactionFee,
} from "@arkovia/sdk";

arkosToAtomic("1.25");              // 125000000n
atomicToArkos("125000000");         // "1.25"
assertMinimumTransactionFee("0.01"); // 1000000n
```

Arkovia uses eight decimal places:

- `1 ARKOS = 100,000,000` atomic units
- Minimum transaction fee: `0.01 ARKOS = 1,000,000` atomic units

## Account addresses

```ts
import {
  accountIdToAddress,
  addressToAccountId,
  isValidArkoviaAddress,
} from "@arkovia/sdk";

const address = accountIdToAddress("1739068987193023818");
const accountId = addressToAccountId(address);
const valid = isValidArkoviaAddress(address);
```

Address decoding performs the complete Reed–Solomon checksum validation used by Arkovia. Numeric account IDs are restricted to the unsigned 64-bit range.

## Local cryptography

Secret phrases remain in the calling application and are never sent to an Arkovia node by these functions.

```ts
import {
  getPublicKey,
  getAccountId,
  getAccountAddress,
  signBytes,
  verifySignature,
} from "@arkovia/sdk";

const publicKey = await getPublicKey(secretPhrase);
const accountId = await getAccountId(secretPhrase);
const address = await getAccountAddress(secretPhrase);

const signature = await signBytes(unsignedTransactionHex, secretPhrase);
const valid = await verifySignature(signature, unsignedTransactionHex, publicKey);
```

`signBytes` is a low-level primitive. Do not sign transaction bytes from an untrusted node until the transaction fields have been independently parsed and checked. A safe transaction parser and builder are the next SDK milestone.

## API methods

### Network and blocks

- `getBlockchainStatus()`
- `getState()`
- `getBlock({ block | height })`
- `getBlocks({ firstIndex, lastIndex, includeTransactions })`
- `getTransaction({ transaction | fullHash })`

### Accounts

- `getAccount(account, { height })`
- `getBalance(account, { height })`
- `getAccountTransactions(account, options)`

### Monetary System currencies

- `getAllCurrencies(options)`
- `getCurrency({ currency | code })`
- `getCurrencyTransfers(currency, options)`
- `getMintingTarget({ currency, account, units })`

Every raw Nxt-compatible endpoint is also available through:

```ts
await arkovia.request("requestType", { parameter: "value" });
```

## Browser security and CORS

Do not place account secret phrases, private keys, or signing material in frontend configuration. Some public Arkovia nodes may not allow browser requests because of CORS or mixed-content restrictions. Production browser applications should use an HTTPS Arkovia gateway or their own backend proxy.

Local transaction signing will be added before the SDK exposes write operations. Secret phrases will never be sent to remote nodes by the recommended SDK flow.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Roadmap

- [x] Typed read-only API client
- [x] Mainnet node failover
- [x] BigInt-safe ARKOS utilities
- [x] Account format helpers
- [x] Minting-target lookup
- [x] Full Reed-Solomon address checksum validation
- [ ] Transaction byte construction
- [x] Core deterministic local signing and signature verification
- [ ] Transaction broadcasting
- [ ] Currency issuance, transfer, exchange, and mint submission
- [ ] Browser wallet adapters
- [ ] npm publication

## Security

Treat secret phrases and private keys as highly sensitive. Never commit them, log them, pass them in URLs, or send them to third-party nodes.

## Developer resources

- [Arkovia Developer Center](https://arkovia.base44.app/developers)
- [Arkovia Blockchain source](https://github.com/mycreationhaven/Arkovia-Blockchain)
- [SDK issues and feature requests](https://github.com/mycreationhaven/Arkovia-TypeScript-SDK/issues)

## License

Copyright 2026 My Creation Haven™.

Licensed under the [Apache License 2.0](./LICENSE).
