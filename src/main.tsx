import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./components/ui/ToastProvider";
import { preloadBranding } from "./lib/schoolRulesDb";
import "./index.css";

// Apply cached branding synchronously before React renders to eliminate FOUC.
preloadBranding();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AuthProvider>
  </StrictMode>,
);
