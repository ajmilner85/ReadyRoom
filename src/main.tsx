import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { WebSocketProvider } from './context/WebSocketContext'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/auth/ProtectedRoute'
import AuthCallback from './components/auth/AuthCallback'
import ResetPassword from './components/auth/ResetPassword'
import { registerWakeHandlers, wake } from './utils/wake'

// Import debug utilities for development
import './utils/debugUtils.ts'

// Import attendance report service to expose console command
import './utils/attendanceReportService.ts'

// Register wake handlers for tab visibility/resume events
registerWakeHandlers()
wake() // optional: wake once on initial load

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <WebSocketProvider>
          <Routes>
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            <Route path="/*" element={
              <ProtectedRoute>
                <App />
              </ProtectedRoute>
            } />
          </Routes>
        </WebSocketProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
