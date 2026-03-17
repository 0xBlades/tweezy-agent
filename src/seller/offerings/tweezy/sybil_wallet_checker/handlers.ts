import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";

// ─── Chain Configuration ────────────────────────────────────────────────────────

interface ChainConfig {
  name: string;
  apiUrl: string;
  explorerUrl: string;
}

const CHAINS: Record<string, ChainConfig> = {
  ethereum: {
    name: "Ethereum",
    apiUrl: "https://api.etherscan.io/api",
    explorerUrl: "https://etherscan.io",
  },
  base: {
    name: "Base",
    apiUrl: "https://api.basescan.org/api",
    explorerUrl: "https://basescan.org",
  },
  arbitrum: {
    name: "Arbitrum",
    apiUrl: "https://api.arbiscan.io/api",
    explorerUrl: "https://arbiscan.io",
  },
  optimism: {
    name: "Optimism",
    apiUrl: "https://api-optimistic.etherscan.io/api",
    explorerUrl: "https://optimistic.etherscan.io",
  },
  polygon: {
    name: "Polygon",
    apiUrl: "https://api.polygonscan.com/api",
    explorerUrl: "https://polygonscan.com",
  },
  bsc: {
    name: "BNB Chain",
    apiUrl: "https://api.bscscan.com/api",
    explorerUrl: "https://bscscan.com",
  },
  avalanche: {
    name: "Avalanche",
    apiUrl: "https://api.snowscan.xyz/api",
    explorerUrl: "https://snowscan.xyz",
  },
  fantom: {
    name: "Fantom",
    apiUrl: "https://api.ftmscan.com/api",
    explorerUrl: "https://ftmscan.com",
  },
  linea: {
    name: "Linea",
    apiUrl: "https://api.lineascan.build/api",
    explorerUrl: "https://lineascan.build",
  },
  scroll: {
    name: "Scroll",
    apiUrl: "https://api.scrollscan.com/api",
    explorerUrl: "https://scrollscan.com",
  },
  zksync: {
    name: "zkSync Era",
    apiUrl: "https://api-era.zksync.network/api",
    explorerUrl: "https://era.zksync.network",
  },
};

// ─── On-Chain Data Fetching ─────────────────────────────────────────────────────

interface TxData {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  functionName: string;
  isError: string;
}

interface WalletMetrics {
  totalTxCount: number;
  uniqueContractsInteracted: number;
  uniqueAddressesInteracted: number;
  firstTxDate: string;
  lastTxDate: string;
  walletAgeDays: number;
  avgTimeBetweenTxsHours: number;
  fundingSources: string[];
  totalValueTransferred: string;
  failedTxCount: number;
  failedTxRatio: number;
  mostUsedContracts: { address: string; count: number }[];
  txFrequencyPattern: string;
  hasOnlyLowValueTxs: boolean;
  contractInteractionDiversity: number;
  burstActivityDetected: boolean;
}

async function fetchTransactions(
  wallet: string,
  chain: ChainConfig,
  apiKey: string,
  limit: number
): Promise<TxData[]> {
  const url = `${chain.apiUrl}?module=account&action=txlist&address=${wallet}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc&apikey=${apiKey}`;

  const response = await fetch(url);
  const data = (await response.json()) as any;

  if (data.status !== "1" || !Array.isArray(data.result)) {
    return [];
  }
  return data.result;
}

async function fetchBalance(
  wallet: string,
  chain: ChainConfig,
  apiKey: string
): Promise<string> {
  const url = `${chain.apiUrl}?module=account&action=balance&address=${wallet}&tag=latest&apikey=${apiKey}`;
  const response = await fetch(url);
  const data = (await response.json()) as any;
  if (data.status === "1") {
    const balWei = BigInt(data.result);
    const balEth = Number(balWei) / 1e18;
    return balEth.toFixed(6);
  }
  return "0";
}

function analyzeTransactions(txs: TxData[], wallet: string): WalletMetrics {
  const walletLower = wallet.toLowerCase();

  // Unique addresses & contracts
  const contractsSet = new Set<string>();
  const addressesSet = new Set<string>();
  const fundingSet = new Set<string>();
  const contractCounts: Record<string, number> = {};
  let failedCount = 0;
  let lowValueCount = 0;

  for (const tx of txs) {
    const counterparty =
      tx.from.toLowerCase() === walletLower ? tx.to : tx.from;

    if (counterparty) {
      addressesSet.add(counterparty.toLowerCase());

      // If it has a function name, it's likely a contract
      if (tx.functionName && tx.functionName.length > 0) {
        contractsSet.add(counterparty.toLowerCase());
        contractCounts[counterparty.toLowerCase()] =
          (contractCounts[counterparty.toLowerCase()] || 0) + 1;
      }
    }

    // Track funding sources (incoming transfers)
    if (tx.to.toLowerCase() === walletLower && Number(tx.value) > 0) {
      fundingSet.add(tx.from.toLowerCase());
    }

    if (tx.isError === "1") failedCount++;

    // Low value = < 0.001 ETH
    if (Number(tx.value) / 1e18 < 0.001) lowValueCount++;
  }

  // Time analysis
  const timestamps = txs.map((tx) => Number(tx.timeStamp)).sort();
  const firstTx = timestamps[0] || 0;
  const lastTx = timestamps[timestamps.length - 1] || 0;
  const ageDays = firstTx > 0 ? (Date.now() / 1000 - firstTx) / 86400 : 0;

  // Average time between transactions
  let avgTimeBetweenTxs = 0;
  if (timestamps.length > 1) {
    const gaps: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      gaps.push(Math.abs(timestamps[i] - timestamps[i - 1]));
    }
    avgTimeBetweenTxs =
      gaps.reduce((sum, g) => sum + g, 0) / gaps.length / 3600;
  }

  // Detect burst activity (many txs in short period)
  let burstDetected = false;
  if (timestamps.length >= 10) {
    for (let i = 0; i < timestamps.length - 10; i++) {
      const window = timestamps[i + 9] - timestamps[i];
      if (window < 3600) {
        // 10 txs in 1 hour
        burstDetected = true;
        break;
      }
    }
  }

  // Frequency pattern
  let freqPattern = "normal";
  if (avgTimeBetweenTxs < 1) freqPattern = "very_frequent";
  else if (avgTimeBetweenTxs < 6) freqPattern = "frequent";
  else if (avgTimeBetweenTxs > 168) freqPattern = "sparse";

  // Most used contracts
  const sortedContracts = Object.entries(contractCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([address, count]) => ({ address, count }));

  // Total value
  const totalValue = txs
    .reduce((sum, tx) => sum + Number(tx.value) / 1e18, 0)
    .toFixed(4);

  // Contract interaction diversity (unique contracts / total txs)
  const diversity =
    txs.length > 0 ? contractsSet.size / txs.length : 0;

  return {
    totalTxCount: txs.length,
    uniqueContractsInteracted: contractsSet.size,
    uniqueAddressesInteracted: addressesSet.size,
    firstTxDate: firstTx > 0 ? new Date(firstTx * 1000).toISOString().split("T")[0] : "N/A",
    lastTxDate: lastTx > 0 ? new Date(lastTx * 1000).toISOString().split("T")[0] : "N/A",
    walletAgeDays: Math.round(ageDays),
    avgTimeBetweenTxsHours: Math.round(avgTimeBetweenTxs * 10) / 10,
    fundingSources: [...fundingSet].slice(0, 10),
    totalValueTransferred: totalValue,
    failedTxCount: failedCount,
    failedTxRatio: txs.length > 0 ? Math.round((failedCount / txs.length) * 100) : 0,
    mostUsedContracts: sortedContracts,
    txFrequencyPattern: freqPattern,
    hasOnlyLowValueTxs: lowValueCount === txs.length && txs.length > 0,
    contractInteractionDiversity: Math.round(diversity * 100),
    burstActivityDetected: burstDetected,
  };
}

// ─── Sybil Heuristic Score ──────────────────────────────────────────────────────

interface HeuristicResult {
  score: number; // 0-100 (0 = clean, 100 = definite sybil)
  flags: string[];
}

function calculateHeuristicScore(metrics: WalletMetrics): HeuristicResult {
  let score = 0;
  const flags: string[] = [];

  // 1. Wallet age (new wallets are more suspicious)
  if (metrics.walletAgeDays < 30) {
    score += 20;
    flags.push("🚩 Wallet is less than 30 days old");
  } else if (metrics.walletAgeDays < 90) {
    score += 10;
    flags.push("⚠️ Wallet is less than 90 days old");
  }

  // 2. Low transaction count
  if (metrics.totalTxCount < 10) {
    score += 15;
    flags.push("🚩 Very low transaction count (<10)");
  } else if (metrics.totalTxCount < 30) {
    score += 5;
    flags.push("⚠️ Low transaction count (<30)");
  }

  // 3. Low contract diversity
  if (metrics.contractInteractionDiversity < 10) {
    score += 15;
    flags.push("🚩 Very low contract interaction diversity (<10%)");
  } else if (metrics.contractInteractionDiversity < 30) {
    score += 8;
    flags.push("⚠️ Low contract interaction diversity (<30%)");
  }

  // 4. Single funding source
  if (metrics.fundingSources.length === 1) {
    score += 10;
    flags.push("🚩 Single funding source detected");
  }

  // 5. Only low value transactions
  if (metrics.hasOnlyLowValueTxs) {
    score += 15;
    flags.push("🚩 All transactions are low value (<0.001 ETH)");
  }

  // 6. Burst activity
  if (metrics.burstActivityDetected) {
    score += 10;
    flags.push("🚩 Burst activity detected (10+ txs in 1 hour)");
  }

  // 7. High failed transaction ratio
  if (metrics.failedTxRatio > 30) {
    score += 10;
    flags.push("🚩 High failed transaction ratio (>30%)");
  }

  // 8. Very frequent but low diversity
  if (metrics.txFrequencyPattern === "very_frequent" && metrics.contractInteractionDiversity < 20) {
    score += 10;
    flags.push("🚩 Many transactions but very few unique contracts");
  }

  // Cap at 100
  score = Math.min(score, 100);

  // Add positive signals
  if (metrics.walletAgeDays > 365) {
    score = Math.max(0, score - 10);
    flags.push("✅ Wallet is over 1 year old");
  }
  if (metrics.uniqueContractsInteracted > 50) {
    score = Math.max(0, score - 10);
    flags.push("✅ High contract interaction diversity (50+)");
  }
  if (metrics.totalTxCount > 200) {
    score = Math.max(0, score - 5);
    flags.push("✅ High transaction count (200+)");
  }

  return { score: Math.max(0, Math.min(100, score)), flags };
}

// ─── AI Analysis Prompt ─────────────────────────────────────────────────────────

function buildPrompt(
  wallet: string,
  chain: string,
  balance: string,
  metrics: WalletMetrics,
  heuristic: HeuristicResult
): string {
  return `You are a blockchain security analyst specializing in sybil detection.

Analyze this wallet for sybil behavior:

**Wallet:** ${wallet}
**Chain:** ${chain}
**Current Balance:** ${balance} ETH/native token

**On-Chain Metrics:**
- Total Transactions: ${metrics.totalTxCount}
- Unique Contracts Interacted: ${metrics.uniqueContractsInteracted}
- Unique Addresses Interacted: ${metrics.uniqueAddressesInteracted}
- Wallet Age: ${metrics.walletAgeDays} days (first tx: ${metrics.firstTxDate})
- Last Activity: ${metrics.lastTxDate}
- Avg Time Between Txs: ${metrics.avgTimeBetweenTxsHours} hours
- Transaction Frequency: ${metrics.txFrequencyPattern}
- Funding Sources: ${metrics.fundingSources.length} unique sources
- Total Value Transferred: ${metrics.totalValueTransferred} ETH
- Failed Tx Ratio: ${metrics.failedTxRatio}%
- Contract Diversity Score: ${metrics.contractInteractionDiversity}%
- Burst Activity: ${metrics.burstActivityDetected ? "YES" : "NO"}
- Only Low-Value Txs: ${metrics.hasOnlyLowValueTxs ? "YES" : "NO"}
- Top Contracts: ${metrics.mostUsedContracts.map((c) => `${c.address.slice(0, 10)}... (${c.count} txs)`).join(", ") || "None"}

**Heuristic Score:** ${heuristic.score}/100 (0=clean, 100=sybil)
**Flags:**
${heuristic.flags.map((f) => `  ${f}`).join("\n")}

Provide your analysis in this EXACT format:

# 🔍 Sybil Analysis Report

**Wallet:** \`${wallet}\`
**Chain:** ${chain}

## 📊 Risk Assessment
- **Sybil Risk Score:** X/100
- **Risk Level:** LOW / MEDIUM / HIGH / CRITICAL
- **Confidence:** X% (how confident you are in this assessment)

## 🔎 Detailed Analysis

### Transaction Pattern Analysis
Analyze the transaction patterns and what they reveal about the wallet's authenticity.

### Funding Source Analysis
Analyze the funding sources and what they reveal.

### Behavioral Indicators
List specific behavioral indicators that point to or against sybil activity.

## 🚩 Red Flags
List any concerning patterns found (or "None detected" if clean).

## ✅ Positive Signals
List any indicators of legitimate wallet usage.

## 🎯 Verdict
Clear, concise final verdict with reasoning.

## 💡 Recommendations
2-3 actionable recommendations based on the analysis.

---
⚠️ Disclaimer: This analysis is based on on-chain data patterns and heuristics. It is not a definitive determination. False positives and negatives are possible.

RULES:
- Be specific with data points
- Don't make conclusions without evidence
- If data is insufficient, say so
- Keep total response under 800 words`;
}

// ─── Handlers ──────────────────────────────────────────────────────────────────

export function validateRequirements(request: any): ValidationResult {
  if (!request.wallet || typeof request.wallet !== "string") {
    return { valid: false, reason: "A 'wallet' address (0x format) is required." };
  }

  const wallet = request.wallet.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return { valid: false, reason: "Invalid wallet address format. Must be 0x followed by 40 hex characters." };
  }

  if (request.chain && !CHAINS[request.chain.toLowerCase()]) {
    return {
      valid: false,
      reason: `Unsupported chain: ${request.chain}. Supported: ${Object.keys(CHAINS).join(", ")}`,
    };
  }

  return { valid: true };
}

export function requestPayment(request: any): string {
  const chain = request.chain || "ethereum";
  return `Sybil analysis for wallet ${request.wallet} on ${chain} accepted. Processing...`;
}

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const wallet = request.wallet.trim();
  const chainKey = (request.chain || "ethereum").toLowerCase();
  const depth = request.depth === "deep" ? 200 : 50;
  const chain = CHAINS[chainKey] || CHAINS.ethereum;

  console.log(`[sybil_checker] Analyzing ${wallet} on ${chain.name} (depth=${depth})`);

  const etherscanApiKey = process.env.ETHERSCAN_API_KEY;
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || "google/gemini-3-flash-preview";

  if (!etherscanApiKey) {
    return { deliverable: "Error: ETHERSCAN_API_KEY is not set." };
  }
  if (!openrouterApiKey) {
    return { deliverable: "Error: OPENROUTER_API_KEY is not set." };
  }

  try {
    // Step 1: Fetch on-chain data
    console.log(`[sybil_checker] Fetching transactions from ${chain.name}...`);
    const [txs, balance] = await Promise.all([
      fetchTransactions(wallet, chain, etherscanApiKey, depth),
      fetchBalance(wallet, chain, etherscanApiKey),
    ]);

    if (txs.length === 0) {
      return {
        deliverable: `# 🔍 Sybil Analysis Report\n\n**Wallet:** \`${wallet}\`\n**Chain:** ${chain.name}\n\n## Result\n⚠️ No transactions found for this wallet on ${chain.name}. The wallet may be unused, or the address might be incorrect.\n\nIf this wallet is active on a different chain, please specify the correct chain.`,
      };
    }

    // Step 2: Analyze on-chain patterns
    console.log(`[sybil_checker] Analyzing ${txs.length} transactions...`);
    const metrics = analyzeTransactions(txs, wallet);

    // Step 3: Calculate heuristic score
    const heuristic = calculateHeuristicScore(metrics);
    console.log(`[sybil_checker] Heuristic score: ${heuristic.score}/100 | Flags: ${heuristic.flags.length}`);

    // Step 4: AI deep analysis
    console.log(`[sybil_checker] Running AI analysis...`);
    const prompt = buildPrompt(wallet, chain.name, balance, metrics, heuristic);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://virtuals.io",
        "X-Title": "Tweezy Sybil Checker",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are an expert blockchain security analyst specializing in sybil attack detection. You analyze on-chain data to determine if a wallet exhibits sybil-like behavior. Be precise, data-driven, and honest about uncertainties.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { deliverable: `Error from AI analysis (${response.status}): ${errorText}` };
    }

    const data = (await response.json()) as any;
    const analysis = data.choices?.[0]?.message?.content?.trim();

    if (!analysis) {
      return { deliverable: "Error: No analysis generated by AI." };
    }

    console.log(`[sybil_checker] ✅ Analysis complete for ${wallet} (${analysis.length} chars)`);
    return { deliverable: analysis };
  } catch (error: any) {
    console.error(`[sybil_checker] ❌ Error: ${error.message}`);
    return { deliverable: `Error analyzing wallet ${wallet}: ${error.message}` };
  }
}
