# Pump.fun Sharpe Sprint Bot

[![make.fun](https://make.fun/badge/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)
[![rank](https://make.fun/badge/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532/rwnliwan/pumpfun-sharpe-sprint-bot/rank.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)
[![reward](https://make.fun/badge/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532/rwnliwan/pumpfun-sharpe-sprint-bot/reward.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)

A deterministic selective-momentum paper-trading bot for make.fun's
[Pump.fun Sharpe Sprint — Cleanest Paper Bot Wins](https://make.fun/bounty/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)
bounty ($2 in USDC).

## Strategy (v4)

One small stake per coin, only where the tape already shows real buying
pressure, then a fixed take-profit / stop-loss / max-hold exit:

- **Entry** (all must hold): net SOL inflow ≥ 1.0 SOL over the last 600
  slots, inflow accelerating (last 300 slots beat the prior 300), price
  +1–18% over the window and within 5% of the window high, real SOL reserves
  0.5–20 SOL, coin age ≥ 120 slots, one entry per mint ever, max 5 open
  positions. Stake 0.05 SOL per position, clamped to the harness size cap.
- **Exit**: take profit +20%, stop loss −8%, or max hold 5400 slots.

Fully deterministic: no clock, no randomness, no environment reads — every
decision comes from the batch the harness hands over, so the two grading
runs agree byte for byte.

## Run

The entrypoint is `main.ts` (Node 22, run as `node /bot/main.ts` by the
grader). The bot shim is vendored at `vendor/makefun-bot.ts` (a byte-identical
copy of the kit's `sdk/ts/makefun-bot.ts`).

Grade locally with the kit (Docker is not installed on this machine, so the
process driver is used):

```sh
node cli/makefun.mjs grade-local --kit . --bot <this repository> --driver process
```

## Honest grade

On the dev window this design grades below hold-cash (0 SOL). It is entered
because it is compliant (guardrails met) and the best of the
selective-momentum family tried — see `trial-log.md` for the full numbers,
not because it wins the dev window.

## License

MIT — see `LICENSE`.
