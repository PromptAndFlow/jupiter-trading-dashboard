// ─── Helius API Client for Jupiter Perps ────────────────────────
const PERPS_PROGRAM_ID = "PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu";
const HELIUS_KEY_STORAGE = "jupiter-perps-helius-key";
const WALLETS_STORAGE = "jupiter-perps-wallets";

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidSolanaAddress(addr) {
  return typeof addr === "string" && BASE58_RE.test(addr.trim());
}

/**
 * Extract the API key from a full Helius URL or a plain key string.
 * Accepts: "83ad2012-..." or "https://beta.helius-rpc.com/?api-key=83ad2012-..." etc.
 */
export function extractApiKey(input) {
  if (!input) return "";
  const trimmed = input.trim();
  // Try to extract api-key param from a URL
  try {
    if (trimmed.includes("helius") || trimmed.includes("http")) {
      const url = new URL(trimmed);
      const key = url.searchParams.get("api-key");
      if (key) return key;
    }
  } catch { /* not a URL, treat as raw key */ }
  return trimmed;
}

export function getSavedApiKey() {
  return localStorage.getItem(HELIUS_KEY_STORAGE) || "";
}

export function saveApiKey(key) {
  if (key) localStorage.setItem(HELIUS_KEY_STORAGE, key);
  else localStorage.removeItem(HELIUS_KEY_STORAGE);
}

export function getSavedWallets() {
  try {
    const saved = localStorage.getItem(WALLETS_STORAGE);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return [];
}

export function saveWallets(wallets) {
  if (wallets?.length) localStorage.setItem(WALLETS_STORAGE, JSON.stringify(wallets));
  else localStorage.removeItem(WALLETS_STORAGE);
}

/**
 * Fetch all Jupiter Perps transactions for a wallet via Helius Enhanced API.
 * Returns an array of parsed transaction objects.
 *
 * @param {string} walletAddress - Solana wallet public key
 * @param {string} apiKey - Helius API key
 * @param {object} opts
 * @param {function} opts.onProgress - callback({ page, totalTxs, perpsTxs })
 * @param {AbortSignal} opts.signal - AbortController signal for cancellation
 * @returns {Promise<Array>} filtered perps transactions
 */
export async function fetchPerpsTransactions(walletAddress, apiKeyInput, { onProgress, signal, since } = {}) {
  if (!isValidSolanaAddress(walletAddress)) throw new Error("Invalid Solana wallet address");
  const apiKey = extractApiKey(apiKeyInput);
  if (!apiKey) throw new Error("Helius API key is required");

  const sinceTs = since ? Math.floor(since.getTime() / 1000) : null;
  const allPerpsTxs = [];
  let lastSignature = null;
  let page = 0;
  let totalFetched = 0;
  let reachedCutoff = false;

  while (true) {
    if (signal?.aborted) throw new Error("Cancelled");

    page++;
    const url = new URL(`https://api-mainnet.helius-rpc.com/v0/addresses/${walletAddress.trim()}/transactions`);
    url.searchParams.set("api-key", apiKey);
    if (lastSignature) url.searchParams.set("before", lastSignature);

    const res = await fetch(url.toString(), { signal });

    if (res.status === 429) {
      // Rate limited — back off and retry
      await sleep(2000);
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("Invalid Helius API key");
    }
    if (!res.ok) {
      throw new Error(`Helius API error: ${res.status} ${res.statusText}`);
    }

    const txs = await res.json();
    if (!Array.isArray(txs) || txs.length === 0) break;

    totalFetched += txs.length;
    lastSignature = txs[txs.length - 1].signature;

    // Filter for transactions that involve the Jupiter Perps program
    // If since is set, also filter out transactions older than the cutoff
    let perpsTxs = txs.filter(tx => isPerpsTransaction(tx));
    if (sinceTs) {
      perpsTxs = perpsTxs.filter(tx => (tx.timestamp || 0) >= sinceTs);
      // Check if the oldest tx in this page is before our cutoff
      const oldestTs = txs[txs.length - 1].timestamp || 0;
      if (oldestTs < sinceTs) reachedCutoff = true;
    }
    allPerpsTxs.push(...perpsTxs);

    onProgress?.({ page, totalTxs: totalFetched, perpsTxs: allPerpsTxs.length });

    // Stop if we've gone past the date cutoff
    if (reachedCutoff) break;
    // If we got fewer than 100, we've reached the end
    if (txs.length < 100) break;

    // Small delay to respect rate limits
    await sleep(200);
  }

  return allPerpsTxs;
}

function isPerpsTransaction(tx) {
  // Check if any instruction or inner instruction references the Perps program
  if (tx.instructions?.some(ix => ix.programId === PERPS_PROGRAM_ID)) return true;
  if (tx.accountData?.some(a => a.account === PERPS_PROGRAM_ID)) return true;
  // Helius enhanced format may list programs at top level
  if (tx.programId === PERPS_PROGRAM_ID) return true;
  // Check in the raw instructions array
  if (tx.transaction?.message?.instructions?.some(ix => ix.programId === PERPS_PROGRAM_ID)) return true;
  // Check description for Jupiter Perpetuals mentions
  if (tx.description?.toLowerCase().includes("perpetual")) return true;
  // Check events
  if (tx.events?.some?.(e => e.programId === PERPS_PROGRAM_ID)) return true;
  return false;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
