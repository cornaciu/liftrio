<div align="center">

<img src="assets/banner.svg" alt="Liftrio — training, nutrition, and progress" width="720">

# Liftrio

### Train well. Fuel well. Keep progressing.

Liftrio brings strength training, nutrition tracking, and progress insights together in one mobile-friendly app.

[**Open Liftrio**](https://liftrio.vercel.app) · [**Explore the source**](https://github.com/cornaciu/liftrio)

<br>

![PWA](https://img.shields.io/badge/PWA-installable-a3e635?style=flat-square)
![React](https://img.shields.io/badge/React-19-38bdf8?style=flat-square&logo=react&logoColor=white)
![Vercel](https://img.shields.io/badge/hosting-Vercel-black?style=flat-square&logo=vercel)
![Supabase](https://img.shields.io/badge/data-Supabase-3ecf8e?style=flat-square&logo=supabase)
![License](https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square)

</div>

---

## One place for training and nutrition

- **Plan and log workouts** with routines, exercises, sets, reps, weights, and rest timers.
- **Track progress** through workout history, statistics, muscle-group balance, personal records, and body weight.
- **Log nutrition** with calories, macros, fiber, sodium, food diary, and daily targets.
- **Import meals from Eat & Track** and keep imported foods in your personal library.
- **Work with a coach** by sharing selected data and receiving scheduled workouts with the client's consent.
- **Stay in sync across devices** with a mobile-friendly progressive web app and a shared profile.

Workout calorie estimates are approximate and intended for general fitness tracking.

## Built to grow

Liftrio is designed to support a broader fitness experience over time, from individual workout and nutrition tracking to coach-supported training and richer progress insights. Its current React and Vite frontend, Vercel Functions API, and Supabase Postgres data layer provide a flexible foundation for future features.

## Use Liftrio on your phone

Open the app in Safari or Chrome and choose **Add to Home Screen**. Liftrio runs as a progressive web app and opens in its own app-like window.

Existing profiles created on the legacy hostname can continue signing in there while their passkeys remain tied to that address: [open-gym-bay.vercel.app](https://open-gym-bay.vercel.app).

## Development and deployment

The production version of Liftrio is maintained on the [vercel-supabase branch](https://github.com/cornaciu/liftrio/tree/vercel-supabase). The interface uses React and Vite, the API runs on Vercel Functions, and user profiles sync through Supabase Postgres.

To run the app locally:

```bash
git clone --branch vercel-supabase https://github.com/cornaciu/liftrio.git
cd liftrio
npm install --prefix frontend
npm run dev --prefix frontend
```

For setup and deployment details, see the [Vercel + Supabase guide](https://github.com/cornaciu/liftrio/blob/vercel-supabase/docs/VERCEL.md).

Build the production frontend:

```bash
npm run build
```

## Origin and license

Liftrio is a customized version derived from [openGym by Duarte Santos](https://github.com/DuarteSantos8/openGym). It retains the AGPL-3.0 license and the attribution in [NOTICE.md](NOTICE.md). This repository's code and contributions are distributed under the terms of [LICENSE](LICENSE).

The exercise library uses [exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset); see NOTICE for attribution and license details.

---

<div align="center">
<sub>Liftrio · Train with purpose. Fuel your progress.</sub>
</div>
