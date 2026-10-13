import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Home } from './components/Home.js';
import { RoomPage } from './components/RoomPage.js';
import { useAppLock } from './hooks/useAppLock.js';

export const App: React.FC = () => {
  const { isBlurred } = useAppLock();

  return (
    <div className={`min-h-screen bg-dark-900 ${isBlurred ? 'privacy-blur' : ''}`}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/r/:slug" element={<RoomPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
};
