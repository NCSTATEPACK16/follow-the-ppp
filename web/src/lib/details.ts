import { DETAILS_BASE_URL } from "./config";
import { rowToLoan } from "./loanRecord";
import type { LoanRecord } from "../types";

/**
 * The pin-tap path: one loan's full record, without booting a SQL engine.
 *
 * Measured against R2, the DuckDB-WASM lookup this replaces cost ~1.1s of
 * query — but only after downloading 6.8MB of compressed WebAssembly and
 * compiling 34MB of engine. On iOS Safari over cellular that boot was the
 * whole wait, and it ran while MapLibre was pulling tiles over the same
 * connection.
 *
 * scripts/07b_detail_shards.py splits the same rows into 9,000 static gzipped
 * JSON files keyed by the first four digits of the loan number, so the client
 * derives the filename by slicing a string: no index to fetch first, no second
 * round trip before the one that carries the answer. A shard is ~80KB.
 */

/** Positional values under a shared column header — see the stage 7b writer. */
interface Shard {
  c: string[];
  r: Record<string, unknown[]>;
}

const PREFIX_LEN = 4;

/**
 * Shards already fetched, newest last.
 *
 * Bounded because a visitor working through a dense city taps a lot of pins,
 * and each neighbouring pin is a different loan number in a different shard.
 * Twelve is about a megabyte — enough that going back to a loan just looked at
 * is free, small enough that a long session cannot grow without limit.
 */
const CACHE_LIMIT = 12;
const cache = new Map<string, Promise<Shard>>();

function shardFor(prefix: string): Promise<Shard> {
  const hit = cache.get(prefix);
  if (hit) return hit;

  const pending = fetch(`${DETAILS_BASE_URL}/${prefix}.json.gz`)
    .then((response) => {
      if (!response.ok) throw new Error(`shard ${prefix}: HTTP ${response.status}`);
      // Stored gzipped and served with Content-Encoding: gzip — r2.dev returns
      // stored bytes as-is and does not compress on the fly — so the browser
      // has already decompressed this by the time we read it.
      return response.json() as Promise<Shard>;
    })
    .catch((err) => {
      // A failed fetch must not poison the cache: the next tap on the same
      // shard should retry rather than replay the rejection forever.
      cache.delete(prefix);
      throw err;
    });

  cache.set(prefix, pending);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return pending;
}

/** Turns a shard's positional row back into a record. */
function toLoan(loanNumber: string, columns: string[], values: unknown[]): LoanRecord {
  const row: Record<string, unknown> = { loan_number: loanNumber };
  columns.forEach((name, i) => {
    row[name] = values[i];
  });
  return rowToLoan(row);
}

/** One loan by number, or null when the release has no such loan. */
export async function getLoanDetail(loanNumber: string): Promise<LoanRecord | null> {
  const shard = await shardFor(loanNumber.slice(0, PREFIX_LEN));
  const values = shard.r[loanNumber.slice(PREFIX_LEN)];
  return values ? toLoan(loanNumber, shard.c, values) : null;
}

/** Every prefix 1000–9999 is populated (stage 7b: 9,000 shards, none empty). */
const PREFIX_MIN = 1000;
const PREFIX_MAX = 9999;

/**
 * Some loan, for the "random loan" button.
 *
 * Uniform over shards and then over the rows within one, which is very nearly
 * uniform over loans: the shards run 1,263 rows on average and 1,584 at worst,
 * so the spread is under 25% and no loan is meaningfully harder to draw than
 * another. The alternative — a random seek into the key space — is what the
 * DuckDB version did, and it cost the same engine boot as everything else.
 */
export async function getRandomLoanDetail(): Promise<LoanRecord | null> {
  const prefix = String(
    PREFIX_MIN + Math.floor(Math.random() * (PREFIX_MAX - PREFIX_MIN + 1)),
  );
  const shard = await shardFor(prefix);
  const keys = Object.keys(shard.r);
  if (keys.length === 0) return null;
  const key = keys[Math.floor(Math.random() * keys.length)];
  return toLoan(prefix + key, shard.c, shard.r[key]);
}
