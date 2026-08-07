import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App";
import UploadCall from "./components/UploadCall";
import ReviewCall from "./components/ReviewCall";
import CallHistory from "./components/CallHistory";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={<UploadCall />} />
          <Route path="calls" element={<CallHistory />} />
          <Route path="review/:callId" element={<ReviewCall />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);