import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ClientPage from './pages/ClientPage'
import { AdminDetail, AdminList } from './pages/Admin'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/c/:token" element={<ClientPage />} />
        <Route path="/admin" element={<AdminList />} />
        <Route path="/admin/:token" element={<AdminDetail />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
