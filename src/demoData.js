export const demoTrades = [];

// Helper to generate realistic random trades
function generateDemoData() {
  const markets = ["SOL-PERP", "SOL-PERP", "SOL-PERP", "BTC-PERP", "ETH-PERP", "JUP-PERP"];
  const now = new Date();
  
  for (let i = 0; i < 45; i++) {
    // Spread trades over the last 30 days
    const daysAgo = Math.floor(Math.random() * 30);
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));

    const market = markets[Math.floor(Math.random() * markets.length)];
    const isWin = Math.random() > 0.45; // ~55% win rate
    
    // Size between $1k and $10k
    const size = Math.floor(Math.random() * 9000) + 1000;
    const leverage = Math.floor(Math.random() * 10) + 2;
    
    // Win is 1-5% of size, loss is 1-3% of size
    const pnlPct = isWin ? (Math.random() * 0.04 + 0.01) : -(Math.random() * 0.02 + 0.01);
    const pnl = size * pnlPct;
    
    const fees = size * 0.001; // 0.1% fees

    demoTrades.push({
      id: "demo-" + i,
      date,
      dateStr: date.toISOString(),
      market,
      side: Math.random() > 0.5 ? "Long" : "Short",
      size,
      leverage,
      pnl,
      fees,
      entryPrice: null,
      exitPrice: null,
      collateral: size / leverage,
      source: "demo",
    });
  }
}

generateDemoData();
