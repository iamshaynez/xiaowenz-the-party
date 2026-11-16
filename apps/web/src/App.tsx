import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { RoomPage } from './pages/RoomPage';
import { browserServices } from './services/browser';
import type { PartyServices } from './services/types';

export function App({ services = browserServices }: { services?: PartyServices }) {
  return (
    <Routes>
      <Route path="/" element={<HomePage services={services} />} />
      <Route path="/r/:code" element={<RoomPage services={services} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
