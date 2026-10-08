# Running SAZO on your own computer

This runs everything on your machine with made-up (simulated) data. No real text messages are sent: sign-in codes appear in the API window.

## 1. Install once

- **Node.js 22 or newer** — https://nodejs.org (the "LTS" installer). Check with `node -v`.
- **Docker Desktop** — https://www.docker.com/products/docker-desktop (runs the database). Start it and wait until it says it is running.
- **Git** — https://git-scm.com (macOS: already there, or `xcode-select --install`).

## 2. Get the code

```bash
git clone https://github.com/sazoapp-global/Sazo_cars.git
cd Sazo_cars
npm install
```

The repository is private: Git will ask you to sign in to GitHub (use a personal access token as the password, or GitHub Desktop / `gh auth login`).

## 3. Start the database and load the sample cars

```bash
npm run dev:services          # starts Postgres and Redis in Docker
npm run build                 # builds the shared packages
npm run db:migrate            # creates the tables
npm run seed -w @sazo/api     # loads the 27 sample cars
```

No settings file is needed — the defaults point at the Docker database. (`.env.example` lists what you can change.)

## 4. Make yourself a SAZO admin

```bash
npm run create-admin -w @sazo/api -- --phone +256772000001 --name "Your Name"
```

Use your own number in `+256…` form. It is only stored on your computer.

## 5. Start the three apps — one terminal window each

| Window | Command | Open |
|---|---|---|
| 1. API | `npm run dev -w @sazo/api` | http://localhost:3000/v1/health |
| 2. Website | `npm run dev -w @sazo/web` | http://localhost:3001 |
| 3. Garage / inspector phone app | `npm run dev -w @sazo/garage` | http://localhost:3002 |

Leave them running. Stop with `Ctrl + C`.

## 6. Try it

- **Sign in:** enter your phone number on the website. The code appears in **window 1** as `Your SAZO code is 123456`.
- **Admin console:** http://localhost:3001/admin (after signing in with the admin number from step 4).
- **Sample plates to search:**
  - `UBJ 214K` — clean Toyota Harrier
  - `UAX 123A` — cloned (copied) plate
  - `UBC 718P` — mileage rolled back
  - `UBK 482M` — Toyota Premio with service history
- **Garage app:** sign up a business on the website ("For businesses"), approve it yourself in the admin console, then sign in at http://localhost:3002.
- **Phone testing:** on the same Wi-Fi, open `http://<your computer's IP>:3002` on the phone.

## 7. Run the tests (optional)

```bash
npm test          # unit and API tests (API tests need TEST_DATABASE_URL — see README)
npm run db:test   # database tests
npm run lint
```

## Starting again tomorrow

Start Docker Desktop, then `npm run dev:services` and the three windows from step 5.

## Clearing everything

`docker compose down -v` deletes the database. Then repeat step 3 onwards.

## If something goes wrong

- **`ECONNRESET` or `ECONNREFUSED` when migrating:** the database isn't ready. Check Docker Desktop is running, then `docker compose ps` — `postgres` should say `healthy`. If it says `restarting` or is missing, `docker compose logs postgres` shows why. `npm run dev:services` now waits until it is healthy, and `db:migrate` waits up to a minute.
- **Another PostgreSQL on this computer** (common on Windows if PostgreSQL was ever installed): it takes port 5432 first. Check with `netstat -ano | findstr :5432` (Windows) or `lsof -i :5432` (Mac). Either stop it (Windows: Services → `postgresql-x64-…` → Stop), or move SAZO's database to 5433: in `docker-compose.yml` change `"5432:5432"` to `"5433:5432"`, run `npm run dev:services` again, and in **every** window first set:
  - Windows (Command Prompt): `set DATABASE_URL=postgres://sazo:sazo@localhost:5433/sazo`
  - Windows (PowerShell): `$env:DATABASE_URL="postgres://sazo:sazo@localhost:5433/sazo"`
  - Mac/Linux: `export DATABASE_URL=postgres://sazo:sazo@localhost:5433/sazo`
- **Website shows an error about the API:** window 1 isn't running or has stopped. Look at its last lines.
- **Odd errors after pulling new code:** run `npm install`, `npm run build` and `npm run db:migrate` again.
