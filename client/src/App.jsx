import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import './index.css';

const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const RegisterPage = lazy(() => import('./pages/RegisterPage.jsx'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const TransactionsPage = lazy(() => import('./pages/TransactionsPage.jsx'));
const BudgetsPage = lazy(() => import('./pages/BudgetsPage.jsx'));
const BillsPage = lazy(() => import('./pages/BillsPage.jsx'));
const GoalsPage = lazy(() => import('./pages/GoalsPage.jsx'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage.jsx'));
const SplitsPage = lazy(() => import('./pages/SplitsPage.jsx'));
const FriendsPage = lazy(() => import('./pages/FriendsPage.jsx'));

const PageLoader = () => (
  <div
    style={{
      minHeight: '60vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <div className="glass-card" style={{ padding: '1.5rem 2rem' }}>
      <p className="text-muted" style={{ margin: 0 }}>Loading page...</p>
    </div>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            <Route element={<ProtectedRoute />}>
              <Route
                path="/"
                element={
                  <Layout>
                    <Navigate to="/dashboard" replace />
                  </Layout>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <Layout>
                    <DashboardPage />
                  </Layout>
                }
              />
              <Route
                path="/transactions"
                element={
                  <Layout>
                    <TransactionsPage />
                  </Layout>
                }
              />
              <Route
                path="/bills"
                element={
                  <Layout>
                    <BillsPage />
                  </Layout>
                }
              />
              <Route
                path="/budgets"
                element={
                  <Layout>
                    <BudgetsPage />
                  </Layout>
                }
              />
              <Route
                path="/goals"
                element={
                  <Layout>
                    <GoalsPage />
                  </Layout>
                }
              />
              <Route
                path="/analytics"
                element={
                  <Layout>
                    <AnalyticsPage />
                  </Layout>
                }
              />
              <Route
                path="/splits"
                element={
                  <Layout>
                    <SplitsPage />
                  </Layout>
                }
              />
              <Route
                path="/friends"
                element={
                  <Layout>
                    <FriendsPage />
                  </Layout>
                }
              />
            </Route>

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
