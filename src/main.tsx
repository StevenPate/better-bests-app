import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { logFeatureFlags } from "./lib/featureFlags";
import { initPerformanceTracking } from './lib/analytics';
import App from "./App.tsx";
import "./index.css";

// Log enabled feature flags (development only, warns if production flags enabled)
logFeatureFlags();

// Initialize analytics performance tracking
initPerformanceTracking();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="theme"
      disableTransitionOnChange
    >
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
