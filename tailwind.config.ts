import type { Config } from "tailwindcss";

export default {
	darkMode: "class", // Change to single string instead of array for cleaner config
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			colors: {
				// Keep CSS variable-based colors for shadcn compatibility
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				// Add new design system colors
				gray: {
					950: '#0a0a0a',
					900: '#111111',
					800: '#1f1f1f',
					700: '#2e2e2e',
					600: '#4a4a4a',
					500: '#737373',
					400: '#9ca3af',
					300: '#d1d5db',
					200: '#e5e7eb',
					100: '#f3f4f6',
					50: '#f9fafb'
				},
				green: {
					950: '#052e16',
					900: '#14532d',
					800: '#166534',
					700: '#15803d',
					600: '#16a34a',
					500: '#22c55e',
					400: '#4ade80',
					300: '#86efac',
					200: '#bbf7d0',
					100: '#dcfce7',
					50: '#f0fdf4'
				},
				red: {
					950: '#450a0a',
					900: '#7f1d1d',
					800: '#991b1b',
					700: '#b91c1c',
					600: '#dc2626',
					500: '#ef4444',
					400: '#f87171',
					300: '#fca5a5',
					200: '#fecaca',
					100: '#fee2e2',
					50: '#fef2f2'
				},
				purple: {
					950: '#3b0764',
					900: '#581c87',
					800: '#6b21a8',
					700: '#7c3aed',
					600: '#9333ea',
					500: '#a855f7',
					400: '#c084fc',
					300: '#d8b4fe',
					200: '#e9d5ff',
					100: '#f3e8ff',
					50: '#faf5ff'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				'fade-in': {
					from: {
						opacity: '0'
					},
					to: {
						opacity: '1'
					}
				},
				'slide-up': {
					from: {
						opacity: '0',
						transform: 'translateY(20px)'
					},
					to: {
						opacity: '1',
						transform: 'translateY(0)'
					}
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'fade-in': 'fade-in 0.5s ease-out',
				'slide-up': 'slide-up 0.3s ease-out'
			},
			backgroundImage: {
				'gradient-primary': 'var(--gradient-primary)',
				'gradient-subtle': 'var(--gradient-subtle)'
			},
			boxShadow: {
				'book': 'var(--shadow-book)',
				'elegant': 'var(--shadow-card)'
			},
			transitionTimingFunction: {
				'smooth': 'var(--transition-smooth)'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
