import { Navigate, Route, Routes } from "react-router-dom";
import { AssistantProcessProvider } from "./auth/AssistantProcessContext";
import { AuthProvider } from "./auth/AuthContext";
import { HomePage } from "./pages/HomePage";
import { LegalInfoPage } from "./pages/LegalInfoPage";
import { LoginPage } from "./pages/LoginPage";
import { NewProcessWizardPage } from "./pages/NewProcessWizardPage";
import { ProcessDetailPage } from "./pages/ProcessDetailPage";
import { ProcessListPage } from "./pages/ProcessListPage";

export default function App() {
  return (
    <AuthProvider>
      <AssistantProcessProvider>
        <div className="app-shell">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<ProcessListPage />} />
            <Route path="/procesy/nowy" element={<NewProcessWizardPage />} />
            <Route path="/procesy/:id" element={<ProcessDetailPage />} />
            <Route path="/prywatnosc" element={<LegalInfoPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </AssistantProcessProvider>
    </AuthProvider>
  );
}
