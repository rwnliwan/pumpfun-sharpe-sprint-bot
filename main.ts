// Pump.fun Sharpe Sprint — selective momentum bot (v4 rebuild).
//
// Strategy: SELECTIVE MOMENTUM, deterministic. One small stake per coin, only
// on coins whose tape already shows real buying pressure, then a fixed
// take-profit / stop-loss / max-hold exit. No clock, no randomness, no
// environment reads: every decision comes from the batch the harness hands
// over (hello, batch, orders, slot), so the two grading runs agree byte for
// byte.
//
// Entry (all must hold, evaluated on a batch that carries a trade on the mint):
//   - net SOL inflow over the last 600 slots >= 1.0 SOL (buys minus sells),
//   - inflow accelerating: inflow in the last 300 slots beats the prior 300,
//   - price up +1%..+18% over the window (vs the earliest trade price still
//     inside the 600-slot window) and within 5% of the window high,
//   - real SOL reserves between 0.5 and 20 SOL,
//   - coin age >= 120 slots since its CreateEvent (or first sight),
//   - one entry per mint ever; at most 5 open positions.
// Stake is 0.05 SOL per position, clamped to the harness size cap (1% of the
// mint's real SOL reserve, at least 0.005 SOL), slippage left wide open so a
// fill is never refused for the price moving in the 2-slot latency.
//
// Exit (per position, priced off the buy fill's own cost basis):
//   - take profit +20%, stop loss -8%, or max hold 5400 slots — sell all.
//
// Honest note: on the dev window this design grades below hold-cash (0 SOL).
// It is entered because it is compliant (guardrails met) and the best of the
// selective-momentum family tried, not because it wins the dev window.

import {
  LAMPORTS_PER_SOL,
  runBot,
  type BotState,
  type BuyInput,
  type OrderInput,
  type SellInput,
} from './vendor/makefun-bot.ts';

// ------------------------------------------------------------------ tuning

const WINDOW_SLOTS = 600; // entry window, in slots
const HALF_WINDOW_SLOTS = 300; // inflow-acceleration split
const MIN_INFLOW_LAMPORTS = LAMPORTS_PER_SOL; // 1.0 SOL net inflow / window
const STAKE_LAMPORTS = LAMPORTS_PER_SOL / 20n; // 0.05 SOL target stake
const MIN_BUY_LAMPORTS = LAMPORTS_PER_SOL / 200n; // 0.005 SOL smallest buy
const MAX_SLIPPAGE_BPS = 10_000; // wide open: never refuse on latency moves
const MIN_RESERVE_LAMPORTS = LAMPORTS_PER_SOL / 2n; // 0.5 SOL real reserves
const MAX_RESERVE_LAMPORTS = LAMPORTS_PER_SOL * 20n; // 20 SOL real reserves
const MIN_AGE_SLOTS = 120;
const MIN_GAIN = 0.01; // +1% over the window
const MAX_GAIN = 0.18; // +18% over the window
const NEAR_HIGH = 0.95; // within 5% of the window high
const TAKE_PROFIT = 1.2; // +20%
const STOP_LOSS = 0.92; // -8%
const HOLD_SLOTS = 5400;

// ------------------------------------------------------------------ per-mint tape

interface TapeSample {
  slot: number;
  price: number; // SOL per token, post-trade virtual reserves ratio
  signedSol: bigint; // +buy / -sell, lamports
}

interface MintTape {
  firstSeenSlot: number;
  samples: TapeSample[];
}

interface EntryInfo {
  price: number; // cost basis, SOL per token, from the buy fill
  slot: number; // slot the buy fill resolved at
}

const tapes = new Map<string, MintTape>();
const entered = new Set<string>(); // one entry per mint ever
const entries = new Map<string, EntryInfo>(); // open positions' cost basis

function priceOf(state: BotState, mint: string): number | null {
  const curve = state.curves.get(mint);
  if (curve === undefined) return null;
  if (curve.virtual_token_reserves === 0n) return null;
  return Number(curve.virtual_quote_reserves) / Number(curve.virtual_token_reserves);
}

function pruneTape(tape: MintTape, slot: number): void {
  const cutoff = slot - WINDOW_SLOTS;
  let drop = 0;
  while (drop < tape.samples.length && tape.samples[drop].slot <= cutoff) drop += 1;
  if (drop > 0) tape.samples.splice(0, drop);
}

// ------------------------------------------------------------------ the bot

await runBot({
  onBatch(state, batch) {
    const orders: OrderInput[] = [];
    const slot = state.slot;
    const caps = state.hello.caps;
    const tx = state.txFeeLamports();
    let free = state.freeCashLamports();
    let openSlots = caps.max_open_positions - state.committedPositionCount();

    // 1. Fold this batch's fills in: a buy fill opens a position (cost basis
    //    from the fill itself), a sell fill or a harness close ends it.
    for (const fill of batch.fills) {
      if (fill.status !== 'filled') continue;
      if (fill.side === 'buy') {
        const spent = BigInt(fill.quote_lamports);
        const tokens = BigInt(fill.token_amount);
        if (spent > 0n && tokens > 0n) {
          entries.set(fill.mint, { price: Number(spent) / Number(tokens), slot: fill.slot });
        }
      } else {
        entries.delete(fill.mint);
      }
    }

    // 2. Tape this batch's trades, and note which mints moved.
    const moved = new Set<string>();
    for (const event of batch.events) {
      if (event.event !== 'TradeEvent') continue;
      const mint = event.mint;
      moved.add(mint);
      let tape = tapes.get(mint);
      if (tape === undefined) {
        tape = { firstSeenSlot: event.slot, samples: [] };
        tapes.set(mint, tape);
      }
      const tokenReserves = BigInt(event.virtual_token_reserves);
      if (tokenReserves === 0n) continue;
      const price = Number(BigInt(event.virtual_quote_reserves)) / Number(tokenReserves);
      const sol = BigInt(event.sol_amount);
      tape.samples.push({ slot: event.slot, price, signedSol: event.is_buy ? sol : -sol });
      pruneTape(tape, slot);
    }

    // 3. Exits. Hold expiry is time-based, so it is swept over every open
    //    position each batch; take-profit / stop-loss need a fresh price, so
    //    they are checked only for mints that traded in this batch.
    const pendingSell = new Set<string>();
    for (const pending of state.pending.values()) {
      if (pending.order.side === 'sell') pendingSell.add(pending.order.mint);
    }
    const maybeExit = (mint: string, checkPrice: boolean): void => {
      if (pendingSell.has(mint)) return;
      const position = state.positions.get(mint);
      const entry = entries.get(mint);
      if (position === undefined || entry === undefined) return;
      if (slot - entry.slot >= HOLD_SLOTS) {
        orders.push({ side: 'sell', mint, token_amount: position.token_amount, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies SellInput);
        pendingSell.add(mint);
        return;
      }
      if (!checkPrice) return;
      const price = priceOf(state, mint);
      if (price === null) return;
      if (price >= entry.price * TAKE_PROFIT || price <= entry.price * STOP_LOSS) {
        orders.push({ side: 'sell', mint, token_amount: position.token_amount, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies SellInput);
        pendingSell.add(mint);
      }
    };
    for (const mint of state.positions.keys()) maybeExit(mint, moved.has(mint));

    // 4. Entries, in the order the batch's events moved the mints.
    for (const mint of moved) {
      if (orders.length >= caps.max_orders_per_batch) break;
      if (openSlots <= 0) break;
      if (entered.has(mint)) continue;
      const curve = state.curves.get(mint);
      if (curve === undefined || curve.complete) continue;
      const tape = tapes.get(mint);
      if (tape === undefined || tape.samples.length < 2) continue;

      // Age: creation slot when the harness saw the CreateEvent, else first sight.
      const born = curve.created_slot ?? tape.firstSeenSlot;
      if (slot - born < MIN_AGE_SLOTS) continue;

      // Real reserves inside 0.5..20 SOL.
      const reserves = curve.real_quote_reserves;
      if (reserves < MIN_RESERVE_LAMPORTS || reserves > MAX_RESERVE_LAMPORTS) continue;

      // Window stats from the tape (already pruned to the last 600 slots).
      const samples = tape.samples;
      const firstPrice = samples[0].price;
      const lastPrice = samples[samples.length - 1].price;
      if (firstPrice <= 0) continue;
      const gain = (lastPrice - firstPrice) / firstPrice;
      if (gain < MIN_GAIN || gain > MAX_GAIN) continue;
      let high = 0;
      let inflow = 0n;
      let recentInflow = 0n;
      const split = slot - HALF_WINDOW_SLOTS;
      for (const sample of samples) {
        if (sample.price > high) high = sample.price;
        inflow += sample.signedSol;
        if (sample.slot > split) recentInflow += sample.signedSol;
      }
      if (lastPrice < high * NEAR_HIGH) continue;
      if (inflow < MIN_INFLOW_LAMPORTS) continue;
      const earlierInflow = inflow - recentInflow;
      if (recentInflow <= 0n || recentInflow <= earlierInflow) continue;

      // Size: target stake clamped to the harness cap; skip dust.
      const amount = state.maxBuyLamports(mint) < STAKE_LAMPORTS ? state.maxBuyLamports(mint) : STAKE_LAMPORTS;
      if (amount < MIN_BUY_LAMPORTS) continue;
      if (free < amount + tx) continue;

      orders.push({ side: 'buy', mint, quote_lamports: amount, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies BuyInput);
      entered.add(mint);
      free -= amount + tx;
      openSlots -= 1;
    }

    // 5. Drop tapes that hold nothing any more and belong to no position.
    for (const [mint, tape] of tapes) {
      if (tape.samples.length === 0 && !state.positions.has(mint)) tapes.delete(mint);
    }

    return orders;
  },
});
