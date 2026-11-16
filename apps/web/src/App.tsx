import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { RoomPage } from './pages/RoomPage';
import { browserServices } from './services/browser';
import type { PartyServices } from './services/types';

const CarStyleLabPage = lazy(async () => {
  const module = await import('./pages/CarStyleLabPage');
  return { default: module.CarStyleLabPage };
});

const CarFrameLabPage = lazy(async () => {
  const module = await import('./pages/CarFrameLabPage');
  return { default: module.CarFrameLabPage };
});

export function App({ services = browserServices }: { services?: PartyServices }) {
  return (
    <Routes>
      <Route path="/" element={<HomePage services={services} />} />
      <Route
        path="/lab/car-styles"
        element={(
          <Suspense fallback={<div className="loading-page"><p>正在打开玩具箱…</p></div>}>
            <CarStyleLabPage />
          </Suspense>
        )}
      />
      <Route
        path="/lab/can-drive-frame"
        element={(
          <Suspense fallback={<div className="loading-page"><p>正在准备固定帧…</p></div>}>
            <CarFrameLabPage />
          </Suspense>
        )}
      />
      <Route path="/r/:code" element={<RoomPage services={services} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
