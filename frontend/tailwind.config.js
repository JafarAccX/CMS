/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      /**
       * Typography — Inter for body, Fraunces for display headings,
       * JetBrains Mono for code/IDs/timestamps.
       */
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif', '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Segoe UI Symbol"', '"Noto Color Emoji"'],
        serif: ['Fraunces', '"Cormorant Garamond"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', '"SF Mono"', 'monospace'],
      },

      colors: {
        /**
         * Accent scale — electric blue #4f7cff
         * 50–200 are alpha-based for layering on dark surfaces.
         * 300 is the readable text tint, 400/500 the primary hue,
         * 600–900 for pressed/darker states.
         */
        accent: {
          50: 'rgba(79, 124, 255, 0.06)',
          100: 'rgba(79, 124, 255, 0.14)',
          200: 'rgba(79, 124, 255, 0.24)',
          300: '#6e93ff',
          400: '#4f7cff',
          500: '#4f7cff',
          600: '#2f5fea',
          700: '#1a4ad4',
          800: '#1038a6',
          900: '#0a2878',
        },

        /**
         * Surface scale — deep navy backgrounds.
         * DEFAULT (#07090f) is the root bg; 50–500 ascend toward lighter navy.
         * Used for panels, inputs, cards, and hover states.
         */
        surface: {
          DEFAULT: '#07090f',
          50: '#0d1018',
          100: '#131826',
          200: '#1a2033',
          300: '#232a40',
          400: '#2c344d',
          500: '#3a4563',
        },

        /**
         * Hairline borders — cool-tinted translucent separators.
         * DEFAULT is subtle (8% opacity), strong is more visible (14%).
         */
        hairline: {
          DEFAULT: 'rgba(148, 175, 230, 0.08)',
          strong: 'rgba(148, 175, 230, 0.14)',
        },

        /**
         * Role colors — oklch-based for perceptual uniformity.
         * admin=coral, mentor=cyan, mod=violet, learner=muted blue.
         * Used in chips (.chip-admin etc.) and avatar accent rings.
         */
        role: {
          admin: 'oklch(0.70 0.15 25)',
          mentor: 'oklch(0.78 0.12 215)',
          mod: 'oklch(0.70 0.16 290)',
          learner: 'oklch(0.72 0.05 240)',
        },
      },

      /**
       * Text color tiers (lightest to darkest):
       *   primary — headings, names, active content
       *   muted   — body text, descriptions
       *   dim     — secondary labels, metadata
       *   faint   — disabled, placeholder-level
       */
      textColor: {
        primary: '#e8edf7',
        muted: '#a3aec7',
        dim: '#6c7793',
        faint: '#424c64',
      },

      borderRadius: {
        'sm': '6px',
        'DEFAULT': '10px',
        'lg': '14px',
        'xl': '20px',
      },

      /**
       * Shadow tokens:
       *   card            — standard card elevation (inset highlight + deep drop)
       *   glow            — accent-ringed emphasis (CTAs, focused cards)
       *   btn             — primary button depth
       *   inner-highlight — subtle inset border for inputs/composer
       */
      boxShadow: {
        'card': '0 1px 0 rgba(255,255,255,0.05) inset, 0 12px 32px -12px rgba(0,0,0,0.6)',
        'glow': '0 0 0 1px rgba(79,124,255,0.32), 0 14px 40px -10px rgba(79,124,255,0.45)',
        'btn': '0 1px 0 rgba(255,255,255,0.18) inset, 0 4px 14px -4px rgba(79,124,255,0.45)',
        'inner-highlight': '0 1px 0 rgba(255,255,255,0.04) inset, 0 1px 2px rgba(0,0,0,0.4)',
      },

      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'bounce-dot': 'bounceDot 1.4s infinite ease-in-out both',
        'pulse-soft': 'pulseSoft 2s infinite',
        'blink': 'blink 1.1s steps(1) infinite',
        'pulse-ring': 'pulseRing 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        bounceDot: {
          '0%, 80%, 100%': { transform: 'scale(0.4)', opacity: '0.4' },
          '40%': { transform: 'scale(1)', opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        blink: {
          '0%, 50%': { opacity: '1' },
          '51%, 100%': { opacity: '0' },
        },
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(79,124,255,0.4)' },
          '100%': { boxShadow: '0 0 0 12px rgba(79,124,255,0)' },
        },
      },
    },
  },
  plugins: [],
}
