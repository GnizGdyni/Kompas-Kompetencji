# Kompas Kompetencji (React + Vite + Supabase)

Aplikacja **dla przełożonych**. Pracownik = obiekt w bazie (`employees`), bez konta.

## Start

```bash
cd kompas-app
npm install
npm run dev
```

http://localhost:5173

## Env

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

## Supabase — kolejność migracji

1. `001_foundation.sql` (jeśli świeży projekt)
2. `003_grants.sql` (jeśli było permission denied)
3. `002_fix_profiles_rls.sql` (opcjonalnie)
4. **`004_employees_as_objects.sql`** ← pracownik jako obiekt  
5. **`005_process_list_and_wizard.sql`** ← lista procesów + kreator

Potem: http://localhost:5173/dashboard → „+ Dodaj pracownika”.
