import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
  safelist: [
    'bg-blue-500', 'bg-blue-600', 
    'bg-purple-500', 'bg-purple-600',
    'bg-orange-500', 'bg-orange-600',
    'bg-green-500', 'bg-green-600',
  ],
} satisfies Config;
