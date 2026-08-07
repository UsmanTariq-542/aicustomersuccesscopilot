import { Outlet } from "react-router-dom";
import Sidebar from "./components/Sidebar";

export default function App() {
  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <Outlet />
    </div>
  );
}