/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Newsreader', 'serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        // rounded-[28px]·[24px]·[14px]가 화면 곳곳에 흩어져 있어 이름을 붙였다.
        // 카드류 둥글기는 이 세 단계를 벗어나지 않게 한다.
        card: '28px',
        tile: '24px',
        control: '14px',
      },
      fontSize: {
        // 기본 스케일(xs~2xl)로 표현되지 않으면서 반복 등장하는 크기만 이름을 붙였다.
        // 여기 없는 크기가 필요하면 대개 기본 스케일로 대체할 수 있다.
        '3xs': '10px',
        '2xs': '11px',
        md: '15px',
      },
      colors: {
        'warm-gray': '#7b726f',
        'accent-gold': '#d4af37',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
    },
  },
  plugins: [],
}
