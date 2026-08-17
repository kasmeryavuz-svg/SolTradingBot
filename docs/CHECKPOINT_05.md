# Checkpoint 05 — Token risk scanner

This checkpoint teaches the bot to inspect **factual on-chain properties** of a Solana mint and store those observations. It still cannot trade, score tokens, or say that a token is safe or a scam.

## What a token mint is

A mint is the on-chain account that defines a token: its decimals, current authorities, and (for Token-2022) optional extensions. The mint address is the token’s identity.

## What mint authority means

Mint authority is the address currently allowed to create more tokens of that mint. If it is present, more supply can be minted. If it is `none`, this scanner does not see a current minting authority.

## Why active mint authority matters

An active mint authority is a **capability**. It is not proof that anyone will mint, dump, or rug. The scanner only reports that the capability exists right now.

## What freeze authority means

Freeze authority can freeze token accounts of that mint so those accounts cannot move tokens until thawed. The scanner reports the capability. It does not predict that it will be used.

## What Token-2022 is

Token-2022 (the Token Extensions program) is a newer Solana token program. Classic SPL Token mints have a fixed layout. Token-2022 mints can attach extra features called extensions.

## What token extensions are

Extensions are optional mint-level features. This scanner records their names and, when the parsed JSON is clear, a few specific capabilities. Unknown extensions are kept as names only. The scanner does not invent meaning.

## PermanentDelegate

A permanent delegate is a mint-level authority that can authorize transfers or burns for token accounts of that mint. That is a strong technical capability. It is not a verdict that the token is malicious.

## TransferHook

A transfer hook means custom program logic runs as part of a transfer. This scanner does not execute that program, simulate a transfer, or decide whether the hook is harmful.

## NonTransferable

Non-transferable means normal transfers between token accounts are disabled. That is a trading-compatibility fact, not proof of intent.

## DefaultAccountState

If new token accounts start `frozen`, they must be thawed before they can be used normally. The scanner reports that default when the parsed state is clearly `frozen`.

## TransferFeeConfig

Token-2022 TransferFeeConfig can contain older and newer fee schedules with epoch semantics. This scanner records the extension and, when the numbers parse safely, configured or scheduled fee metadata. It does not call `getEpochInfo`, so it does not claim which schedule is currently effective or currently charged. It does not call this a tax scam.

## What total supply means

Supply is the current raw token-unit amount from `getTokenSupply`. It is an integer string such as `1000000000`. The scanner does not use `uiAmount` for math.

## Token account vs wallet owner vs beneficial owner

- A **token account** holds a balance of one mint.
- A **wallet owner** is the account authorized to spend that token account.
- A **beneficial owner** is the real-world person or organization behind it.

`getTokenLargestAccounts` returns **token accounts**. A large account may be a DEX vault, a program account, an exchange account, a treasury, or something else. This checkpoint does not classify that.

## Why the largest accounts do not prove who owns the supply

The RPC method does not return people, insiders, or developer wallets. Concentration math is therefore **low confidence**.

## What concentration means

Concentration is the share of current supply sitting in the largest observed token accounts. Example: top 1 = 25.42% means the single largest token account contains that share of supply.

Top N is the share held by the first `min(N, observed)` ranked token accounts. If only three accounts were returned, top 5, top 10, and top 20 are that same three-account sum. That does not mean five, ten, or twenty accounts were observed.

Mint-account decimals are the canonical decimals. If `getTokenSupply` or any `getTokenLargestAccounts` item reports a different decimals value, that dataset is rejected and concentration is not calculated.

## What basis points mean

10_000 basis points = 100.00%. The database stores integers. The display converts `2542` to `25.42%`.

## Why 50% in one token account is not “the developer owns 50%”

That account might be liquidity, a program, or an exchange. The scanner will say the largest **token account** holds about 50%. It will not say a person owns 50%.

## What severity means

Severity is how serious the **technical indicator** is in this checkpoint’s rules: `info`, `medium`, `high`, or `critical`. It is not a safety rating for the token.

## What confidence means

Confidence is how sure the scanner is about that indicator. Authority facts are high confidence. Concentration heuristics are low confidence because ownership is unknown.

## Why no numeric score exists

A single number would hide different facts and invite “buy if score is low.” Checkpoint 05 has findings, not a score.

## Why a report with no findings is not proof of safety

It only means: none of the Checkpoint 05 indicators triggered. The token can still have locked or unlocked liquidity, a honeypot, wash trading, or other risks this scanner does not inspect.

## What the scanner does not inspect yet

- liquidity locks or burns
- whether the creator will rug
- honeypot / sell simulation
- wash trading
- insider or wallet-cluster analysis
- creator history
- social-media legitimacy
- expected profit or momentum

A risk-only scan may create the canonical `tokens` row. `first_observed_at` is still the first time **this database** recorded the mint, not launch time.

Risk facts come from several RPC calls. Mint, supply, and largest-account slots are stored separately. They are not one atomic blockchain snapshot.
