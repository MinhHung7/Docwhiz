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
    <div>
      <div className="glow left"></div>
      <div className="glow right"></div>
      <div className="stars"></div>

      <div className="container">
        <div className="hero-logo">
          <img src="/assets/logo.png" alt="Docwhiz Logo" className="logo" />
          <h1 className="logo-text">Docwhiz</h1>
        </div>

        <h1 className="headline">Ask. Note. Map. Master</h1>
        <p className="subheadline">
          Turn PDFs into active knowledge: ask questions, take custom notes, and
          build visual mindmaps to understand deeply and retain longer.
        </p>

        <div className="features">
          <div className="feature-item">🧠 Converse with Knowledge</div>
          <div className="feature-item">📝 Craft Intelligent Notes</div>
          <div className="feature-item">🗺️ Illuminate Ideas Visually</div>
        </div>

        <button className="signup-button" onClick={handleLogin}>
          Sign Up with Google
        </button>

        <div className="feature-section">
          <div className="feature-image">
            <img src="/assets/home_img1.png" alt="AI Chatbot" />
          </div>

          <div className="feature-description">
            <h2>Learn with Docwhiz's chat bot.</h2>
            <p>
              Dive into seamless conversations with your documents. Powered by
              AI, Docwhiz transforms static PDFs into intelligent dialogue —
              making comprehension faster, deeper, and truly engaging.
            </p>
            <div className="features-list">
              <div className="feature-item">💬 Ask Anything, Instantly</div>
              <div className="feature-item">📖 Understand with Clarity</div>
              <div className="feature-item">
                ⚡ Learn at the Speed of Thought
              </div>
            </div>
          </div>
        </div>
        <div className="feature-section">
          <div className="feature-description">
            <h2>Summarize PDFs with AI Precision.</h2>
            <p>
              Skip the scroll. Let Docwhiz distill lengthy PDFs into sharp,
              structured summaries — helping you grasp the key ideas in seconds,
              not hours.
            </p>
            <div className="features-list">
              <div className="feature-item">🧠 Instant Insight Extraction</div>
              <div className="feature-item">📌 Key Points, No Fluff</div>
              <div className="feature-item">⚙️ AI-Tuned for Accuracy</div>
            </div>
          </div>
          <div className="feature-image">
            <img src="/assets/home_img2.png" alt="AI Summary" />
          </div>
        </div>

        <div className="feature-section">
          <div className="feature-image">
            <img src="/assets/home_img3.png" alt="Mindmap" />
          </div>

          <div className="feature-description">
            <h2>Customize your own mindmap</h2>
            <p>
              Create stunning, customizable mindmaps that reflect the way you
              think. Organize knowledge visually, connect concepts effortlessly,
              and gain clarity through structure.
            </p>
            <div className="features-list">
              <div className="feature-item">🧩 Organize Knowledge Visually</div>
              <div className="feature-item">🎨 Fully Customizable Contents</div>
              <div className="feature-item">🗺️ Clarity Through Structure</div>
            </div>
          </div>
        </div>

        <footer>© 2025 Docwhiz</footer>
      </div>
    </div>
  );
};

export default Login;
