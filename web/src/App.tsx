import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { NewRequest } from "./pages/NewRequest";
import { DocumentDetail } from "./pages/DocumentDetail";
import { Sign } from "./pages/Sign";
import { Verify } from "./pages/Verify";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sent" element={<Dashboard onlySent />} />
        <Route path="/new" element={<NewRequest />} />
        <Route path="/documents/:id" element={<DocumentDetail />} />
        <Route path="/sign/:token" element={<Sign />} />
        <Route path="/verify" element={<Verify />} />
      </Routes>
    </BrowserRouter>
  );
}
