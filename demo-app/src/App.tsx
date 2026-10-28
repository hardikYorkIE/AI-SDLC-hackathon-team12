import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import { BrokenCheckout } from './pages/BrokenCheckout';
import { BrokenDashboard } from './pages/BrokenDashboard';
import { GoodLanding } from './pages/GoodLanding';
import { NewFeature } from './pages/NewFeature';

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/good-landing" replace />} />
          <Route path="/broken-checkout" element={<BrokenCheckout />} />
          <Route path="/broken-dashboard" element={<BrokenDashboard />} />
          <Route path="/good-landing" element={<GoodLanding />} />
          <Route path="/new-feature" element={<NewFeature />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
