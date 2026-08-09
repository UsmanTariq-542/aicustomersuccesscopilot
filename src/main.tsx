import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App";
import LandingPage from "./components/LandingPage";
import UploadCall from "./components/UploadCall";
import ReviewCall from "./components/ReviewCall";
import CallHistory from "./components/CallHistory";
import Dashboard from "./components/Dashboard";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route element={<App />}>
          <Route path="upload" element={<UploadCall />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="calls" element={<CallHistory />} />
          <Route path="review/:callId" element={<ReviewCall />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);