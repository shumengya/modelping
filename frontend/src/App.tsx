import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { PwaUpdatePrompt } from "./components/PwaUpdatePrompt";
import { AppBootProvider } from "./context/AppBootContext";
import { Admin } from "./pages/Admin";
import { Dashboard } from "./pages/Dashboard";

export default function App() {
  return (
    <AppBootProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="admin" element={<Admin />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        <PwaUpdatePrompt />
      </BrowserRouter>
    </AppBootProvider>
  );
}
