import { Home, Library, Search } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useT } from "../hooks/useT";

const items = [
  { to: "/", key: "nav.home" as const, icon: Home, end: true },
  { to: "/search", key: "nav.search" as const, icon: Search, end: false },
  { to: "/library", key: "nav.library" as const, icon: Library, end: false },
];

export function BottomNav() {
  const t = useT();
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {items.map(({ to, key, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <Icon size={21} strokeWidth={2.1} />
          <span>{t(key)}</span>
          <span className="nav-dot" aria-hidden="true" />
        </NavLink>
      ))}
    </nav>
  );
}
