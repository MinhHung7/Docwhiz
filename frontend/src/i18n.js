import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// File chứa các bản dịch
import translationEN from "./locales/en/translation.json";
import translationVI from "./locales/vi/translation.json";
import translationJA from "./locales/ja/translation.json";

const resources = {
  en: { translation: translationEN },
  vi: { translation: translationVI },
  ja: { translation: translationJA },
};

i18n
  .use(LanguageDetector) // Phát hiện ngôn ngữ trình duyệt
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en", // Ngôn ngữ mặc định
    interpolation: { escapeValue: false },
  });

export default i18n;
