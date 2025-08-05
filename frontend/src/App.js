// App.js
import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./components/SupabaseClient/SupabaseClient";
import Login from "./components/Login/Login";
import Main from "./components/Main/Main";
import OAuthCallback from "./components/OAuthCallback/OAuthCallback";

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setLoading(false);
    });
  }, []);

  if (loading) return;

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={user ? <Navigate to="/main" /> : <Navigate to="/login" />}
        />
        <Route
          path="/main"
          element={user ? <Main /> : <Navigate to="/login" />}
        />
        <Route
          path="/login"
          // element={!user ? <Login /> : <Navigate to="/main" />}
          element={<Login />}
        />
        <Route path="/oauth/callback" element={<OAuthCallback />} />{" "}
        {/* 👈 THÊM DÒNG NÀY */}
      </Routes>
    </BrowserRouter>
  );
};

export default App;
