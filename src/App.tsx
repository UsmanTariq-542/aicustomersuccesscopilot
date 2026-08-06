import Sidebar from "./components/Sidebar";
import UploadCall from "./components/UploadCall";

export default function App() {
  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <UploadCall />
    </div>
  );
}