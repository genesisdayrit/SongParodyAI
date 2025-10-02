import "./App.css";
import { Routes, Route, BrowserRouter, useLocation } from 'react-router-dom';
import { useState } from "react";
import Home from './pages/Home'
import CreateParodyPage from './pages/CreateParodyPage'

import reactLogo from "./assets/react.svg";

function App() {

  return (
    <>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create-parody" element={<CreateParodyPage />} />
      </Routes>
    </BrowserRouter>
    </>
  );
}

export default App;
