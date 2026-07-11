"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = "http://localhost:8000";

type Status = "idle" | "uploading" | "success" | "error";

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [statementType, setStatementType] = useState("AEON");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const acceptFile = (f: File | null) => {
    if (!f) return;

    const lowerName = f.name.toLowerCase();

    if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".pdf")) {
      setStatus("error");
      setMessage("Please select a .csv or .pdf file");
      return;
    }

    if (lowerName.endsWith(".pdf")) {
      setStatementType("BANK_PDF");
    }

    setFile(f);
    setStatus("idle");
    setMessage("");
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    acceptFile(e.dataTransfer.files?.[0] || null);
  };

  const handleUpload = async () => {
    if (!file) {
      setStatus("error");
      setMessage("Please select a CSV or PDF file");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("statement_type", statementType);

    setStatus("uploading");
    setMessage("");

    try {
      const res = await fetch(
        `${API_BASE}/files/upload?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Upload failed");
      }

      setStatus("success");
      setMessage("Upload successful — your dashboard is updated.");
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "Upload failed");
    }
  };

  const clearFile = () => {
    setFile(null);
    setStatus("idle");
    setMessage("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <main className="afmRoot">
      <Style />

      <div className="dashboardWrap">
        <header className="heroCard">
          <div className="heroContent">
            <div className="brandBlock">
              <div className="brandIcon">AI</div>
              <div>
                <h1>Upload transactions</h1>
                <p>
                  Import your bank or credit-card statement to refresh expense
                  intelligence and cashflow tracking.
                </p>
              </div>
            </div>

            <div className="heroActions">
              <button className="ghostBtn" onClick={() => router.push("/")}>
                ← Back to dashboard
              </button>
              <button
                className="lightBtn"
                onClick={() => inputRef.current?.click()}
              >
                Select file
              </button>
            </div>
          </div>
        </header>

        <section className="mainGrid">
          <Panel
            className="span7"
            title="Statement Import"
            subtitle="Select statement type first, then upload one CSV or PDF file."
          >
            <div className="statementSelector">
              <label>Select Statement Type</label>

              <select
                value={statementType}
                onChange={(e) => {
                  setStatementType(e.target.value);
                  setStatus("idle");
                  setMessage("");
                }}
              >
                <option value="AEON">AEON</option>
                <option value="AMEX">AMEX</option>
                <option value="ORICO">ORICO</option>
                <option value="BANK_PDF">SMBC Trust Bank PDF</option>
                <option value="OTHERS">Others</option>
              </select>

              <p>
                Choose the correct statement format before uploading your CSV or
                PDF.
              </p>
            </div>

            <label
              htmlFor="csv-input"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`dropZone ${isDragging ? "active" : ""} ${
                file ? "hasFile" : ""
              }`}
            >
              <div className="uploadIcon">↑</div>
              <strong>
                {isDragging
                  ? "Drop the CSV or PDF file here"
                  : "Drag a CSV or PDF here, or click to browse"}
              </strong>
              <span>
                Supported formats: AEON CSV, AMEX CSV, ORICO CSV, SMBC Trust
                Bank PDF, or standard CSV
              </span>

              <input
                ref={inputRef}
                id="csv-input"
                type="file"
                accept=".csv,.pdf,text/csv,application/pdf"
                onChange={(e) => acceptFile(e.target.files?.[0] || null)}
                hidden
              />
            </label>

            {file && (
              <div className="fileCard">
                <div className="fileBadge">
                  {file.name.toLowerCase().endsWith(".pdf") ? "PDF" : "CSV"}
                </div>
                <div className="fileMain">
                  <p>{file.name}</p>
                  <span>
                    {formatBytes(file.size)} · {statementType} statement
                  </span>
                </div>
                <button
                  className="outlineBtn"
                  type="button"
                  onClick={clearFile}
                >
                  Remove
                </button>
              </div>
            )}

            <div className="buttonRow">
              <button
                className="darkBtn large"
                onClick={handleUpload}
                disabled={status === "uploading" || !file}
              >
                {status === "uploading" && <span className="spinner" />}
                {status === "uploading" ? "Uploading..." : "Upload file"}
              </button>

              <button
                className="outlineBtn largeOutline"
                onClick={() => router.push("/")}
              >
                Cancel
              </button>
            </div>

            {status === "success" && (
              <div className="alert success">
                <span>✓</span>
                <p>{message}</p>
                <button onClick={() => router.push("/")}>View dashboard</button>
              </div>
            )}

            {status === "error" && message && (
              <div className="alert error">
                <span>!</span>
                <p>{message}</p>
              </div>
            )}
          </Panel>

          <Panel
            className="span5"
            title="Import Checklist"
            subtitle="Keep the upload clean and predictable."
          >
            <div className="insightStack">
              <ChecklistItem
                index={1}
                title="Select statement type"
                text="Choose AEON, AMEX, ORICO, SMBC Trust Bank PDF, or Others before uploading the file."
              />
              <ChecklistItem
                index={2}
                title="Use supported export"
                text="Download the statement as CSV or PDF from your bank or credit-card portal."
              />
              <ChecklistItem
                index={3}
                title="Keep original columns"
                text="Do not delete date, description, or amount columns before upload."
              />
              <ChecklistItem
                index={4}
                title="Review dashboard"
                text="After upload, verify categories, merchants, and totals on the dashboard."
              />
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Panel({
  title,
  subtitle,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`panel ${className}`}>
      <div className="panelHeader">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function ChecklistItem({
  index,
  title,
  text,
}: {
  index: number;
  title: string;
  text: string;
}) {
  return (
    <div className="insightCard">
      <div>
        <span>{index}</span>
        <b>{title}</b>
      </div>
      <p>{text}</p>
    </div>
  );
}

function Style() {
  return (
    <style jsx global>{`
      .afmRoot,
      .afmRoot * {
        box-sizing: border-box;
      }

      .afmRoot {
        min-height: 100vh;
        background: #f5f7fb;
        color: #0f172a;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system,
          BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .dashboardWrap {
        width: 100%;
        max-width: 1600px;
        min-width: 1180px;
        margin: 0 auto;
        padding: 32px 40px;
      }

      .heroCard,
      .panel {
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

      .ghostBtn {
        height: 38px;
        border-radius: 999px;
        padding: 0 16px;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        border: 1px solid rgba(255, 255, 255, 0.15);
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

      .mainGrid {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 24px;
        margin-bottom: 24px;
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

      .panelHeader h2 {
        margin: 0;
        color: #0f172a;
        font-size: 18px;
        line-height: 1.25;
        font-weight: 800;
        letter-spacing: -0.015em;
      }

      .panelHeader p {
        margin: 6px 0 0;
        color: #64748b;
        font-size: 14px;
        line-height: 1.45;
      }

      .statementSelector {
        margin-bottom: 16px;
        border-radius: 18px;
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        padding: 16px;
      }

      .statementSelector label {
        display: block;
        margin-bottom: 8px;
        color: #0f172a;
        font-size: 13px;
        font-weight: 850;
      }

      .statementSelector select {
        width: 100%;
        height: 44px;
        border-radius: 14px;
        border: 1px solid #cbd5e1;
        background: #fff;
        color: #0f172a;
        padding: 0 14px;
        font-size: 14px;
        font-weight: 700;
        outline: none;
      }

      .statementSelector select:focus {
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
      }

      .statementSelector p {
        margin: 8px 0 0;
        color: #64748b;
        font-size: 13px;
      }

      .dropZone {
        min-height: 292px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        border-radius: 24px;
        border: 1.5px dashed #cbd5e1;
        background: #f8fafc;
        transition: 0.16s ease;
        cursor: pointer;
        text-align: center;
        padding: 32px;
      }

      .dropZone:hover,
      .dropZone.active {
        border-color: #93c5fd;
        background: #eff6ff;
        box-shadow: 0 12px 24px rgba(37, 99, 235, 0.08);
      }

      .dropZone.hasFile {
        border-color: #a7f3d0;
        background: #ecfdf5;
      }

      .uploadIcon {
        width: 52px;
        height: 52px;
        border-radius: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0f172a;
        color: #fff;
        font-size: 24px;
        font-weight: 900;
        box-shadow: 0 12px 24px rgba(15, 23, 42, 0.16);
      }

      .dropZone strong {
        color: #0f172a;
        font-size: 16px;
        font-weight: 850;
      }

      .dropZone span {
        color: #64748b;
        font-size: 13px;
      }

      .fileCard {
        margin-top: 16px;
        display: flex;
        align-items: center;
        gap: 14px;
        border-radius: 18px;
        border: 1px solid #e2e8f0;
        background: #fff;
        padding: 14px;
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.04);
      }

      .fileBadge {
        width: 42px;
        height: 42px;
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #ecfdf5;
        color: #047857;
        font-size: 12px;
        font-weight: 900;
        border: 1px solid #a7f3d0;
      }

      .fileMain {
        flex: 1;
        min-width: 0;
      }

      .fileMain p {
        margin: 0;
        color: #0f172a;
        font-size: 14px;
        font-weight: 850;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .fileMain span {
        display: block;
        margin-top: 3px;
        color: #64748b;
        font-size: 12px;
      }

      .buttonRow {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 18px;
      }

      .darkBtn {
        height: 42px;
        border-radius: 999px;
        padding: 0 18px;
        background: #0f172a;
        color: #fff;
        font-size: 13px;
        font-weight: 850;
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.14);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .darkBtn.large {
        flex: 1;
        height: 46px;
      }

      .darkBtn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .outlineBtn {
        height: 38px;
        border-radius: 999px;
        background: #fff;
        border: 1px solid #e2e8f0;
        color: #334155;
        padding: 0 16px;
        font-size: 13px;
        font-weight: 800;
      }

      .largeOutline {
        height: 46px;
      }

      .spinner {
        width: 15px;
        height: 15px;
        border-radius: 999px;
        border: 2px solid rgba(255, 255, 255, 0.35);
        border-top-color: #fff;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .alert {
        margin-top: 16px;
        display: flex;
        align-items: flex-start;
        gap: 10px;
        border-radius: 16px;
        padding: 14px 16px;
        border: 1px solid;
      }

      .alert span {
        width: 24px;
        height: 24px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 900;
      }

      .alert p {
        flex: 1;
        margin: 2px 0 0;
        font-size: 14px;
        line-height: 1.45;
      }

      .alert button {
        background: transparent;
        font-size: 13px;
        font-weight: 850;
        text-decoration: underline;
      }

      .alert.success {
        background: #ecfdf5;
        border-color: #a7f3d0;
        color: #065f46;
      }

      .alert.success span {
        background: #10b981;
        color: #fff;
      }

      .alert.success button {
        color: #065f46;
      }

      .alert.error {
        background: #fff1f2;
        border-color: #fecdd3;
        color: #9f1239;
      }

      .alert.error span {
        background: #e11d48;
        color: #fff;
      }

      .insightStack {
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

      @media (max-width: 1250px) {
        .dashboardWrap {
          min-width: 0;
          padding: 24px;
        }

        .heroContent {
          flex-direction: column;
          align-items: stretch;
        }

        .heroActions {
          flex-wrap: wrap;
        }

        .span7,
        .span5 {
          grid-column: span 12;
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
        .panel {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      }
    `}</style>
  );
}