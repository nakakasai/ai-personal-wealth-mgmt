"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const API_BASE = "http://localhost:8000";

type CategorySummary = { category: string; amount: number };
type RecentTxn = {
  date: string | null;
  description: string | null;
  amount: number;
  category: string | null;
  source?: string | null;
};
type OverviewResponse = {
  month: string;
  source?: string;
  income: number;
  expense: number;
  net: number;
  categories: CategorySummary[];
  recent_transactions: RecentTxn[];
};
type MerchantSummary = { merchant: string; amount: number; count: number };
type AssetAllocation = {
  category: string;
  value: number;
  percentage: number;
};
type NetWorthSummary = {
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  allocation: AssetAllocation[];
};

type PaytmPortfolio = {
  broker: string;
  currency: "INR";
  base_currency: "JPY";
  holding_count: number;
  total_invested_value: number;
  total_current_value: number;
  total_gain_loss: number;
  total_gain_loss_percentage: number;
  inr_to_jpy_rate: number;
  fx_rate_date: string;
  total_invested_value_jpy: number;
  total_current_value_jpy: number;
  total_gain_loss_jpy: number;
  price_as_of: string;
};

const CATEGORY_COLORS = [
  "#2563EB",
  "#7C3AED",
  "#059669",
  "#DC2626",
  "#EA580C",
  "#0891B2",
  "#9333EA",
  "#4F46E5",
  "#0D9488",
  "#BE123C",
];
const ACCOUNT_OPTIONS = [
  { value: "ALL", label: "All Accounts" },
  { value: "AEON", label: "AEON Card" },
  { value: "AMEX", label: "American Express" },
  { value: "ORICO", label: "Orico Card" },
  { value: "SMBC_TRUST", label: "SMBC Trust Bank" },
  { value: "OTHERS", label: "Others" },
];

function accountLabel(value?: string | null) {
  const found = ACCOUNT_OPTIONS.find((item) => item.value === (value || "ALL"));
  return found?.label || value || "All Accounts";
}

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function compactText(value: string) {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s・･ー－\-—–＿_/／＊*.,()（）]/g, "");
}

function extractMerchant(description?: string | null) {
  if (!description) return "Unknown";
  const original = description.trim();
  const normalized = original.normalize("NFKC").toUpperCase();
  const merchantPart = original.split("/")[0]?.trim() || original;
  const merchantText = merchantPart.normalize("NFKC").toUpperCase();
  const compact = compactText(merchantText);
  const fullCompact = compactText(normalized);
  if (compact.includes("KINGPOWER")) return "King Power Duty Free";
  if (
    compact.includes("シデイエナジ") ||
    compact.includes("シディエナジ") ||
    compact.includes("CDENERGY")
  )
    return "CD Energy";
  if (
    compact.includes("BOOKING") ||
    compact.includes("ブツキング") ||
    compact.includes("ブッキング")
  )
    return "Booking.com";
  if (compact.includes("エエヌエ") || compact.includes("ANA")) return "ANA";
  if (compact.includes("AMAZON")) return "Amazon";
  if (compact.includes("ラクテンモバイル")) return "Rakuten Mobile";
  if (compact.includes("RAKUTEN") || compact.includes("楽天")) return "Rakuten";
  if (compact.includes("GOOGLEPLAY")) return "Google Play";
  if (compact.includes("NETFLIX")) return "Netflix";
  if (
    compact.includes("UBER") ||
    compact.includes("ウバトリツプ") ||
    compact.includes("ウーバートリップ")
  )
    return "Uber";
  if (compact.includes("UNIQLO") || compact.includes("ユニクロ"))
    return "Uniqlo";
  if (compact.includes("SEVENELEVEN") || compact.includes("セブン"))
    return "7-Eleven";
  if (
    compact.includes("FAMILYMART") ||
    compact.includes("フアミリ") ||
    compact.includes("ファミリ")
  )
    return "FamilyMart";
  if (
    compact.includes("LAWSON") ||
    compact.includes("ロソン") ||
    compact.includes("ローソン")
  )
    return "Lawson";
  if (compact.includes("マツモトキヨシ")) return "Matsumoto Kiyoshi";
  if (compact.includes("アンビカ")) return "Ambika Shop";
  if (compact.includes("スポツデポ") || compact.includes("スポーツデポ"))
    return "Sports Depot";
  if (compact.includes("ナリタ") || compact.includes("成田"))
    return "Narita Airport";
  if (compact.includes("マルエツ")) return "Maruetsu";
  if (compact.includes("タイムズ")) return "Times Parking";
  if (compact.includes("モリビル")) return "Mori Building";
  if (compact.includes("TAXI") || compact.includes("タクシ")) return "Taxi";
  if (compact.includes("APPLE") && !fullCompact.includes("APPLEPAY"))
    return "Apple";
  return merchantPart.slice(0, 28);
}

function displayCategory(
  description?: string | null,
  category?: string | null,
) {
  const merchant = extractMerchant(description);
  if (merchant === "Matsumoto Kiyoshi") return "Health";
  if (
    ["Narita Airport", "ANA", "Booking.com", "King Power Duty Free"].includes(
      merchant,
    )
  )
    return "Travel";
  if (["CD Energy", "Rakuten Mobile"].includes(merchant)) return "Utilities";
  if (
    ["7-Eleven", "FamilyMart", "Lawson", "Ambika Shop", "Maruetsu"].includes(
      merchant,
    )
  )
    return "Food";
  if (["Times Parking", "Uber", "Taxi", "Mori Building"].includes(merchant))
    return "Transport";
  return category || "Uncategorized";
}

function splitInsightText(text: string) {
  if (!text) return [];
  return text
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .split(/(?<=\.)\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [wealth, setWealth] = useState<NetWorthSummary | null>(null);
  const [wealthLoading, setWealthLoading] = useState(true);
  const [wealthError, setWealthError] = useState("");
  const [paytmConnected, setPaytmConnected] = useState(false);
  const [paytmPortfolio, setPaytmPortfolio] = useState<PaytmPortfolio | null>(null);
  const [paytmLoading, setPaytmLoading] = useState(false);
  const [paytmMessage, setPaytmMessage] = useState("");
  const [paytmError, setPaytmError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedSource, setSelectedSource] = useState<string>("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [insights, setInsights] = useState<string>("");
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState("");

  const fetchData = async (token: string, month: string, source: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("token", token);
      if (month) params.set("month", month);
      if (source && source !== "ALL") params.set("source", source);
      const res = await fetch(
        `${API_BASE}/dashboard/overview?${params.toString()}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to load dashboard");
      }
      setData((await res.json()) as OverviewResponse);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  const fetchWealthSummary = async (token: string) => {
    setWealthLoading(true);
    setWealthError("");
    try {
      const res = await fetch(`${API_BASE}/net-worth/summary`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to load net worth");
      }
      setWealth((await res.json()) as NetWorthSummary);
    } catch (err: any) {
      setWealthError(err.message || "Failed to load net worth");
    } finally {
      setWealthLoading(false);
    }
  };

  const fetchPaytmPortfolio = async (token: string) => {
    const res = await fetch(`${API_BASE}/equities/paytm/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || "Failed to load Paytm holdings");
    }
    const portfolio = (await res.json()) as PaytmPortfolio;
    setPaytmPortfolio(portfolio);
    return portfolio;
  };

  const fetchPaytmStatus = async (token: string) => {
    const res = await fetch(`${API_BASE}/equities/paytm/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const body = await res.json();
    const connected = Boolean(body.connected);
    setPaytmConnected(connected);
    if (connected) {
      try {
        await fetchPaytmPortfolio(token);
      } catch {
        // Connection status remains useful even if a quote refresh briefly fails.
      }
    }
    return connected;
  };

  const handlePaytmConnect = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }

    setPaytmLoading(true);
    setPaytmError("");
    setPaytmMessage("Opening Paytm Money secure login...");
    try {
      const res = await fetch(`${API_BASE}/equities/paytm/connect`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Could not start Paytm connection");
      }
      const body = await res.json();
      window.open(
        body.login_url,
        "_blank",
        "noopener,noreferrer",
      );

      setPaytmMessage("Complete login and OTP in the Paytm window...");
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        if (await fetchPaytmStatus(token)) {
          setPaytmMessage("Paytm connected. Refreshing portfolio...");
          await handlePaytmSync(token);
          return;
        }
      }
      throw new Error("Paytm login timed out. Please try Connect again.");
    } catch (err: any) {
      setPaytmError(err.message || "Could not connect Paytm Money");
      setPaytmMessage("");
    } finally {
      setPaytmLoading(false);
    }
  };

  const handlePaytmSync = async (providedToken?: string) => {
    const token = providedToken || localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }

    setPaytmLoading(true);
    setPaytmError("");
    setPaytmMessage("Updating prices and converting INR to JPY...");
    try {
      const res = await fetch(`${API_BASE}/equities/paytm/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to synchronize Paytm portfolio");
      }
      const portfolio = (await res.json()) as PaytmPortfolio;
      setPaytmPortfolio(portfolio);
      setPaytmConnected(true);
      setPaytmMessage(
        `Updated ${portfolio.holding_count} holdings using ECB FX rate dated ${portfolio.fx_rate_date}.`,
      );
      await fetchWealthSummary(token);
    } catch (err: any) {
      setPaytmError(err.message || "Failed to synchronize Paytm portfolio");
      setPaytmMessage("");
    } finally {
      setPaytmLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }
    fetchData(token, selectedMonth, selectedSource);
    fetchWealthSummary(token);
    fetchPaytmStatus(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, selectedMonth, selectedSource, searchQuery]);

  const handleMonthChange = async (value: string) => {
    setSelectedMonth(value);
    setInsights("");
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }
    await fetchData(token, value, selectedSource);
  };

  const handleAllClick = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }
    setSelectedMonth("ALL");
    setInsights("");
    await fetchData(token, "ALL", selectedSource);
  };

  const handleSourceChange = async (value: string) => {
    setSelectedSource(value);
    setSelectedCategory(null);
    setSearchQuery("");
    setInsights("");
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }
    await fetchData(token, selectedMonth, value);
  };

  const handleGenerateInsights = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }
    setInsightsLoading(true);
    setInsightsError("");
    setInsights("");
    try {
      const res = await fetch(
        `${API_BASE}/dashboard/insights?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            month: selectedMonth || null,
            source: selectedSource,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to generate insights");
      }
      const json = await res.json();
      setInsights(json.insights || "");
    } catch (err: any) {
      setInsightsError(err.message || "Failed to generate insights");
    } finally {
      setInsightsLoading(false);
    }
  };

  const dashboard = useMemo(() => {
    if (!data) return null;
    const expenseTxns = data.recent_transactions.filter(
      (txn) => txn.amount < 0,
    );
    const categoryMap = new Map<string, number>();
    for (const txn of expenseTxns) {
      const cat = displayCategory(txn.description, txn.category);
      categoryMap.set(
        cat,
        (categoryMap.get(cat) || 0) + Math.abs(txn.amount || 0),
      );
    }
    const categoryRows = Array.from(categoryMap.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: data.expense > 0 ? (amount / data.expense) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
    const categoryChartData = categoryRows.map((c) => ({
      name: c.category,
      value: c.amount,
    }));
    const merchantMap = new Map<string, MerchantSummary>();
    for (const txn of expenseTxns) {
      const merchant = extractMerchant(txn.description);
      const existing = merchantMap.get(merchant) || {
        merchant,
        amount: 0,
        count: 0,
      };
      existing.amount += Math.abs(txn.amount || 0);
      existing.count += 1;
      merchantMap.set(merchant, existing);
    }
    const topMerchants = Array.from(merchantMap.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
    const savingsRate = data.income > 0 ? (data.net / data.income) * 100 : 0;
    const spendRatio =
      data.income > 0 ? Math.min((data.expense / data.income) * 100, 100) : 0;
    const effectiveSelectedCategory =
      selectedCategory || categoryRows[0]?.category || null;
    const categoryFilteredTxns =
      effectiveSelectedCategory == null
        ? expenseTxns
        : expenseTxns.filter(
          (txn) =>
            displayCategory(txn.description, txn.category) ===
            effectiveSelectedCategory,
        );
    const query = searchQuery.trim().toLowerCase();
    const filteredTxns = query
      ? categoryFilteredTxns.filter((txn) => {
        const merchant = extractMerchant(txn.description).toLowerCase();
        const description = (txn.description || "").toLowerCase();
        const category = displayCategory(
          txn.description,
          txn.category,
        ).toLowerCase();
        return (
          merchant.includes(query) ||
          description.includes(query) ||
          category.includes(query)
        );
      })
      : categoryFilteredTxns;
    return {
      categoryChartData,
      categoryRows,
      topMerchants,
      savingsRate,
      spendRatio,
      effectiveSelectedCategory,
      filteredTxns,
      expenseTxns,
      largestCategory: categoryRows[0],
    };
  }, [data, selectedCategory, searchQuery]);

  useEffect(() => {
    if (!dashboard || !selectedCategory) return;
    const stillExists = dashboard.categoryRows.some(
      (c) => c.category === selectedCategory,
    );
    if (!stillExists)
      setSelectedCategory(dashboard.categoryRows[0]?.category || null);
  }, [dashboard, selectedCategory]);

  if (loading && !data && !error)
    return (
      <Shell>
        <CenterCard>Loading your dashboard...</CenterCard>
      </Shell>
    );
  if (error)
    return (
      <Shell>
        <div className="errorCard">
          <h1>Something went wrong</h1>
          <p>{error}</p>
          <button onClick={() => router.refresh()} className="primaryBtn">
            Retry
          </button>
        </div>
      </Shell>
    );
  if (!data || !dashboard) return null;

  const insightLines = splitInsightText(insights);
  const ITEMS_PER_PAGE = 10;
  const totalItems = dashboard.filteredTxns.length;
  const totalPages =
    totalItems === 0 ? 1 : Math.ceil(totalItems / ITEMS_PER_PAGE);
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentPageTxns = dashboard.filteredTxns.slice(startIndex, endIndex);

  return (
    <Shell>
      <div className="dashboardWrap">
        <header className="heroCard">
          <div className="heroContent">
            <div className="brandBlock">
              <div className="brandIcon">AI</div>
              <div>
                <h1>AI Finance Manager</h1>
                <p>
                  Your complete financial position, asset allocation, and
                  monthly expense intelligence in one place.
                </p>
              </div>
            </div>
            <div className="heroActions">
              <label className="monthPill">
                <span>Month</span>
                <input
                  type="month"
                  value={
                    selectedMonth && selectedMonth !== "ALL"
                      ? selectedMonth
                      : ""
                  }
                  onChange={(e) => handleMonthChange(e.target.value)}
                />
              </label>
              <label className="accountPill">
                <span>Account</span>
                <select
                  value={selectedSource}
                  onChange={(e) => handleSourceChange(e.target.value)}
                >
                  {ACCOUNT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={handleAllClick} className="ghostBtn">
                All time
              </button>
              <button
                onClick={() => router.push("/upload")}
                className="lightBtn"
              >
                Upload Statement
              </button>

              <button
                onClick={() => router.push("/net-worth")}
                className="wealthBtn"
              >
                Net Worth
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem("token");
                  router.replace("/login");
                }}
                className="logoutBtn"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <section className="kpiGrid">
          <KpiCard
            title="Net Worth"
            value={wealthLoading ? "Loading..." : wealth ? `¥ ${formatCurrency(wealth.net_worth)}` : "Unavailable"}
            helper={wealthError || "Assets minus liabilities"}
            tone="blue"
          />
          <KpiCard
            title="Total Assets"
            value={wealthLoading ? "Loading..." : wealth ? `¥ ${formatCurrency(wealth.total_assets)}` : "Unavailable"}
            helper={wealth ? `${wealth.allocation.length} asset categories` : "Add assets in Net Worth"}
            tone="emerald"
          />
          <KpiCard
            title="Total Liabilities"
            value={wealthLoading ? "Loading..." : wealth ? `¥ ${formatCurrency(wealth.total_liabilities)}` : "Unavailable"}
            helper="Loans and outstanding balances"
            tone="amber"
          />
          <KpiCard
            title="Monthly Expenses"
            value={`₹ ${formatCurrency(data.expense)}`}
            helper={`${data.month} · ${dashboard.expenseTxns.length} transactions`}
            tone="rose"
          />
        </section>

        <section className="brokerCard">
          <div className="brokerIdentity">
            <div className="brokerLogo">₹</div>
            <div>
              <div className="brokerTitleRow">
                <h2>Indian Equity · Paytm Money</h2>
                <span className={paytmConnected ? "statusBadge connected" : "statusBadge"}>
                  {paytmConnected ? "Connected" : "Not connected"}
                </span>
              </div>
              <p>
                Official broker holdings, current market value, and automatic
                INR-to-JPY conversion for Net Worth.
              </p>
            </div>
          </div>

          {paytmPortfolio ? (
            <div className="brokerMetrics">
              <div>
                <span>Invested</span>
                <strong>₹ {formatCurrency(paytmPortfolio.total_invested_value)}</strong>
              </div>
              <div>
                <span>Current value</span>
                <strong>₹ {formatCurrency(paytmPortfolio.total_current_value)}</strong>
              </div>
              <div>
                <span>Gain / loss</span>
                <strong className={paytmPortfolio.total_gain_loss >= 0 ? "positive" : "negative"}>
                  ₹ {formatCurrency(paytmPortfolio.total_gain_loss)}
                  {" · "}
                  {formatCurrency(paytmPortfolio.total_gain_loss_percentage)}%
                </strong>
              </div>
              <div>
                <span>Net Worth value</span>
                <strong>¥ {formatCurrency(paytmPortfolio.total_current_value_jpy)}</strong>
                <small>
                  1 INR = {paytmPortfolio.inr_to_jpy_rate} JPY · ECB {paytmPortfolio.fx_rate_date}
                </small>
              </div>
            </div>
          ) : (
            <p className="brokerEmpty">
              Connect your Paytm Money account to retrieve your six equity holdings.
            </p>
          )}

          <div className="brokerActions">
            <button
              className="outlineBtn"
              onClick={handlePaytmConnect}
              disabled={paytmLoading}
            >
              {paytmConnected ? "Reconnect Paytm" : "Connect Paytm Money"}
            </button>
            <button
              className="darkBtn"
              onClick={() => handlePaytmSync()}
              disabled={!paytmConnected || paytmLoading}
            >
              {paytmLoading ? "Working..." : "Refresh Portfolio"}
            </button>
          </div>

          {(paytmMessage || paytmError) && (
            <p className={paytmError ? "brokerNotice error" : "brokerNotice"}>
              {paytmError || paytmMessage}
            </p>
          )}
        </section>

        <section className="mainGrid">
          <Panel
            className="span12"
            title="Asset Allocation"
            subtitle="How your total assets are distributed across equity, real estate, cash, funds, and other categories."
            action={
              <button onClick={() => router.push("/net-worth")} className="darkBtn">
                Manage Assets
              </button>
            }
          >
            <div className="categoryLayout">
              <div className="chartBox">
                {wealth && wealth.allocation.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={wealth.allocation}
                        dataKey="value"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        outerRadius={104}
                        innerRadius={66}
                        paddingAngle={3}
                      >
                        {wealth.allocation.map((entry, index) => (
                          <Cell
                            key={entry.category}
                            fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: any) =>
                          `¥ ${formatCurrency(Number(value))}`
                        }
                        contentStyle={{
                          backgroundColor: "#FFFFFF",
                          border: "1px solid #E2E8F0",
                          borderRadius: "14px",
                          fontSize: "12px",
                          boxShadow: "0 12px 28px rgba(15,23,42,0.10)",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="emptyState">
                    {wealthLoading ? "Loading asset allocation..." : "Add assets to see your allocation"}
                  </div>
                )}
              </div>
              <div className="categoryList">
                {(wealth?.allocation || []).map((asset, index) => (
                  <div key={asset.category} className="categoryRow">
                    <div className="categoryTop">
                      <span
                        className="dot"
                        style={{
                          backgroundColor:
                            CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                        }}
                      />
                      <span className="catName">{asset.category}</span>
                      <span className="catPct">{asset.percentage.toFixed(1)}%</span>
                      <span className="catAmount">
                        ¥ {formatCurrency(asset.value)}
                      </span>
                    </div>
                    <div className="bar">
                      <div
                        style={{
                          width: `${Math.min(asset.percentage, 100)}%`,
                          backgroundColor:
                            CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </section>

        <section className="mainGrid">
          <Panel
            className="span7"
            title="Spend by Category"
            subtitle="Cleaned category view based on merchant intelligence."
            action={
              <div className="panelStat">
                <span>Total expense</span>
                <strong>₹ {formatCurrency(data.expense)}</strong>
              </div>
            }
          >
            <div className="categoryLayout">
              <div className="chartBox">
                {dashboard.categoryChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dashboard.categoryChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={104}
                        innerRadius={66}
                        paddingAngle={3}
                      >
                        {dashboard.categoryChartData.map((entry, index) => (
                          <Cell
                            key={`cell-${entry.name}`}
                            fill={
                              CATEGORY_COLORS[index % CATEGORY_COLORS.length]
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: any) =>
                          `₹ ${formatCurrency(Number(value))}`
                        }
                        contentStyle={{
                          backgroundColor: "#FFFFFF",
                          border: "1px solid #E2E8F0",
                          borderRadius: "14px",
                          fontSize: "12px",
                          boxShadow: "0 12px 28px rgba(15,23,42,0.10)",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="emptyState">No expense data yet</div>
                )}
              </div>
              <div className="categoryList">
                {dashboard.categoryRows.slice(0, 7).map((cat, index) => (
                  <button
                    key={cat.category}
                    onClick={() => setSelectedCategory(cat.category)}
                    className={`categoryRow ${dashboard.effectiveSelectedCategory === cat.category ? "active" : ""}`}
                  >
                    <div className="categoryTop">
                      <span
                        className="dot"
                        style={{
                          backgroundColor:
                            CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                        }}
                      />
                      <span className="catName">{cat.category}</span>
                      <span className="catPct">
                        {cat.percentage.toFixed(0)}%
                      </span>
                      <span className="catAmount">
                        ₹ {formatCurrency(cat.amount)}
                      </span>
                    </div>
                    <div className="bar">
                      <div
                        style={{
                          width: `${Math.min(cat.percentage, 100)}%`,
                          backgroundColor:
                            CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                        }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          <Panel
            className="span5"
            title="AI Insights"
            subtitle="Action-oriented summary from current data."
            action={
              <button
                onClick={handleGenerateInsights}
                disabled={insightsLoading}
                className="darkBtn"
              >
                {insightsLoading ? "Analyzing..." : "Generate"}
              </button>
            }
          >
            {insightsError && <p className="errorText">{insightsError}</p>}
            <div className="insightStack">
              {(insightLines.length > 0
                ? insightLines
                : [
                  dashboard.largestCategory
                    ? `${dashboard.largestCategory.category} is the biggest spending driver at ${dashboard.largestCategory.percentage.toFixed(0)}% of total expenses.`
                    : "Upload CSV to see category insights.",
                  data.income === 0
                    ? "Income is not connected yet, so savings and savings rate are temporary."
                    : `Savings rate is ${dashboard.savingsRate.toFixed(1)}% for this period.`,
                  "Start with top merchants and large one-time transactions for fastest savings opportunities.",
                ]
              ).map((line, index) => (
                <InsightCard key={index} index={index + 1} text={line} />
              ))}
            </div>
          </Panel>
        </section>

        <section className="mainGrid">
          <Panel
            className="span7"
            title="Top Merchants"
            subtitle="Normalized merchant names from raw card-statement descriptions."
          >
            <div className="merchantGrid">
              {dashboard.topMerchants.length === 0 ? (
                <p className="muted">No merchant data yet.</p>
              ) : (
                dashboard.topMerchants.map((merchant, index) => (
                  <div key={merchant.merchant} className="merchantCard">
                    <div className="rank">{index + 1}</div>
                    <div className="merchantMain">
                      <p>{merchant.merchant}</p>
                      <span>
                        {merchant.count}{" "}
                        {merchant.count === 1 ? "transaction" : "transactions"}
                      </span>
                    </div>
                    <strong>₹ {formatCurrency(merchant.amount)}</strong>
                  </div>
                ))
              )}
            </div>
          </Panel>
          <Panel
            className="span5"
            title="Cashflow Snapshot"
            subtitle="Temporary view until backend monthly aggregation is added."
            action={
              <span className="smallPill">
                {data.month} · {accountLabel(selectedSource)}
              </span>
            }
          >
            <div className="cashflowStack">
              <CashflowMetricCard
                label="Income"
                value={`₹ ${formatCurrency(data.income)}`}
                helper={data.income === 0 ? "Not connected yet" : data.month}
                tone="emerald"
              />
              <CashflowMetricCard
                label="Expense"
                value={`₹ ${formatCurrency(data.expense)}`}
                helper={`${dashboard.expenseTxns.length} expense transactions`}
                tone="rose"
              />
              <CashflowMetricCard
                label="Spend vs Income"
                value={`${dashboard.spendRatio.toFixed(1)}%`}
                helper={
                  data.income === 0
                    ? "Waiting for income data"
                    : "Expense / income"
                }
                tone="blue"
              />
            </div>
          </Panel>
        </section>

        <section className="tablePanel">
          <div className="tableHeader">
            <div>
              <h2>
                {dashboard.effectiveSelectedCategory
                  ? `${dashboard.effectiveSelectedCategory} Transactions`
                  : "Transactions"}
              </h2>
              <p>Merchant, category, raw description, and amount.</p>
            </div>
            <div className="tableActions">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search merchant, category, or description"
              />
              {dashboard.effectiveSelectedCategory && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className="outlineBtn"
                >
                  Show all expenses
                </button>
              )}
            </div>
          </div>
          {totalItems === 0 ? (
            <p className="emptyTable">
              No transactions found for this selection.
            </p>
          ) : (
            <>
              <div className="tableScroller">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Account</th>
                      <th>Merchant</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th className="right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentPageTxns.map((txn, index) => (
                      <tr key={`${txn.date}-${txn.description}-${index}`}>
                        <td>{txn.date || "-"}</td>
                        <td>
                          <span className="tag">
                            {accountLabel(txn.source)}
                          </span>
                        </td>
                        <td className="strong">
                          {extractMerchant(txn.description)}
                        </td>
                        <td>
                          <span className="tag">
                            {displayCategory(txn.description, txn.category)}
                          </span>
                        </td>
                        <td className="truncate">{txn.description || "-"}</td>
                        <td className="amount">
                          -₹ {formatCurrency(Math.abs(txn.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pagination">
                <span>
                  Showing <strong>{startIndex + 1}</strong> –{" "}
                  <strong>{Math.min(endIndex, totalItems)}</strong> of{" "}
                  <strong>{totalItems}</strong> transactions
                </span>
                <div>
                  <button
                    type="button"
                    disabled={safePage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <span>
                    Page <strong>{safePage}</strong> of{" "}
                    <strong>{totalPages}</strong>
                  </span>
                  <button
                    type="button"
                    disabled={safePage === totalPages || totalItems === 0}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="afmRoot">
      <DashboardStyles />
      {children}
    </main>
  );
}

function CenterCard({ children }: { children: ReactNode }) {
  return <div className="centerCard">{children}</div>;
}

function Panel({
  title,
  subtitle,
  action,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`panel ${className}`}>
      <div className="panelHeader">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function KpiCard({
  title,
  value,
  helper,
  tone,
}: {
  title: string;
  value: string;
  helper: string;
  tone: "emerald" | "rose" | "blue" | "amber" | "violet";
}) {
  return (
    <div className="kpiCard">
      <div className={`kpiStripe ${tone}`} />
      <div className="kpiBody">
        <p>{title}</p>
        <strong>{value}</strong>
        <span>{helper}</span>
      </div>
    </div>
  );
}

function InsightCard({ index, text }: { index: number; text: string }) {
  return (
    <div className="insightCard">
      <div>
        <span>{index}</span>
        <b>Insight</b>
      </div>
      <p>{text}</p>
    </div>
  );
}

function CashflowMetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: "emerald" | "rose" | "blue";
}) {
  return (
    <div className={`cashCard ${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{helper}</span>
    </div>
  );
}

function DashboardStyles() {
  return (
    <style jsx global>{`
      .afmRoot,
      .afmRoot * {
        box-sizing: border-box;
      }
        
      .wealthBtn {
        height: 38px;
        border-radius: 999px;
        padding: 0 16px;
        background: linear-gradient(90deg, #2563eb, #4f46e5);
        color: #ffffff;
        font-size: 12px;
        font-weight: 800;
        border: 1px solid rgba(255, 255, 255, 0.16);
        box-shadow: 0 8px 20px rgba(37, 99, 235, 0.28);
        transition:
          transform 0.15s ease,
          box-shadow 0.15s ease,
          opacity 0.15s ease;
      }

      .wealthBtn:hover {
        transform: translateY(-1px);
        box-shadow: 0 10px 24px rgba(37, 99, 235, 0.36);
      }

      .wealthBtn:active {
        transform: translateY(0);
      }
      .afmRoot {
        min-height: 100vh;
        background: #f5f7fb;
        color: #0f172a;
        font-family:
          Inter,
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
      }
      .dashboardWrap {
        width: 100%;
        max-width: 1600px;
        min-width: 1180px;
        margin: 0 auto;
        padding: 32px 40px;
      }
      .heroCard,
      .panel,
      .kpiCard,
      .tablePanel,
      .centerCard,
      .errorCard {
        background: #fff;
        border: 1px solid #e2e8f0;
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.06);
      }
      .heroCard {
        border-radius: 28px;
        overflow: hidden;
        margin-bottom: 24px;
      }
      .heroContent {
        background: linear-gradient(90deg, #020617, #0f172a 55%, #172554);
        padding: 24px 28px;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
      }
      .brandBlock {
        display: flex;
        align-items: center;
        gap: 16px;
        min-width: 0;
      }
      .brandIcon {
        width: 48px;
        height: 48px;
        flex: 0 0 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.15);
        font-weight: 800;
      }
      .brandBlock h1 {
        margin: 0;
        font-size: 26px;
        line-height: 1.2;
        font-weight: 750;
        letter-spacing: -0.02em;
      }
      .brandBlock p {
        margin: 6px 0 0;
        color: #cbd5e1;
        font-size: 14px;
        line-height: 1.45;
      }
      .heroActions {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
      }
      button,
      input,
      select {
        font: inherit;
      }
      button {
        cursor: pointer;
        border: 0;
      }
      .monthPill,
      .accountPill {
        height: 38px;
        display: flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 0 12px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.15);
      }
      .monthPill span,
      .accountPill span {
        font-size: 12px;
        font-weight: 600;
        color: #cbd5e1;
      }
      .monthPill input {
        width: 135px;
        border: 0;
        outline: 0;
        background: transparent;
        color: #fff;
        font-size: 12px;
        color-scheme: dark;
      }
      .accountPill select {
        width: 150px;
        border: 0;
        outline: 0;
        background: transparent;
        color: #fff;
        font-size: 12px;
        font-weight: 750;
        color-scheme: dark;
      }
      .accountPill option {
        color: #0f172a;
        background: #fff;
      }
      .ghostBtn,
      .logoutBtn {
        height: 38px;
        border-radius: 999px;
        padding: 0 16px;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        border: 1px solid rgba(255, 255, 255, 0.15);
      }
      .logoutBtn {
        background: transparent;
        border: 0;
        color: #cbd5e1;
      }
      .lightBtn {
        height: 38px;
        border-radius: 999px;
        padding: 0 16px;
        background: #fff;
        color: #0f172a;
        font-size: 12px;
        font-weight: 800;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
      }
      .kpiGrid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 20px;
        margin-bottom: 24px;
      }
      .kpiCard {
        border-radius: 24px;
        overflow: hidden;
      }
      .kpiStripe {
        height: 6px;
      }
      .kpiStripe.emerald {
        background: linear-gradient(90deg, #10b981, #14b8a6);
      }
      .kpiStripe.rose {
        background: linear-gradient(90deg, #f43f5e, #ef4444);
      }
      .kpiStripe.blue {
        background: linear-gradient(90deg, #3b82f6, #6366f1);
      }
      .kpiStripe.amber {
        background: linear-gradient(90deg, #f59e0b, #f97316);
      }
      .kpiStripe.violet {
        background: linear-gradient(90deg, #8b5cf6, #d946ef);
      }
      .kpiBody {
        padding: 20px;
        min-height: 132px;
      }
      .kpiBody p {
        margin: 0;
        color: #64748b;
        font-size: 12px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .kpiBody strong {
        display: block;
        margin-top: 10px;
        font-size: 25px;
        line-height: 1.15;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: #0f172a;
        white-space: nowrap;
      }
      .kpiBody span {
        display: block;
        margin-top: 12px;
        color: #64748b;
        font-size: 14px;
        line-height: 1.35;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .mainGrid {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 24px;
        margin-bottom: 24px;
      }
      .span12 {
        grid-column: span 12;
      }
      .span7 {
        grid-column: span 7;
      }
      .span5 {
        grid-column: span 5;
      }
      .panel {
        border-radius: 28px;
        padding: 24px;
        min-width: 0;
        overflow: hidden;
      }
      .panelHeader {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 20px;
      }
      .panelHeader h2,
      .tableHeader h2 {
        margin: 0;
        color: #0f172a;
        font-size: 18px;
        line-height: 1.25;
        font-weight: 800;
        letter-spacing: -0.015em;
      }
      .panelHeader p,
      .tableHeader p {
        margin: 6px 0 0;
        color: #64748b;
        font-size: 14px;
        line-height: 1.45;
      }
      .panelStat {
        text-align: right;
        color: #64748b;
        font-size: 12px;
        white-space: nowrap;
      }
      .panelStat strong {
        display: block;
        margin-top: 4px;
        color: #0f172a;
        font-size: 16px;
        font-weight: 800;
      }
      .categoryLayout {
        display: grid;
        grid-template-columns: 42% 1fr;
        gap: 26px;
        align-items: center;
      }
      .chartBox {
        height: 292px;
        min-width: 0;
      }
      .emptyState {
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #94a3b8;
        font-size: 14px;
      }
      .categoryList {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 0;
      }
      .categoryRow {
        width: 100%;
        display: block;
        text-align: left;
        border-radius: 16px;
        border: 1px solid #e2e8f0;
        background: #fff;
        padding: 12px 14px;
        transition: 0.16s ease;
      }
      .categoryRow:hover {
        background: #f8fafc;
        border-color: #cbd5e1;
      }
      .categoryRow.active {
        background: #eff6ff;
        border-color: #bfdbfe;
        box-shadow: 0 8px 20px rgba(37, 99, 235, 0.08);
      }
      .categoryTop {
        display: grid;
        grid-template-columns: 12px minmax(0, 1fr) 44px 116px;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
      }
      .dot {
        width: 12px;
        height: 12px;
        border-radius: 999px;
      }
      .catName {
        font-size: 14px;
        font-weight: 750;
        color: #0f172a;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .catPct {
        text-align: right;
        font-size: 14px;
        font-weight: 800;
        color: #0f172a;
      }
      .catAmount {
        text-align: right;
        font-size: 12px;
        font-weight: 700;
        color: #64748b;
        white-space: nowrap;
      }
      .bar {
        height: 8px;
        border-radius: 999px;
        overflow: hidden;
        background: #f1f5f9;
      }
      .bar div {
        height: 100%;
        border-radius: 999px;
      }
      .darkBtn {
        height: 36px;
        border-radius: 999px;
        padding: 0 16px;
        background: #0f172a;
        color: #fff;
        font-size: 12px;
        font-weight: 800;
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.14);
      }
      .errorText {
        margin: 0 0 12px;
        border-radius: 12px;
        background: #fff1f2;
        color: #e11d48;
        padding: 10px 12px;
        font-size: 12px;
      }
      .insightStack,
      .cashflowStack {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .insightCard {
        border-radius: 16px;
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        padding: 16px;
      }
      .insightCard div {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
      }
      .insightCard span {
        width: 24px;
        height: 24px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #0f172a;
        color: #fff;
        font-size: 11px;
        font-weight: 900;
      }
      .insightCard b {
        color: #64748b;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .insightCard p {
        margin: 0;
        color: #334155;
        font-size: 14px;
        line-height: 1.55;
      }
      .merchantGrid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .merchantCard {
        display: flex;
        align-items: center;
        gap: 14px;
        border-radius: 18px;
        border: 1px solid #e2e8f0;
        background: #fff;
        padding: 14px;
        min-width: 0;
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.04);
      }
      .rank {
        width: 36px;
        height: 36px;
        flex: 0 0 36px;
        border-radius: 999px;
        background: #0f172a;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 900;
      }
      .merchantMain {
        flex: 1;
        min-width: 0;
      }
      .merchantMain p {
        margin: 0;
        color: #0f172a;
        font-size: 14px;
        font-weight: 800;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .merchantMain span {
        display: block;
        margin-top: 3px;
        color: #64748b;
        font-size: 12px;
      }
      .merchantCard strong {
        color: #0f172a;
        font-size: 14px;
        font-weight: 900;
        white-space: nowrap;
      }
      .smallPill {
        border-radius: 999px;
        background: #f1f5f9;
        color: #475569;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 800;
      }
      .cashCard {
        border-radius: 18px;
        border: 1px solid;
        padding: 16px 18px;
      }
      .cashCard.emerald {
        background: #ecfdf5;
        border-color: #a7f3d0;
        color: #065f46;
      }
      .cashCard.rose {
        background: #fff1f2;
        border-color: #fecdd3;
        color: #9f1239;
      }
      .cashCard.blue {
        background: #eff6ff;
        border-color: #bfdbfe;
        color: #1e40af;
      }
      .cashCard p {
        margin: 0;
        opacity: 0.78;
        font-size: 12px;
        font-weight: 850;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .cashCard strong {
        display: block;
        margin-top: 6px;
        font-size: 22px;
        line-height: 1.2;
        font-weight: 900;
      }
      .cashCard span {
        display: block;
        margin-top: 4px;
        opacity: 0.76;
        font-size: 14px;
      }
      .tablePanel {
        border-radius: 28px;
        overflow: hidden;
        margin-bottom: 40px;
      }
      .tableHeader {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 20px;
        padding: 22px 24px;
        border-bottom: 1px solid #e2e8f0;
      }
      .tableActions {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
      }
      .tableActions input {
        width: 420px;
        border-radius: 999px;
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        padding: 11px 18px;
        outline: none;
        color: #1e293b;
        font-size: 14px;
      }
      .tableActions input:focus {
        border-color: #93c5fd;
        background: #fff;
        box-shadow: 0 0 0 4px #dbeafe;
      }
      .outlineBtn {
        height: 42px;
        border-radius: 999px;
        background: #fff;
        border: 1px solid #e2e8f0;
        color: #334155;
        padding: 0 16px;
        font-size: 14px;
        font-weight: 750;
      }
      .tableScroller {
        overflow-x: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      thead {
        background: #f8fafc;
        color: #64748b;
      }
      th {
        padding: 14px 20px;
        text-align: left;
        font-size: 12px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        white-space: nowrap;
      }
      td {
        padding: 14px 20px;
        border-top: 1px solid #f1f5f9;
        color: #475569;
        vertical-align: middle;
      }
      tbody tr:hover {
        background: rgba(239, 246, 255, 0.65);
      }
      .strong {
        color: #0f172a;
        font-weight: 850;
      }
      .tag {
        display: inline-flex;
        border-radius: 999px;
        background: #f1f5f9;
        color: #334155;
        padding: 5px 10px;
        font-size: 12px;
        font-weight: 750;
      }
      .truncate {
        max-width: 540px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .right,
      .amount {
        text-align: right;
      }
      .amount {
        color: #e11d48;
        font-weight: 900;
        white-space: nowrap;
      }
      .emptyTable {
        margin: 0;
        padding: 32px 24px;
        color: #64748b;
        font-size: 14px;
      }
      .pagination {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 16px 24px;
        border-top: 1px solid #e2e8f0;
        color: #64748b;
        font-size: 14px;
      }
      .pagination strong {
        color: #1e293b;
      }
      .pagination div {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .pagination button {
        border-radius: 999px;
        border: 1px solid #e2e8f0;
        background: #fff;
        color: #334155;
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 800;
      }
      .pagination button:disabled {
        color: #cbd5e1;
        cursor: not-allowed;
      }
      .centerCard {
        border-radius: 18px;
        padding: 18px 24px;
        color: #475569;
        font-size: 14px;
      }
      .afmRoot:has(.centerCard),
      .afmRoot:has(.errorCard) {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .errorCard {
        max-width: 430px;
        width: 100%;
        border-radius: 22px;
        padding: 24px;
      }
      .errorCard h1 {
        margin: 0 0 8px;
        color: #e11d48;
        font-size: 20px;
      }
      .errorCard p {
        color: #334155;
        font-size: 14px;
      }
      .primaryBtn {
        border-radius: 10px;
        background: #2563eb;
        color: #fff;
        padding: 10px 16px;
        font-weight: 800;
      }
      .brokerCard {
        display: grid;
        grid-template-columns: minmax(280px, 1.15fr) minmax(520px, 1.85fr) auto;
        align-items: center;
        gap: 24px;
        margin-bottom: 22px;
        padding: 22px 24px;
        border: 1px solid #dbeafe;
        border-radius: 24px;
        background: linear-gradient(135deg, #ffffff 0%, #eff6ff 100%);
        box-shadow: 0 14px 35px rgba(30, 64, 175, 0.08);
      }
      .brokerIdentity {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .brokerLogo {
        display: grid;
        place-items: center;
        width: 50px;
        height: 50px;
        flex: 0 0 50px;
        border-radius: 16px;
        background: linear-gradient(135deg, #0ea5e9, #1d4ed8);
        color: white;
        font-size: 24px;
        font-weight: 900;
      }
      .brokerTitleRow {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
      }
      .brokerTitleRow h2 {
        margin: 0;
        color: #0f172a;
        font-size: 18px;
        font-weight: 900;
      }
      .brokerIdentity p,
      .brokerEmpty {
        margin: 5px 0 0;
        color: #64748b;
        font-size: 13px;
        line-height: 1.45;
      }
      .statusBadge {
        border-radius: 999px;
        background: #f1f5f9;
        color: #64748b;
        padding: 4px 9px;
        font-size: 11px;
        font-weight: 850;
      }
      .statusBadge.connected {
        background: #dcfce7;
        color: #15803d;
      }
      .brokerMetrics {
        display: grid;
        grid-template-columns: repeat(4, minmax(125px, 1fr));
        gap: 12px;
      }
      .brokerMetrics div {
        min-width: 0;
        padding: 12px 14px;
        border: 1px solid rgba(191, 219, 254, 0.85);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.8);
      }
      .brokerMetrics span,
      .brokerMetrics small {
        display: block;
        color: #64748b;
        font-size: 11px;
        font-weight: 750;
      }
      .brokerMetrics strong {
        display: block;
        margin-top: 5px;
        color: #0f172a;
        font-size: 15px;
        font-weight: 900;
        white-space: nowrap;
      }
      .brokerMetrics strong.positive {
        color: #047857;
      }
      .brokerMetrics strong.negative {
        color: #be123c;
      }
      .brokerMetrics small {
        margin-top: 4px;
        white-space: nowrap;
      }
      .brokerActions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
      }
      .brokerActions button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }
      .brokerNotice {
        grid-column: 1 / -1;
        margin: -8px 0 0;
        color: #1d4ed8;
        font-size: 13px;
        font-weight: 750;
      }
      .brokerNotice.error {
        color: #be123c;
      }
      @media (max-width: 1250px) {
        .dashboardWrap {
          min-width: 0;
          padding: 24px;
        }
        .heroContent,
        .tableHeader {
          flex-direction: column;
          align-items: stretch;
        }
        .heroActions {
          flex-wrap: wrap;
        }
        .brokerCard {
          grid-template-columns: 1fr;
        }
        .brokerMetrics {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .brokerActions {
          justify-content: flex-start;
        }
        .kpiGrid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .span7,
        .span5 {
          grid-column: span 12;
        }
        .categoryLayout {
          grid-template-columns: 1fr;
        }
        .merchantGrid {
          grid-template-columns: 1fr;
        }
        .tableActions {
          flex-wrap: wrap;
        }
        .tableActions input {
          width: min(100%, 420px);
        }
      }
      @media print {
        .afmRoot {
          background: #f5f7fb !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .dashboardWrap {
          min-width: 1180px;
          padding: 24px;
        }
        .heroCard,
        .panel,
        .kpiCard,
        .tablePanel {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      }
    `}</style>
  );
}
