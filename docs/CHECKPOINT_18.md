# Checkpoint 18 — Wallet intelligence

Checkpoint 18 builds a **read-only public on-chain holder-cohort intelligence layer**.

It asks factual questions about the largest **token accounts** of one Solana mint, the public addresses that own those accounts, and a capped window of public token-balance-change history. It does **not** identify the person behind an address. It does **not** score wallets. It does **not** compute profit. It does **not** copy trades. It does **not** send transactions.

Spec: `wi18_v1`  
Name: `public_onchain_holder_cohort_intelligence`

Schema becomes **9**. Migration **009_wallet_intelligence**.

Checkpoint 15 “wallet security” is **our** controlled signing wallet. Checkpoint 18 “wallet intelligence” analyzes **public** blockchain addresses. A public Solana address is not a secret. CP18 never reads the operator private key, the w15 signer, or the secret prompt.

## Beginner map

| Idea | What it means here |
| --- | --- |
| Solana wallet / system account | An account owned by the System Program and not executable. wi18 may call this a **wallet candidate**. That is not proof a human controls it. |
| Token account | A separate account that holds a balance of one mint. It has its own address. |
| Associated token account (ATA) | The usual derived token-account address for (owner, mint, token program). One owner can have the ATA plus extra token accounts for the same mint. |
| Owner | The pubkey stored in the token account that is allowed to spend that balance. Several token accounts can share one owner. |
| Program / PDA / vault | An account owned by a program, or executable. It may be a vault, a PDA, or another program-owned structure. wi18 does **not** guess which. |
| Why a token account is not a wallet | `getTokenLargestAccounts` returns token-account addresses. Treating those 20 rows as “top wallets” is wrong. |
| Why one owner can have several token accounts | The same owner can hold the mint in more than one token account. CP18 **aggregates inside the observed top-20 set only**. Another account owned by the same address may sit outside the top 20, so the aggregate is not necessarily the owner’s complete balance. |
| Largest token accounts | Official RPC: up to 20 token accounts for one mint, finalized. Amounts are raw integer strings. |
| Public transaction history | Helius `getTransactionsForAddress` with `status=succeeded` and `tokenAccounts=balanceChanged`. Read-only. |
| Balance delta | `post − pre` raw token amount, BigInt, only for complete wallet-owned token-balance pairs (accountIndex, mint, owner, supported programId, decimals). An unpaired pre or post counterpart makes the **entire transaction incomplete**. wi18 does not infer create/close zeros. Incomplete transactions still count as observed history but do not move directional, unique-mint, target-mint-net, or active-day metrics. |
| Why a delta is not a trade | Transfers, routing, wrapping, account creation, and vault interaction can all move balances. wi18 says `positive_token_delta`, `negative_token_delta`, or `bidirectional_token_change`. It never says BUY, SELL, or SWAP. |
| Bidirectional change | In one transaction the wallet has at least one mint with net raw delta `> 0` **and** a **different** mint with net raw delta `< 0`. That structure is not a guaranteed swap. |
| History censoring | Recent history uses at most three Helius pages: `limit=100`, optional `limit=100`, optional `limit=1` probe. Retain at most 200 unique valid observations. If the probe returns a row, `historyCensored=true` and counts are **lower bounds**. Do not say “exactly 200 transactions.” |
| First observed activity | A separate oldest-first **signatures** query with `limit=1`. It is not fenced by the 30-day window, but it is fenced `slot <= holderContextSlot`. Provider token-account metadata only exists from slot `111491819` (~December 2022). This is **not** wallet creation time and **not** a guaranteed first chain transaction. |
| Holder snapshot slots | `holderContextSlot` is the `getTokenLargestAccounts` ranking slot. `holderResolutionContextSlot` is the later `getMultipleAccounts` owner-resolution slot. `ownerClassificationContextSlot` is a still-later owner-metadata slot. These are not one mathematically atomic historical RPC snapshot. |
| Observed age | `OBSERVED_FRESH_7D` / `OBSERVED_YOUNG_30D` / `OBSERVED_ESTABLISHED_30D_PLUS` / `UNKNOWN`. The word **OBSERVED** is mandatory. Missing `blockTime` ⇒ `UNKNOWN` for first-observed age. Null `blockTime` in the recent window is excluded from 30-day behavioral metrics. |
| Why this can help later research | Future work can test whether these **features** add edge. CP18 only makes the evidence trustworthy. |
| Why CP18 itself does not trade | Evidence is not a signal, not a score, and not wired to s07, paper, or `live:execute`. |

## What this layer uses

- One canonical base58 mint, verified as a supported SPL Token or Token-2022 mint
- Official Solana mainnet-beta genesis identity
- `getTokenLargestAccounts` (finalized) as the holder **ranking** snapshot
- One `getMultipleAccounts` (jsonParsed, finalized, `minContextSlot=holderContextSlot`) to resolve those token accounts
- A later unique-owner `getMultipleAccounts` for classification metadata
- Helius `getTransactionsForAddress` for recent full history (paginated 100/100/1) and first-observed signatures
- Atomic SQLite persistence of public evidence digests, not raw provider JSON

## Frozen limits (no environment override)

| Limit | Value |
| --- | --- |
| Observed token accounts | 20 |
| Analyzed wallet candidates | 10 |
| History window | 30 days |
| Retained full transactions per wallet | 200 unique valid observations; inspect at most 201 |
| Full-history page limit | 100 (never request full `limit > 100`) |
| Censor probe | page 3 `limit=1` only after two full pages with a next token |
| First-observed query | `transactionDetails=signatures`, `sortOrder=asc`, `limit=1` |
| History concurrency | 2 wallets; pages for one wallet stay sequential |
| Provider timeout | 10 seconds |
| Read-only attempts | **2 total = 1 initial + 1 retry** per RPC call; retry only 429 / 5xx / timeout / transport |
| Worst-case history RPC per analyzed wallet | 8 (3 recent pages + 1 first-observed, each up to 2 attempts) |

Analyzed cohort: only `SYSTEM_OWNED_NON_EXECUTABLE` owners with positive observed top-20 aggregate raw amount, sorted by observed top-20 aggregate raw amount DESC, best original token-account rank ASC, then address code-point ASC. Rank is official RPC array position + 1 after proving raw amounts are non-increasing. History performance does not select the cohort. Zero-balance top-20 rows remain observations with 0 share; they are not history-analysis targets.

Share metrics are **observed top-20 balance basis points** using BigInt floor division (`ownerRaw * 10000 / totalRaw`). The sum of owner BPS need not equal 10000. They are not supply share.

Owner/classification RPC calls are later finalized observations. wi18 fail-closes if token-account amount/mint/decimals changed between ranking and resolution. It still cannot prove a mathematically atomic historical RPC snapshot.

Partial failure: if any analyzed wallet history pipeline fails, the entire scan fails and persists nothing.

Duplicate scan fingerprints are rejected by a UNIQUE constraint.

## What this layer must not do

- Sign, construct, or send a transaction
- Read the operator private key or w15 signer
- Call `live:execute`, Jupiter execute/submit, or Jito
- Auto-run from `npm run dev`, discovery, collector, strategy, paper, or live
- Create `smartWalletScore`, whale/alpha/insider scores, or any weighted formula
- Calculate wallet PnL, win rate, ROI, or portfolio value
- Attribute a public key to a person (ENS/SNS, social matching, Wallet Identity API)
- Claim wallets are one entity from funding alone
- Label deltas BUY / SELL / SWAP
- Call first-observed activity wallet creation
- Call the top 20 token accounts “top 20 wallets”

## Commands

| Command | Network | SQLite |
| --- | --- | --- |
| `wallet-intel:status` | no | no write |
| `wallet-intel:holders -- <MINT>` | yes (mainnet) | no write |
| `wallet-intel:inspect -- <MINT>` | yes (mainnet) | no write |
| `wallet-intel:scan -- <MINT>` | yes (mainnet) | atomic write of that same evidence set |
| `wallet-intel:latest -- <MINT>` | no | read-only |
| `wallet-intel:history -- <MINT>` | no | read-only |

There is no `wallet-intel:copy`, `trade`, `buy`, `watch`, `auto`, `follow`, `send`, or `front-run`.

`wallet-intel:scan` requires `DATABASE_ENABLED=true`, schema 9, and `HELIUS_API_KEY`. `TRADING_ENABLED` and `LIVE_BROADCAST_ENABLED` are irrelevant.

## Persistence

One completed scan is one SQLite transaction: scan row, holder rows, profile rows. Failure rolls back all of them. Rows are immutable after insert.

Stored history evidence is a SHA-256 digest of canonical signature / slot / transactionIndex / blockTime / wallet token-delta projection. Pagination tokens and API keys are not fingerprint input. Raw amounts and signed net deltas are TEXT. The database is not a chain archive.

`scan_fingerprint` is UNIQUE. There is no UPDATE path; rows are immutable.

## Fingerprints

`WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT` binds the canonical wi18 rules. Scan and profile fingerprints bind semantic public evidence. They do not bind API keys, provider URLs, machine paths, or database filenames. Same evidence ⇒ same canonical projection. A later semantic change is `wi18_v2`.

## Upstream freeze

s07, b08, p09, pm10, x11, a12, r125, d13, e14, w15, l16, o17, and cost17 stay unchanged. CP18 does not edit entry rules, the optimizer catalog, paper, or live caps.
