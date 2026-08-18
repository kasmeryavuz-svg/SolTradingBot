# Wallet intelligence sources

Primary sources for Checkpoint 18 (`wi18_v1`, `public_onchain_holder_cohort_intelligence`). Date checked: **2026-08-18**.

No unofficial holder-dashboard, copy-trade bot, or “smart money” tutorial is the source of truth. This file records the official RPC contracts wi18 uses, the exact semantics bound in code, and the APIs that are intentionally not used.

CP18 is **public on-chain holder-cohort evidence**. It does not identify people, score wallets, compute PnL, copy trades, or send transactions.

## Solana RPC

Official sources (re-read 2026-08-18):

- [getTokenLargestAccounts](https://solana.com/docs/rpc/http/gettokenlargestaccounts)
- [getAccountInfo](https://solana.com/docs/rpc/http/getaccountinfo)
- [getMultipleAccounts](https://solana.com/docs/rpc/http/getmultipleaccounts)
- [getGenesisHash](https://solana.com/docs/rpc/http/getgenesishash)
- [RPC HTTP method index](https://solana.com/docs/rpc/http)
- [Token balances JSON structure](https://solana.com/docs/rpc/json-structures#token-balances) (shared `uiTokenAmount` / raw `amount` fields)
- [Account data JSON structure](https://solana.com/docs/rpc/json-structures#account-data) (`jsonParsed` `{program, parsed, space}`)
- [Available clusters / genesis hashes](https://docs.anza.xyz/clusters/available)

| Method | Official current fact | How wi18 uses it |
| --- | --- | --- |
| `getTokenLargestAccounts` | Returns **up to 20 token accounts** for one SPL mint, not wallets. Each row has `address` (token-account pubkey), raw `amount` (base-10 integer string), `decimals`, plus deprecated `uiAmount` / `uiAmountString`. | Holder snapshot only. Commitment `finalized`. Arithmetic uses raw `amount` → `BigInt`. Never `uiAmount`. Output language: “top 20 observed token accounts.” |
| Context slot | RPC `result.context.slot` is the snapshot slot for that call. | `holderContextSlot` comes from `getTokenLargestAccounts`. History is fenced `slot <= holderContextSlot`. |
| `getAccountInfo` / `getMultipleAccounts` | `value` is `null` if missing. `minContextSlot` is the earliest slot the node may use. `jsonParsed` yields `{program, parsed, space}` when a parser exists. | Mint check. Token-account resolution in **one** `getMultipleAccounts` with `commitment=finalized`, `encoding=jsonParsed`, `minContextSlot=holderContextSlot`. Capture `holderResolutionContextSlot` and require `>= holderContextSlot`. Unique owners are classified in a later batch with `minContextSlot=holderResolutionContextSlot`. Capture `ownerClassificationContextSlot` and require `>= holderResolutionContextSlot`. |
| Parsed SPL token account | `info.mint`, `info.owner`, `info.state`, `info.tokenAmount.amount`, `info.tokenAmount.decimals`. Account `owner` must be SPL Token or Token-2022. | Parsed type/mint/raw amount/decimals must equal the ranking observation. Mismatch fail-closes. `uiAmount` is ignored. |
| Rank | Official RPC returns up to 20 rows. | Rank = returned array position + 1 after `length <= 20`. Do not re-sort by `uiAmount`. If raw amounts increase down the array, fail closed. |
| `getGenesisHash` | Returns the connected cluster’s genesis hash. | Production network commands require official mainnet-beta genesis `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`. Wrong cluster fails closed. |

Limitations recorded from official docs:

- The largest-account set is **not** the owner’s complete token balance and **not** share of total supply.
- Ranking and owner-resolution are **separate RPC calls**. wi18 fail-closes if amount/mint/decimals changed, but it cannot prove a mathematically atomic historical snapshot.
- `uiAmount` is a float and is deprecated in favor of `uiAmountString`. wi18 does not use either for math.
- `jsonParsed` may fall back to raw bytes if the node has no parser. wi18 treats that as an integrity failure for mint/token-account payloads.

## Helius RPC — `getTransactionsForAddress`

Official sources (re-read 2026-08-18):

- [getTransactionsForAddress tutorial](https://www.helius.dev/docs/rpc/gettransactionsforaddress)
- [getTransactionsForAddress API reference](https://www.helius.dev/docs/api-reference/rpc/http/gettransactionsforaddress)

This is a **Helius-exclusive JSON-RPC method**. It is not standard Solana RPC. wi18 calls it with raw `fetch` against the current official mainnet host. The Helius SDK is not installed.

Production base URL is constructed internally:

`https://mainnet.helius-rpc.com/?api-key=<HELIUS_API_KEY>`

The operator puts the key in `.env` as `HELIUS_API_KEY`. They do not paste an authenticated URL. The key is never written to SQLite, never bound into fingerprints, and never printed.

| Option | Official current fact | How wi18 uses it |
| --- | --- | --- |
| Host | Official examples use `https://mainnet.helius-rpc.com/?api-key=...` | Code-defined origin `https://mainnet.helius-rpc.com`. Other hosts are refused. |
| Result shape | `{ data: Transaction[], paginationToken: string \| null }` | Parse `result.data`. Do not persist the raw JSON. |
| `transactionDetails` | `signatures` or `full`. wi18 full-mode request `limit` is **1–100 per request**. Signatures-mode `limit` is 1–1000. | Recent history: `full`. First-observed: `signatures`. |
| `encoding` | Same as `getTransaction`: `json`, `jsonParsed`, `base64`, `base58`. Applies in full mode. | Recent history: `jsonParsed`. First-observed signatures mode omits encoding. |
| `maxSupportedTransactionVersion` | Same as `getTransaction`. Official examples use `0`. | Recent history: `0`. Omitted on the signatures first-observed request. |
| `sortOrder` | `desc` newest first (default); `asc` oldest first. | Recent window: `desc`. First-observed lookup: `asc`, `limit=1`. |
| `limit` | Full-mode production ceiling is 100 per request. Never send full `limit > 100`. Signatures-mode ceiling is 1000; wi18 first-observed uses 1. | Page 1: 100. Page 2: 100 only if page 1 has a `paginationToken` and 100 retained are not enough. Page 3: `limit=1` probe only if page 2 has a token and 200 rows were inspected. First-observed: 1. |
| `commitment` | `finalized` or `confirmed`. `processed` is not supported. | `finalized`. |
| `filters.status` | `succeeded` / `failed` / `any` (default). | `succeeded`. A failed `meta.err` in a succeeded query is an integrity failure. |
| `filters.tokenAccounts` | `none` (default), `balanceChanged` (recommended), `all`. | `balanceChanged`. |
| `filters.blockTime` | Unix seconds; operators `gte`, `gt`, `lte`, `lt`, `eq`. | Recent window: `gte` scan start − 30 days, `lte` scan start. First-observed query does **not** apply that lower bound. Null recent `blockTime` cannot be proven inside 30d and is excluded from 30d behavioral metrics. |
| `filters.slot` | Operators `gte`, `gt`, `lte`, `lt`. | `lte: holderContextSlot`. Any returned `slot > holderContextSlot` is a provider-integrity failure. |
| `paginationToken` | `"slot:position"` for the next page. | Passed through from the previous page only. Never invented. Repeated or malformed tokens fail closed. Not fingerprint input. Maximum 3 recent-history requests per wallet. |
| Full `meta` | `preTokenBalances` / `postTokenBalances` with `accountIndex`, `mint`, `owner`, `programId`, `uiTokenAmount.amount`, `decimals`. `transactionIndex` is present for ordering. | Wallet token-delta engine uses the token-balance `owner` field, not `accountKeys`. Raw `amount` → `BigInt`. A delta is computed only from complete pre/post pairs that match accountIndex, mint, owner, supported token programId, and decimals. Unpaired counterparts, null arrays, or empty-vs-wallet-owned arrays are **incomplete**. wi18 does not synthesize a zero, infer create, or infer close. Sort: slot DESC, transactionIndex DESC, signature code-point. |

### Historical limitation (first observed ≠ wallet creation)

Official Helius docs: the `tokenAccounts` filter depends on the `owner` field in token-balance metadata, introduced at slot **111,491,819** (~December 2022). Activity before that slot may be missing from `balanceChanged` results.

wi18 therefore stores **first observed activity under these provider/history semantics**. It does not store `walletCreatedAt` and does not claim wallet-creation time.

Mainnet retention for this method is documented as unlimited; that still does not prove a complete lifetime history under `tokenAccounts=balanceChanged`.

## APIs intentionally not used

Confirmed 2026-08-18:

| API | Official status | Why wi18 does not use it |
| --- | --- | --- |
| [Enhanced Transactions](https://www.helius.dev/docs/enhanced-transactions/overview) (`POST /v0/transactions`, `GET /v0/addresses/{address}/transactions`) | Legacy product in **maintenance mode**. Official guidance for new work: use `getTransactionsForAddress` for history/backfill. | New integration is forbidden. Not a wi18 dependency. |
| [Wallet API](https://www.helius.dev/docs/wallet-api/history) | **Beta**. Endpoints and response formats may change. | Forbidden. Not a wi18 dependency. |
| Helius Wallet Identity / naming | Identity / ENS / SNS / social matching | Forbidden. Public key only. No doxxing. |
| Helius funded-by / cluster endpoints | Funding-graph / entity clustering | Forbidden in wi18_v1. Shared-funder intelligence would need a later explicitly audited spec. |
| Helius SDK | npm package | Zero new dependencies. Raw `fetch` only. |
| Standard `getSignaturesForAddress` + `getTransaction` fan-out | Official Solana RPC | Not used for CP18 history. Helius `getTransactionsForAddress` is the single history provider. |

## Authentication and secrets

- Secret name: `HELIUS_API_KEY`
- Placeholder only in `.env.example`
- Never commit a real key
- Never store the key, authenticated URL, or `Authorization` header in SQLite
- Never print the key
- Never bind the key into `WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT`, scan fingerprints, or profile fingerprints
- Error paths sanitize `api-key=`, `api_key=`, `HELIUS_API_KEY`, and the key substring

## Read-only retry (code-defined)

Timeout: 10 seconds. Maximum **2 total attempts = 1 initial + 1 retry** per RPC call. Retry only HTTP 429, HTTP 5xx, timeout, or network transport failure. No environment override. No unbounded retry. Pagination does not multiply retries across wallets: each page is its own RPC call with the same 2-attempt bound. Worst-case recent-history attempts per wallet: 6. Plus first-observed: 2. Total history RPC attempts per analyzed wallet: 8.

## What these sources do not authorize

They do not authorize:

- calling the results “top 20 wallets”
- labeling a balance delta BUY / SELL / SWAP
- a smart-money / whale / insider score
- copy trading or wallet following
- `live:execute`, signing, or transaction construction
- connecting wi18 features to s07 / r125 / o17 / paper / live
