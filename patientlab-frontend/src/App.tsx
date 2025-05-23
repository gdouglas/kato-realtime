import { Routes, Route, Navigate } from 'react-router-dom';
import SpeakPage from './routes/SpeakPage';
import WritePage from './routes/WritePage';

export default function App() {

  return (
    <div className="h-screen w-screen bg-gray-50">
      <Routes>
        <Route path="/speak" element={<SpeakPage />} />
        <Route path="/write" element={<WritePage />} />
        <Route path="/*" element={<Navigate to="/speak" replace />} />
      </Routes>
    </div>
  );
}