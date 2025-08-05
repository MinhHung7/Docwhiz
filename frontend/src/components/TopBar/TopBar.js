import React from "react";
import { FaGlobe } from "react-icons/fa";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../SupabaseClient/SupabaseClient";
import { useEffect } from "react";
import "./TopBar.css"; // adjust path if styles are global

const TopBar = ({ currentLang, changeLanguage }) => {
  const { t } = useTranslation();

  const [avatarUrl, setAvatarUrl] = useState("/assets/avatar.jpg");
  const [userName, setUserName] = useState("Guest");

  const [showLangMenu, setShowLangMenu] = useState(false);

  const handleLangChange = (lang) => {
    changeLanguage(lang);
    setShowLangMenu(false);
  };

  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const metadata = user.user_metadata || {};
        setAvatarUrl(metadata.picture || "/assets/avatar.jpg");
        setUserName(metadata.name || metadata.full_name || "User");
      }
    };
    fetchUser();
  }, []);

  return (
    <div className="topbar">
      <div className="logo-wrapper">
        <img src="/assets/logo.png" alt="Logo" className="logo-img" />
        <h2 class="logo-text">Docwhiz</h2>
      </div>
      <nav className="nav-links">
        <a href="/login">{t("home")}</a>
        <a href="#">{t("logout")}</a>
        <div className="lang-selector">
          <button
            className="lang-button"
            onClick={() => setShowLangMenu(!showLangMenu)}
          >
            <FaGlobe /> {currentLang.toUpperCase()}
          </button>
          {showLangMenu && (
            <div className="lang-dropdown">
              <div onClick={() => handleLangChange("en")}>🇬🇧 English</div>
              <div onClick={() => handleLangChange("vi")}>🇻🇳 Tiếng Việt</div>
              <div onClick={() => handleLangChange("ja")}>🇯🇵 日本語</div>
            </div>
          )}
        </div>
        <div className="user-profile">
          <img src={avatarUrl} alt="User Avatar" className="user-avatar" />
          <div className="user-info">
            <div className="user-name">{userName}</div>
            <div className="user-plan">Free</div>
          </div>
        </div>
      </nav>
    </div>
  );
};

export default TopBar;
