import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

// Translation resources - loaded statically for now.
// Dynamic imports can be added later for code-splitting.
import zhCommon from "./locales/zh-CN/common.json";
import zhResearch from "./locales/zh-CN/research.json";
import zhReviews from "./locales/zh-CN/reviews.json";
import zhRun from "./locales/zh-CN/run.json";
import zhSources from "./locales/zh-CN/sources.json";
import zhTicker from "./locales/zh-CN/ticker.json";

import enCommon from "./locales/en-US/common.json";
import enResearch from "./locales/en-US/research.json";
import enReviews from "./locales/en-US/reviews.json";
import enRun from "./locales/en-US/run.json";
import enSources from "./locales/en-US/sources.json";
import enTicker from "./locales/en-US/ticker.json";

const resources = {
  "zh-CN": {
    common: zhCommon,
    research: zhResearch,
    run: zhRun,
    sources: zhSources,
    reviews: zhReviews,
    ticker: zhTicker,
  },
  "en-US": {
    common: enCommon,
    research: enResearch,
    run: enRun,
    sources: enSources,
    reviews: enReviews,
    ticker: enTicker,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    defaultNS: "common",
    ns: ["common", "research", "run", "sources", "reviews", "ticker"],
    fallbackLng: "zh-CN",
    interpolation: {
      escapeValue: false, // React handles escaping
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export default i18n;
