// src/components/partner/PartnerTabBar.jsx
import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/partner",                label: "Home",   icon: "🏠", end: true },
  { to: "/partner/wallet",         label: "Wallet", icon: "💳" },
  { to: "/partner/reimbursements", label: "Reimb.", icon: "💵" },
  { to: "/partner/calendar",       label: "Agenda", icon: "📅" },
  { to: "/partner/lightning-lanes",label: "L. Lanes", icon: "⚡" },
  { to: "/partner/profile",        label: "Profile",icon: "👤" },
];

export default function PartnerTabBar(){
  return (
    <nav className="pm-tabbar" aria-label="Partner bottom navigation">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) => "pm-tab" + (isActive ? " is-active" : "")}
        >
          <span className="pm-tab__icon" aria-hidden>{t.icon}</span>
          <span className="pm-tab__label">{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
