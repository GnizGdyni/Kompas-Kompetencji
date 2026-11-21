# Kompas Kompetencji — architektura startowa (MVP)

## Założenie

Aplikacja jest **tylko dla przełożonych** (oraz HR).  
Pracownik **nie loguje się** — jest obiektem w tabeli `employees`, którego przełożony dodaje i ocenia.

## Stack

```
React (Vite) + React Router
Supabase Auth         → logowanie przełożonego / HR
Supabase Postgres     → profiles, employees, evaluation_cases
Vercel                → hosting
```

## Role kont (Auth)

| Rola | Kim jest |
|------|----------|
| `supervisor` | Przełożony — główny użytkownik |
| `hr` | HR / administrator procesu |
| `unit_head` | Kierujący komórką (opcjonalnie) |

`employee` jako konto **nie jest używane**.

## Model danych

```
auth.users + profiles     ← kto się loguje (przełożony)
        │
        ▼
employees                 ← obiekty osób ocenianych (bez Auth)
        │
        ▼
evaluation_cases          ← sprawa oceny (employee_id → employees)
```

## Co dalej

- sprawa pierwszej oceny na wybranym pracowniku
- asystent AI
- PDF arkusza
