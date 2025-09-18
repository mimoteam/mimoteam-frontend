import React from "react";
import FinanceDashboard from "./FinanceDashboard.jsx";      // estava "../FinanceDashboard.jsx"
import { useFinanceData } from "../api/useFinanceData.js";  // estava "./api/..."

export default function FinanceHome() {
  const { payments, services, loading } = useFinanceData();

  return (
    <div className="finance-page">
      {loading && (
        <div className="fin-head" style={{ marginBottom: 8 }}>
          <span className="kpi-title" style={{ fontWeight: 700 }}>Loading…</span>
        </div>
      )}
      <FinanceDashboard payments={payments} services={services} />
    </div>
  );
}
