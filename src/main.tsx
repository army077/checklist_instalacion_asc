import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminAuthProvider, RequireAdminAuth } from './auth/AdminAuth'
import ClientPage from './pages/ClientPage'
import { AdminConfig, AdminDetail, AdminList } from './pages/Admin'
import AdminLogin from './pages/AdminLogin'
import Conversations from './pages/Conversations'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminAuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/c/:token" element={<ClientPage />} />
          <Route path="/confirm/:orderId/:conversationId" element={<ClientPage />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<RequireAdminAuth><AdminList /></RequireAdminAuth>} />
          <Route path="/admin/config" element={<RequireAdminAuth><AdminConfig /></RequireAdminAuth>} />
          <Route path="/admin/conversaciones" element={<RequireAdminAuth><Conversations /></RequireAdminAuth>} />
          <Route path="/admin/:token" element={<RequireAdminAuth><AdminDetail /></RequireAdminAuth>} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </BrowserRouter>
    </AdminAuthProvider>
  </StrictMode>,
)
