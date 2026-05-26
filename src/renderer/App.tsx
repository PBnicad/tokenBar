import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Shell } from './components/Shell'
import { Dashboard } from './pages/Dashboard'
import { Models } from './pages/Models'
import { Sessions } from './pages/Sessions'
import { Usage } from './pages/Usage'

export default function App() {
  return (
    <HashRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/models" element={<Models />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/usage" element={<Usage />} />
        </Routes>
      </Shell>
    </HashRouter>
  )
}
