import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Upload,
  History,
  Headphones,
  X,
} from "lucide-react";

const navItems = [
  { label: "Upload Call", icon: Upload, path: "/" },
  { label: "Team Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Call History", icon: History, path: "/calls" },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const handleNav = (path: string) => {
    if (path !== "#") {
      navigate(path);
      onClose();
    }
  };

  // Close drawer on route change on mobile
  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const sidebarContent = (
    <>
      {/* Logo / Brand */}
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-5 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Headphones className="w-4 h-4 text-on-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground leading-tight">
            CS Copilot
          </p>
          <p className="text-[11px] text-foreground/40 font-medium leading-tight">
            Internal tool
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 pt-4 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.label}
            onClick={() => handleNav(item.path)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
              isActive(item.path)
                ? "bg-primary/10 text-primary"
                : "text-foreground/60 hover:text-foreground hover:bg-muted"
            }`}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            {item.label}
          </button>
        ))}
      </nav>

      {/* User area */}
      <div className="px-3 pb-4 border-t border-border pt-3">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground/50">
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-foreground/40">
            P
          </div>
          <span className="font-medium">Priya</span>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-shrink-0 border-r border-border bg-white flex-col h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-border flex flex-col transform transition-transform duration-250 ease-out md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Navigation menu"
        role="dialog"
        aria-modal={open}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-foreground/40 hover:text-foreground hover:bg-muted transition-colors duration-150"
          aria-label="Close navigation menu"
        >
          <X className="w-4 h-4" />
        </button>
        {sidebarContent}
      </aside>
    </>
  );
}