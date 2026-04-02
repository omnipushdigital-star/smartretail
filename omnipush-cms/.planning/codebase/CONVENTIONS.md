# Conventions

## Code Style

- **Strict TypeScript:** Types are centralized heavily inside `types/index.ts` to enforce explicit shape validation on DB returns. The `any` bypass is utilized on rare legacy components mapped iteratively.
- **Component Style:** Highly functional React components. Direct inline-styling or simple class-based layout via global `index.css` is routinely used instead of heavy styled-component libraries, keeping the DOM fast.
- **Dependency Tracking:** Hooks (`useEffect`, `useCallback`, `useMemo`) meticulously enforce strict dependency arrays, though occasionally skipped intentionally when triggering specific player loop routines via manual event listeners.

## React State Handling

- Substantial adoption of standard hooks paradigm for local state.
- Forms are managed generally using basic `useState` mapping objects instead of high-overhead form context libraries to maintain fast runtime cycles.

## Error Handling

- **Admin Dashboard:** Universal `react-hot-toast` captures. Raw error objects thrown from the Supabase API are caught, formatted, and exposed to the user seamlessly.
- **Edge Layer:** Relies on robust `try/catch` encapsulation parsing JWT tokens and throwing specific `new Response(..., { status: 4xxx })` constructs conforming to the Edge Runtime requirements.

## Naming

- **Files:** PascalCase for React components and pages (`PlaylistsPage.tsx`). Kebab-case for Edge Functions directory/Deno modules (`device-heartbeat`).
- **CSS:** Standard BEM or declarative dash tokens (`btn-primary`, `form-group`).

## Edge Functions
- Always written in standard Deno TypeScript. Always rely on injected environment secrets (`Deno.env.get(...)`).
