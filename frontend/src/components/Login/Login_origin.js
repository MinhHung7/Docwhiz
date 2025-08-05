import React from "react";
import "./Login.css";
import { supabase } from "../SupabaseClient/SupabaseClient";

const Login = () => {
  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "http://localhost:3000/oauth/callback",
      },
    });

    if (error) {
      console.error("Login error:", error.message);
    }
  };

  return (
    <div className="container">
      <div className="topbar">
        <div className="logo">
          <img src="/assets/logo.png" alt="Logo" className="logo-img" />
          <span className="logo-text">FILEWHIZ</span>
        </div>

        <div className="nav">
          <a href="#pricing" className="link">
            Pricing
          </a>
          <a href="#contact" className="link">
            Contact
          </a>
        </div>
      </div>

      <div className="body">
        <div className="left">
          <h2>Filewhiz</h2>
          <p>Study now </p>
          <p>
            with <span class="gradient-text">FILEWHIZ</span>
          </p>
          <p className="slogan">Learn better with your own materials.</p>
          <button className="button" onClick={handleLogin}>
            Sign in with Google
          </button>
        </div>

        <div className="right">
          {/* Bạn có thể thêm ảnh minh họa hoặc animation ở đây */}
          <img
            src="/assets/home_page.png"
            alt="Hero Image"
            className="hero-img"
          />
        </div>
      </div>
    </div>
  );
};

export default Login;
