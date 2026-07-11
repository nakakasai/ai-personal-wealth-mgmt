"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const API_BASE = "http://localhost:8000";

type CategorySummary = {
  category: string;
  amount: number;
};

type RecentTxn = {
  date: string | null;
  description: string | null;
  amount: number;
  category: string | null;
};

type OverviewResponse = {
  month: string;
  income: number;
  expense: number;
  net: number;
  categories: CategorySummary[];
  recent_transactions: RecentTxn[];
};

type MerchantSummary = {
  merchant: string;
  amount: number;
  count: number;
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

function displayCategory(description?: string | null, category?: string | null) {
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [insights, setInsights] = useState<string>("");
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState("");

  const fetchData = async (token: string, month: string) => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      params.set("token", token);
      if (month) params.set("month", month);

      const res = await fetch(`${API_BASE}/dashboard/overview?${params.toString()}`);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to load dashboard");
      }

      const json = (await res.json()) as OverviewResponse;
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }
    fetchData(token, selectedMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, selectedMonth, searchQuery]);

  const handleMonthChange = async (value: string) => {
    setSelectedMonth(value);
    setInsights("");
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }
    await fetchData(token, value);
  };

  const handleAllClick = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }
    setSelectedMonth("ALL");
    setInsights("");
    await fetchData(token, "ALL");
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
          body: JSON.stringify({ month: selectedMonth || null }),
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

    const expenseTxns = data.recent_transactions.filter((txn) => txn.amount < 0);

    const categoryMap = new Map<string, number>();
    for (const txn of expenseTxns) {
      const cat = displayCategory(txn.description, txn.category);
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + Math.abs(txn.amount || 0));
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
          const category = displayCategory(txn.description, txn.category).toLowerCase();
          return (
            merchant.includes(query) ||
            description.includes(query) ||
            category.includes(query)
          );
        })
      : categoryFilteredTxns;

    const largestCategory = categoryRows[0];

    return {
      categoryChartData,
      categoryRows,
      topMerchants,
      savingsRate,
      spendRatio,
      effectiveSelectedCategory,
      filteredTxns,
      expenseTxns,
      largestCategory,
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

  if (loading && !data && !error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F6F8FB]">
        <div className="rounded-[24px] border border-slate-200 bg-white/85 px-6 py-4 text-sm text-slate-600 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          Loading your dashboard...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F6F8FB]">
        <div className="w-full max-w-md rounded-[24px] border border-rose-100 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <h1 className="mb-2 text-xl font-semibold text-rose-600">
            Something went wrong
          </h1>
          <p className="mb-4 text-sm text-slate-700">{error}</p>
          <button
            onClick={() => router.refresh()}
            className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!data || !dashboard) return null;

  const insightLines = splitInsightText(insights);
  const ITEMS_PER_PAGE = 10;
  const totalItems = dashboard.filteredTxns.length;
  const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / ITEMS_PER_PAGE);
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentPageTxns = dashboard.filteredTxns.slice(startIndex, endIndex);

  return (
    <main className="min-h-screen overflow-x-auto bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.16),transparent_30%),radial-gradient(circle_at_top_right,rgba(20,184,166,0.14),transparent_28%),#F6F8FB] text-slate-950">
      <div className="mx-auto max-w-[1440px] min-w-[1180px] px-7 py-7">
        <header className="mb-6 flex items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-teal-500 text-lg font-extrabold text-white shadow-[0_12px_32px_rgba(37,99,235,0.25)]">
              AI
            </div>
            <div>
              <h1 className="text-[30px] font-extrabold tracking-[-0.04em]">
                AI Finance Manager
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                Professional desktop dashboard for expense intelligence and cashflow tracking.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Month
              </span>
              <input
                type="month"
                value={selectedMonth && selectedMonth !== "ALL" ? selectedMonth : ""}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="w-36 border-0 bg-transparent text-sm text-slate-800 outline-none"
              />
            </div>
            <button
              onClick={handleAllClick}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 shadow-sm hover:bg-slate-50"
            >
              All time
            </button>
            <button
              onClick={() => router.push("/upload")}
              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
            >
              Upload CSV
            </button>
            <button
              onClick={() => {
                localStorage.removeItem("token");
                router.replace("/login");
              }}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </header>

        <section className="mb-5 grid grid-cols-4 gap-5">
          <KpiCard
            label="Total Income"
            value={`₹ ${formatCurrency(data.income)}`}
            helper={data.income === 0 ? "Income data not connected" : data.month}
            tone="success"
          />
          <KpiCard
            label="Total Expense"
            value={`₹ ${formatCurrency(data.expense)}`}
            helper={`${dashboard.expenseTxns.length} expense transactions`}
            tone="danger"
          />
          <KpiCard
            label="Net Savings"
            value={`₹ ${formatCurrency(data.net)}`}
            helper={data.net >= 0 ? "Positive cashflow" : "Temporary until income is added"}
            tone={data.net >= 0 ? "primary" : "warning"}
          />
          <KpiCard
            label="Savings Rate"
            value={`${dashboard.savingsRate.toFixed(1)}%`}
            helper={data.income > 0 ? "Savings / income" : "Waiting for income data"}
            tone="violet"
          />
        </section>

        <section className="mb-5 grid grid-cols-12 gap-5">
          <Card
            className="col-span-8"
            title="Spend by Category"
            subtitle="Cleaned category view based on merchant intelligence."
            action={
              <div className="text-right">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Total expense
                </p>
                <p className="mt-1 text-lg font-extrabold tracking-tight text-slate-950">
                  ₹ {formatCurrency(data.expense)}
                </p>
              </div>
            }
          >
            <div className="grid grid-cols-12 gap-6">
              <div className="relative col-span-5 h-[320px]">
                {dashboard.categoryChartData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dashboard.categoryChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={118}
                          innerRadius={76}
                          paddingAngle={4}
                        >
                          {dashboard.categoryChartData.map((entry, index) => (
                            <Cell
                              key={`cell-${entry.name}`}
                              fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: any) => `₹ ${formatCurrency(Number(value))}`}
                          contentStyle={{
                            backgroundColor: "#FFFFFF",
                            border: "1px solid #E5E7EB",
                            borderRadius: "16px",
                            fontSize: "12px",
                            boxShadow: "0 14px 30px rgba(15,23,42,0.12)",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 grid place-items-center">
                      <div className="text-center">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                          Spend
                        </p>
                        <p className="text-xl font-extrabold tracking-tight text-slate-950">
                          ₹ {formatCurrency(data.expense)}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="grid h-full place-items-center rounded-[24px] border border-dashed border-slate-200 bg-white/60 text-sm text-slate-400">
                    No expense data yet
                  </div>
                )}
              </div>

              <div className="col-span-7 space-y-3">
                {dashboard.categoryRows.slice(0, 7).map((cat, index) => (
                  <button
                    key={cat.category}
                    onClick={() => setSelectedCategory(cat.category)}
                    className={`w-full rounded-[20px] border p-4 text-left transition ${
                      dashboard.effectiveSelectedCategory === cat.category
                        ? "border-blue-200 bg-blue-50 shadow-sm"
                        : "border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white"
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                      />
                      <span className="flex-1 truncate text-sm font-extrabold text-slate-900">
                        {cat.category}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-slate-700 shadow-sm">
                        {cat.percentage.toFixed(0)}%
                      </span>
                      <span className="w-28 text-right text-xs font-bold text-slate-500">
                        ₹ {formatCurrency(cat.amount)}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(cat.percentage, 100)}%`,
                          backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                        }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card
            className="col-span-4"
            title="AI Insights"
            subtitle="Action-oriented summary from current data."
            action={
              <button
                onClick={handleGenerateInsights}
                disabled={insightsLoading}
                className="rounded-2xl bg-slate-950 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
              >
                {insightsLoading ? "Analyzing..." : "Generate"}
              </button>
            }
          >
            {insightsError && (
              <p className="mb-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-600">
                {insightsError}
              </p>
            )}

            <div className="space-y-3">
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
                  ]).map((line, index) => (
                <InsightCard key={index} index={index + 1} text={line} />
              ))}
            </div>
          </Card>
        </section>

        <section className="mb-5 grid grid-cols-12 gap-5">
          <Card
            className="col-span-8"
            title="Top Merchants"
            subtitle="Normalized merchant names from raw card-statement descriptions."
          >
            {dashboard.topMerchants.length === 0 ? (
              <p className="text-sm text-slate-500">No merchant data yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {dashboard.topMerchants.map((merchant, index) => (
                  <div
                    key={merchant.merchant}
                    className="flex items-center gap-4 rounded-[20px] border border-slate-200 bg-white/70 p-4 shadow-sm"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-950 text-xs font-extrabold text-white">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold text-slate-950">
                        {merchant.merchant}
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {merchant.count} {merchant.count === 1 ? "transaction" : "transactions"}
                      </p>
                    </div>
                    <p className="whitespace-nowrap text-sm font-extrabold text-slate-950">
                      ₹ {formatCurrency(merchant.amount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            className="col-span-4"
            title="Cashflow Snapshot"
            subtitle="Temporary view until backend monthly aggregation is added."
            action={
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                {data.month}
              </span>
            }
          >
            <div className="space-y-3">
              <CashflowCard
                label="Income"
                value={`₹ ${formatCurrency(data.income)}`}
                helper={data.income === 0 ? "Not connected yet" : data.month}
                tone="success"
              />
              <CashflowCard
                label="Expense"
                value={`₹ ${formatCurrency(data.expense)}`}
                helper={`${dashboard.expenseTxns.length} expense transactions`}
                tone="danger"
              />
              <CashflowCard
                label="Spend vs Income"
                value={`${dashboard.spendRatio.toFixed(1)}%`}
                helper={data.income === 0 ? "Waiting for income data" : "Expense / income"}
                tone="primary"
              />
            </div>
          </Card>
        </section>

        <section className="mb-10 overflow-hidden rounded-[24px] border border-slate-200 bg-white/85 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-5">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-950">
                {dashboard.effectiveSelectedCategory
                  ? `${dashboard.effectiveSelectedCategory} Transactions`
                  : "Transactions"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Merchant, category, raw description, and amount.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search merchant, category, or description"
                className="w-[420px] rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
              />
              {dashboard.effectiveSelectedCategory && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className="whitespace-nowrap rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Show all
                </button>
              )}
            </div>
          </div>

          {totalItems === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-500">
              No transactions found for this selection.
            </p>
          ) : (
            <>
              <div className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                    <tr className="text-left">
                      <th className="px-6 py-4 font-extrabold">Date</th>
                      <th className="px-4 py-4 font-extrabold">Merchant</th>
                      <th className="px-4 py-4 font-extrabold">Category</th>
                      <th className="px-4 py-4 font-extrabold">Description</th>
                      <th className="px-6 py-4 text-right font-extrabold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentPageTxns.map((txn, index) => (
                      <tr
                        key={`${txn.date}-${txn.description}-${index}`}
                        className="transition hover:bg-blue-50/50"
                      >
                        <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-600">
                          {txn.date || "-"}
                        </td>
                        <td className="px-4 py-4 font-extrabold text-slate-950">
                          {extractMerchant(txn.description)}
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                            {displayCategory(txn.description, txn.category)}
                          </span>
                        </td>
                        <td className="max-w-[520px] truncate px-4 py-4 text-slate-500">
                          {txn.description || "-"}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right font-extrabold text-rose-600">
                          -₹ {formatCurrency(Math.abs(txn.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 text-sm text-slate-500">
                <span>
                  Showing <b className="text-slate-800">{startIndex + 1}</b> –{" "}
                  <b className="text-slate-800">{Math.min(endIndex, totalItems)}</b> of{" "}
                  <b className="text-slate-800">{totalItems}</b> transactions
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={safePage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className={`rounded-2xl border px-4 py-2 text-sm font-bold ${
                      safePage === 1
                        ? "cursor-not-allowed border-slate-200 bg-white text-slate-300"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Prev
                  </button>
                  <span>
                    Page <b className="text-slate-800">{safePage}</b> of{" "}
                    <b className="text-slate-800">{totalPages}</b>
                  </span>
                  <button
                    type="button"
                    disabled={safePage === totalPages || totalItems === 0}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className={`rounded-2xl border px-4 py-2 text-sm font-bold ${
                      safePage === totalPages || totalItems === 0
                        ? "cursor-not-allowed border-slate-200 bg-white text-slate-300"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Card({
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
    <div
      className={`rounded-[24px] border border-slate-200 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur ${className}`}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-slate-950">
            {title}
          </h2>
          {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function KpiCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: "success" | "danger" | "primary" | "warning" | "violet";
}) {
  const toneClass = {
    success: "bg-emerald-50 text-emerald-700",
    danger: "bg-rose-50 text-rose-700",
    primary: "bg-blue-50 text-blue-700",
    warning: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
  }[tone];

  const dotClass = {
    success: "bg-emerald-500",
    danger: "bg-rose-500",
    primary: "bg-blue-500",
    warning: "bg-amber-500",
    violet: "bg-violet-500",
  }[tone];

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/85 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">
          {label}
        </p>
        <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
      </div>
      <p className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-slate-950">
        {value}
      </p>
      <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold ${toneClass}`}>
        {helper}
      </span>
    </div>
  );
}

function InsightCard({ index, text }: { index: number; text: string }) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white/70 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-950 text-[11px] font-extrabold text-white">
          {index}
        </span>
        <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
          Insight
        </p>
      </div>
      <p className="text-sm leading-relaxed text-slate-700">{text}</p>
    </div>
  );
}

function CashflowCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: "success" | "danger" | "primary";
}) {
  const toneClass = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    danger: "border-rose-200 bg-rose-50 text-rose-800",
    primary: "border-blue-200 bg-blue-50 text-blue-800",
  }[tone];

  return (
    <div className={`rounded-[20px] border px-5 py-4 ${toneClass}`}>
      <p className="text-xs font-extrabold uppercase tracking-wide opacity-75">
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-1 text-sm font-medium opacity-75">{helper}</p>
    </div>
  );
}
