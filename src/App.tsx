import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store';
import { AppLayout } from './components/layout/AppLayout';
import { Login } from './pages/Login';
import { SpacesLanding } from './pages/SpacesLanding';
import { Dashboard } from './pages/Dashboard';
import { TopologyLab } from './pages/TopologyLab';
import { Security } from './pages/Security';
import { Governance } from './pages/Governance';
import { AIChat } from './pages/AIChat';
import { DataSources } from './pages/DataSources';
import { VisualModel } from './pages/VisualModel';
import { CodeCanvas } from './pages/CodeCanvas';
import { Observability } from './pages/Observability';
import { Settings } from './pages/Settings';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useStore(state => state.user);
  if (!user?.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={
          <ProtectedRoute>
            <SpacesLanding />
          </ProtectedRoute>
        } />

        <Route path="/space/:spaceId" element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="visuals" element={<VisualModel />} />
          <Route path="code" element={<CodeCanvas />} />
          <Route path="chat" element={<AIChat />} />
          <Route path="topology" element={<TopologyLab />} />
          <Route path="governance" element={<Governance />} />
          <Route path="security" element={<Security />} />
          <Route path="data" element={<DataSources />} />
          <Route path="observability" element={<Observability />} />
          <Route path="settings" element={<Settings />} />
          
          {/* Fallback routes for unbuilt tabs */}
          <Route path="forecast" element={<div className="p-8 text-center text-slate-500">Forecasting Module (In Development)</div>} />
        </Route>
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
