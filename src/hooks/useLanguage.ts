"use client";

import { useCallback, useEffect, useState } from "react";

export type Language = "en" | "zh";

const STORAGE_KEY = "language";
const CHANGE_EVENT = "stock-skills:language-changed";

function getInitialLanguage(): Language {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "zh" ? "zh" : "en";
}

function applyLanguage(language: Language) {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
}

export function useLanguage() {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    applyLanguage(language);
    localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    const handleChange = () => setLanguage(getInitialLanguage());
    window.addEventListener(CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(CHANGE_EVENT, handleChange);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => {
      const next = prev === "en" ? "zh" : "en";
      localStorage.setItem(STORAGE_KEY, next);
      window.dispatchEvent(new Event(CHANGE_EVENT));
      return next;
    });
  }, []);

  return { language, toggleLanguage } as const;
}
