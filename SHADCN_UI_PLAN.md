# ShockProof shadcn/ui Plan

Use this when converting the static prototype into a real Next.js + TypeScript app.

## 1. Create / Initialize

For a new app:

```bash
npx create-next-app@latest shockproof-app
cd shockproof-app
npx shadcn@latest init
```

Choose:

- TypeScript: yes
- App Router: yes
- Tailwind: yes
- Import alias: `@/*`
- shadcn style: `new-york`
- Base color: `neutral`
- CSS variables: yes

For an existing Next.js app:

```bash
npx shadcn@latest init
```

## 2. Add Components

```bash
npx shadcn@latest add button card badge tabs select switch checkbox progress alert sheet separator avatar
```

Add the auth blocks you selected:

```bash
npx shadcn@latest add signup-03
npx shadcn@latest add login-03
```

Use `lucide-react` icons:

```bash
npm install lucide-react
```

## 3. Theme Tokens

Paste this into `app/globals.css` after Tailwind imports.

```css
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Syne:wght@500;600;700;800&display=swap");

:root {
  --background: 214 61% 7%;
  --foreground: 210 100% 99%;
  --card: 217 50% 10%;
  --card-foreground: 210 100% 99%;
  --popover: 217 50% 9%;
  --popover-foreground: 210 100% 99%;
  --primary: 218 100% 56%;
  --primary-foreground: 0 0% 100%;
  --secondary: 217 24% 16%;
  --secondary-foreground: 210 100% 99%;
  --muted: 217 24% 16%;
  --muted-foreground: 216 18% 67%;
  --accent: 198 100% 58%;
  --accent-foreground: 214 61% 7%;
  --destructive: 358 74% 59%;
  --destructive-foreground: 0 0% 100%;
  --border: 216 24% 20%;
  --input: 216 24% 20%;
  --ring: 214 100% 59%;
  --radius: 0.75rem;
}

body {
  font-family: "Inter", sans-serif;
  background:
    radial-gradient(circle at 4% 4%, hsl(218 100% 56% / 0.82), transparent 32%),
    radial-gradient(circle at 90% 92%, hsl(226 100% 70% / 0.62), transparent 30%),
    linear-gradient(135deg, #121a2a 0%, #07101c 44%, #050913 100%);
}

.font-display {
  font-family: "Syne", "Inter", sans-serif;
}
```

## 4. App Structure

Recommended screens:

- `app/sign-in/page.tsx`
- `app/(app)/dashboard/page.tsx`
- `app/(app)/capture/page.tsx`
- `app/(app)/advice/page.tsx`
- `app/(app)/settings/page.tsx`
- `components/app-shell.tsx`
- `components/top-nav.tsx`
- `components/risk-ring.tsx`
- `components/meter-capture-card.tsx`
- `components/advice-card.tsx`

## 5. UI Direction

- Keep Sign In separate and first.
- After sign-in, keep four tabs at the top: Dashboard, Capture, Advice, Settings.
- Use `Card` for metrics and panels.
- Use `Button` for primary actions.
- Use `Tabs` or a custom shadcn-style nav for the four top sections.
- Use `Select` for State, Discom, and billing cycle.
- Use `Switch` for alerts, Hinglish advice, and realtime updates.
- Use `Badge` for Realtime, Processing, Completed, and 96% read confidence.
- Use `Progress` or a custom SVG ring for slab risk.
