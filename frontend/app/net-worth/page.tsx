"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import {
  AlertCircle,
  Banknote,
  BriefcaseBusiness,
  Building2,
  Coins,
  CreditCard,
  Landmark,
  Loader2,
  Pencil,
  PiggyBank,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";


const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";


const ASSET_CATEGORIES = [
  "Cash & Deposits",
  "Debt Funds",
  "Equity",
  "Real Estate",
  "Pension Fund",
  "Gold",
  "Angel Investment",
  "Crypto",
  "Other",
];


const LIABILITY_CATEGORIES = [
  "Home Loan",
  "Car Loan",
  "Personal Loan",
  "Credit Card",
  "Education Loan",
  "Other",
];


const CHART_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#0891b2",
  "#059669",
  "#d97706",
  "#dc2626",
  "#4f46e5",
  "#9333ea",
  "#64748b",
];


type Asset = {
  id: number;
  user_id: number;
  category: string;
  asset_name: string;
  institution?: string | null;
  current_value: number;
  invested_value?: number | null;
  currency: string;
  source_type: string;
  quantity?: number | null;
  purchase_price?: number | null;
  linked_liability_amount?: number | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};


type Liability = {
  id: number;
  user_id: number;
  category: string;
  liability_name: string;
  institution?: string | null;
  outstanding_amount: number;
  original_amount?: number | null;
  interest_rate?: number | null;
  monthly_payment?: number | null;
  currency: string;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};


type Allocation = {
  category: string;
  value: number;
  percentage: number;
};


type HistoryItem = {
  date: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
};


type Summary = {
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  previous_net_worth: number;
  change_amount: number;
  change_percentage: number;
  allocation: Allocation[];
  assets: Asset[];
  liabilities: Liability[];
  history: HistoryItem[];
};


type AssetForm = {
  category: string;
  asset_name: string;
  institution: string;
  current_value: string;
  invested_value: string;
  quantity: string;
  purchase_price: string;
  linked_liability_amount: string;
  notes: string;
};


type LiabilityForm = {
  category: string;
  liability_name: string;
  institution: string;
  outstanding_amount: string;
  original_amount: string;
  interest_rate: string;
  monthly_payment: string;
  notes: string;
};


const emptyAssetForm: AssetForm = {
  category: "Cash & Deposits",
  asset_name: "",
  institution: "",
  current_value: "",
  invested_value: "",
  quantity: "",
  purchase_price: "",
  linked_liability_amount: "",
  notes: "",
};


const emptyLiabilityForm: LiabilityForm = {
  category: "Home Loan",
  liability_name: "",
  institution: "",
  outstanding_amount: "",
  original_amount: "",
  interest_rate: "",
  monthly_payment: "",
  notes: "",
};


function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    localStorage.getItem("token") ||
    localStorage.getItem("access_token")
  );
}


function formatCurrency(value: number, compact = false) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(value);
}


function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}


function numericOrNull(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}


function getCategoryIcon(category: string) {
  const className = "h-5 w-5";

  switch (category) {
    case "Cash & Deposits":
      return <Landmark className={className} />;

    case "Debt Funds":
      return <ShieldCheck className={className} />;

    case "Equity":
      return <TrendingUp className={className} />;

    case "Real Estate":
      return <Building2 className={className} />;

    case "Pension Fund":
      return <PiggyBank className={className} />;

    case "Gold":
      return <Coins className={className} />;

    case "Angel Investment":
      return <Rocket className={className} />;

    case "Crypto":
      return <WalletCards className={className} />;

    default:
      return <BriefcaseBusiness className={className} />;
  }
}


export default function NetWorthPage() {
  const router = useRouter();

  const [summary, setSummary] =
    useState<Summary | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [modalType, setModalType] =
    useState<"asset" | "liability" | null>(null);

  const [editingAssetId, setEditingAssetId] =
    useState<number | null>(null);

  const [
    editingLiabilityId,
    setEditingLiabilityId,
  ] = useState<number | null>(null);

  const [assetForm, setAssetForm] =
    useState<AssetForm>(emptyAssetForm);

  const [liabilityForm, setLiabilityForm] =
    useState<LiabilityForm>(
      emptyLiabilityForm
    );


  const apiRequest = useCallback(
    async <T,>(
      path: string,
      options: RequestInit = {}
    ): Promise<T> => {
      const token = getToken();

      if (!token) {
        throw new Error(
          "Login token not found. Please log in again."
        );
      }

      const response = await fetch(
        `${API_URL}${path}`,
        {
          ...options,
          headers: {
            "Content-Type":
              "application/json",
            Authorization:
              `Bearer ${token}`,
            ...(options.headers || {}),
          },
        }
      );

      if (!response.ok) {
        let message =
          "Request failed";

        try {
          const data =
            await response.json();

          message =
            data.detail ||
            message;
        } catch {
          // Ignore parsing error
        }

        throw new Error(message);
      }

      return response.json() as Promise<T>;
    },
    []
  );


  const loadSummary =
    useCallback(async () => {
      setLoading(true);
      setError("");

      try {
        const data =
          await apiRequest<Summary>(
            "/net-worth/summary"
          );

        setSummary(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load net worth data."
        );
      } finally {
        setLoading(false);
      }
    }, [apiRequest]);


  useEffect(() => {
    loadSummary();
  }, [loadSummary]);


  const assetsByCategory =
    useMemo(() => {
      if (!summary) {
        return [];
      }

      return ASSET_CATEGORIES
        .map((category) => {
          const assets =
            summary.assets.filter(
              (asset) =>
                asset.category ===
                category
            );

          return {
            category,
            assets,
            total:
              assets.reduce(
                (
                  sum,
                  asset
                ) =>
                  sum +
                  asset.current_value,
                0
              ),
          };
        })
        .filter(
          (group) =>
            group.assets.length > 0
        );
    }, [summary]);


  const chartHistory =
    useMemo(() => {
      if (!summary) {
        return [];
      }

      return summary.history.map(
        (item) => ({
          ...item,
          displayDate:
            formatDate(item.date),
        })
      );
    }, [summary]);


  function closeModal() {
    setModalType(null);
    setEditingAssetId(null);
    setEditingLiabilityId(null);
    setAssetForm(
      emptyAssetForm
    );
    setLiabilityForm(
      emptyLiabilityForm
    );
    setError("");
  }


  function openNewAsset() {
    setEditingAssetId(null);
    setAssetForm(
      emptyAssetForm
    );
    setModalType("asset");
  }


  function openNewLiability() {
    setEditingLiabilityId(null);
    setLiabilityForm(
      emptyLiabilityForm
    );
    setModalType(
      "liability"
    );
  }


  function openEditAsset(
    asset: Asset
  ) {
    setEditingAssetId(
      asset.id
    );

    setAssetForm({
      category:
        asset.category,

      asset_name:
        asset.asset_name,

      institution:
        asset.institution ||
        "",

      current_value:
        String(
          asset.current_value
        ),

      invested_value:
        asset.invested_value ==
        null
          ? ""
          : String(
              asset.invested_value
            ),

      quantity:
        asset.quantity ==
        null
          ? ""
          : String(
              asset.quantity
            ),

      purchase_price:
        asset.purchase_price ==
        null
          ? ""
          : String(
              asset.purchase_price
            ),

      linked_liability_amount:
        asset.linked_liability_amount ==
        null
          ? ""
          : String(
              asset.linked_liability_amount
            ),

      notes:
        asset.notes || "",
    });

    setModalType("asset");
  }


  function openEditLiability(
    liability: Liability
  ) {
    setEditingLiabilityId(
      liability.id
    );

    setLiabilityForm({
      category:
        liability.category,

      liability_name:
        liability.liability_name,

      institution:
        liability.institution ||
        "",

      outstanding_amount:
        String(
          liability.outstanding_amount
        ),

      original_amount:
        liability.original_amount ==
        null
          ? ""
          : String(
              liability.original_amount
            ),

      interest_rate:
        liability.interest_rate ==
        null
          ? ""
          : String(
              liability.interest_rate
            ),

      monthly_payment:
        liability.monthly_payment ==
        null
          ? ""
          : String(
              liability.monthly_payment
            ),

      notes:
        liability.notes || "",
    });

    setModalType(
      "liability"
    );
  }


  async function saveAsset(
    event: FormEvent
  ) {
    event.preventDefault();

    setSaving(true);
    setError("");

    try {
      const payload = {
        category:
          assetForm.category,

        asset_name:
          assetForm.asset_name.trim(),

        institution:
          assetForm.institution.trim() ||
          null,

        current_value:
          Number(
            assetForm.current_value
          ),

        invested_value:
          numericOrNull(
            assetForm.invested_value
          ),

        currency:
          "JPY",

        source_type:
          "manual",

        quantity:
          numericOrNull(
            assetForm.quantity
          ),

        purchase_price:
          numericOrNull(
            assetForm.purchase_price
          ),

        linked_liability_amount:
          numericOrNull(
            assetForm.linked_liability_amount
          ) || 0,

        notes:
          assetForm.notes.trim() ||
          null,
      };


      if (
        !payload.asset_name
      ) {
        throw new Error(
          "Asset name is required."
        );
      }


      if (
        !Number.isFinite(
          payload.current_value
        ) ||
        payload.current_value < 0
      ) {
        throw new Error(
          "Enter a valid current value."
        );
      }


      if (editingAssetId) {
        await apiRequest(
          `/net-worth/assets/${editingAssetId}`,
          {
            method: "PUT",
            body:
              JSON.stringify(
                payload
              ),
          }
        );
      } else {
        await apiRequest(
          "/net-worth/assets",
          {
            method: "POST",
            body:
              JSON.stringify(
                payload
              ),
          }
        );
      }


      closeModal();
      await loadSummary();

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save asset."
      );
    } finally {
      setSaving(false);
    }
  }


  async function saveLiability(
    event: FormEvent
  ) {
    event.preventDefault();

    setSaving(true);
    setError("");

    try {
      const payload = {
        category:
          liabilityForm.category,

        liability_name:
          liabilityForm
            .liability_name
            .trim(),

        institution:
          liabilityForm
            .institution
            .trim() ||
          null,

        outstanding_amount:
          Number(
            liabilityForm
              .outstanding_amount
          ),

        original_amount:
          numericOrNull(
            liabilityForm
              .original_amount
          ),

        interest_rate:
          numericOrNull(
            liabilityForm
              .interest_rate
          ),

        monthly_payment:
          numericOrNull(
            liabilityForm
              .monthly_payment
          ),

        currency:
          "JPY",

        notes:
          liabilityForm
            .notes
            .trim() ||
          null,
      };


      if (
        !payload.liability_name
      ) {
        throw new Error(
          "Liability name is required."
        );
      }


      if (
        !Number.isFinite(
          payload.outstanding_amount
        ) ||
        payload.outstanding_amount <
          0
      ) {
        throw new Error(
          "Enter a valid outstanding amount."
        );
      }


      if (
        editingLiabilityId
      ) {
        await apiRequest(
          `/net-worth/liabilities/${editingLiabilityId}`,
          {
            method: "PUT",
            body:
              JSON.stringify(
                payload
              ),
          }
        );
      } else {
        await apiRequest(
          "/net-worth/liabilities",
          {
            method: "POST",
            body:
              JSON.stringify(
                payload
              ),
          }
        );
      }


      closeModal();
      await loadSummary();

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save liability."
      );
    } finally {
      setSaving(false);
    }
  }


  async function deleteAsset(
    assetId: number
  ) {
    if (
      !window.confirm(
        "Delete this asset?"
      )
    ) {
      return;
    }

    try {
      await apiRequest(
        `/net-worth/assets/${assetId}`,
        {
          method: "DELETE",
        }
      );

      await loadSummary();

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete asset."
      );
    }
  }


  async function deleteLiability(
    liabilityId: number
  ) {
    if (
      !window.confirm(
        "Delete this liability?"
      )
    ) {
      return;
    }

    try {
      await apiRequest(
        `/net-worth/liabilities/${liabilityId}`,
        {
          method: "DELETE",
        }
      );

      await loadSummary();

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete liability."
      );
    }
  }


  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">

        <div className="flex items-center gap-3 text-slate-600">

          <Loader2 className="h-5 w-5 animate-spin" />

          Loading wealth data...

        </div>

      </main>
    );
  }


  return (
    <main className="min-h-screen bg-slate-50 px-5 py-7 lg:px-8">

      <div className="mx-auto max-w-7xl">


        {/* =====================================================
            MERGED PREMIUM HERO
        ===================================================== */}

        <header className="mb-6 overflow-hidden rounded-[28px] border border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">

          <div className="px-7 py-7 lg:px-8 lg:py-8">

            <div className="flex flex-col gap-7 lg:flex-row lg:items-start lg:justify-between">


              {/* LEFT SIDE */}

              <div className="min-w-0">

                <div className="flex items-center gap-4">

                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-sm font-extrabold text-white">

                    AI

                  </div>


                  <div>

                    <div className="flex items-center gap-2">

                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">

                        AI Finance Manager

                      </p>


                      <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-200">

                        Wealth

                      </span>

                    </div>


                    <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">

                      Net Worth

                    </h1>

                  </div>

                </div>


                {/* CURRENT NET WORTH */}

                <div className="mt-8">

                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">

                    Current Net Worth

                  </p>


                  <div className="mt-3 flex flex-wrap items-end gap-4">

                    <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">

                      {formatCurrency(
                        summary?.net_worth ||
                          0
                      )}

                    </h2>


                    <div
                      className={`mb-1 flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold ${
                        (
                          summary?.change_amount ||
                          0
                        ) >= 0
                          ? "bg-emerald-400/15 text-emerald-300"
                          : "bg-red-400/15 text-red-300"
                      }`}
                    >

                      {(
                        summary?.change_amount ||
                        0
                      ) >= 0 ? (

                        <TrendingUp className="h-4 w-4" />

                      ) : (

                        <TrendingDown className="h-4 w-4" />

                      )}


                      {Math.abs(
                        summary?.change_percentage ||
                          0
                      ).toFixed(2)}

                      %

                    </div>

                  </div>


                  <p className="mt-3 text-sm text-slate-400">

                    {(
                      summary?.change_amount ||
                      0
                    ) >= 0
                      ? "+"
                      : "-"
                    }

                    {formatCurrency(
                      Math.abs(
                        summary?.change_amount ||
                          0
                      )
                    )}{" "}

                    versus your previous snapshot

                  </p>

                </div>

              </div>


              {/* RIGHT ACTIONS */}

              <div className="flex flex-wrap items-center gap-2 lg:max-w-[480px] lg:justify-end">

                <button
                  type="button"
                  onClick={() =>
                    router.push("/")
                  }
                  className="h-10 rounded-full border border-white/15 bg-white/10 px-4 text-xs font-bold text-white transition hover:bg-white/15"
                >

                  Dashboard

                </button>


                <button
                  type="button"
                  onClick={loadSummary}
                  className="flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 text-xs font-bold text-white transition hover:bg-white/15"
                >

                  <RefreshCw className="h-4 w-4" />

                  Refresh

                </button>


                <button
                  type="button"
                  onClick={
                    openNewLiability
                  }
                  className="flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 text-xs font-bold text-white transition hover:bg-white/15"
                >

                  <CreditCard className="h-4 w-4" />

                  Add Liability

                </button>


                <button
                  type="button"
                  onClick={
                    openNewAsset
                  }
                  className="flex h-10 items-center gap-2 rounded-full bg-white px-5 text-xs font-extrabold text-slate-950 shadow-lg transition hover:bg-blue-50"
                >

                  <Plus className="h-4 w-4" />

                  Add Asset

                </button>

              </div>

            </div>

          </div>

        </header>


        {/* =====================================================
            ERROR
        ===================================================== */}

        {error && !modalType && (

          <div className="mb-5 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">

            <AlertCircle className="h-5 w-5" />

            {error}

          </div>

        )}


        {/* =====================================================
            SUMMARY CARDS
        ===================================================== */}

        <div className="mb-6 grid gap-4 md:grid-cols-3">

          <SummaryCard
            title="Total Assets"
            value={
              summary?.total_assets ||
              0
            }
            subtitle={`${summary?.assets.length || 0} assets`}
            icon={
              <Banknote className="h-5 w-5" />
            }
          />


          <SummaryCard
            title="Total Liabilities"
            value={
              summary?.total_liabilities ||
              0
            }
            subtitle={`${summary?.liabilities.length || 0} liabilities`}
            icon={
              <CreditCard className="h-5 w-5" />
            }
          />


          <SummaryCard
            title="Asset-to-Debt Ratio"
            value={
              summary?.total_liabilities
                ? summary.total_assets /
                  summary.total_liabilities
                : 0
            }
            subtitle="Financial leverage"
            icon={
              <ShieldCheck className="h-5 w-5" />
            }
            ratio
          />

        </div>


        {/* =====================================================
            CHARTS
        ===================================================== */}

        <div className="mb-6 grid gap-6 xl:grid-cols-2">


          {/* NET WORTH TREND */}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <h3 className="font-bold text-slate-950">

              Net Worth Trend

            </h3>


            <p className="mt-1 text-sm text-slate-500">

              Historical wealth movement

            </p>


            {chartHistory.length > 1 ? (

              <div className="mt-5 h-72">

                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >

                  <AreaChart
                    data={
                      chartHistory
                    }
                  >

                    <defs>

                      <linearGradient
                        id="netWorthFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >

                        <stop
                          offset="5%"
                          stopColor="#2563eb"
                          stopOpacity={
                            0.3
                          }
                        />

                        <stop
                          offset="95%"
                          stopColor="#2563eb"
                          stopOpacity={
                            0
                          }
                        />

                      </linearGradient>

                    </defs>


                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                    />


                    <XAxis
                      dataKey="displayDate"
                      tickLine={false}
                      axisLine={false}
                    />


                    <YAxis
                      tickFormatter={(
                        value
                      ) =>
                        formatCurrency(
                          Number(
                            value
                          ),
                          true
                        )
                      }
                      tickLine={false}
                      axisLine={false}
                    />


                    <Tooltip
                      formatter={(
                        value
                      ) =>
                        formatCurrency(
                          Number(
                            value
                          )
                        )
                      }
                    />


                    <Area
                      type="monotone"
                      dataKey="net_worth"
                      stroke="#2563eb"
                      strokeWidth={3}
                      fill="url(#netWorthFill)"
                    />

                  </AreaChart>

                </ResponsiveContainer>

              </div>

            ) : (

              <EmptyBox
                text="Net worth history will appear after multiple snapshots."
              />

            )}

          </div>


          {/* ASSET ALLOCATION */}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <h3 className="font-bold text-slate-950">

              Asset Allocation

            </h3>


            <p className="mt-1 text-sm text-slate-500">

              Where your wealth is invested

            </p>


            {summary &&
            summary.allocation.length >
              0 ? (

              <>

                <div className="h-56">

                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                  >

                    <PieChart>

                      <Pie
                        data={
                          summary.allocation
                        }
                        dataKey="value"
                        nameKey="category"
                        innerRadius={
                          55
                        }
                        outerRadius={
                          85
                        }
                        paddingAngle={
                          3
                        }
                      >

                        {summary.allocation.map(
                          (
                            item,
                            index
                          ) => (

                            <Cell
                              key={
                                item.category
                              }
                              fill={
                                CHART_COLORS[
                                  index %
                                    CHART_COLORS.length
                                ]
                              }
                            />

                          )
                        )}

                      </Pie>


                      <Tooltip
                        formatter={(
                          value
                        ) =>
                          formatCurrency(
                            Number(
                              value
                            )
                          )
                        }
                      />

                    </PieChart>

                  </ResponsiveContainer>

                </div>


                <div className="space-y-3">

                  {summary.allocation.map(
                    (
                      item,
                      index
                    ) => (

                      <div
                        key={
                          item.category
                        }
                        className="flex justify-between text-sm"
                      >

                        <div className="flex items-center gap-2">

                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{
                              backgroundColor:
                                CHART_COLORS[
                                  index %
                                    CHART_COLORS.length
                                ],
                            }}
                          />


                          <span className="text-slate-600">

                            {
                              item.category
                            }

                          </span>

                        </div>


                        <span className="font-semibold text-slate-900">

                          {item.percentage.toFixed(
                            1
                          )}

                          %

                        </span>

                      </div>

                    )
                  )}

                </div>

              </>

            ) : (

              <EmptyBox
                text="Add assets to see your portfolio allocation."
              />

            )}

          </div>

        </div>


        {/* =====================================================
            ASSETS
        ===================================================== */}

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

          <div className="mb-5 flex items-center justify-between">

            <div>

              <h3 className="font-bold text-slate-950">

                Your Assets

              </h3>


              <p className="mt-1 text-sm text-slate-500">

                Current value of your wealth by category

              </p>

            </div>


            <button
              onClick={
                openNewAsset
              }
              className="flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
            >

              <Plus className="h-4 w-4" />

              Add

            </button>

          </div>


          {assetsByCategory.length >
          0 ? (

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">

              {assetsByCategory.map(
                (group) => (

                  <div
                    key={
                      group.category
                    }
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
                  >

                    <div className="flex items-center gap-3">

                      <div className="rounded-xl bg-white p-2.5 text-blue-700 shadow-sm">

                        {getCategoryIcon(
                          group.category
                        )}

                      </div>


                      <div>

                        <h4 className="font-bold text-slate-900">

                          {
                            group.category
                          }

                        </h4>


                        <p className="text-xs text-slate-500">

                          {
                            group.assets
                              .length
                          }{" "}

                          asset

                          {group.assets
                            .length > 1
                            ? "s"
                            : ""
                          }

                        </p>

                      </div>

                    </div>


                    <p className="mt-5 text-2xl font-bold text-slate-950">

                      {formatCurrency(
                        group.total
                      )}

                    </p>


                    <div className="mt-5 space-y-3">

                      {group.assets.map(
                        (asset) => (

                          <div
                            key={
                              asset.id
                            }
                            className="rounded-xl border border-slate-200 bg-white p-3"
                          >

                            <div className="flex justify-between gap-3">

                              <div className="min-w-0">

                                <p className="truncate text-sm font-semibold text-slate-900">

                                  {
                                    asset.asset_name
                                  }

                                </p>


                                <p className="truncate text-xs text-slate-500">

                                  {asset.institution ||
                                    "Manual"}

                                </p>

                              </div>


                              <p className="shrink-0 text-sm font-bold text-slate-900">

                                {formatCurrency(
                                  asset.current_value,
                                  true
                                )}

                              </p>

                            </div>


                            {asset.category ===
                              "Real Estate" &&
                              Number(
                                asset.linked_liability_amount ||
                                  0
                              ) >
                                0 && (

                                <p className="mt-2 text-xs text-slate-500">

                                  Equity:{" "}

                                  <span className="font-semibold text-slate-700">

                                    {formatCurrency(
                                      asset.current_value -
                                        Number(
                                          asset.linked_liability_amount ||
                                            0
                                        ),
                                      true
                                    )}

                                  </span>

                                </p>

                              )}


                            <div className="mt-3 flex justify-end gap-1">

                              <button
                                type="button"
                                onClick={() =>
                                  openEditAsset(
                                    asset
                                  )
                                }
                                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                aria-label="Edit asset"
                              >

                                <Pencil className="h-4 w-4" />

                              </button>


                              <button
                                type="button"
                                onClick={() =>
                                  deleteAsset(
                                    asset.id
                                  )
                                }
                                className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                                aria-label="Delete asset"
                              >

                                <Trash2 className="h-4 w-4" />

                              </button>

                            </div>

                          </div>

                        )
                      )}

                    </div>

                  </div>

                )
              )}

            </div>

          ) : (

            <EmptyBox
              text="No assets added yet. Click Add Asset to begin."
            />

          )}

        </section>


        {/* =====================================================
            LIABILITIES
        ===================================================== */}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

          <div className="mb-5 flex items-center justify-between">

            <div>

              <h3 className="font-bold text-slate-950">

                Liabilities

              </h3>


              <p className="mt-1 text-sm text-slate-500">

                Loans and outstanding balances

              </p>

            </div>


            <button
              onClick={
                openNewLiability
              }
              className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            >

              <Plus className="h-4 w-4" />

              Add

            </button>

          </div>


          {summary &&
          summary.liabilities.length >
            0 ? (

            <div className="overflow-x-auto">

              <table className="w-full min-w-[700px] text-left">

                <thead>

                  <tr className="border-b text-xs uppercase text-slate-500">

                    <th className="pb-3">
                      Liability
                    </th>

                    <th className="pb-3">
                      Institution
                    </th>

                    <th className="pb-3">
                      Interest
                    </th>

                    <th className="pb-3">
                      Monthly Payment
                    </th>

                    <th className="pb-3 text-right">
                      Outstanding
                    </th>

                    <th className="pb-3 text-right">
                      Actions
                    </th>

                  </tr>

                </thead>


                <tbody>

                  {summary.liabilities.map(
                    (
                      liability
                    ) => (

                      <tr
                        key={
                          liability.id
                        }
                        className="border-b border-slate-100 last:border-0"
                      >

                        <td className="py-4">

                          <p className="font-semibold text-slate-900">

                            {
                              liability.liability_name
                            }

                          </p>


                          <p className="text-xs text-slate-500">

                            {
                              liability.category
                            }

                          </p>

                        </td>


                        <td className="py-4 text-sm text-slate-600">

                          {liability.institution ||
                            "—"}

                        </td>


                        <td className="py-4 text-sm text-slate-600">

                          {liability.interest_rate ==
                          null
                            ? "—"
                            : `${liability.interest_rate}%`
                          }

                        </td>


                        <td className="py-4 text-sm text-slate-600">

                          {liability.monthly_payment ==
                          null
                            ? "—"
                            : formatCurrency(
                                liability.monthly_payment
                              )
                          }

                        </td>


                        <td className="py-4 text-right font-semibold text-slate-900">

                          {formatCurrency(
                            liability.outstanding_amount
                          )}

                        </td>


                        <td className="py-4">

                          <div className="flex justify-end gap-1">

                            <button
                              type="button"
                              onClick={() =>
                                openEditLiability(
                                  liability
                                )
                              }
                              className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                              aria-label="Edit liability"
                            >

                              <Pencil className="h-4 w-4" />

                            </button>


                            <button
                              type="button"
                              onClick={() =>
                                deleteLiability(
                                  liability.id
                                )
                              }
                              className="rounded-md p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                              aria-label="Delete liability"
                            >

                              <Trash2 className="h-4 w-4" />

                            </button>

                          </div>

                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          ) : (

            <EmptyBox
              text="No liabilities added yet."
            />

          )}

        </section>

      </div>


      {/* =====================================================
          MODAL
      ===================================================== */}

      {modalType && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">

          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">

            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-5">

              <div>

                <h2 className="text-lg font-bold text-slate-950">

                  {modalType ===
                  "asset"
                    ? editingAssetId
                      ? "Edit Asset"
                      : "Add Asset"
                    : editingLiabilityId
                      ? "Edit Liability"
                      : "Add Liability"
                  }

                </h2>


                <p className="mt-1 text-xs text-slate-500">

                  Values are currently recorded in JPY.

                </p>

              </div>


              <button
                type="button"
                onClick={
                  closeModal
                }
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
              >

                <X className="h-5 w-5" />

              </button>

            </div>


            {modalType ===
            "asset" ? (

              <form
                onSubmit={
                  saveAsset
                }
                className="space-y-5 p-6"
              >

                <Field label="Category">

                  <select
                    value={
                      assetForm.category
                    }
                    onChange={(
                      e
                    ) =>
                      setAssetForm(
                        {
                          ...assetForm,
                          category:
                            e.target
                              .value,
                        }
                      )
                    }
                    className={
                      inputClass
                    }
                  >

                    {ASSET_CATEGORIES.map(
                      (
                        category
                      ) => (

                        <option
                          key={
                            category
                          }
                          value={
                            category
                          }
                        >

                          {
                            category
                          }

                        </option>

                      )
                    )}

                  </select>

                </Field>


                <Field label="Asset Name">

                  <input
                    value={
                      assetForm.asset_name
                    }
                    onChange={(
                      e
                    ) =>
                      setAssetForm(
                        {
                          ...assetForm,
                          asset_name:
                            e.target
                              .value,
                        }
                      )
                    }
                    className={
                      inputClass
                    }
                    placeholder="Example: SBI Equity Portfolio"
                    required
                  />

                </Field>


                <Field label="Institution">

                  <input
                    value={
                      assetForm.institution
                    }
                    onChange={(
                      e
                    ) =>
                      setAssetForm(
                        {
                          ...assetForm,
                          institution:
                            e.target
                              .value,
                        }
                      )
                    }
                    className={
                      inputClass
                    }
                    placeholder="Example: SBI Securities"
                  />

                </Field>


                <Field label="Current Value">

                  <input
                    type="number"
                    min="0"
                    value={
                      assetForm.current_value
                    }
                    onChange={(
                      e
                    ) =>
                      setAssetForm(
                        {
                          ...assetForm,
                          current_value:
                            e.target
                              .value,
                        }
                      )
                    }
                    className={
                      inputClass
                    }
                    required
                  />

                </Field>


                <Field label="Invested Value">

                  <input
                    type="number"
                    min="0"
                    value={
                      assetForm.invested_value
                    }
                    onChange={(
                      e
                    ) =>
                      setAssetForm(
                        {
                          ...assetForm,
                          invested_value:
                            e.target
                              .value,
                        }
                      )
                    }
                    className={
                      inputClass
                    }
                  />

                </Field>


                {assetForm.category ===
                  "Real Estate" && (

                  <>

                    <Field label="Purchase Price">

                      <input
                        type="number"
                        min="0"
                        value={
                          assetForm.purchase_price
                        }
                        onChange={(
                          e
                        ) =>
                          setAssetForm(
                            {
                              ...assetForm,
                              purchase_price:
                                e
                                  .target
                                  .value,
                            }
                          )
                        }
                        className={
                          inputClass
                        }
                      />

                    </Field>


                    <Field label="Outstanding Property Loan">

                      <input
                        type="number"
                        min="0"
                        value={
                          assetForm.linked_liability_amount
                        }
                        onChange={(
                          e
                        ) =>
                          setAssetForm(
                            {
                              ...assetForm,
                              linked_liability_amount:
                                e
                                  .target
                                  .value,
                            }
                          )
                        }
                        className={
                          inputClass
                        }
                      />

                    </Field>

                  </>

                )}


                {assetForm.category ===
                  "Gold" && (

                  <Field label="Quantity">

                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={
                        assetForm.quantity
                      }
                      onChange={(
                        e
                      ) =>
                        setAssetForm(
                          {
                            ...assetForm,
                            quantity:
                              e.target
                                .value,
                          }
                        )
                      }
                      className={
                        inputClass
                      }
                    />

                  </Field>

                )}


                <Field label="Notes">

                  <textarea
                    value={
                      assetForm.notes
                    }
                    onChange={(
                      e
                    ) =>
                      setAssetForm(
                        {
                          ...assetForm,
                          notes:
                            e.target
                              .value,
                        }
                      )
                    }
                    className={
                      inputClass
                    }
                    rows={3}
                  />

                </Field>


                {error && (

                  <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">

                    {error}

                  </div>

                )}


                <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">

                  <button
                    type="button"
                    onClick={
                      closeModal
                    }
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >

                    Cancel

                  </button>


                  <button
                    type="submit"
                    disabled={
                      saving
                    }
                    className="flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >

                    {saving && (

                      <Loader2 className="h-4 w-4 animate-spin" />

                    )}


                    {editingAssetId
                      ? "Update Asset"
                      : "Save Asset"
                    }

                  </button>

                </div>

              </form>

            ) : (

              <form
                onSubmit={
                  saveLiability
                }
                className="space-y-5 p-6"
              >

                <Field label="Category">

                  <select
                    value={
                      liabilityForm.category
                    }
                    onChange={(
                      e
                    ) =>
                      setLiabilityForm(
                        {
                          ...liabilityForm,
                          category:
                            e.target
                              .value,
                        }
                      )
                    }
                    className={
                      inputClass
                    }
                  >

                    {LIABILITY_CATEGORIES.map(
                      (
                        category
                      ) => (

                        <option
                          key={
                            category
                          }
                          value={
                            category
                          }
                        >

                          {
                            category
                          }

                        </option>

                      )
                    )}

                  </select>

                </Field>


                <Field label="Liability Name">

                  <input
                    value={
                      liabilityForm.liability_name
                    }
                    onChange={(
                      e
                    ) =>
                      setLiabilityForm(
                        {
                          ...liabilityForm,
                          liability_name:
                            e.target
                              .value,
                        }
                      )
                    }
                    className={
                      inputClass
                    }
                    placeholder="Example: Home Loan"
                    required
                  />

                </Field>


                <Field label="Institution">

                  <input
                    value={
                      liabilityForm.institution
                    }
                    onChange={(
                      e
                    ) =>
                      setLiabilityForm(
                        {
                          ...liabilityForm,
                          institution:
                            e.target
                              .value,
                        }
                      )
                    }
                    className={
                      inputClass
                    }
                  />

                </Field>


                <Field label="Outstanding Amount">

                  <input
                    type="number"
                    min="0"
                    value={
                      liabilityForm.outstanding_amount
                    }
                    onChange={(
                      e
                    ) =>
                      setLiabilityForm(
                        {
                          ...liabilityForm,
                          outstanding_amount:
                            e.target
                              .value,
                        }
                      )
                    }
                    className={
                      inputClass
                    }
                    required
                  />

                </Field>


                <Field label="Original Loan Amount">

                  <input
                    type="number"
                    min="0"
                    value={
                      liabilityForm.original_amount
                    }
                    onChange={(
                      e
                    ) =>
                      setLiabilityForm(
                        {
                          ...liabilityForm,
                          original_amount:
                            e.target
                              .value,
                        }
                      )
                    }
                    className={
                      inputClass
                    }
                  />

                </Field>


                <Field label="Interest Rate (%)">

                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={
                      liabilityForm.interest_rate
                    }
                    onChange={(
                      e
                    ) =>
                      setLiabilityForm(
                        {
                          ...liabilityForm,
                          interest_rate:
                            e.target
                              .value,
                        }
                      )
                    }
                    className={
                      inputClass
                    }
                  />

                </Field>


                <Field label="Monthly Payment">

                  <input
                    type="number"
                    min="0"
                    value={
                      liabilityForm.monthly_payment
                    }
                    onChange={(
                      e
                    ) =>
                      setLiabilityForm(
                        {
                          ...liabilityForm,
                          monthly_payment:
                            e.target
                              .value,
                        }
                      )
                    }
                    className={
                      inputClass
                    }
                  />

                </Field>


                <Field label="Notes">

                  <textarea
                    value={
                      liabilityForm.notes
                    }
                    onChange={(
                      e
                    ) =>
                      setLiabilityForm(
                        {
                          ...liabilityForm,
                          notes:
                            e.target
                              .value,
                        }
                      )
                    }
                    className={
                      inputClass
                    }
                    rows={3}
                  />

                </Field>


                {error && (

                  <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">

                    {error}

                  </div>

                )}


                <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">

                  <button
                    type="button"
                    onClick={
                      closeModal
                    }
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >

                    Cancel

                  </button>


                  <button
                    type="submit"
                    disabled={
                      saving
                    }
                    className="flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >

                    {saving && (

                      <Loader2 className="h-4 w-4 animate-spin" />

                    )}


                    {editingLiabilityId
                      ? "Update Liability"
                      : "Save Liability"
                    }

                  </button>

                </div>

              </form>

            )}

          </div>

        </div>

      )}

    </main>
  );
}


function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  ratio = false,
}: {
  title: string;
  value: number;
  subtitle: string;
  icon: React.ReactNode;
  ratio?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

      <div className="flex items-center justify-between">

        <span className="text-sm font-semibold text-slate-600">

          {title}

        </span>


        <span className="rounded-xl bg-slate-100 p-2.5 text-slate-700">

          {icon}

        </span>

      </div>


      <p className="mt-4 text-2xl font-bold tracking-tight text-slate-950">

        {ratio
          ? `${value.toFixed(2)}x`
          : formatCurrency(
              value
            )
        }

      </p>


      <p className="mt-1 text-xs text-slate-500">

        {subtitle}

      </p>

    </div>
  );
}


function EmptyBox({
  text,
}: {
  text: string;
}) {
  return (
    <div className="mt-5 flex min-h-52 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">

      {text}

    </div>
  );
}


const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10";


function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">

      <span className="mb-2 block text-sm font-semibold text-slate-700">

        {label}

      </span>

      {children}

    </label>
  );
}