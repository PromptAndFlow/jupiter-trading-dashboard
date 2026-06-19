// ─── Jupiter Perps Transaction Parser ───────────────────────────
// Parses Jupiter Perps transactions by fetching log messages from Solana RPC.
// Log messages contain instruction names, prices, PnL, fees in plain text.
// Side (Long/Short) is extracted from Anchor event data (base64 "Program data:" entries).

import { extractApiKey } from "./heliusClient";

const PERPS_PROGRAM_ID = "PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu";
const USDC_DECIMALS = 6;

// Custody address → market name mapping
const CUSTODY_MAP = {
  "7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz": "SOL",
  "AQCGyheWPLeo6Qp9WpYS9m3Qj479t7R636N9ey1rEjEn": "ETH",
  "5Pv3gM9JrFFH883SWAhvJC9RPYmo8UNxuFtv5bMMALkm": "BTC",
  "G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa": "USDC",
  "4vkNeXiYEUizLdrpdPS1eC2mccyM4NUPRtERrk6ZETkk": "USDT",
};

// Instruction name patterns from log messages
const DECREASE_NAMES = [
  "InstantDecreasePosition", "DecreasePosition", "DecreasePosition2",
  "DecreasePositionWithTpsl", "ClosePositionRequest", "ClosePositionRequest2",
  "ClosePosition", "ClosePosition2",
];
const INCREASE_NAMES = [
  "InstantIncreasePosition", "IncreasePosition", "IncreasePosition2",
  "IncreasePositionWithTpsl", "OpenPositionRequest", "OpenPositionRequest2",
  "OpenPosition", "OpenPosition2",
];
const LIQUIDATE_NAMES = ["LiquidateFullPosition", "Liquidate"];
// Instruction names to skip — these are pending order setups, not actual trades
const SKIP_NAMES = ["CreatePositionRequest", "CreateTpsl", "UpdateTpsl", "CancelTpsl"];

/**
 * Parse Helius enhanced transactions into trade objects for the journal.
 * Fetches log messages from Solana RPC to extract PnL, prices, and fees.
 *
 * @param {Array} transactions - Helius enhanced transaction objects
 * @param {string} apiKeyInput - Helius API key or URL (for RPC log fetching)
 * @param {object} opts
 * @param {AbortSignal} opts.signal
 * @param {function} opts.onProgress
 * @returns {Promise<Array>} trade objects matching journal schema
 */
export async function parsePerpsTransactions(transactions, apiKeyInput, { signal, onProgress } = {}) {
  const apiKey = extractApiKey(apiKeyInput);
  // Sort chronologically (oldest first)
  const sorted = [...transactions].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const trades = [];
  const openPositions = new Map(); // key: market+side → { entryPrice, sizeUsd, collateralUsd }

  // Fetch log messages in batches
  const batchSize = 20;
  for (let i = 0; i < sorted.length; i += batchSize) {
    if (signal?.aborted) break;
    const batch = sorted.slice(i, i + batchSize);

    // Fetch transaction details (logs + inner instructions) for batch in parallel
    const detailsResults = await Promise.all(
      batch.map(tx => fetchTransactionDetails(tx.signature, apiKey, signal))
    );

    for (let j = 0; j < batch.length; j++) {
      const tx = batch[j];
      const { logs, innerInstructions } = detailsResults[j];
      const parsed = parseFromLogs(logs, innerInstructions, tx);
      if (!parsed) continue;

      if (parsed.type === "increase") {
        // Track open position for entry price correlation
        const key = `${parsed.market}|${parsed.side}`;
        const existing = openPositions.get(key);

        if (existing) {
          const totalSize = existing.sizeUsd + (parsed.sizeUsd || 0);
          if (totalSize > 0 && parsed.entryPrice) {
            existing.entryPrice = (existing.entryPrice * existing.sizeUsd + parsed.entryPrice * (parsed.sizeUsd || 0)) / totalSize;
            existing.sizeUsd = totalSize;
          }
          existing.collateralUsd = (existing.collateralUsd || 0) + (parsed.collateralUsd || 0);
        } else {
          openPositions.set(key, {
            entryPrice: parsed.entryPrice || null,
            sizeUsd: parsed.sizeUsd || 0,
            collateralUsd: parsed.collateralUsd || 0,
          });
        }
      } else if (parsed.type === "decrease" || parsed.type === "liquidate") {
        // Skip trades with no meaningful data (misidentified instructions)
        if (!parsed.exitPrice && !parsed.pnl && !parsed.fees) continue;

        // Emit a trade record
        const key = `${parsed.market}|${parsed.side}`;
        const openPos = openPositions.get(key);

        const entryPrice = parsed.entryPrice || openPos?.entryPrice || null;
        const exitPrice = parsed.exitPrice || null;
        const sizeUsd = parsed.sizeUsd || null;
        const collateralUsd = parsed.collateralUsd || null;
        const leverage = (sizeUsd && collateralUsd) ? Math.round((sizeUsd / collateralUsd) * 10) / 10 : null;

        const dateVal = new Date((tx.timestamp || 0) * 1000);

        // Derive side from price relationship if not detected from logs/events
        let side = parsed.side || "—";
        if (side === "—" && entryPrice && exitPrice && parsed.pnl != null) {
          if (parsed.pnl > 0) {
            side = exitPrice > entryPrice ? "Long" : "Short";
          } else if (parsed.pnl < 0) {
            side = exitPrice < entryPrice ? "Long" : "Short";
          }
        }
        // Fallback: if we only have exit price, try to match with the open position
        // that was tracked at the same market (regardless of side "—")
        if (side === "—" && openPos?.entryPrice && exitPrice && parsed.pnl != null) {
          const ep = openPos.entryPrice;
          if (parsed.pnl > 0) {
            side = exitPrice > ep ? "Long" : "Short";
          } else if (parsed.pnl < 0) {
            side = exitPrice < ep ? "Long" : "Short";
          }
        }
        // Last resort: try all open positions for this market
        if (side === "—" && exitPrice && parsed.pnl != null && parsed.pnl !== 0) {
          for (const [posKey, pos] of openPositions) {
            if (posKey.startsWith(parsed.market + "|") && pos.entryPrice) {
              if (parsed.pnl > 0) {
                side = exitPrice > pos.entryPrice ? "Long" : "Short";
              } else {
                side = exitPrice < pos.entryPrice ? "Long" : "Short";
              }
              break;
            }
          }
        }

        trades.push({
          id: Math.random().toString(36).substr(2, 9),
          date: dateVal,
          dateStr: dateVal.toISOString(),
          side,
          market: parsed.market || "SOL",
          size: sizeUsd,
          leverage,
          entryPrice,
          exitPrice,
          pnl: parsed.pnl ?? 0,
          fees: parsed.fees || 0,
          collateral: collateralUsd,
          txSignature: tx.signature || null,
          source: "wallet",
        });

        // Update tracked position
        if (openPos && sizeUsd) {
          if (sizeUsd < openPos.sizeUsd) {
            openPos.sizeUsd -= sizeUsd;
          } else {
            openPositions.delete(key);
          }
        }
      }
    }

    onProgress?.({ parsed: Math.min(i + batchSize, sorted.length), total: sorted.length });

    // Small delay between batches
    if (i + batchSize < sorted.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  return trades;
}

/**
 * Fetch transaction details (logs + inner instructions) via Solana RPC.
 * Returns { logs: string[], innerInstructions: array } so we can parse both
 * plain-text log messages AND structured Anchor event data.
 */
async function fetchTransactionDetails(signature, apiKey, signal) {
  try {
    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
      }),
    });
    const data = await res.json();
    return {
      logs: data.result?.meta?.logMessages || [],
      innerInstructions: data.result?.meta?.innerInstructions || [],
    };
  } catch {
    return { logs: [], innerInstructions: [] };
  }
}

/**
 * Parse trade data from Solana RPC log messages, inner instructions, and Helius enhanced tx data.
 *
 * Log message patterns from Jupiter Perps:
 *   "Program log: Instruction: InstantDecreasePosition"
 *   "Program log: Exit price: 88805000"
 *   "Program log: Entry price: 88700000"
 *   "Program log: has_profit: true, pnl_delta: 809671063"
 *   "Program log: Collected fee: 39328469"
 *   "Program log: Size delta: 53293490000"
 *   "Program data: <base64>" — Anchor event containing side (Long/Short)
 *
 * Inner instructions contain Anchor CPI events with structured binary data
 * that can be decoded to extract side, sizeUsd, collateralUsd, price etc.
 */
function parseFromLogs(logs, innerInstructions, tx) {
  if (!logs.length) return null;

  // Find the first relevant instruction name (skip oracle updates, compute budget, etc.)
  let type = null;
  for (const log of logs) {
    const ixMatch = log.match(/Instruction:\s+(\w+)/);
    if (!ixMatch) continue;
    const name = ixMatch[1];
    // Skip non-trade instructions
    if (SKIP_NAMES.some(n => name.includes(n))) continue;
    if (["UpdateWithSigner", "UpdateAgPriceFeed", "Transfer", "CloseAccount", "ComputeBudget"].some(n => name.includes(n))) continue;

    if (DECREASE_NAMES.some(n => name.includes(n))) { type = "decrease"; break; }
    else if (INCREASE_NAMES.some(n => name.includes(n))) { type = "increase"; break; }
    else if (LIQUIDATE_NAMES.some(n => name.includes(n))) { type = "liquidate"; break; }
  }

  if (!type) return null;

  // Extract values from log messages (plain text)
  const extract = (pattern) => {
    for (const log of logs) {
      const match = log.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const exitPriceRaw = extract(/Exit price:\s*(\d+)/);
  const entryPriceRaw = extract(/Entry price:\s*(\d+)/);
  const pnlMatch = extract(/pnl_delta:\s*(\d+)/);
  const hasProfit = extract(/has_profit:\s*(true|false)/);
  const feeRaw = extract(/Collected fee:\s*(\d+)/);
  const sizeDeltaRaw = extract(/Size delta:\s*(\d+)/) || extract(/size_usd_delta:\s*(\d+)/);
  const sizeRaw = extract(/size_usd:\s*(\d+)/);
  const swapUsdRaw = extract(/swap_usd_amount:\s*(\d+)/);

  // Convert atomic values to USD (÷ 1e6)
  let exitPrice = exitPriceRaw ? parseInt(exitPriceRaw) / 1e6 : null;
  let entryPrice = entryPriceRaw ? parseInt(entryPriceRaw) / 1e6 : null;
  let fees = feeRaw ? parseInt(feeRaw) / 1e6 : null;
  let sizeUsd = sizeDeltaRaw ? parseInt(sizeDeltaRaw) / 1e6 : (sizeRaw ? parseInt(sizeRaw) / 1e6 : null);

  // Collateral: use USDC/USDT token transfers from Helius enhanced data
  const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
  let collateralUsd = null;
  if (tx.tokenTransfers?.length) {
    const stablecoinTransfer = tx.tokenTransfers.find(t => t.mint === USDC_MINT || t.mint === USDT_MINT);
    if (stablecoinTransfer) collateralUsd = stablecoinTransfer.tokenAmount;
  }
  if (!collateralUsd && swapUsdRaw) {
    collateralUsd = parseInt(swapUsdRaw) / 1e6;
  }

  // Determine collateral type from the Perps instruction accounts.
  // Jupiter Perps instructions list the collateral custody account — if it's a
  // stablecoin custody (USDC/USDT) → Short, if it's the asset custody (SOL/ETH/BTC) → Long.
  // The collateral custody is typically the LAST custody account in the instruction.
  let collateralCustodyType = null; // "stable" or "asset"
  if (tx.instructions) {
    for (const ix of tx.instructions) {
      if (ix.programId === PERPS_PROGRAM_ID && ix.accounts) {
        // Scan accounts for custody addresses; the collateral custody is usually
        // after the main custody. If we find a stablecoin custody → Short.
        const custodies = ix.accounts.filter(acc => CUSTODY_MAP[acc]);
        if (custodies.length >= 2) {
          // Last custody is the collateral custody
          const lastCustody = custodies[custodies.length - 1];
          const custodyName = CUSTODY_MAP[lastCustody];
          collateralCustodyType = (custodyName === "USDC" || custodyName === "USDT") ? "stable" : "asset";
        } else if (custodies.length === 1) {
          // Single custody — the asset itself is the collateral → Long
          const custodyName = CUSTODY_MAP[custodies[0]];
          if (custodyName !== "USDC" && custodyName !== "USDT") collateralCustodyType = "asset";
          else collateralCustodyType = "stable";
        }
      }
    }
  }

  // Calculate PnL
  let pnl = 0;
  if (pnlMatch) {
    pnl = parseInt(pnlMatch) / 1e6;
    if (hasProfit === "false") pnl = -pnl;
  }

  // Identify market from tx accounts
  const market = identifyMarketFromTx(tx);

  // ── Try to extract structured data from Anchor CPI events ──
  // Inner instructions contain bs58-encoded event data with an 8-byte
  // Anchor discriminator followed by the event struct fields.
  const eventData = parseAnchorEventData(innerInstructions, logs);

  // Use event data to fill in missing fields
  if (eventData) {
    if (eventData.sizeUsd && !sizeUsd) sizeUsd = eventData.sizeUsd;
    if (eventData.collateralUsd && !collateralUsd) collateralUsd = eventData.collateralUsd;
    if (eventData.price && !entryPrice) entryPrice = eventData.price;
  }

  // Identify side — most reliable: collateral custody type from Perps instruction accounts
  // Jupiter Perps: Long = asset collateral (SOL/ETH/BTC), Short = stablecoin collateral (USDC/USDT)
  let side = "—";
  if (collateralCustodyType === "stable") {
    side = "Short";
  } else if (collateralCustodyType === "asset") {
    side = "Long";
  }
  // Fallback to event data and log parsing
  if (side === "—") side = eventData?.side || identifySide(logs, tx);

  return { type, market, side, entryPrice, exitPrice, sizeUsd, collateralUsd, pnl, fees };
}

// ─── Base58 decoder (for inner instruction data) ──────────────
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function decodeBase58(str) {
  const bytes = [];
  for (const c of str) {
    let carry = BASE58_ALPHABET.indexOf(c);
    if (carry < 0) return null;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Leading zeros
  for (const c of str) {
    if (c !== "1") break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

// Read a u64 (little-endian) from a Uint8Array at the given offset
function readU64(bytes, offset) {
  let val = 0;
  for (let i = 7; i >= 0; i--) {
    val = val * 256 + (bytes[offset + i] || 0);
  }
  return val;
}

// Read an i64 (little-endian, signed) from a Uint8Array
function readI64(bytes, offset) {
  const lo = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
  const hi = bytes[offset + 4] | (bytes[offset + 5] << 8) | (bytes[offset + 6] << 16) | (bytes[offset + 7] << 24);
  return hi * 0x100000000 + (lo >>> 0);
}

/**
 * Parse Anchor CPI event data from inner instructions.
 *
 * Jupiter Perps emits events as CPI calls to the event authority.
 * The inner instruction data is bs58-encoded and has this layout:
 *   [8 bytes discriminator][event struct fields...]
 *
 * From the Jupiter Perps IDL, ALL trade events share the same field prefix:
 *   positionKey(32) + positionSide(1) + positionCustody(32) +
 *   positionCollateralCustody(32) + positionSizeUsd(8) + ...
 *
 * Event positionSide is u8: 1=Long, 2=Short (matches PDA seed encoding,
 * NOT the Borsh enum encoding used in position account state).
 *
 * Offsets after 8-byte discriminator:
 *   positionSide:               32
 *   positionCollateralCustody:  65 (32 bytes)
 *   positionSizeUsd:            97 (8 bytes, u64 / 1e6 = USD)
 */
function parseAnchorEventData(innerInstructions, logs) {
  if (!innerInstructions?.length) return null;

  // Known collateral custody addresses → determines side as backup
  const STABLE_CUSTODIES = new Set([
    "G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa", // USDC
    "4vkNeXiYEUizLdrpdPS1eC2mccyM4NUPRtERrk6ZETkk", // USDT
  ]);

  // Collect all inner instruction data payloads
  const payloads = [];
  for (const group of innerInstructions) {
    for (const ix of (group.instructions || [])) {
      if (ix.data && typeof ix.data === "string" && ix.data.length > 20) {
        const decoded = decodeBase58(ix.data);
        if (decoded && decoded.length > 105) {
          payloads.push(decoded);
        }
      }
    }
  }

  // Also collect from "Program data:" log entries (base64-encoded)
  for (const log of logs) {
    const match = log.match(/^Program data:\s*(.+)$/);
    if (!match) continue;
    try {
      const binary = atob(match[1].trim());
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      if (bytes.length > 105) payloads.push(bytes);
    } catch {}
  }

  if (payloads.length === 0) return null;

  // IDL-derived layout: after 8-byte discriminator
  const DISC = 8;
  const SIDE_OFFSET = DISC + 32;           // 40 from start
  const COLLATERAL_CUSTODY_OFFSET = DISC + 65;  // 73 from start (32 bytes)
  const SIZE_USD_OFFSET = DISC + 97;       // 105 from start (u64)

  for (const bytes of payloads) {
    if (bytes.length < SIZE_USD_OFFSET + 8) continue;

    const sideByte = bytes[SIDE_OFFSET];
    // Event positionSide: 1=Long, 2=Short
    if (sideByte !== 1 && sideByte !== 2) continue;

    // Validate sizeUsd: should be reasonable (> $1, < $100M)
    const sizeRaw = readU64(bytes, SIZE_USD_OFFSET);
    const sizeUsdVal = sizeRaw / 1e6;
    if (sizeUsdVal < 1 || sizeUsdVal > 100_000_000) continue;

    const side = sideByte === 1 ? "Long" : "Short";

    return {
      side,
      sizeUsd: sizeUsdVal,
    };
  }

  return null;
}

/**
 * Identify market (SOL, ETH, BTC) from transaction accounts.
 */
function identifyMarketFromTx(tx) {
  // Check perps instruction accounts for custody addresses
  if (tx.instructions) {
    for (const ix of tx.instructions) {
      if (ix.programId === PERPS_PROGRAM_ID && ix.accounts) {
        for (const acc of ix.accounts) {
          if (CUSTODY_MAP[acc] && CUSTODY_MAP[acc] !== "USDC" && CUSTODY_MAP[acc] !== "USDT") {
            return CUSTODY_MAP[acc];
          }
        }
      }
    }
  }
  // Check all account data
  if (tx.accountData) {
    for (const a of tx.accountData) {
      if (CUSTODY_MAP[a.account] && CUSTODY_MAP[a.account] !== "USDC" && CUSTODY_MAP[a.account] !== "USDT") {
        return CUSTODY_MAP[a.account];
      }
    }
  }
  return "SOL";
}

/**
 * Identify position side (Long/Short) using multiple strategies:
 * 1. Plain-text log patterns (is_long, side:, etc.)
 * 2. Anchor event data from "Program data:" log entries (base64 decoded)
 * 3. Helius enhanced transaction description and events
 * 4. Helius enhanced account data / inner instructions
 */
function identifySide(logs, tx) {
  const logStr = logs.join("\n");

  // 1. Plain-text log patterns — check many variations
  if (/is_long:\s*false/i.test(logStr)) return "Short";
  if (/is_long:\s*true/i.test(logStr)) return "Long";
  if (/side:\s*short/i.test(logStr) || /Short position/i.test(logStr)) return "Short";
  if (/side:\s*long/i.test(logStr) || /Long position/i.test(logStr)) return "Long";
  if (/position_side:\s*2/i.test(logStr)) return "Short";
  if (/position_side:\s*1/i.test(logStr)) return "Long";
  // Jupiter Perps event positionSide u8: 1=Long, 2=Short (PDA seed encoding)
  if (/side:\s*2\b/.test(logStr)) return "Short";
  if (/side:\s*1\b/.test(logStr)) return "Long";

  // 2. Decode Anchor event data from "Program data:" entries
  const sideFromEvent = parseSideFromEventData(logs);
  if (sideFromEvent) return sideFromEvent;

  // 3. Check description from Helius enhanced data
  const desc = (tx.description || "").toLowerCase();
  if (desc.includes("short")) return "Short";
  if (desc.includes("long")) return "Long";

  // 4. Check Helius events array
  if (tx.events) {
    for (const ev of (Array.isArray(tx.events) ? tx.events : [])) {
      const evStr = JSON.stringify(ev).toLowerCase();
      if (evStr.includes('"short"') || evStr.includes('"side":2') || evStr.includes('"is_long":false')) return "Short";
      if (evStr.includes('"long"') || evStr.includes('"side":1') || evStr.includes('"is_long":true')) return "Long";
    }
  }

  return "—";
}

/**
 * Try to extract side from base64-encoded Anchor event data in log messages.
 * Jupiter Perps events contain positionSide as u8 (1=Long, 2=Short).
 * We look for "Program data:" entries and scan for the side byte at known offsets.
 *
 * From the IDL, all trade events start with:
 *   discriminator(8) + positionKey(32) + positionSide(1) + ...
 * So positionSide is at offset 40 from byte 0.
 */
function parseSideFromEventData(logs) {
  // IDL-derived offset: discriminator(8) + positionKey(32) = 40
  // Also try other offsets for non-standard events
  const SIDE_OFFSETS = [40, 8, 72, 104];

  // Collect all Program data entries that come after the Perps program invocation
  let inPerpsContext = false;
  const candidates = [];
  for (const log of logs) {
    if (log.includes(PERPS_PROGRAM_ID)) inPerpsContext = true;
    if (inPerpsContext) {
      const match = log.match(/^Program data:\s*(.+)$/);
      if (match) candidates.push(match[1].trim());
    }
  }
  // Also try all Program data entries if none found in perps context
  if (candidates.length === 0) {
    for (const log of logs) {
      const match = log.match(/^Program data:\s*(.+)$/);
      if (match) candidates.push(match[1].trim());
    }
  }

  for (const base64 of candidates) {
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      // Skip very small payloads (not real events)
      if (bytes.length < 16) continue;

      // Check each known offset for a valid side byte
      for (const offset of SIDE_OFFSETS) {
        if (bytes.length <= offset) continue;
        const sideByte = bytes[offset];
        if (sideByte === 1) return "Long";
        if (sideByte === 2) return "Short";
      }
    } catch {
      // Invalid base64, skip
    }
  }
  return null;
}
