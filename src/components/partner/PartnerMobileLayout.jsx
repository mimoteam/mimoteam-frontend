import React from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Wallet, Zap, CalendarDays, MoreVertical, User, DollarSign, X, LogOut } from "lucide-react";

// CSS
import "../../styles/partner/PartnerTokens.css";
import "../../styles/partner/PartnerMobileLayout.css";

export default function PartnerMobileLayout() {
  const [moreOpen, setMoreOpen] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  React.useEffect(() => { setMoreOpen(false); }, [location.pathname]);

  const pageTitle = React.useMemo(() => {
    const p = location.pathname;
    if (p.startsWith("/partner/lightning-lanes")) return "Lightning";
    if (p.startsWith("/partner/calendar"))        return "Calendar";
    if (p.startsWith("/partner/reimbursements"))  return "Reimbursements";
    if (p.startsWith("/partner/profile"))         return "Profile";
    return "Wallet";
  }, [location.pathname]);

  const go = (to) => () => navigate(to);

  const handleSignOut = () => {
    // avisa o App para executar o logout oficial
    try {
      window.dispatchEvent(new CustomEvent("mimo:logout", { detail: { source: "partner" } }));
    } catch {}
    // fallback: limpa credenciais e volta pra raiz
    try {
      localStorage.removeItem("auth_token_v1");
      localStorage.removeItem("current_user_v1");
    } catch {}
    navigate("/", { replace: true });
    setTimeout(() => { try { window.location.reload(); } catch {} }, 50);
  };

  return (
    <div className="pml-wrap partner-mobile">
      <header className="pml-header">
        <div className="brand">MIMO</div>
        <h1 className="title" aria-live="polite">{pageTitle}</h1>
        <div className="spacer" />
      </header>

      <main className="pml-main">
        <Outlet />
      </main>

      <nav className="pml-tabbar" role="navigation" aria-label="Partner primary">
        <NavLink to="/partner" end className={({ isActive }) => `tab${isActive ? " active" : ""}`} aria-label="Wallet">
          <Wallet size={20} />
          <span>Wallet</span>
        </NavLink>
        <NavLink to="/partner/lightning-lanes" className={({ isActive }) => `tab${isActive ? " active" : ""}`} aria-label="Lightning">
          <Zap size={20} />
          <span>Lightning</span>
        </NavLink>
        <NavLink to="/partner/calendar" className={({ isActive }) => `tab${isActive ? " active" : ""}`} aria-label="Calendar">
          <CalendarDays size={20} />
          <span>Calendar</span>
        </NavLink>
        <button
          type="button"
          className="tab more-btn"
          aria-label="More"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(v => !v)}
        >
          <MoreVertical size={20} />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <>
          <div className="pml-sheet-backdrop" onClick={() => setMoreOpen(false)} />
          <div className="pml-sheet" role="dialog" aria-label="More options">
            <div className="sheet-head">
              <strong>More options</strong>
              <button className="icon-btn" onClick={() => setMoreOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="sheet-grid">
              <button className="sheet-item" onClick={go("/partner/profile")} aria-label="Profile">
                <div className="ic"><User size={18} /></div>
                <span>Profile</span>
              </button>

              <button className="sheet-item" onClick={go("/partner/reimbursements")} aria-label="Reimbursements">
                <div className="ic"><DollarSign size={18} /></div>
                <span>Reimbursements</span>
              </button>

              <button className="sheet-item danger" onClick={handleSignOut} aria-label="Sign out">
                <div className="ic"><LogOut size={18} /></div>
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
