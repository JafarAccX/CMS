/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      /**
       * Typography — Poppins primary (matches design system),
       * Fraunces for display, JetBrains Mono for code/timestamps.
       */
      fontFamily: {
        sans: ['Poppins', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif', '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Segoe UI Symbol"', '"Noto Color Emoji"'],
        serif: ['Fraunces', '"Cormorant Garamond"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', '"SF Mono"', 'monospace'],
      },

      colors: {
        /**
         * Accent scale — electric blue #3b82ff → cyan #00dbe8
         * Matches the HTML design gradient system exactly.
         */
        accent: {
          50:  'rgba(59, 130, 255, 0.06)',
          100: 'rgba(59, 130, 255, 0.14)',
          200: 'rgba(59, 130, 255, 0.24)',
          300: '#afc6ff',   // badge text, active link tint
          400: '#3b82ff',   // primary blue (gradient start)
          500: '#2563eb',
          600: '#1d4ed8',
          700: '#1a4ad4',
          800: '#1038a6',
          900: '#0a2878',
          // Cyan — gradient end color, used for AI spark / live indicators
          cyan: '#00dbe8',
        },

        /**
         * Surface scale — deep navy backgrounds.
         * Exact values from the Figma design system.
         * DEFAULT (#05070a) is the root background.
         */
        surface: {
          DEFAULT: '#05070a',
          50:  '#0a0d12',   // card backgrounds   (rgb 10,13,18)
          100: '#10151d',   // panel backgrounds  (rgb 16,21,29)
          200: '#161e2e',   // elevated panels
          300: '#1e293b',   // strong borders, input bg (rgb 30,41,59)
          400: '#2c344d',
          500: '#3a4563',
        },

        /**
         * Hairline borders — pure white alpha separators.
         * Matches rgba(255,255,255,0.08) used throughout the designs.
         */
        hairline: {
          DEFAULT: 'rgba(255, 255, 255, 0.08)',
          strong:  'rgba(255, 255, 255, 0.14)',
        },

        /**
         * Role colors — oklch-based for perceptual uniformity.
         */
        role: {
          admin:   'oklch(0.70 0.15 25)',
          mentor:  'oklch(0.78 0.12 215)',
          mod:     'oklch(0.70 0.16 290)',
          learner: 'oklch(0.72 0.05 240)',
        },
      },

      /**
       * Text color tiers — exact values from design system:
       *   primary  #e0e3e6  — headings, names, active content
       *   muted    #94a3b8  — body text, descriptions
       *   dim      #6c7793  — secondary labels, metadata
       *   faint    #424c64  — disabled, placeholder-level
       */
      textColor: {
        primary: '#e0e3e6',
        muted:   '#94a3b8',
        dim:     '#6c7793',
        faint:   '#424c64',
      },

      borderRadius: {
        'sm':      '6px',
        'DEFAULT': '10px',
        'lg':      '14px',
        'xl':      '20px',
      },

      /**
       * Shadow tokens — updated to match design glow system.
       */
      boxShadow: {
        'card':             '0 1px 0 rgba(255,255,255,0.05) inset, 0 12px 32px -12px rgba(0,0,0,0.6)',
        'glow':             '0 0 0 1px rgba(59,130,255,0.32), 0 14px 40px -10px rgba(59,130,255,0.45)',
        'btn':              '0 0 14px rgba(59,130,255,0.35), 0 1px 0 rgba(255,255,255,0.18) inset',
        'btn-cyan':         '0 0 14px rgba(0,219,232,0.25), 0 0 28px rgba(59,130,255,0.2)',
        'inner-highlight':  '0 1px 0 rgba(255,255,255,0.04) inset, 0 1px 2px rgba(0,0,0,0.4)',
      },

      animation: {
        'fade-in':    'fadeIn 0.3s ease-out',
        'slide-up':   'slideUp 0.3s ease-out',
        'bounce-dot': 'bounceDot 1.4s infinite ease-in-out both',
        'pulse-soft': 'pulseSoft 2s infinite',
        'blink':      'blink 1.1s steps(1) infinite',
        'pulse-ring': 'pulseRing 2s infinite',
      },
      keyframes: {
        fadeIn:    { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp:   { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        bounceDot: { '0%, 80%, 100%': { transform: 'scale(0.4)', opacity: '0.4' }, '40%': { transform: 'scale(1)', opacity: '1' } },
        pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
        blink:     { '0%, 50%': { opacity: '1' }, '51%, 100%': { opacity: '0' } },
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(59,130,255,0.4)' }, '100%': { boxShadow: '0 0 0 12px rgba(59,130,255,0)' } },
      },
    },
  },
  plugins: [],
}
