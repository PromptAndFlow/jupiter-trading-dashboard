import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "./supabaseClient";
import { fetchPerpsTransactions, isValidSolanaAddress, getSavedApiKey, saveApiKey, getSavedWallets, saveWallets, extractApiKey } from "./heliusClient";
import { parsePerpsTransactions } from "./walletImport";
import { demoTrades } from "./demoData";

const STORAGE_KEY = "jupiter-perps-trades";
const THEME_KEY = "jupiter-perps-theme";
const GOALS_KEY = "jupiter-perps-goals";

// ─── Auth Login Component ──────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const bg = "#020617";
  const bgCard = "#0a0f1e";
  const border = "#1e293b";
  const accent = "#6366f1";
  const accentHover = "#818cf8";
  const text = "#e2e8f0";
  const textMuted = "#64748b";
  const negative = "#ef4444";

  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ background: bgCard, border: `1px solid ${border}`, borderRadius: 16, padding: "40px 36px", width: 380, maxWidth: "90vw" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: `linear-gradient(135deg, ${accent}, ${accentHover})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: "#fff" }}>J</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: text }}>Jupiter Perps Journal</div>
            <div style={{ fontSize: 11, color: textMuted }}>SOL Perpetuals Tracker</div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: textMuted, marginBottom: 6 }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: "100%", padding: "10px 12px", background: bg, border: `1px solid ${border}`, borderRadius: 8, color: text, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
              placeholder="you@example.com"
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, color: textMuted, marginBottom: 6 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{ width: "100%", padding: "10px 12px", background: bg, border: `1px solid ${border}`, borderRadius: 8, color: text, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: negative, background: `${negative}18`, padding: "8px 12px", borderRadius: 8, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: "12px 0", background: accent, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1, transition: "all 0.15s" }}
          >
            {loading ? "Please wait..." : "Sign In"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: textMuted }}>
          Invitation only — contact admin for access.
        </div>
      </div>
    </div>
  );
}

// ─── Supabase helpers ──────────────────────────────────────────
function tradeToRow(trade, userId) {
  return {
    user_id: userId,
    date_str: trade.dateStr,
    pnl: trade.pnl ?? 0,
    market: trade.market ?? "SOL-PERP",
    side: trade.side ?? "Long",
    size: trade.size ?? null,
    entry_price: trade.entryPrice ?? null,
    exit_price: trade.exitPrice ?? null,
    fees: trade.fees ?? 0,
    leverage: trade.leverage ? parseFloat(trade.leverage) || null : null,
    collateral: trade.collateral ?? null,
  };
}

function rowToTrade(row) {
  return {
    id: row.id,
    date: new Date(row.date_str),
    dateStr: row.date_str,
    pnl: row.pnl,
    market: row.market,
    side: row.side,
    size: row.size,
    entryPrice: row.entry_price,
    exitPrice: row.exit_price,
    fees: row.fees,
    leverage: row.leverage,
    collateral: row.collateral,
  };
}

const DEFAULT_GOALS = {
  dailyTarget:        1000,
  dailyStopLoss:      1500,
  weeklyTarget:       4500,
  monthlyTarget:      15000,
  winRateTarget:      55,    // whole number %
  profitFactorTarget: 1.5,
  avgRatioTarget:     1.0,
};

function loadGoals() {
  try {
    const saved = localStorage.getItem(GOALS_KEY);
    if (saved) return { ...DEFAULT_GOALS, ...JSON.parse(saved) };
  } catch (e) {}
  return { ...DEFAULT_GOALS };
}

function saveGoals(g) {
  try { localStorage.setItem(GOALS_KEY, JSON.stringify(g)); } catch (e) {}
}

// ─── Theme Definitions ───────────────────────────────────────────
const PRESET_THEMES = {
  "Midnight": {
    bg: "#020617", bgCard: "#0a0f1e", bgCell: "#0f172a",
    border: "#1e293b", borderStrong: "#334155",
    text: "#e2e8f0", textMuted: "#64748b", textFaint: "#475569",
    accent: "#6366f1", accentHover: "#818cf8",
    positive: "#10b981", negative: "#ef4444", warning: "#f59e0b",
    headerBg: "#0a0f1e",
  },
  "Ocean": {
    bg: "#030d1a", bgCard: "#061529", bgCell: "#0a1e36",
    border: "#0e2d4a", borderStrong: "#1a4060",
    text: "#dbeafe", textMuted: "#5b8fb9", textFaint: "#3a6080",
    accent: "#0ea5e9", accentHover: "#38bdf8",
    positive: "#06b6d4", negative: "#f43f5e", warning: "#fb923c",
    headerBg: "#061529",
  },
  "Emerald": {
    bg: "#020c08", bgCard: "#061410", bgCell: "#0a1f18",
    border: "#0f2d22", borderStrong: "#1a4535",
    text: "#d1fae5", textMuted: "#4b8b6a", textFaint: "#2d5a42",
    accent: "#10b981", accentHover: "#34d399",
    positive: "#22c55e", negative: "#f43f5e", warning: "#facc15",
    headerBg: "#061410",
  },
  "Neon": {
    bg: "#080010", bgCard: "#0d0020", bgCell: "#120030",
    border: "#2d0060", borderStrong: "#5500aa",
    text: "#f0e6ff", textMuted: "#9966cc", textFaint: "#663399",
    accent: "#cc00ff", accentHover: "#dd44ff",
    positive: "#00ff88", negative: "#ff2255", warning: "#ffcc00",
    headerBg: "#0d0020",
  },
  "Cyberpunk": {
    bg: "#000a0a", bgCard: "#001414", bgCell: "#001e1e",
    border: "#003333", borderStrong: "#005555",
    text: "#ccffff", textMuted: "#33aaaa", textFaint: "#226666",
    accent: "#00ffcc", accentHover: "#44ffdd",
    positive: "#00ff88", negative: "#ff4400", warning: "#ffcc00",
    headerBg: "#001414",
  },
  "Crimson": {
    bg: "#0d0004", bgCard: "#1a000a", bgCell: "#200010",
    border: "#3a0018", borderStrong: "#5a0028",
    text: "#ffe4ec", textMuted: "#cc5577", textFaint: "#882244",
    accent: "#f43f5e", accentHover: "#fb7185",
    positive: "#10b981", negative: "#ff1744", warning: "#ffa000",
    headerBg: "#1a000a",
  },
  "Solar": {
    bg: "#0d0800", bgCard: "#1a1200", bgCell: "#201800",
    border: "#3a2800", borderStrong: "#5a4000",
    text: "#fff8e1", textMuted: "#c8963c", textFaint: "#8a6020",
    accent: "#f59e0b", accentHover: "#fbbf24",
    positive: "#84cc16", negative: "#ef4444", warning: "#f97316",
    headerBg: "#1a1200",
  },
  "Light": {
    bg: "#f8fafc", bgCard: "#ffffff", bgCell: "#f1f5f9",
    border: "#e2e8f0", borderStrong: "#cbd5e1",
    text: "#0f172a", textMuted: "#64748b", textFaint: "#94a3b8",
    accent: "#6366f1", accentHover: "#4f46e5",
    positive: "#059669", negative: "#dc2626", warning: "#d97706",
    headerBg: "#ffffff",
  },
  "Slate": {
    bg: "#0f172a", bgCard: "#1e293b", bgCell: "#293548",
    border: "#334155", borderStrong: "#475569",
    text: "#f1f5f9", textMuted: "#94a3b8", textFaint: "#64748b",
    accent: "#818cf8", accentHover: "#a5b4fc",
    positive: "#34d399", negative: "#f87171", warning: "#fbbf24",
    headerBg: "#1e293b",
  },
  "Custom": null, // user-defined
};

const COLOR_LABELS = {
  bg: "Page Background",
  bgCard: "Card / Header Background",
  bgCell: "Cell Background",
  border: "Border",
  borderStrong: "Border Strong",
  text: "Primary Text",
  textMuted: "Muted Text",
  textFaint: "Faint Text",
  accent: "Accent Color",
  accentHover: "Accent Hover",
  positive: "Profit / Positive",
  negative: "Loss / Negative",
  warning: "Warning",
  headerBg: "Header Background",
};

function loadTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return { name: "Midnight", colors: PRESET_THEMES["Midnight"] };
}

function saveTheme(theme) {
  try { localStorage.setItem(THEME_KEY, JSON.stringify(theme)); } catch (e) {}
}

// ─── Theme Panel Component ───────────────────────────────────────
function ThemePanel({ theme, onClose, onThemeChange }) {
  const [activePreset, setActivePreset] = useState(theme.name);
  const [colors, setColors] = useState({ ...theme.colors });
  const [tab, setTab] = useState("presets"); // presets | custom

  const applyPreset = (name) => {
    if (name === "Custom") return;
    setActivePreset(name);
    setColors({ ...PRESET_THEMES[name] });
    const newTheme = { name, colors: PRESET_THEMES[name] };
    saveTheme(newTheme);
    onThemeChange(newTheme);
  };

  const updateColor = (key, val) => {
    const updated = { ...colors, [key]: val };
    setColors(updated);
    setActivePreset("Custom");
    const newTheme = { name: "Custom", colors: updated };
    saveTheme(newTheme);
    onThemeChange(newTheme);
  };

  const resetToPreset = (name) => {
    applyPreset(name === "Custom" ? "Midnight" : name);
  };

  const t = colors;

  const panelStyle = {
    position: "fixed", top: 0, right: 0, width: 320, height: "100vh",
    background: t.bgCard, borderLeft: `1px solid ${t.border}`,
    zIndex: 200, display: "flex", flexDirection: "column",
    fontFamily: "'JetBrains Mono', monospace", boxShadow: `-8px 0 32px rgba(0,0,0,0.5)`,
  };

  const tabStyle = (active) => ({
    flex: 1, padding: "10px 0", background: active ? t.accent : "transparent",
    color: active ? t.bg : t.textMuted, border: "none", cursor: "pointer",
    fontFamily: "inherit", fontSize: 12, fontWeight: 600, letterSpacing: 1,
    transition: "all 0.15s",
  });

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ padding: "16px 18px", borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>🎨 Theme Studio</div>
          <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>Active: <span style={{ color: t.accent }}>{activePreset}</span></div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${t.border}` }}>
        <button style={tabStyle(tab === "presets")} onClick={() => setTab("presets")}>PRESETS</button>
        <button style={tabStyle(tab === "custom")} onClick={() => setTab("custom")}>CUSTOM</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {tab === "presets" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(PRESET_THEMES).filter(([k]) => k !== "Custom").map(([name, preset]) => (
              <button
                key={name}
                onClick={() => applyPreset(name)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px", borderRadius: 8, cursor: "pointer",
                  border: `2px solid ${activePreset === name ? preset.accent : preset.border}`,
                  background: activePreset === name ? `${preset.accent}18` : preset.bgCard,
                  transition: "all 0.15s", fontFamily: "inherit", width: "100%",
                }}
              >
                {/* Color swatches */}
                <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                  {[preset.bg, preset.accent, preset.positive, preset.negative].map((c, i) => (
                    <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c, border: `1px solid ${preset.borderStrong}` }} />
                  ))}
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: preset.text }}>{name}</div>
                  <div style={{ fontSize: 10, color: preset.textMuted, marginTop: 1 }}>
                    {preset.bg} · {preset.accent}
                  </div>
                </div>
                {activePreset === name && (
                  <div style={{ marginLeft: "auto", color: preset.accent, fontSize: 14 }}>✓</div>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 4, letterSpacing: 1 }}>
              PICK ANY COLOR — CHANGES APPLY INSTANTLY
            </div>
            {Object.entries(COLOR_LABELS).map(([key, label]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: t.bgCell, borderRadius: 6, border: `1px solid ${t.border}` }}>
                <div>
                  <div style={{ fontSize: 11, color: t.text, fontWeight: 500 }}>{label}</div>
                  <div style={{ fontSize: 9, color: t.textFaint, marginTop: 2 }}>{colors[key]}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 4, background: colors[key], border: `2px solid ${t.borderStrong}` }} />
                  <input
                    type="color"
                    value={colors[key]}
                    onChange={(e) => updateColor(key, e.target.value)}
                    style={{ width: 32, height: 32, border: "none", background: "none", cursor: "pointer", padding: 0 }}
                  />
                </div>
              </div>
            ))}
            <button
              onClick={() => resetToPreset(activePreset)}
              style={{ marginTop: 8, padding: "10px", background: "transparent", border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}
            >
              ↺ Reset to {activePreset === "Custom" ? "Midnight" : activePreset}
            </button>
          </div>
        )}
      </div>

      {/* Footer — floating theme switcher preview */}
      <div style={{ padding: "12px 16px", borderTop: `1px solid ${t.border}`, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {Object.entries(PRESET_THEMES).filter(([k]) => k !== "Custom").map(([name, preset]) => (
          <button
            key={name}
            title={name}
            onClick={() => applyPreset(name)}
            style={{
              width: 22, height: 22, borderRadius: 4, cursor: "pointer", padding: 0,
              background: preset.accent, border: `2px solid ${activePreset === name ? "#fff" : "transparent"}`,
              transition: "all 0.15s",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────
const fmt = (n, dec = 2) => {
  if (n == null || isNaN(n)) return "$0.00";
  const abs = Math.abs(n);
  if (abs >= 1000) return (n < 0 ? "-" : "") + "$" + abs.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return (n < 0 ? "-" : "") + "$" + abs.toFixed(dec);
};
const fmtK = (n) => {
  if (n == null || isNaN(n)) return "$0";
  const abs = Math.abs(n);
  if (abs >= 10000) return (n < 0 ? "-" : "") + "$" + (abs / 1000).toFixed(1) + "K";
  return fmt(n, 0);
};
const pct = (n) => (n == null || isNaN(n) ? "0%" : (n * 100).toFixed(1) + "%");

const getWeekOfMonth = (date) => {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  return Math.ceil((date.getDate() + first.getDay()) / 7);
};

const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const getWeekNumber = (d) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
};

// Normalize market name for consistent dedup (e.g. "SOL-PERP" → "SOL", "SOL" → "SOL")
function normalizeMarket(m) { return (m || "").replace(/-PERP$/i, ""); }

// ─── CSV parser ─────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  
  // Handle both comma and tab delimited
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());
  
  const trades = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = [];
    let current = "";
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === delimiter && !inQuotes) { vals.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    vals.push(current.trim());
    
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });
    
    // Map Jupiter export fields flexibly
    const trade = mapJupiterTrade(row, headers);
    if (trade) trades.push(trade);
  }
  return trades;
}

function mapJupiterTrade(row, headers) {
  // Try to find PnL column
  const pnlKeys = ["pnl", "p&l", "profit", "realized pnl", "realized_pnl", "realizedpnl", "net pnl", "net_pnl", "profit/loss", "profit_loss", "profit / loss ($)", "profit / loss"];
  const dateKeys = ["close time", "close_time", "closetime", "closed at", "closed_at", "date", "time", "timestamp", "close date", "close_date", "exit time", "exit_time", "exittime", "created at", "created_at"];
  const sideKeys = ["side", "direction", "type", "position", "position type", "position_type"];
  const marketKeys = ["market", "token", "symbol", "pair", "asset", "coin"];
  const sizeKeys = ["size", "amount", "quantity", "qty", "notional", "position size", "position_size", "trade size ($)", "trade size"];
  const leverageKeys = ["leverage", "lev"];
  const entryKeys = ["entry price", "entry_price", "entryprice", "avg entry", "open price", "open_price", "execution price ($)", "execution price"];
  const exitKeys = ["exit price", "exit_price", "exitprice", "close price", "close_price", "mark price", "mark_price"];
  const feeKeys = ["fee", "fees", "total fees", "total_fees", "trading fee", "trading_fee", "trade fee ($)", "trade fee"];
  const collateralKeys = ["collateral", "margin", "initial margin", "initial_margin", "deposit / withdraw ($)", "deposit / withdraw"];

  const find = (keys) => {
    for (const k of keys) {
      for (const h of Object.keys(row)) {
        if (h.toLowerCase().trim() === k) return row[h];
      }
    }
    return null;
  };

  const parseNum = (v) => {
    if (!v) return null;
    const cleaned = v.replace(/[$,\s]/g, "").replace(/[()]/g, m => m === "(" ? "-" : "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  };

  const parseDate = (v) => {
    if (!v) return null;
    // Handle Unix timestamps (seconds or ms)
    const num = parseFloat(v);
    if (!isNaN(num) && num > 1e9) {
      return num > 1e12 ? new Date(num) : new Date(num * 1000);
    }
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  const pnl = parseNum(find(pnlKeys));
  const dateVal = parseDate(find(dateKeys));
  
  if (dateVal == null) return null;
  // Skip "Increase" rows (position opens) that have no P&L — only import closes/decreases
  const posChange = find(["position change", "position_change"]);
  if (posChange && posChange.toLowerCase() === "increase" && pnl == null) return null;
  
  return {
    id: Math.random().toString(36).substr(2, 9),
    date: dateVal || new Date(),
    dateStr: dateVal ? dateVal.toISOString() : new Date().toISOString(),
    side: find(sideKeys) || "—",
    market: find(marketKeys) || "SOL-PERP",
    size: parseNum(find(sizeKeys)),
    leverage: parseNum(find(leverageKeys)),
    entryPrice: parseNum(find(entryKeys)),
    exitPrice: parseNum(find(exitKeys)),
    pnl: pnl || 0,
    fees: parseNum(find(feeKeys)) || 0,
    collateral: parseNum(find(collateralKeys)),
    source: "csv",
  };
}

// ─── Gauge Component ────────────────────────────────────────────
function Gauge({ value, label, sub, color }) {
  const angle = Math.min(Math.max(value, 0), 1) * 180;
  const radius = 36;
  const cx = 44, cy = 42;
  const toRad = (deg) => (deg - 180) * Math.PI / 180;
  const endX = cx + radius * Math.cos(toRad(angle));
  const endY = cy + radius * Math.sin(toRad(angle));
  const large = 0;
  
  return (
    <div style={{ textAlign: "center" }}>
      <svg width="88" height="50" viewBox="0 0 88 50">
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`} fill="none" stroke="rgba(100,116,139,0.25)" strokeWidth="7" strokeLinecap="round" />
        {angle > 0 && (
          <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 ${large} 1 ${endX} ${endY}`} fill="none" stroke={color || "#10b981"} strokeWidth="7" strokeLinecap="round" />
        )}
      </svg>
      <div style={{ fontSize: 22, fontWeight: 700, color: "inherit", marginTop: -4, fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
      <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// ─── Goals Panel ────────────────────────────────────────────────
function GoalsPanel({ goals, onSave, onClose, theme }) {
  const T = theme;
  const [form, setForm] = useState({ ...goals });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const fields = [
    {
      section: "Daily",
      items: [
        { key: "dailyTarget",   label: "Daily P&L Target ($)",    min: 0,   step: 100, hint: "Aim to hit this each trading day" },
        { key: "dailyStopLoss", label: "Daily Hard Stop ($)",      min: 0,   step: 100, hint: "Max loss allowed — stop trading if hit" },
      ],
    },
    {
      section: "Weekly & Monthly",
      items: [
        { key: "weeklyTarget",  label: "Weekly P&L Target ($)",   min: 0,   step: 500 },
        { key: "monthlyTarget", label: "Monthly P&L Target ($)",  min: 0,   step: 1000 },
      ],
    },
    {
      section: "Quality Metrics",
      items: [
        { key: "winRateTarget",      label: "Win Rate Target (%)",      min: 0, max: 100, step: 1,   hint: "e.g. 55 = 55%" },
        { key: "profitFactorTarget", label: "Profit Factor Target",     min: 0, step: 0.1 },
        { key: "avgRatioTarget",     label: "Avg Win/Loss Ratio Target", min: 0, step: 0.1, hint: "Goal: > 1.0" },
      ],
    },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: 28, width: 460, maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>🎯 Goals & Benchmarks</div>
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${T.borderStrong}`, color: T.textMuted, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>✕</button>
        </div>
        {fields.map(({ section, items }) => (
          <div key={section} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${T.border}` }}>{section}</div>
            {items.map(({ key, label, min, max, step, hint }) => (
              <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: T.text }}>{label}</div>
                  {hint && <div style={{ fontSize: 10, color: T.textFaint, marginTop: 1 }}>{hint}</div>}
                </div>
                <input
                  type="number" min={min} max={max} step={step}
                  value={form[key]}
                  onChange={e => set(key, parseFloat(e.target.value) || 0)}
                  style={{ background: T.bgCell, border: `1px solid ${T.borderStrong}`, borderRadius: 6, color: T.text, padding: "6px 10px", fontSize: 13, fontFamily: "inherit", width: 100, textAlign: "right" }}
                />
              </div>
            ))}
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${T.borderStrong}`, color: T.textMuted, borderRadius: 6, padding: "8px 18px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Cancel</button>
          <button onClick={() => onSave(form)} style={{ background: T.accent, border: "none", color: T.bg, borderRadius: 6, padding: "8px 18px", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 700 }}>Save Goals</button>
        </div>
      </div>
    </div>
  );
}

// ─── Benchmark Bar ──────────────────────────────────────────────
function BenchmarkBar({ trades, goals, theme, privacy }) {
  const T = theme;
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem("jupiter-perps-benchmarks-open") !== "false"; } catch (e) { return true; }
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem("jupiter-perps-benchmarks-open", String(next)); } catch (e) {}
  };

  const $b = (str) => privacy
    ? <span style={{ filter: "blur(5px)", userSelect: "none" }}>{str}</span>
    : str;

  const fmtb = (v) => {
    const abs = Math.abs(v);
    const s = abs >= 10000 ? "$" + (abs / 1000).toFixed(1) + "k" : "$" + abs.toFixed(0);
    return (v >= 0 ? "+" : "-") + s;
  };

  // ── Time-range helpers ───────────────────────────────────────
  const now = new Date();

  const todayTrades = useMemo(() =>
    trades.filter(t => t.date.toDateString() === now.toDateString()),
    [trades]);

  const weekTrades = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    return trades.filter(t => t.date >= d);
  }, [trades]);

  const monthTrades = useMemo(() =>
    trades.filter(t => t.date.getFullYear() === now.getFullYear() && t.date.getMonth() === now.getMonth()),
    [trades]);

  // ── Aggregates ──────────────────────────────────────────────
  const agg = (ts) => {
    const pnl   = ts.reduce((s, t) => s + t.pnl, 0);
    const wins  = ts.filter(t => t.pnl > 0);
    const losses = ts.filter(t => t.pnl < 0);
    const grossWin  = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const avgWin  = wins.length  ? grossWin  / wins.length  : 0;
    const avgLoss = losses.length ? grossLoss / losses.length : 0;
    return {
      pnl,
      winRate: ts.length ? wins.length / ts.length * 100 : null,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
      avgRatio: avgLoss > 0 ? avgWin / avgLoss : null,
      count: ts.length,
    };
  };

  const today = useMemo(() => agg(todayTrades), [todayTrades]);
  const week  = useMemo(() => agg(weekTrades),  [weekTrades]);
  const month = useMemo(() => agg(monthTrades), [monthTrades]);

  // ── Emoji logic ─────────────────────────────────────────────
  const em = (value, target, warnPct = 0.5) => {
    if (value === null || value === undefined) return "⚪";
    if (value >= target) return "✅";
    if (value >= target * warnPct) return "🟡";
    return "❌";
  };

  const stopEm = (pnl, limit) => {
    if (pnl >= 0) return "✅";
    const used = Math.abs(pnl) / limit;
    if (used >= 1)    return "🔴";
    if (used >= 0.67) return "🟡";
    return "✅";
  };

  // ── Row component ────────────────────────────────────────────
  const Row = ({ emoji, label, value, goal, unit = "" }) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5, fontSize: 11, lineHeight: "1.6" }}>
      <span style={{ fontSize: 13 }}>{emoji}</span>
      <span style={{ color: T.textMuted }}>{label}:</span>
      <span style={{ color: T.text, fontWeight: 600 }}>{$b(value)}</span>
      {goal !== undefined && (
        <span style={{ color: T.textFaint, fontSize: 10 }}>/ {goal}{unit}</span>
      )}
    </div>
  );

  const divider = <div style={{ width: 1, background: T.border, alignSelf: "stretch", margin: "0 4px" }} />;

  return (
    <div style={{ background: T.bgCard, borderBottom: `1px solid ${T.border}` }}>
      {/* Header / toggle */}
      <div
        onClick={toggle}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 24px", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>
          🎯 Benchmarks
        </div>
        <div style={{ fontSize: 10, color: T.textFaint }}>{open ? "▲ hide" : "▼ show"}</div>
      </div>

      {open && (
        <div style={{ display: "flex", gap: 0, padding: "4px 24px 14px" }}>
          {/* TODAY */}
          <div style={{ flex: 1, paddingRight: 20 }}>
            <div style={{ fontSize: 9, color: T.accent, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>Today</div>
            {today.count === 0
              ? <div style={{ fontSize: 11, color: T.textFaint }}>No trades yet</div>
              : <>
                  <Row emoji={stopEm(today.pnl, goals.dailyStopLoss)} label="Stop loss" value={today.pnl < 0 ? fmtb(today.pnl) : "clean"} goal={fmtb(-goals.dailyStopLoss)} />
                  <Row emoji={em(today.pnl, goals.dailyTarget)} label="P&L" value={fmtb(today.pnl)} goal={fmtb(goals.dailyTarget)} />
                  {today.winRate !== null && <Row emoji={em(today.winRate, goals.winRateTarget)} label="Win rate" value={today.winRate.toFixed(0) + "%"} goal={goals.winRateTarget + "%"} />}
                </>
            }
          </div>

          {divider}

          {/* THIS WEEK */}
          <div style={{ flex: 1, paddingLeft: 20, paddingRight: 20 }}>
            <div style={{ fontSize: 9, color: T.accent, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>This Week</div>
            {week.count === 0
              ? <div style={{ fontSize: 11, color: T.textFaint }}>No trades yet</div>
              : <>
                  <Row emoji={em(week.pnl, goals.weeklyTarget)} label="P&L" value={fmtb(week.pnl)} goal={fmtb(goals.weeklyTarget)} />
                  {week.winRate !== null && <Row emoji={em(week.winRate, goals.winRateTarget)} label="Win rate" value={week.winRate.toFixed(0) + "%"} goal={goals.winRateTarget + "%"} />}
                  {week.profitFactor !== null && <Row emoji={em(week.profitFactor === Infinity ? 99 : week.profitFactor, goals.profitFactorTarget)} label="Prof. factor" value={week.profitFactor === Infinity ? "∞" : week.profitFactor.toFixed(2)} goal={goals.profitFactorTarget} />}
                </>
            }
          </div>

          {divider}

          {/* THIS MONTH */}
          <div style={{ flex: 1, paddingLeft: 20 }}>
            <div style={{ fontSize: 9, color: T.accent, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>This Month</div>
            {month.count === 0
              ? <div style={{ fontSize: 11, color: T.textFaint }}>No trades yet</div>
              : <>
                  <Row emoji={em(month.pnl, goals.monthlyTarget, 0.4)} label="P&L" value={fmtb(month.pnl)} goal={fmtb(goals.monthlyTarget)} />
                  {month.winRate !== null && <Row emoji={em(month.winRate, goals.winRateTarget)} label="Win rate" value={month.winRate.toFixed(0) + "%"} goal={goals.winRateTarget + "%"} />}
                  {month.profitFactor !== null && <Row emoji={em(month.profitFactor === Infinity ? 99 : month.profitFactor, goals.profitFactorTarget)} label="Prof. factor" value={month.profitFactor === Infinity ? "∞" : month.profitFactor.toFixed(2)} goal={goals.profitFactorTarget} />}
                  {month.avgRatio !== null && <Row emoji={em(month.avgRatio, goals.avgRatioTarget)} label="Avg ratio" value={month.avgRatio.toFixed(2)} goal={goals.avgRatioTarget} />}
                </>
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pattern Panel ──────────────────────────────────────────────
function PatternPanel({ trades, monthTrades, yearTrades, theme, privacy }) {
  const T = theme;
  const $p = (str) => privacy ? <span style={{ filter: "blur(6px)", userSelect: "none" }}>{str}</span> : str;
  const [scope, setScope] = useState("all");
  const [drill, setDrill] = useState(null); // { type: "day"|"hour", value: 0-6|0-23 }

  const scopedTrades = useMemo(
    () => scope === "month" ? monthTrades : scope === "year" ? yearTrades : trades,
    [scope, trades, monthTrades, yearTrades]
  );

  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DAY_FULL  = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const hourLabel = (h) => h === 0 ? "12A" : h < 12 ? h + "A" : h === 12 ? "12P" : (h - 12) + "P";
  const hourFull  = (h) => h === 0 ? "12:00 AM" : h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM" : `${h - 12}:00 PM`;
  const pfmt = (v) => {
    const abs = Math.abs(v);
    const s = abs >= 10000 ? "$" + (abs / 1000).toFixed(1) + "k" : "$" + abs.toFixed(0);
    return (v >= 0 ? "+" : "-") + s;
  };
  const pfmtFull = (v) =>
    (v >= 0 ? "+" : "-") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ppct = (v) => (v * 100).toFixed(0) + "%";

  // hex color + computed alpha suffix for heatmap backgrounds
  const heatBg = (pnl, count, maxAbs) => {
    if (count === 0) return T.bgCell;
    const intensity = Math.min(Math.abs(pnl) / maxAbs, 1);
    const alpha = Math.round((0.12 + intensity * 0.68) * 255).toString(16).padStart(2, "0");
    return (pnl >= 0 ? T.positive : T.negative) + alpha;
  };

  const dayStats = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const ts = scopedTrades.filter(t => t.date.getDay() === i);
      const pnl = ts.reduce((s, t) => s + t.pnl, 0);
      return { pnl, trades: ts, wins: ts.filter(t => t.pnl > 0).length, count: ts.length };
    }), [scopedTrades]);

  const hourStats = useMemo(() =>
    Array.from({ length: 24 }, (_, i) => {
      const ts = scopedTrades.filter(t => t.date.getHours() === i);
      const pnl = ts.reduce((s, t) => s + t.pnl, 0);
      return { pnl, trades: ts, wins: ts.filter(t => t.pnl > 0).length, count: ts.length };
    }), [scopedTrades]);

  const maxDayAbs  = Math.max(...dayStats.map(d => Math.abs(d.pnl)), 1);
  const maxHourAbs = Math.max(...hourStats.map(h => Math.abs(h.pnl)), 1);

  const drillTrades = useMemo(() =>
    drill ? (drill.type === "day" ? dayStats[drill.value].trades : hourStats[drill.value].trades) : [],
    [drill, dayStats, hourStats]);
  const drillPnl   = drillTrades.reduce((s, t) => s + t.pnl, 0);
  const drillWins  = drillTrades.filter(t => t.pnl > 0).length;
  const drillTitle = drill
    ? (drill.type === "day" ? DAY_FULL[drill.value] : `${hourFull(drill.value)} – ${hourFull(drill.value + 1)}`)
    : "";

  // Secondary breakdown inside drill panel
  const secStats = useMemo(() => {
    if (!drill) return [];
    const ts = drill.type === "day" ? dayStats[drill.value].trades : hourStats[drill.value].trades;
    if (drill.type === "day") {
      return Array.from({ length: 24 }, (_, i) => {
        const sub = ts.filter(t => t.date.getHours() === i);
        return { pnl: sub.reduce((s, t) => s + t.pnl, 0), count: sub.length, wins: sub.filter(t => t.pnl > 0).length };
      });
    }
    return Array.from({ length: 7 }, (_, i) => {
      const sub = ts.filter(t => t.date.getDay() === i);
      return { pnl: sub.reduce((s, t) => s + t.pnl, 0), count: sub.length, wins: sub.filter(t => t.pnl > 0).length };
    });
  }, [drill, dayStats, hourStats]);
  const secMax = Math.max(...secStats.map(s => Math.abs(s.pnl)), 1);

  return (
    <div style={{ padding: "16px 24px" }}>
      {/* Scope selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: T.textMuted, marginRight: 4 }}>Range:</span>
        {[["all", "All Time"], ["year", "This Year"], ["month", "This Month"]].map(([v, label]) => (
          <button key={v} onClick={() => { setScope(v); setDrill(null); }} style={{
            background: scope === v ? T.accent : "transparent",
            color: scope === v ? T.bg : T.textMuted,
            border: `1px solid ${scope === v ? T.accent : T.borderStrong}`,
            borderRadius: 6, padding: "4px 12px", cursor: "pointer",
            fontSize: 11, fontFamily: "inherit", fontWeight: 600, transition: "all 0.15s",
          }}>{label}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: T.textFaint }}>
          {scopedTrades.length} trades · click any segment to drill in
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
        {/* ── Day of Week bars ─────────────────────────────────── */}
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>Day of Week</div>
          {dayStats.map((d, i) => {
            const barW = d.count > 0 ? Math.max((Math.abs(d.pnl) / maxDayAbs) * 100, 3) : 0;
            const isSel = drill?.type === "day" && drill?.value === i;
            return (
              <div key={i}
                onClick={() => d.count > 0 && setDrill(isSel ? null : { type: "day", value: i })}
                style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 6,
                  cursor: d.count > 0 ? "pointer" : "default",
                  background: isSel ? `${T.accent}15` : "transparent",
                  borderRadius: 6, padding: "5px 6px",
                  border: isSel ? `1px solid ${T.accent}40` : "1px solid transparent",
                  transition: "all 0.15s",
                }}>
                <div style={{ fontSize: 11, color: isSel ? T.accent : T.textMuted, fontWeight: 600, width: 30, flexShrink: 0 }}>{DAY_NAMES[i]}</div>
                <div style={{ flex: 1, height: 16, background: T.bgCell, borderRadius: 3, overflow: "hidden" }}>
                  {d.count > 0 && (
                    <div style={{ height: "100%", width: `${barW}%`, background: d.pnl >= 0 ? T.positive : T.negative, opacity: isSel ? 1 : 0.75, borderRadius: 3, transition: "width 0.3s" }} />
                  )}
                </div>
                {d.count > 0 ? (
                  <div style={{ display: "flex", gap: 6, fontSize: 10, flexShrink: 0 }}>
                    <span style={{ color: d.pnl >= 0 ? T.positive : T.negative, fontWeight: 700, minWidth: 54, textAlign: "right" }}>{$p(pfmt(d.pnl))}</span>
                    <span style={{ color: T.textFaint, width: 30 }}>{ppct(d.wins / d.count)}</span>
                    <span style={{ color: T.textFaint, width: 20 }}>{d.count}t</span>
                  </div>
                ) : (
                  <span style={{ fontSize: 10, color: T.textFaint }}>—</span>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Hour Heatmap ─────────────────────────────────────── */}
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>Hour of Day</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 5 }}>
            {hourStats.map((h, i) => {
              const isSel = drill?.type === "hour" && drill?.value === i;
              return (
                <div key={i}
                  onClick={() => h.count > 0 && setDrill(isSel ? null : { type: "hour", value: i })}
                  style={{
                    background: isSel ? `${T.accent}30` : heatBg(h.pnl, h.count, maxHourAbs),
                    border: isSel ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
                    borderRadius: 7, padding: "8px 4px", textAlign: "center",
                    cursor: h.count > 0 ? "pointer" : "default",
                    transition: "all 0.2s", minHeight: 54,
                    display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
                  }}>
                  <div style={{ fontSize: 9, color: isSel ? T.accent : T.textMuted, fontWeight: isSel ? 700 : 500 }}>{hourLabel(i)}</div>
                  {h.count > 0 ? (
                    <>
                      <div style={{ fontSize: 10, color: h.pnl >= 0 ? T.positive : T.negative, fontWeight: 700, marginTop: 3 }}>{$p(pfmt(h.pnl))}</div>
                      <div style={{ fontSize: 8, color: T.textFaint, marginTop: 1 }}>{h.count}t · {ppct(h.wins / h.count)}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 8, color: T.textFaint, marginTop: 3 }}>—</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Drill Panel ──────────────────────────────────────────── */}
      {drill && drillTrades.length > 0 && (
        <div style={{ marginTop: 16, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>
                {drillTitle}
                <span style={{ marginLeft: 12, color: drillPnl >= 0 ? T.positive : T.negative }}>{$p(pfmtFull(drillPnl))}</span>
              </div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>
                {drillTrades.length} trades · {ppct(drillWins / drillTrades.length)} win rate · avg {$p(pfmtFull(drillPnl / drillTrades.length))} per trade
              </div>
            </div>
            <button onClick={() => setDrill(null)} style={{ background: "none", border: `1px solid ${T.borderStrong}`, color: T.textMuted, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>✕</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Secondary breakdown */}
            <div>
              <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                {drill.type === "day" ? `Hour breakdown for ${DAY_FULL[drill.value]}s` : `Day breakdown for ${hourFull(drill.value)}`}
              </div>
              {drill.type === "hour" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {secStats.map((s, i) => s.count === 0 ? null : (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ fontSize: 10, color: T.textMuted, width: 28 }}>{DAY_NAMES[i]}</div>
                      <div style={{ flex: 1, height: 14, background: T.bgCell, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.max((Math.abs(s.pnl) / secMax) * 100, 3)}%`, background: s.pnl >= 0 ? T.positive : T.negative, opacity: 0.8, borderRadius: 2 }} />
                      </div>
                      <div style={{ fontSize: 10, color: s.pnl >= 0 ? T.positive : T.negative, width: 54, textAlign: "right" }}>{$p(pfmt(s.pnl))}</div>
                      <div style={{ fontSize: 9, color: T.textFaint, width: 18 }}>{s.count}t</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 3 }}>
                  {secStats.map((s, i) => (
                    <div key={i} style={{ background: s.count > 0 ? heatBg(s.pnl, s.count, secMax) : T.bgCell, border: `1px solid ${T.border}`, borderRadius: 5, padding: "5px 2px", textAlign: "center" }}>
                      <div style={{ fontSize: 8, color: T.textMuted }}>{hourLabel(i)}</div>
                      {s.count > 0 && <div style={{ fontSize: 8, color: s.pnl >= 0 ? T.positive : T.negative, fontWeight: 600, marginTop: 1 }}>{$p(pfmt(s.pnl))}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Trade list */}
            <div>
              <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Trades (best → worst)</div>
              <div style={{ maxHeight: 210, overflowY: "auto" }}>
                {[...drillTrades].sort((a, b) => b.pnl - a.pnl).map(t => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${T.bgCell}`, fontSize: 11, gap: 8 }}>
                    <span style={{ color: T.textMuted, flexShrink: 0 }}>{t.date.toLocaleDateString()}</span>
                    <span style={{ color: T.textMuted, flex: 1 }}>{t.market}</span>
                    <span style={{ color: t.side?.toLowerCase().includes("long") ? T.positive : T.negative, flexShrink: 0 }}>{t.side}</span>
                    <span style={{ color: t.pnl >= 0 ? T.positive : T.negative, fontWeight: 700, flexShrink: 0 }}>{$p(pfmtFull(t.pnl))}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stat Pill ──────────────────────────────────────────────────
function StatPill({ label, value, sub, positive, theme }) {
  const T = theme || {};
  return (
    <div style={{
      background: T.bgCell || "#0f172a",
      border: `1px solid ${T.border || "#1e293b"}`,
      borderRadius: 10,
      padding: "14px 18px",
      minWidth: 120,
      flex: 1,
    }}>
      <div style={{ fontSize: 11, color: T.textMuted || "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: positive == null ? (T.text || "#f1f5f9") : positive ? (T.positive || "#10b981") : (T.negative || "#ef4444"), fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.textMuted || "#64748b", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────
// ─── Auth Wrapper ──────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#020617", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>
        Loading...
      </div>
    );
  }

  // Bypass sign-in for open-source local usage
  const activeSession = session || { user: { id: "local-user" } };
  return <JupiterPerpsJournal session={activeSession} />;
}

function JupiterPerpsJournal({ session }) {
  const [realTrades, setTrades] = useState([]);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const trades = isDemoMode ? demoTrades : realTrades;
  const [viewDate, setViewDate] = useState(new Date());
  const [view, setView] = useState("month"); // month, year
  const [showUpload, setShowUpload] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [importMsg, setImportMsg] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [manualForm, setManualForm] = useState({ date: new Date().toISOString().split("T")[0], market: "SOL-PERP", side: "Long", pnl: "", fees: "", size: "", leverage: "", notes: "" });
  const [selectedDay, setSelectedDay] = useState(null);
  const [theme, setTheme] = useState(() => loadTheme());
  const [showTheme, setShowTheme] = useState(false);
  const [goals, setGoals] = useState(() => loadGoals());
  const [showGoals, setShowGoals] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [hiddenStats, setHiddenStats] = useState(() => {
    try { const s = localStorage.getItem("jupiter-perps-hidden-stats"); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });
  const [syncing, setSyncing] = useState(false);
  const [walletTab, setWalletTab] = useState("csv"); // "csv" | "wallet"
  const [walletAddresses, setWalletAddresses] = useState(() => {
    const saved = getSavedWallets();
    return saved.length > 0 ? saved.map(w => ({ addr: w, enabled: true })) : [{ addr: "", enabled: true }];
  });
  const [heliusKey, setHeliusKey] = useState(() => getSavedApiKey());
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletProgress, setWalletProgress] = useState(null);
  const [saveWalletsChecked, setSaveWalletsChecked] = useState(() => getSavedWallets().length > 0);
  const walletAbortRef = useRef(null);
  const T = theme.colors; // shorthand for current theme colors
  const $ = (str) => privacy ? <span style={{ filter: "blur(6px)", userSelect: "none" }}>{str}</span> : str;
  const userId = session.user.id;

  // Load trades from Supabase
  useEffect(() => {
    async function loadTrades() {
      // Fetch all trades (Supabase defaults to 1000 row limit)
      let allData = [];
      let from = 0;
      const pageSize = 1000;
      let keepFetching = true;
      let fetchError = null;

      while (keepFetching) {
        const { data: page, error } = await supabase
          .from("trades")
          .select("*")
          .eq("user_id", userId)
          .order("date_str", { ascending: true })
          .range(from, from + pageSize - 1);

        if (error) { fetchError = error; break; }
        if (page && page.length > 0) {
          allData = allData.concat(page);
          from += pageSize;
          if (page.length < pageSize) keepFetching = false;
        } else {
          keepFetching = false;
        }
      }

      const data = allData;
      const error = fetchError;

      if (error) {
        console.error("Error loading trades:", error);
        // Fall back to localStorage
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const loaded = JSON.parse(saved);
            setTrades(loaded.map(t => ({ ...t, date: new Date(t.dateStr) })));
          }
        } catch (e) { console.log("No saved data"); }
        return;
      }

      if (data && data.length > 0) {
        // Dedup on load: remove duplicate trades from different import sources
        // (e.g. "SOL" vs "SOL-PERP", PnL off by $0.01 due to rounding)
        const loaded = data.map(rowToTrade);
        const dedupKey = (t) => [
          t.dateStr, Math.round(t.pnl || 0), normalizeMarket(t.market), Math.round((t.fees || 0) * 10),
        ].join("|");
        const seen = new Set();
        // Prefer trades with side info (not "—") by sorting them first
        const sorted = [...loaded].sort((a, b) => (a.side === "—" ? 1 : 0) - (b.side === "—" ? 1 : 0));
        const cleaned = sorted.filter(t => {
          const key = dedupKey(t);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (cleaned.length < loaded.length) {
          console.log(`Dedup: removed ${loaded.length - cleaned.length} duplicate trades on load`);
          // Clean up Supabase too — delete removed trade IDs
          const cleanedIds = new Set(cleaned.map(t => t.id));
          const removedIds = loaded.filter(t => !cleanedIds.has(t.id)).map(t => t.id);
          if (removedIds.length > 0) {
            supabase.from("trades").delete().in("id", removedIds).then(({ error }) => {
              if (error) console.error("Dedup cleanup error:", error);
            });
          }
        }
        setTrades(cleaned);
      } else {
        // Check localStorage for existing data to migrate
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const loaded = JSON.parse(saved);
            if (loaded.length > 0) {
              const localTrades = loaded.map(t => ({ ...t, date: new Date(t.dateStr) }));
              setTrades(localTrades);
              // Auto-migrate localStorage data to Supabase
              const rows = localTrades.map(t => tradeToRow(t, userId));
              await supabase.from("trades").insert(rows);
              console.log(`Migrated ${rows.length} trades from localStorage to Supabase`);
            }
          }
        } catch (e) { console.log("No local data to migrate"); }
      }
    }
    loadTrades();
  }, [userId]);

  // Save trades — writes to both Supabase and localStorage
  const saveTrades = useCallback(async (newTrades) => {
    if (isDemoMode) {
      alert("Viewing Demo Profile. Cannot modify demo data.");
      return;
    }
    setTrades(newTrades);
    // Always keep localStorage as backup
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newTrades));
    } catch (e) { console.error("localStorage save error:", e); }

    // Sync to Supabase
    setSyncing(true);
    try {
      // Delete all existing trades for this user and re-insert
      await supabase.from("trades").delete().eq("user_id", userId);
      if (newTrades.length > 0) {
        const rows = newTrades.map(t => tradeToRow(t, userId));
        // Insert in batches of 500 to avoid payload limits
        for (let i = 0; i < rows.length; i += 500) {
          const batch = rows.slice(i, i + 500);
          const { error } = await supabase.from("trades").insert(batch);
          if (error) console.error("Supabase insert error:", error);
        }
      }
    } catch (e) {
      console.error("Supabase sync error:", e);
    } finally {
      setSyncing(false);
    }
  }, [userId]);

  // CSV handling
  const handleFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseCSV(e.target.result);
      if (parsed.length === 0) {
        setImportMsg({ type: "error", text: "No trades found. Check CSV format." });
        return;
      }
      // Loose key for matching (date + PnL + market + fees) — allows updating missing fields
      const looseKey = (t) => [
        t.dateStr, Math.round(t.pnl || 0), normalizeMarket(t.market), Math.round((t.fees || 0) * 10),
      ].join("|");

      // Full fingerprint for exact-match dedup
      const fingerprint = (t) => [
        t.dateStr, t.pnl, normalizeMarket(t.market), t.side, t.size ?? "",
        t.entryPrice ?? "", t.exitPrice ?? "", t.fees ?? "", t.leverage ?? "", t.collateral ?? "",
      ].join("|");

      // Build loose-key index for update-in-place
      const existingByKey = new Map();
      trades.forEach((t, idx) => {
        const key = looseKey(t);
        if (!existingByKey.has(key)) existingByKey.set(key, idx);
      });

      const updatedTrades = [...trades];
      const newTrades = [];
      let updatedCount = 0;

      for (const t of parsed) {
        const key = looseKey(t);
        const existIdx = existingByKey.get(key);
        if (existIdx != null) {
          // Update existing trade with data from CSV (CSV is authoritative — always overwrite if CSV has data)
          const existing = updatedTrades[existIdx];
          let changed = false;
          if (t.side && t.side !== "—" && existing.side !== t.side) { existing.side = t.side; changed = true; }
          if (t.size && existing.size !== t.size) { existing.size = t.size; changed = true; }
          if (t.entryPrice && !existing.entryPrice) { existing.entryPrice = t.entryPrice; changed = true; }
          if (t.exitPrice && !existing.exitPrice) { existing.exitPrice = t.exitPrice; changed = true; }
          if (t.leverage && !existing.leverage) { existing.leverage = t.leverage; changed = true; }
          if (t.collateral && !existing.collateral) { existing.collateral = t.collateral; changed = true; }
          if (changed) updatedCount++;
        } else {
          // Check full fingerprint to avoid exact dupes
          newTrades.push(t);
          existingByKey.set(key, updatedTrades.length + newTrades.length - 1);
        }
      }

      const merged = [...updatedTrades, ...newTrades];
      const seen = new Set();
      const deduped = merged.filter(t => {
        const key = fingerprint(t);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      saveTrades(deduped);
      const skipped = parsed.length - newTrades.length - updatedCount;
      const parts = [];
      if (newTrades.length > 0) parts.push(`${newTrades.length} new trade${newTrades.length !== 1 ? "s" : ""}`);
      if (updatedCount > 0) parts.push(`${updatedCount} updated`);
      if (skipped > 0) parts.push(`${skipped} unchanged`);
      const msg = parts.length > 0
        ? `${parts.join(" · ")} (${deduped.length} total)`
        : `No new trades found — all already imported`;
      setImportMsg({ type: newTrades.length > 0 ? "success" : "info", text: msg });
      setTimeout(() => setImportMsg(null), 4000);
    };
    reader.readAsText(file);
  }, [trades, saveTrades]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, [handleFile]);

  const handleRestore = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      let parsed;
      try {
        parsed = JSON.parse(e.target.result);
      } catch {
        setImportMsg({ type: "error", text: "Invalid backup file — could not parse JSON." });
        setTimeout(() => setImportMsg(null), 4000);
        return;
      }
      if (!Array.isArray(parsed) || parsed.length === 0 || !parsed[0]?.dateStr) {
        setImportMsg({ type: "error", text: "Invalid backup format — expected a Jupiter Perps Journal backup." });
        setTimeout(() => setImportMsg(null), 4000);
        return;
      }
      const restored = parsed.map(t => ({ ...t, date: new Date(t.dateStr) }));
      const replace = window.confirm(
        `Backup contains ${restored.length} trade${restored.length !== 1 ? "s" : ""}.\n\nOK = Replace all current data (${trades.length} trades)\nCancel = Merge with current data`
      );
      if (replace) {
        saveTrades(restored);
        setImportMsg({ type: "success", text: `Restored ${restored.length} trades from backup.` });
      } else {
        // Merge with dedup
        const fingerprint = (t) => [t.dateStr, t.pnl, normalizeMarket(t.market), t.side, t.size ?? "", t.entryPrice ?? "", t.exitPrice ?? "", t.fees ?? "", t.leverage ?? "", t.collateral ?? ""].join("|");
        const existingKeys = new Set(trades.map(fingerprint));
        const added = restored.filter(t => !existingKeys.has(fingerprint(t)));
        const seen = new Set();
        const deduped = [...trades, ...added].filter(t => {
          const k = fingerprint(t); if (seen.has(k)) return false; seen.add(k); return true;
        });
        saveTrades(deduped);
        setImportMsg({ type: added.length > 0 ? "success" : "info", text: added.length > 0 ? `Merged ${added.length} new trade${added.length !== 1 ? "s" : ""} from backup · ${restored.length - added.length} duplicates skipped.` : "No new trades found — all already exist." });
      }
      setTimeout(() => setImportMsg(null), 4000);
    };
    reader.readAsText(file);
  }, [trades, saveTrades]);

  // Wallet import handler — fetches all enabled wallets
  // quickRefresh=true limits fetch to last 30 days for speed
  const handleWalletImport = useCallback(async (quickRefresh = false) => {
    const enabledWallets = walletAddresses.filter(w => w.enabled && w.addr.trim());
    const validWallets = enabledWallets.filter(w => isValidSolanaAddress(w.addr));

    if (enabledWallets.length === 0) {
      setImportMsg({ type: "error", text: "Enter at least one wallet address." });
      setTimeout(() => setImportMsg(null), 4000);
      return;
    }
    if (validWallets.length !== enabledWallets.length) {
      setImportMsg({ type: "error", text: `${enabledWallets.length - validWallets.length} invalid wallet address${enabledWallets.length - validWallets.length !== 1 ? "es" : ""}.` });
      setTimeout(() => setImportMsg(null), 4000);
      return;
    }
    if (!heliusKey) {
      setImportMsg({ type: "error", text: "Enter your Helius API key or RPC URL first." });
      setTimeout(() => setImportMsg(null), 4000);
      return;
    }

    // Save preferences
    saveApiKey(heliusKey);
    if (saveWalletsChecked) saveWallets(walletAddresses.filter(w => w.addr.trim()).map(w => w.addr.trim()));
    else saveWallets([]);

    setWalletLoading(true);
    setWalletProgress({ page: 0, totalTxs: 0, perpsTxs: 0, currentWallet: 1, totalWallets: validWallets.length });
    setImportMsg(null);

    const abort = new AbortController();
    walletAbortRef.current = abort;

    try {
      let allPerpsTxs = [];
      const since = quickRefresh ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) : undefined;

      for (let i = 0; i < validWallets.length; i++) {
        const wallet = validWallets[i].addr.trim();
        const perpsTxs = await fetchPerpsTransactions(wallet, heliusKey, {
          onProgress: (p) => setWalletProgress({ ...p, currentWallet: i + 1, totalWallets: validWallets.length }),
          signal: abort.signal,
          since,
        });
        allPerpsTxs.push(...perpsTxs);
      }

      if (allPerpsTxs.length === 0) {
        setImportMsg({ type: "info", text: `No Jupiter Perps trades found for ${validWallets.length} wallet${validWallets.length !== 1 ? "s" : ""}.` });
        setTimeout(() => setImportMsg(null), 5000);
        setWalletLoading(false);
        setWalletProgress(null);
        return;
      }

      setWalletProgress(prev => ({ ...prev, phase: "Parsing logs..." }));
      const parsed = await parsePerpsTransactions(allPerpsTxs, heliusKey, { signal: abort.signal });
      if (parsed.length === 0) {
        setImportMsg({ type: "info", text: `Found ${allPerpsTxs.length} perps transactions but no closed trades to import.` });
        setTimeout(() => setImportMsg(null), 5000);
        setWalletLoading(false);
        setWalletProgress(null);
        return;
      }

      // Deduplicate: use PnL + date + fees + market as core identity
      // Round PnL to nearest dollar — CSV and wallet imports can differ by $0.01
      // due to rounding when dividing atomic values by 1e6
      const coreKey = (t) => [
        t.dateStr, Math.round(t.pnl || 0), normalizeMarket(t.market), Math.round((t.fees || 0) * 10),
      ].join("|");

      // Build a map of existing trades by core key for update-in-place
      const existingByKey = new Map();
      trades.forEach((t, idx) => {
        const key = coreKey(t);
        if (!existingByKey.has(key)) existingByKey.set(key, idx);
      });

      const updatedTrades = [...trades];
      const newTrades = [];
      let updatedCount = 0;

      for (const t of parsed) {
        const key = coreKey(t);
        const existIdx = existingByKey.get(key);
        if (existIdx != null) {
          // Update existing trade if new data has better side/size info
          const existing = updatedTrades[existIdx];
          let changed = false;
          if ((!existing.side || existing.side === "—") && t.side && t.side !== "—") {
            existing.side = t.side;
            changed = true;
          }
          if (!existing.size && t.size) {
            existing.size = t.size;
            changed = true;
          }
          if (!existing.entryPrice && t.entryPrice) {
            existing.entryPrice = t.entryPrice;
            changed = true;
          }
          if (!existing.exitPrice && t.exitPrice) {
            existing.exitPrice = t.exitPrice;
            changed = true;
          }
          if (!existing.leverage && t.leverage) {
            existing.leverage = t.leverage;
            changed = true;
          }
          if (!existing.collateral && t.collateral) {
            existing.collateral = t.collateral;
            changed = true;
          }
          if (changed) updatedCount++;
        } else {
          newTrades.push(t);
          existingByKey.set(key, updatedTrades.length + newTrades.length - 1);
        }
      }

      const merged = [...updatedTrades, ...newTrades];
      const seen = new Set();
      const deduped = merged.filter(t => {
        const key = coreKey(t);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      saveTrades(deduped);
      const skipped = parsed.length - newTrades.length - updatedCount;
      const walletLabel = validWallets.length > 1 ? `${validWallets.length} wallets` : "wallet";
      const parts = [];
      if (newTrades.length > 0) parts.push(`${newTrades.length} new trade${newTrades.length !== 1 ? "s" : ""}`);
      if (updatedCount > 0) parts.push(`${updatedCount} updated`);
      if (skipped > 0) parts.push(`${skipped} unchanged`);
      const msg = parts.length > 0
        ? `${parts.join(" · ")} from ${walletLabel}`
        : `No new trades — all already imported`;
      setImportMsg({ type: newTrades.length > 0 ? "success" : "info", text: msg });
      setTimeout(() => setImportMsg(null), 5000);
    } catch (err) {
      if (err.message === "Cancelled") {
        setImportMsg({ type: "info", text: "Wallet import cancelled." });
      } else {
        setImportMsg({ type: "error", text: err.message || "Failed to fetch wallet data." });
      }
      setTimeout(() => setImportMsg(null), 5000);
    } finally {
      setWalletLoading(false);
      setWalletProgress(null);
      walletAbortRef.current = null;
    }
  }, [walletAddresses, heliusKey, saveWalletsChecked, trades, saveTrades]);

  const cancelWalletImport = useCallback(() => {
    walletAbortRef.current?.abort();
  }, []);

  const addManualTrade = useCallback(() => {
    const pnl = parseFloat(manualForm.pnl);
    if (isNaN(pnl)) return;
    const d = new Date(manualForm.date + "T12:00:00");
    const trade = {
      id: Math.random().toString(36).substr(2, 9),
      date: d,
      dateStr: d.toISOString(),
      side: manualForm.side,
      market: manualForm.market,
      size: parseFloat(manualForm.size) || null,
      leverage: parseFloat(manualForm.leverage) || null,
      entryPrice: null,
      exitPrice: null,
      pnl: pnl,
      fees: parseFloat(manualForm.fees) || 0,
      collateral: null,
      source: "manual",
    };
    saveTrades([...trades, trade]);
    setManualEntry(false);
    setManualForm({ date: new Date().toISOString().split("T")[0], market: "SOL-PERP", side: "Long", pnl: "", fees: "", size: "", leverage: "", notes: "" });
  }, [manualForm, trades, saveTrades]);

  const clearAll = useCallback(() => {
    if (confirm("Clear all trade data? This cannot be undone.")) {
      saveTrades([]);
    }
  }, [saveTrades]);

  // ─── Computed stats ─────────────────────────────────────────
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthTrades = useMemo(() => trades.filter(t => t.date.getFullYear() === year && t.date.getMonth() === month), [trades, year, month]);
  const yearTrades = useMemo(() => trades.filter(t => t.date.getFullYear() === year), [trades, year]);
  const activeTrades = view === "month" ? monthTrades : yearTrades;

  const stats = useMemo(() => {
    if (activeTrades.length === 0) return { netPnl: 0, winRate: 0, profitFactor: 0, dayWinPct: 0, avgWin: 0, avgLoss: 0, avgRatio: 0, totalTrades: 0, wins: 0, losses: 0, tradeDays: 0, winDays: 0 };
    
    const wins = activeTrades.filter(t => t.pnl > 0);
    const losses = activeTrades.filter(t => t.pnl < 0);
    const netPnl = activeTrades.reduce((s, t) => s + t.pnl, 0);
    const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const avgWin = wins.length ? grossWin / wins.length : 0;
    const avgLoss = losses.length ? grossLoss / losses.length : 0;

    // Day-level stats
    const dayMap = {};
    activeTrades.forEach(t => {
      const key = t.date.toDateString();
      dayMap[key] = (dayMap[key] || 0) + t.pnl;
    });
    const days = Object.values(dayMap);
    const winDays = days.filter(d => d > 0).length;

    return {
      netPnl,
      winRate: activeTrades.length ? wins.length / activeTrades.length : 0,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
      dayWinPct: days.length ? winDays / days.length : 0,
      avgWin,
      avgLoss,
      avgRatio: avgLoss > 0 ? avgWin / avgLoss : 0,
      totalTrades: activeTrades.length,
      wins: wins.length,
      losses: losses.length,
      tradeDays: days.length,
      winDays,
    };
  }, [activeTrades]);

  // ─── Streak stats (all-time, trade days only) ───────────────
  const streakStats = useMemo(() => {
    if (trades.length === 0) return { current: 0, best: 0 };
    const dayMap = {};
    trades.forEach(t => {
      const key = t.date.toDateString();
      dayMap[key] = (dayMap[key] || 0) + t.pnl;
    });
    const sorted = Object.entries(dayMap)
      .map(([k, pnl]) => ({ date: new Date(k), pnl }))
      .sort((a, b) => a.date - b.date);
    let current = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].pnl > 0) current++;
      else break;
    }
    let best = 0, run = 0;
    for (const d of sorted) {
      if (d.pnl > 0) { run++; if (run > best) best = run; }
      else run = 0;
    }
    return { current, best };
  }, [trades]);

  // ─── Calendar data ──────────────────────────────────────────
  const calendarData = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const dayPnl = {};
    const dayTrades = {};
    const dayWins = {};
    monthTrades.forEach(t => {
      const d = t.date.getDate();
      dayPnl[d] = (dayPnl[d] || 0) + t.pnl;
      dayTrades[d] = (dayTrades[d] || 0) + 1;
      if (t.pnl > 0) dayWins[d] = (dayWins[d] || 0) + 1;
    });

    // Weekly summaries
    const weeks = {};
    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(year, month, d);
      const w = getWeekOfMonth(date);
      if (!weeks[w]) weeks[w] = { pnl: 0, days: 0 };
      if (dayTrades[d]) {
        weeks[w].pnl += dayPnl[d] || 0;
        weeks[w].days++;
      }
    }

    return { startPad, totalDays, dayPnl, dayTrades, dayWins, weeks };
  }, [monthTrades, year, month]);

  // ─── Year calendar data ─────────────────────────────────────
  const yearCalData = useMemo(() => {
    const monthPnl = {};
    const monthTradeCount = {};
    const monthWins = {};
    yearTrades.forEach(t => {
      const m = t.date.getMonth();
      monthPnl[m] = (monthPnl[m] || 0) + t.pnl;
      monthTradeCount[m] = (monthTradeCount[m] || 0) + 1;
      if (t.pnl > 0) monthWins[m] = (monthWins[m] || 0) + 1;
    });
    return { monthPnl, monthTradeCount, monthWins };
  }, [yearTrades]);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const today = new Date();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const prevYear = () => setViewDate(new Date(year - 1, month, 1));
  const nextYear = () => setViewDate(new Date(year + 1, month, 1));

  // Day detail
  const selectedDayTrades = useMemo(() => {
    if (!selectedDay) return [];
    return monthTrades.filter(t => t.date.getDate() === selectedDay);
  }, [selectedDay, monthTrades]);

  // ─── Day emoji stamp ────────────────────────────────────────
  const dayEmoji = (pnl) => {
    if (pnl >= 5000)                          return "🤑";
    if (pnl >= goals.dailyTarget)             return "🔥";
    if (pnl >= goals.dailyTarget * 0.5)       return "😊";
    if (pnl > 0)                              return "🙂";
    if (pnl >= -goals.dailyStopLoss * 0.5)   return "😕";
    if (pnl > -goals.dailyStopLoss)           return "😟";
    return "😭"; // stop loss hit
  };

  // ─── Styles ─────────────────────────────────────────────────
  const css = {
    app: { fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace", background: T.bg, color: T.text, minHeight: "100vh", padding: "0", transition: "background 0.3s, color 0.3s" },
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: `1px solid ${T.border}`, background: T.headerBg },
    logo: { display: "flex", alignItems: "center", gap: 10 },
    statsBar: { display: "flex", gap: 12, padding: "16px 24px", flexWrap: "wrap", justifyContent: "center", background: T.bg },
    calWrap: { display: "flex", gap: 0, flex: 1 },
    cal: { flex: 1, padding: "16px 24px" },
    sidebar: { width: 180, padding: "16px 12px", borderLeft: `1px solid ${T.border}`, background: T.headerBg },
    grid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 },
    dayCell: (hasTrades, pnl, isToday, isSelected) => ({
      background: hasTrades ? (pnl > 0 ? `${T.positive}15` : pnl < 0 ? `${T.negative}15` : T.bgCell) : T.bgCard,
      border: isSelected ? `2px solid ${T.accent}` : isToday ? `1px solid ${T.borderStrong}` : `1px solid ${T.bgCell}`,
      borderRadius: 6,
      padding: "6px 8px",
      minHeight: 72,
      cursor: hasTrades ? "pointer" : "default",
      transition: "all 0.15s",
      position: "relative",
    }),
    btn: (active) => ({
      background: active ? T.accent : "transparent",
      color: active ? T.bg : T.textMuted,
      border: active ? "none" : `1px solid ${T.borderStrong}`,
      borderRadius: 6,
      padding: "6px 14px",
      cursor: "pointer",
      fontSize: 12,
      fontFamily: "inherit",
      fontWeight: 600,
      transition: "all 0.15s",
    }),
    iconBtn: { background: "transparent", border: `1px solid ${T.borderStrong}`, borderRadius: 6, color: T.textMuted, cursor: "pointer", padding: "6px 10px", fontSize: 14, fontFamily: "inherit" },
    card: { background: T.bgCell, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 18px" },
  };

  return (
    <div style={css.app}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`
        .jp-stats-bar > div { flex: 1 1 130px; }
        @media (max-width: 768px) {
          .jp-cal-sidebar { display: none !important; }
        }
        @media (max-width: 640px) {
          .jp-header { flex-wrap: wrap !important; gap: 8px !important; padding: 10px 14px !important; }
          .jp-header-actions { flex-wrap: wrap !important; justify-content: flex-end !important; gap: 4px !important; }
          .jp-header-actions > button { padding: 5px 8px !important; font-size: 10px !important; }
          .jp-stats-bar { padding: 10px 12px !important; gap: 8px !important; }
          .jp-stats-bar > div { flex: 1 1 calc(33% - 8px); min-width: unset !important; }
          .jp-nav { flex-wrap: wrap !important; gap: 8px !important; padding: 10px 12px !important; }
          .jp-nav-stats { width: 100%; text-align: center; font-size: 10px !important; }
          .jp-day-cell { min-height: 52px !important; padding: 4px 5px !important; }
          .jp-day-pnl { font-size: 12px !important; }
        }
        @media (max-width: 480px) {
          .jp-stats-bar > div { flex: 1 1 calc(50% - 8px); }
          .jp-header-logo-title { font-size: 13px !important; }
          .jp-header-logo-sub { font-size: 9px !important; }
          .jp-nav-month-label { min-width: 120px !important; font-size: 15px !important; }
        }
        @media (max-width: 380px) {
          .jp-stats-bar > div { flex: 1 1 100%; }
        }
      `}</style>

      {/* ── Header ──────────────────────────────────── */}
      <div style={css.header} className="jp-header">
        <div style={css.logo}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${T.accent}, ${T.accentHover})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700 }}>J</div>
          <div>
            <div className="jp-header-logo-title" style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Jupiter Perps Journal</div>
            <div className="jp-header-logo-sub" style={{ fontSize: 10, color: T.textMuted }}>SOL Perpetuals Tracker</div>
          </div>
        </div>
        <div className="jp-header-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select 
            value={isDemoMode ? "demo" : "local"} 
            onChange={(e) => setIsDemoMode(e.target.value === "demo")}
            style={{ background: T.bgCell, color: T.text, border: `1px solid ${T.borderStrong}`, borderRadius: 6, padding: "4px 8px", fontSize: 11, fontFamily: "inherit" }}
          >
            <option value="local">My Data (Local)</option>
            <option value="demo">Demo Profile</option>
          </select>
          {importMsg && (
            <div style={{ fontSize: 11, color: importMsg.type === "error" ? T.negative : importMsg.type === "info" ? T.warning : T.positive, padding: "4px 10px", background: importMsg.type === "error" ? `${T.negative}18` : importMsg.type === "info" ? `${T.warning}18` : `${T.positive}18`, borderRadius: 6 }}>
              {importMsg.text}
            </div>
          )}
          <button style={css.iconBtn} onClick={() => setManualEntry(!manualEntry)} title="Add trade">+ Trade</button>
          <button style={css.iconBtn} onClick={() => setShowUpload(!showUpload)} title="Import CSV">↑ Import</button>
          {heliusKey && walletAddresses.some(w => w.enabled && w.addr.trim()) && (
            <button
              style={{ ...css.iconBtn, color: walletLoading ? T.warning : T.textMuted, borderColor: walletLoading ? T.warning : undefined }}
              onClick={walletLoading ? cancelWalletImport : () => handleWalletImport(true)}
              title={walletLoading ? "Cancel fetch" : "Refresh wallet trades (last 30 days)"}
            >
              {walletLoading ? "⏳ Fetching..." : "↻ Refresh"}
            </button>
          )}
          <button style={css.iconBtn} onClick={() => setShowLog(!showLog)} title="Trade log">☰ Log</button>
          <button style={css.iconBtn} onClick={() => {
            const data = JSON.stringify(trades, null, 2);
            const blob = new Blob([data], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `jupiter-perps-backup-${new Date().toISOString().split("T")[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }} title="Export backup">↓ Backup</button>
          <label style={{ ...css.iconBtn, cursor: "pointer" }} title="Restore from backup">
            ↑ Restore
            <input type="file" accept=".json" style={{ display: "none" }} onChange={(e) => { handleRestore(e.target.files[0]); e.target.value = ""; }} />
          </label>
          <button style={{ ...css.iconBtn, color: privacy ? T.warning : T.textMuted, borderColor: privacy ? T.warning : undefined }} onClick={() => setPrivacy(!privacy)} title={privacy ? "Show amounts" : "Hide amounts"}>{privacy ? "🙈 Hide" : "👁 Show"}</button>
          <button style={{ ...css.iconBtn, color: T.accent, borderColor: T.accent }} onClick={() => setShowGoals(true)} title="Goals &amp; Benchmarks">🎯 Goals</button>
          <button style={{ ...css.iconBtn, color: T.accent, borderColor: T.accent }} onClick={() => setShowTheme(!showTheme)} title="Theme">🎨</button>
          <button style={{ ...css.iconBtn, color: T.negative, borderColor: `${T.negative}55` }} onClick={clearAll} title="Clear data">✕</button>
          {syncing && <span style={{ fontSize: 10, color: T.textMuted }}>syncing...</span>}
          <button style={{ ...css.iconBtn, fontSize: 11 }} onClick={async () => { await supabase.auth.signOut(); }} title="Sign out">⏏ Out</button>
        </div>
      </div>

      {isDemoMode && (
        <div style={{ background: `${T.warning}22`, color: T.warning, padding: "10px 24px", fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.border}` }}>
          <span><strong>Viewing Demo Profile.</strong> Fake data is active for demonstration purposes.</span>
          <button onClick={() => setIsDemoMode(false)} style={{ background: "transparent", color: T.warning, border: `1px solid ${T.warning}55`, borderRadius: 4, padding: "4px 8px", fontSize: 10, cursor: "pointer" }}>Exit Demo</button>
        </div>
      )}

      {/* ── Upload zone (tabbed: CSV | Wallet) ────── */}
      {showUpload && (
        <div style={{ margin: "12px 24px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
          {/* Tab bar */}
          <div style={{ display: "flex", borderBottom: `1px solid ${T.border}` }}>
            {[["csv", "CSV Import"], ["wallet", "Wallet Import"]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setWalletTab(key)}
                style={{
                  flex: 1, padding: "10px 16px", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                  background: walletTab === key ? T.bgCell : "transparent",
                  color: walletTab === key ? T.accent : T.textMuted,
                  border: "none", borderBottom: walletTab === key ? `2px solid ${T.accent}` : "2px solid transparent",
                  cursor: "pointer", transition: "all 0.2s",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* CSV tab */}
          {walletTab === "csv" && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              style={{
                padding: 28,
                border: dragOver ? `2px dashed ${T.accent}` : "2px dashed transparent",
                background: dragOver ? `${T.accent}0a` : "transparent",
                textAlign: "center",
                transition: "all 0.2s",
              }}
            >
              <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 10 }}>
                Drop your Jupiter CSV export here, or
              </div>
              <label style={{ ...css.btn(true), cursor: "pointer", display: "inline-block" }}>
                Browse Files
                <input type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ""; }} />
              </label>
              <div style={{ fontSize: 10, color: T.textFaint, marginTop: 10 }}>
                Supports Jupiter.ag perps CSV exports. Columns auto-detected.
              </div>
            </div>
          )}

          {/* Wallet tab */}
          {walletTab === "wallet" && (
            <div style={{ padding: "20px 28px" }}>
              <div style={{ marginBottom: 16, padding: "10px 14px", background: `${T.warning}15`, border: `1px solid ${T.warning}40`, borderRadius: 8, color: T.warning, fontSize: 11, lineHeight: 1.4 }}>
                <strong>⚠️ Note:</strong> CSV Import is highly recommended. Wallet import via on-chain data may not capture all historical data or trade attributes required for full Pattern analysis.
              </div>
              {/* API Key */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>
                  Helius API Key or RPC URL
                </label>
                <input
                  type="password"
                  value={heliusKey}
                  onChange={(e) => setHeliusKey(e.target.value)}
                  placeholder="API key or full Helius RPC URL"
                  style={{
                    width: "100%", padding: "8px 12px", fontSize: 12, fontFamily: "inherit",
                    background: T.bgCell, border: `1px solid ${T.borderStrong}`, borderRadius: 6,
                    color: T.text, boxSizing: "border-box",
                  }}
                />
                <div style={{ fontSize: 9, color: T.textFaint, marginTop: 4 }}>
                  Paste your API key or full URL (e.g. https://...helius-rpc.com/?api-key=xxx)
                </div>
              </div>

              {/* Wallet addresses */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>
                  Solana Wallet{walletAddresses.length > 1 ? "s" : ""}
                </label>
                {walletAddresses.map((w, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                    {walletAddresses.length > 1 && (
                      <input
                        type="checkbox"
                        checked={w.enabled}
                        onChange={() => {
                          const updated = [...walletAddresses];
                          updated[idx] = { ...updated[idx], enabled: !updated[idx].enabled };
                          setWalletAddresses(updated);
                        }}
                        style={{ accentColor: T.accent, flexShrink: 0 }}
                        title={w.enabled ? "Enabled" : "Disabled"}
                      />
                    )}
                    <input
                      type="text"
                      value={w.addr}
                      onChange={(e) => {
                        const updated = [...walletAddresses];
                        updated[idx] = { ...updated[idx], addr: e.target.value };
                        setWalletAddresses(updated);
                      }}
                      placeholder={`Wallet address${walletAddresses.length > 1 ? ` #${idx + 1}` : ""}`}
                      style={{
                        flex: 1, padding: "8px 12px", fontSize: 12, fontFamily: "inherit",
                        background: T.bgCell, border: `1px solid ${w.addr && !isValidSolanaAddress(w.addr) ? T.negative : T.borderStrong}`, borderRadius: 6,
                        color: T.text, boxSizing: "border-box",
                        opacity: w.enabled ? 1 : 0.4,
                      }}
                    />
                    {walletAddresses.length > 1 && (
                      <button
                        onClick={() => setWalletAddresses(walletAddresses.filter((_, i) => i !== idx))}
                        style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 14, padding: "4px 6px", flexShrink: 0 }}
                        title="Remove wallet"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setWalletAddresses([...walletAddresses, { addr: "", enabled: true }])}
                  style={{ background: "none", border: `1px dashed ${T.borderStrong}`, borderRadius: 6, color: T.textMuted, cursor: "pointer", fontSize: 11, padding: "5px 12px", fontFamily: "inherit", marginTop: 2 }}
                >
                  + Add wallet
                </button>
              </div>

              {/* Save wallets checkbox */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: T.textMuted, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={saveWalletsChecked}
                    onChange={(e) => setSaveWalletsChecked(e.target.checked)}
                    style={{ accentColor: T.accent }}
                  />
                  Remember wallet{walletAddresses.length > 1 ? "s" : ""}
                </label>
              </div>

              {/* Fetch button / progress */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {!walletLoading ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => handleWalletImport(false)}
                      disabled={!walletAddresses.some(w => w.enabled && w.addr.trim()) || !heliusKey}
                      style={{
                        ...css.btn(true), padding: "8px 24px",
                        opacity: (!walletAddresses.some(w => w.enabled && w.addr.trim()) || !heliusKey) ? 0.4 : 1,
                        cursor: (!walletAddresses.some(w => w.enabled && w.addr.trim()) || !heliusKey) ? "not-allowed" : "pointer",
                      }}
                    >
                      Fetch All
                    </button>
                    <button
                      onClick={() => handleWalletImport(true)}
                      disabled={!walletAddresses.some(w => w.enabled && w.addr.trim()) || !heliusKey}
                      style={{
                        ...css.btn(false), padding: "8px 24px",
                        opacity: (!walletAddresses.some(w => w.enabled && w.addr.trim()) || !heliusKey) ? 0.4 : 1,
                        cursor: (!walletAddresses.some(w => w.enabled && w.addr.trim()) || !heliusKey) ? "not-allowed" : "pointer",
                      }}
                    >
                      Last 30 Days
                    </button>
                  </div>
                ) : (
                  <>
                    <button onClick={cancelWalletImport} style={{ ...css.btn(false), padding: "8px 16px", color: T.negative, borderColor: T.negative }}>
                      Cancel
                    </button>
                    {walletProgress && (
                      <span style={{ fontSize: 11, color: T.textMuted }}>
                        {walletProgress.phase ? walletProgress.phase : (<>
                          {walletProgress.totalWallets > 1 && `Wallet ${walletProgress.currentWallet}/${walletProgress.totalWallets} · `}
                          Page {walletProgress.page} · {walletProgress.totalTxs} txs scanned · {walletProgress.perpsTxs} perps found
                        </>)}
                      </span>
                    )}
                  </>
                )}
              </div>

              <div style={{ fontSize: 10, color: T.textFaint, marginTop: 12 }}>
                Fetches Jupiter Perps trade history directly from on-chain data via Helius.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Manual Entry ───────────────────────────── */}
      {manualEntry && (
        <div style={{ margin: "12px 24px", padding: 20, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 12 }}>Quick Add Trade</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            {[
              { label: "Date", key: "date", type: "date" },
              { label: "Market", key: "market", type: "text", placeholder: "SOL-PERP" },
              { label: "Side", key: "side", type: "select", options: ["Long", "Short"] },
              { label: "P&L ($)", key: "pnl", type: "number", placeholder: "0.00" },
              { label: "Fees ($)", key: "fees", type: "number", placeholder: "0.00" },
              { label: "Size ($)", key: "size", type: "number", placeholder: "0.00" },
              { label: "Leverage", key: "leverage", type: "number", placeholder: "3.5" },
            ].map(f => (
              <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase" }}>{f.label}</label>
                {f.type === "select" ? (
                  <select value={manualForm[f.key]} onChange={e => setManualForm({ ...manualForm, [f.key]: e.target.value })} style={{ background: T.bgCell, border: `1px solid ${T.borderStrong}`, borderRadius: 6, color: T.text, padding: "6px 10px", fontSize: 12, fontFamily: "inherit", minWidth: 80 }}>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type} value={manualForm[f.key]} onChange={e => setManualForm({ ...manualForm, [f.key]: e.target.value })} placeholder={f.placeholder} style={{ background: T.bgCell, border: `1px solid ${T.borderStrong}`, borderRadius: 6, color: T.text, padding: "6px 10px", fontSize: 12, fontFamily: "inherit", width: f.type === "date" ? 130 : 80 }} />
                )}
              </div>
            ))}
            <button onClick={addManualTrade} style={{ ...css.btn(true), padding: "8px 20px", alignSelf: "end" }}>Add</button>
          </div>
        </div>
      )}

      {/* ── Stats Bar ──────────────────────────────── */}
      <div style={css.statsBar} className="jp-stats-bar">
        <div style={{ background: T.bgCell, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 20px", minWidth: 140, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Net P&L <span style={{ color: T.textFaint }}>({stats.totalTrades})</span></div>
          <div style={{ fontSize: 26, fontWeight: 700, color: stats.netPnl >= 0 ? T.positive : T.negative }}>{$(fmt(stats.netPnl))}</div>
        </div>
        <div style={{ background: T.bgCell, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center" }}>
          <Gauge value={stats.winRate} label={pct(stats.winRate)} sub={`${stats.wins}W / ${stats.losses}L`} color={stats.winRate >= 0.5 ? T.positive : T.warning} />
          <div style={{ fontSize: 10, color: T.textMuted, writingMode: "vertical-rl", marginLeft: 4 }}>WIN RATE</div>
        </div>
        <div style={{ background: T.bgCell, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center" }}>
          <Gauge value={Math.min(stats.profitFactor / 3, 1)} label={stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)} sub="target > 1.5" color={stats.profitFactor >= 1.5 ? T.positive : stats.profitFactor >= 1 ? T.warning : T.negative} />
          <div style={{ fontSize: 10, color: T.textMuted, writingMode: "vertical-rl", marginLeft: 4 }}>PROFIT FACTOR</div>
        </div>
        <div style={{ background: T.bgCell, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center" }}>
          <Gauge value={stats.dayWinPct} label={pct(stats.dayWinPct)} sub={`${stats.winDays}/${stats.tradeDays} days`} color={stats.dayWinPct >= 0.5 ? T.positive : T.warning} />
          <div style={{ fontSize: 10, color: T.textMuted, writingMode: "vertical-rl", marginLeft: 4 }}>DAY WIN %</div>
        </div>
        <div style={{ background: T.bgCell, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 18px", display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 150 }}>
          <div style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Avg Win / Loss</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.text }}>{stats.avgRatio.toFixed(2)}</div>
          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            <span style={{ fontSize: 11, color: T.positive }}>{$(fmt(stats.avgWin))}</span>
            <span style={{ fontSize: 11, color: T.negative }}>-{$(fmt(stats.avgLoss))}</span>
          </div>
        </div>
        {/* Streak card */}
        {(() => {
          const { current, best } = streakStats;
          const streakEmoji = current >= 7 ? "💎" : current >= 4 ? "🔥🔥" : current >= 2 ? "🔥" : current === 1 ? "✨" : "—";
          const streakColor = current > 0 ? T.positive : T.textFaint;
          const borderColor = current >= 4 ? T.positive : current > 0 ? `${T.positive}55` : T.border;
          return (
            <div style={{ background: T.bgCell, border: `1px solid ${borderColor}`, borderRadius: 10, padding: "14px 18px", display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 130, transition: "border-color 0.3s" }}>
              <div style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Green Streak</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: streakColor, fontFamily: "'JetBrains Mono', monospace" }}>{current}</div>
                <div style={{ fontSize: 12, color: T.textMuted }}>days</div>
                <div style={{ fontSize: 18, marginLeft: 2 }}>{streakEmoji}</div>
              </div>
              <div style={{ fontSize: 11, color: T.textFaint, marginTop: 6 }}>best: {best} day{best !== 1 ? "s" : ""}</div>
            </div>
          );
        })()}
      </div>

      {/* ── Benchmark Bar ──────────────────────────── */}
      <BenchmarkBar trades={trades} goals={goals} theme={T} privacy={privacy} />

      {/* ── Navigation ─────────────────────────────── */}
      <div className="jp-nav" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button style={css.iconBtn} onClick={view === "month" ? prevMonth : prevYear}>◀</button>
          <div className="jp-nav-month-label" style={{ fontSize: 18, fontWeight: 700, color: T.text, minWidth: 180, textAlign: "center" }}>
            {view === "month" ? `${monthNames[month]} ${year}` : `${year}`}
          </div>
          <button style={css.iconBtn} onClick={view === "month" ? nextMonth : nextYear}>▶</button>
          <button style={{ ...css.iconBtn, fontSize: 11 }} onClick={() => { setViewDate(new Date()); }}>Today</button>
        </div>
        <div style={{ display: "flex", gap: 2, background: T.bgCell, borderRadius: 8, padding: 2, border: `1px solid ${T.border}` }}>
          {[["month", "Month"], ["year", "Year"], ["patterns", "Patterns"]].map(([v, label]) => (
            <button key={v} style={css.btn(view === v)} onClick={() => setView(v)}>{label}</button>
          ))}
        </div>
        <div className="jp-nav-stats" style={{ fontSize: 12, color: T.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
          {[
            ["monthly", "Monthly", monthTrades],
            ["yearly", "Yearly", yearTrades],
            ["allTime", "All-time", trades],
          ].map(([key, label, src], i) => {
            const pnl = src.reduce((s, t) => s + t.pnl, 0);
            const toggle = () => {
              const next = { ...hiddenStats, [key]: !hiddenStats[key] };
              setHiddenStats(next);
              try { localStorage.setItem("jupiter-perps-hidden-stats", JSON.stringify(next)); } catch {}
            };
            return (
              <span key={key} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                {i > 0 && <span style={{ margin: "0 6px", color: T.border }}>|</span>}
                {hiddenStats[key] ? (
                  <button onClick={toggle} title={`Show ${label}`} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", padding: "0 2px", fontSize: 11 }}>{label} 👁</button>
                ) : (
                  <>
                    {label}: <span style={{ color: pnl >= 0 ? T.positive : T.negative, fontWeight: 700 }}>{$(fmt(pnl))}</span>
                    <button onClick={toggle} title={`Hide ${label}`} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", padding: "0 2px", fontSize: 10, opacity: 0.5 }}>✕</button>
                  </>
                )}
              </span>
            );
          })}
        </div>
      </div>

      {/* ── Calendar + Sidebar ─────────────────────── */}
      {view === "patterns" ? (
        <PatternPanel trades={trades} monthTrades={monthTrades} yearTrades={yearTrades} theme={T} privacy={privacy} />
      ) : view === "month" ? (
        <div style={css.calWrap}>
          <div style={css.cal}>
            {/* Day headers */}
            <div style={css.grid}>
              {dayNames.map(d => (
                <div key={d} style={{ textAlign: "center", fontSize: 11, color: T.textMuted, padding: "6px 0", fontWeight: 600 }}>{d}</div>
              ))}
            </div>
            {/* Calendar grid */}
            <div style={css.grid}>
              {Array.from({ length: calendarData.startPad }).map((_, i) => (
                <div key={`pad-${i}`} style={{ background: T.bg, borderRadius: 6, minHeight: 72 }} />
              ))}
              {Array.from({ length: calendarData.totalDays }).map((_, i) => {
                const d = i + 1;
                const pnl = calendarData.dayPnl[d];
                const count = calendarData.dayTrades[d] || 0;
                const wins = calendarData.dayWins[d] || 0;
                const hasTrades = count > 0;
                const isToday = isSameDay(new Date(year, month, d), today);
                const isSelected = selectedDay === d;

                return (
                  <div
                    key={d}
                    className="jp-day-cell"
                    style={css.dayCell(hasTrades, pnl, isToday, isSelected)}
                    onClick={() => hasTrades && setSelectedDay(isSelected ? null : d)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                      <div style={{ fontSize: 11, color: isToday ? T.accent : T.textMuted, fontWeight: isToday ? 700 : 400 }}>{d}</div>
                      {hasTrades && <div style={{ fontSize: 14, lineHeight: 1 }}>{dayEmoji(pnl)}</div>}
                    </div>
                    {hasTrades && (
                      <>
                        <div className="jp-day-pnl" style={{ fontSize: 16, fontWeight: 700, color: pnl > 0 ? T.positive : pnl < 0 ? T.negative : T.textMuted }}>
                          {$(Math.abs(pnl) >= 1000 ? fmtK(pnl) : fmt(pnl, 0))}
                        </div>
                        <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2 }}>
                          {count} trade{count !== 1 ? "s" : ""} · {count > 0 ? pct(wins / count) : "0%"}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Day detail */}
            {selectedDay && selectedDayTrades.length > 0 && (() => {
              const dayPnl   = calendarData.dayPnl[selectedDay];
              const dayWins  = selectedDayTrades.filter(t => t.pnl > 0);
              const dayLosses = selectedDayTrades.filter(t => t.pnl < 0);
              const winRate  = selectedDayTrades.length ? dayWins.length / selectedDayTrades.length * 100 : 0;
              const bestTrade  = [...selectedDayTrades].sort((a, b) => b.pnl - a.pnl)[0];
              const worstTrade = [...selectedDayTrades].sort((a, b) => a.pnl - b.pnl)[0];
              const stopHit    = dayPnl <= -goals.dailyStopLoss;
              const targetHit  = dayPnl >= goals.dailyTarget;
              const emoji      = dayEmoji(dayPnl);

              const chips = [
                {
                  label: "Daily Target",
                  ok: targetHit,
                  warn: dayPnl > 0 && !targetHit,
                  icon: targetHit ? "✅" : dayPnl > 0 ? "🟡" : "❌",
                  value: $(fmt(dayPnl)),
                  sub: `goal ${fmt(goals.dailyTarget)}`,
                },
                {
                  label: "Stop Loss",
                  ok: !stopHit,
                  warn: dayPnl < 0 && Math.abs(dayPnl) >= goals.dailyStopLoss * 0.67 && !stopHit,
                  icon: stopHit ? "🔴" : dayPnl < 0 && Math.abs(dayPnl) >= goals.dailyStopLoss * 0.67 ? "🟡" : "✅",
                  value: stopHit ? "STOP HIT" : "Clean",
                  sub: `limit ${fmt(-goals.dailyStopLoss)}`,
                },
                {
                  label: "Win Rate",
                  icon: winRate >= goals.winRateTarget ? "✅" : winRate >= goals.winRateTarget * 0.7 ? "🟡" : "❌",
                  value: `${winRate.toFixed(0)}%`,
                  sub: `${dayWins.length}W / ${dayLosses.length}L`,
                },
                {
                  label: "Best / Worst",
                  icon: "📊",
                  value: $(fmt(bestTrade.pnl)),
                  sub: `worst: ${fmt(worstTrade.pnl)}`,
                },
              ];

              return (
                <div style={{ marginTop: 16, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: 32, lineHeight: 1 }}>{emoji}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
                        {monthNames[month]} {selectedDay}
                        <span style={{ marginLeft: 10, fontSize: 18, color: dayPnl >= 0 ? T.positive : T.negative }}>{$(fmt(dayPnl))}</span>
                      </div>
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                        {selectedDayTrades.length} trade{selectedDayTrades.length !== 1 ? "s" : ""}
                        {stopHit && <span style={{ marginLeft: 8, color: T.negative, fontWeight: 700 }}>· STOP LOSS HIT</span>}
                        {targetHit && <span style={{ marginLeft: 8, color: T.positive, fontWeight: 700 }}>· TARGET REACHED 🔥</span>}
                      </div>
                    </div>
                  </div>

                  {/* Goal chips */}
                  <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}` }}>
                    {chips.map((c, i) => (
                      <div key={i} style={{ flex: 1, padding: "10px 14px", borderRight: i < chips.length - 1 ? `1px solid ${T.border}` : "none", background: c.ok ? `${T.positive}08` : c.warn ? `${T.warning}08` : "transparent" }}>
                        <div style={{ fontSize: 9, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{c.label}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                          <span style={{ marginRight: 5 }}>{c.icon}</span>{c.value}
                        </div>
                        <div style={{ fontSize: 9, color: T.textFaint, marginTop: 2 }}>{c.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Trade table */}
                  <div style={{ padding: "10px 16px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "80px 90px 80px 90px 80px 50px 28px", gap: "5px 12px", fontSize: 11 }}>
                      <div style={{ color: T.textMuted, fontWeight: 600 }}>Market</div>
                      <div style={{ color: T.textMuted, fontWeight: 600 }}>Side</div>
                      <div style={{ color: T.textMuted, fontWeight: 600 }}>Size</div>
                      <div style={{ color: T.textMuted, fontWeight: 600 }}>P&L</div>
                      <div style={{ color: T.textMuted, fontWeight: 600 }}>Fees</div>
                      <div style={{ color: T.textMuted, fontWeight: 600 }}>Via</div>
                      <div></div>
                      {selectedDayTrades.map(t => (
                        <React.Fragment key={t.id}>
                          <div style={{ color: T.text }}>{t.market}</div>
                          <div style={{ color: t.side?.toLowerCase().includes("long") ? T.positive : T.negative }}>{t.side}</div>
                          <div style={{ color: T.text }}>{t.size ? $(fmt(t.size)) : "—"}</div>
                          <div style={{ color: t.pnl >= 0 ? T.positive : T.negative, fontWeight: 600 }}>{$(fmt(t.pnl))}</div>
                          <div style={{ color: T.textMuted }}>{t.fees ? $(fmt(t.fees)) : "—"}</div>
                          <div style={{ color: T.textFaint, fontSize: 9, textTransform: "uppercase" }}>{t.source || "csv"}</div>
                          <button
                            onClick={() => saveTrades(trades.filter(tr => tr.id !== t.id))}
                            style={{ background: "none", border: "none", color: T.negative, cursor: "pointer", fontSize: 12, fontFamily: "inherit", padding: 0, opacity: 0.6 }}
                            title="Delete trade"
                          >✕</button>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="jp-cal-sidebar" style={css.sidebar}>
            <div style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>Weekly</div>
            {[1, 2, 3, 4, 5, 6].map(w => {
              const data = calendarData.weeks[w];
              if (!data && w > 4) return null;
              return (
                <div key={w} style={{ marginBottom: 14, padding: "10px 12px", background: T.bgCell, borderRadius: 8, border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 11, color: T.textMuted }}>Week {w}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: data && data.pnl !== 0 ? (data.pnl > 0 ? T.positive : T.negative) : T.textFaint, marginTop: 2 }}>
                    {data ? $(fmt(data.pnl, 0)) : "$0"}
                  </div>
                  <div style={{ fontSize: 10, color: T.textFaint, marginTop: 2 }}>
                    {data ? `${data.days} day${data.days !== 1 ? "s" : ""}` : "0 days"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── Year View ─────────────────────────────── */
        <div style={{ padding: "8px 24px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {monthNamesShort.map((m, i) => {
            const pnl = yearCalData.monthPnl[i] || 0;
            const count = yearCalData.monthTradeCount[i] || 0;
            const wins = yearCalData.monthWins[i] || 0;
            return (
              <div
                key={m}
                onClick={() => { setViewDate(new Date(year, i, 1)); setView("month"); }}
                style={{
                  background: count > 0 ? (pnl > 0 ? `${T.positive}10` : pnl < 0 ? `${T.negative}10` : T.bgCell) : T.bgCard,
                  border: `1px solid ${i === today.getMonth() && year === today.getFullYear() ? T.borderStrong : T.border}`,
                  borderRadius: 10,
                  padding: "16px 20px",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, marginBottom: 8 }}>{m}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: count > 0 ? (pnl > 0 ? T.positive : pnl < 0 ? T.negative : T.textFaint) : T.border }}>
                  {count > 0 ? $(fmt(pnl, 0)) : "—"}
                </div>
                {count > 0 && (
                  <div style={{ fontSize: 10, color: T.textMuted, marginTop: 6 }}>
                    {count} trades · {pct(wins / count)} win
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Trade Log Modal ────────────────────────── */}
      {showLog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowLog(false)}>
          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, maxWidth: 800, width: "90%", maxHeight: "80vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Trade Log ({trades.length})</div>
              <button style={css.iconBtn} onClick={() => setShowLog(false)}>✕</button>
            </div>
            {trades.length === 0 ? (
              <div style={{ textAlign: "center", color: T.textFaint, padding: 40 }}>No trades yet. Import a CSV or add manually.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {["Date", "Market", "Side", "Size", "Leverage", "Entry", "Exit", "P&L", "Fees", "Via"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${T.border}`, color: T.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
                      ))}
                      <th style={{ width: 30 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...trades].sort((a, b) => b.date - a.date).map(t => (
                      <tr key={t.id} style={{ borderBottom: `1px solid ${T.bgCell}` }}>
                        <td style={{ padding: "8px 10px", color: T.textMuted }}>{t.date.toLocaleDateString()}</td>
                        <td style={{ padding: "8px 10px", color: T.text }}>{t.market}</td>
                        <td style={{ padding: "8px 10px", color: t.side?.toLowerCase().includes("long") ? T.positive : T.negative }}>{t.side}</td>
                        <td style={{ padding: "8px 10px", color: T.text }}>{t.size ? fmt(t.size) : "—"}</td>
                        <td style={{ padding: "8px 10px", color: T.text }}>{t.leverage ? t.leverage + "x" : "—"}</td>
                        <td style={{ padding: "8px 10px", color: T.text }}>{t.entryPrice ? fmt(t.entryPrice) : "—"}</td>
                        <td style={{ padding: "8px 10px", color: T.text }}>{t.exitPrice ? fmt(t.exitPrice) : "—"}</td>
                        <td style={{ padding: "8px 10px", color: t.pnl >= 0 ? T.positive : T.negative, fontWeight: 700 }}>{fmt(t.pnl)}</td>
                        <td style={{ padding: "8px 10px", color: T.textMuted }}>{t.fees ? fmt(t.fees) : "—"}</td>
                        <td style={{ padding: "8px 10px", color: T.textFaint, fontSize: 9, textTransform: "uppercase" }}>{t.source || "csv"}</td>
                        <td style={{ padding: "8px 10px" }}>
                          <button
                            onClick={() => saveTrades(trades.filter(tr => tr.id !== t.id))}
                            style={{ background: "none", border: "none", color: T.negative, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}
                            title="Delete trade"
                          >✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Empty state ────────────────────────────── */}
      {trades.length === 0 && !showUpload && !manualEntry && (
        <div style={{ textAlign: "center", padding: "60px 24px" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 16, color: T.textMuted, fontWeight: 600, marginBottom: 8 }}>No trades yet</div>
          <div style={{ fontSize: 12, color: T.textFaint, maxWidth: 400, margin: "0 auto 20px" }}>
            Export your trades from Jupiter.ag as a CSV, then import them here. You can also add trades manually.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button style={css.btn(true)} onClick={() => setShowUpload(true)}>↑ Import CSV</button>
            <button style={{ ...css.btn(false) }} onClick={() => setManualEntry(true)}>+ Add Trade</button>
          </div>
        </div>
      )}

      {/* ── Theme Panel ────────────────────────────── */}
      {showTheme && (
        <ThemePanel
          theme={theme}
          onClose={() => setShowTheme(false)}
          onThemeChange={(t) => setTheme(t)}
        />
      )}

      {/* ── Goals Panel ─────────────────────────────── */}
      {showGoals && (
        <GoalsPanel
          goals={goals}
          onSave={(g) => { saveGoals(g); setGoals(g); setShowGoals(false); }}
          onClose={() => setShowGoals(false)}
          theme={T}
        />
      )}

      {/* ── Footer ──────────────────────────────────── */}
      <div style={{ marginTop: "auto", padding: "20px 24px", borderTop: `1px solid ${T.border}`, display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 12, color: T.textMuted }}>
            Built by <a href="https://phantom.com/user/cryptoandcloud" target="_blank" rel="noreferrer" style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>@cryptoandcloud</a>
          </div>
          <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.borderStrong }} />
          <div style={{ fontSize: 12, color: T.textFaint }}>
            <a href="https://github.com/PromptAndFlow" target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>GitHub</a>
          </div>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: T.bgCell, padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.borderStrong}` }}>
          <div style={{ fontSize: 11, color: T.textMuted }}>💖 Support the project:</div>
          <div style={{ fontSize: 11, color: T.text, fontFamily: "'JetBrains Mono', monospace", background: T.bgCard, padding: "4px 8px", borderRadius: 4, border: `1px solid ${T.border}` }}>
            Fzy84tGixxQHD2dZphhULEKfYcCsqF5VXoka1xX8iAUC
          </div>
          <button 
            onClick={() => {
              navigator.clipboard.writeText("Fzy84tGixxQHD2dZphhULEKfYcCsqF5VXoka1xX8iAUC");
              const btn = document.getElementById("copy-sol-btn");
              if(btn) {
                const old = btn.innerText;
                btn.innerText = "Copied!";
                setTimeout(() => btn.innerText = old, 2000);
              }
            }}
            id="copy-sol-btn"
            style={{ background: T.accent, color: T.bgCard, border: "none", borderRadius: 4, padding: "4px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}