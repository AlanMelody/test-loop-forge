import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { BoardPage } from './pages/BoardPage';
import { LoginPage } from './pages/LoginPage';
import { RequirementDetailPage } from './pages/RequirementDetailPage';
import { AppProvider } from './state/AppContext';

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/requirements" element={<BoardPage />} />
            <Route path="/requirements/:id" element={<RequirementDetailPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/requirements" replace />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}
