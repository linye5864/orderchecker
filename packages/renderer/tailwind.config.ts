import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

const config: Config = {
  darkMode: ["class"],
  // NOTE: Use repo-root-relative globs to make Tailwind content scanning work
  // even when the renderer is built from other working directories (e.g. apps/desktop).
  content: ["./packages/renderer/src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554"
        },
        gray: {
          50: "#fafafa",
          100: "#f5f5f5",
          200: "#e5e5e5",
          300: "#d4d4d4",
          400: "#a3a3a3",
          500: "#737373",
          600: "#525252",
          700: "#404040",
          800: "#262626",
          900: "#171717",
          950: "#0a0a0a"
        },
        success: {
          DEFAULT: "#16a34a",
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d"
        },
        warning: {
          DEFAULT: "#ca8a04",
          50: "#fefce8",
          100: "#fef9c3",
          200: "#fef08a",
          300: "#fde047",
          400: "#facc15",
          500: "#eab308",
          600: "#ca8a04",
          700: "#a16207",
          800: "#854d0e",
          900: "#713f12"
        },
        error: {
          DEFAULT: "#dc2626",
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#f87171",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
          800: "#991b1b",
          900: "#7f1d1d"
        },
        info: {
          DEFAULT: "#0284c7",
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e"
        }
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        full: "9999px"
      },
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
        "2xl": "24px",
        sidebar: "220px",
        "sidebar-collapsed": "60px",
        topbar: "56px"
      },
      fontSize: {
        xs: ["11px", { lineHeight: "1.4", fontWeight: "600" }],
        sm: ["12px", { lineHeight: "1.5", fontWeight: "400" }],
        base: ["13px", { lineHeight: "1.5", fontWeight: "400" }],
        lg: ["14px", { lineHeight: "1.4", fontWeight: "600" }],
        xl: ["16px", { lineHeight: "1.3", fontWeight: "600" }],
        "2xl": ["18px", { lineHeight: "1.2", fontWeight: "700" }],
        "3xl": ["24px", { lineHeight: "1.1", fontWeight: "700" }]
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Microsoft YaHei",
          "sans-serif"
        ],
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"]
      },
      fontWeight: {
        normal: "400",
        medium: "500",
        semibold: "600",
        bold: "700"
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0, 0, 0, 0.05)",
        md: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
        lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
        xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        focus: "0 0 0 3px rgba(59, 130, 246, 0.15)"
      },
      transitionDuration: {
        fast: "150ms",
        base: "200ms",
        slow: "300ms",
        slower: "400ms"
      },
      transitionTimingFunction: {
        linear: "linear",
        in: "ease-in",
        out: "ease-out",
        "in-out": "ease-in-out"
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        slideInRight: {
          "0%": { transform: "translateX(400px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" }
        },
        spin: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" }
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "10%, 30%, 50%, 70%, 90%": { transform: "translateX(-10px)" },
          "20%, 40%, 60%, 80%": { transform: "translateX(10px)" }
        }
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-in-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
        spin: "spin 0.8s linear infinite",
        shake: "shake 0.5s ease-in-out"
      },
      screens: {
        sm: "375px",
        md: "768px",
        lg: "1024px",
        xl: "1440px"
      },
      zIndex: {
        drawer: "2000",
        dropdown: "1000",
        sticky: "999",
        modal: "1000",
        tooltip: "9999"
      }
    }
  },
  plugins: [forms]
};

export default config;
