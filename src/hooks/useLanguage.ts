"use client";

import { useCallback, useEffect, useState } from "react";

export type Language = "en" | "zh";

const STORAGE_KEY = "language";
const CHANGE_EVENT = "stock-skills:language-changed";

function getInitialLanguage(): Language {
  if (typeof window === "undefined") return "zh";
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "en" ? "en" : "zh";
}

function applyLanguage(language: Language) {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
}

export function useLanguage() {
  // Always start with "zh" to match the server render, then sync from
  // localStorage after hydration to avoid SSR mismatch.
  const [language, setLanguage] = useState<Language>("zh");
  const [hydrated, setHydrated] = useState(false);

  // Sync from localStorage on first client render
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en") setLanguage("en");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    applyLanguage(language);
    localStorage.setItem(STORAGE_KEY, language);
  }, [language, hydrated]);

  useEffect(() => {
    const handleChange = () => setLanguage(getInitialLanguage());
    window.addEventListener(CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(CHANGE_EVENT, handleChange);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => {
      const next = prev === "en" ? "zh" : "en";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
    // Defer the event so other components' setState calls happen after the
    // current render cycle, avoiding "Cannot update while rendering" warnings.
    queueMicrotask(() => window.dispatchEvent(new Event(CHANGE_EVENT)));
  }, []);

  return { language, toggleLanguage } as const;
}
