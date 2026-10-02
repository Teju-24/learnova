# Learnova — An AI Tutor That Learns How You Learn

A personalised AI tutor that teaches AI concepts through each learner's own field, skill level, and goal.

**Built for BFWAI Hack26 — PS 03: Personalised AI Tutor for Learning AI**

---

## The Problem

Every AI-learning platform today gives the same content to everyone. A chemistry student and a software engineer get the same videos, in the same order, at the same pace. Nothing detects where you get stuck or what you already know.

Learnova is different. It diagnoses each learner's background, goal, and comfort level, then routes them through a personalised AI curriculum — same content, but different order, depth, and framing per learner.

---

## What It Does

* **Personalised learning paths** — AI routes each learner through a unique sequence of 8–12 concepts based on their background and goal
* **Adaptive difficulty** — three tiers (beginner, intermediate, advanced) selected by mastery
* **Interleaved lessons** — card-at-a-time. Read a short section, then do a hands-on activity
* **7 interaction types** — fill-in-the-blank, drag-to-match, order-the-steps, predict-the-outcome, spot-the-mistake, explain-in-your-own-words, and an AI-graded Python code editor
* **AI-graded code editor** — learners write real Python; the AI grades it and shows a reference solution
* **Live mastery tracking** — the mastery ring updates as learners progress
* **Visual roadmap** — a car tracks the learner's position along their path
* **Feedback checkpoints** — every 2–5 concepts, learners give feedback; the path re-plans dynamically
* **Sparks, streaks, badges** — engagement mechanics
* **Downloadable certificate** at 80% completion
* **Dark mode**, shareable progress card, searchable glossary, weekly goals, review mode

---

## Architecture — Content-First, AI-Routes

Most AI tutors generate content live per user — slow, expensive, inconsistent.

Learnova pre-writes all content once (44 hand-crafted lessons across 20 concepts and three tiers), then uses AI as a **routing layer**: choosing which concepts, in what order, at what depth, and reframed in the learner's field.

**Results:**

* Page loads in under 1 second
* Cost is about $0.002 per learner
* Every learner sees the same great lesson for a given concept, personalised at the entry point

---

## Tech Stack

| Layer     | Technology                                         |
| --------- | -------------------------------------------------- |
| Frontend  | Next.js 14 (App Router), TypeScript, Tailwind CSS  |
| Animation | Framer Motion                                      |
| Icons     | Lucide React                                       |
| Database  | Supabase (Postgres + Auth + Row Level Security)    |
| LLM       | Groq (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`) |

---

## Setup & Installation

### Prerequisites

* Node.js 18+
* A Supabase project
* A Groq API key

### 1. Clone the repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd learnova-ai-tutor
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GROQ_API_KEY=your_groq_api_key
```

**Where to get these:**

* **Supabase:** Project Settings → API → Project URL, anon key, service_role key
* **Groq:** [console.groq.com](https://console.groq.com) → API Keys → Create API Key

### 4. Apply database migrations

In the Supabase SQL Editor, run each migration in `supabase/migrations/` in order (001 through 013).

Alternatively, if using the Supabase CLI:

```bash
supabase db push
```

### 5. Seed the curriculum

Populate the concepts and content:

```bash
npm run seed
npm run seed:manual
npm run seed:personas
```

**What each command does:**

* `npm run seed` — inserts 20 concepts with prerequisites
* `npm run seed:manual` — loads 44 hand-written lesson packages from `content/` into Supabase
* `npm run seed:personas` — creates 3 demo learner accounts (see below)

### 6. Run the development server

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

---

## How to Run in Production

```bash
npm run build
npm run start
```

The app runs at `http://localhost:3000`.

---

## Demo Accounts

Three pre-configured personas are seeded for demonstration:

| Persona      | Email                      | Password       | Background                 |
| ------------ | -------------------------- | -------------- | -------------------------- |
| Priya Sharma | `priya.demo@learnova.test` | `learnova2026` | Chemistry, AI for research |
| Rahul Verma  | `rahul.demo@learnova.test` | `learnova2026` | Engineering, transformers  |
| Aisha Khan   | `aisha.demo@learnova.test` | `learnova2026` | Business, RAG for startup  |

**Sign in as each to see how their paths, tiers, and lesson framings differ** — same curriculum, three completely different experiences.

---

## Project Structure

```text
learnova/
├── app/                          # Next.js App Router
│   ├── (auth)/login/             # Authentication page
│   ├── api/                      # API routes (LLM, DB writes)
│   ├── me/                       # Dashboard, lessons, profile
│   │   ├── lesson/[conceptId]/   # Lesson player
│   │   ├── profile/              # Learner profile
│   │   ├── certificate/          # Completion certificate
│   │   └── review/               # Review mode
│   ├── start/                    # Onboarding flow
│   ├── glossary/                # Searchable concept glossary
│   └── layout.tsx                # Root layout
├── components/                   # UI components
│   ├── interactions/             # 7 interaction types
│   └── ...                       # Dashboard, profile, lesson player
├── content/                      # 44 hand-written lesson JSON files
├── lib/                          # Helpers
│   ├── llm/                      # Groq wrapper + prompts
│   ├── supabase/                 # Client + server clients
│   ├── gamification.ts           # Sparks, streaks, badges
│   ├── learner.ts                # Learner helpers
│   └── adaptive-test.ts          # Adaptive difficulty logic
├── scripts/                      # Seed and content generation scripts
└── supabase/migrations/          # 001-013 database schema
```

---

## Available Scripts

| Script                  | Purpose                                        |
| ----------------------- | ---------------------------------------------- |
| `npm run dev`           | Start development server                       |
| `npm run build`         | Production build                               |
| `npm run start`         | Run production server                          |
| `npm run seed`          | Seed 20 concepts                               |
| `npm run seed:manual`   | Load 44 lessons from `content/`                |
| `npm run seed:personas` | Create demo learner accounts                   |
| `npm run seed:content`  | Regenerate lesson content via Groq (if needed) |

---

## How Personalisation Works

1. **Onboarding** — learner provides background, name, goal, and answers 3 diagnostic questions
2. **Diagnosis** — AI grades the answers; builds an initial mastery map
3. **Path routing** — AI picks 8–12 concepts in a personalised order, choosing tier per concept
4. **Lesson personalisation** — every activity's prompt is reframed in the learner's field (chemistry vs. engineering vs. business)
5. **Continuous adaptation** — mastery updates after every activity; feedback checkpoints every 2–5 concepts can extend or re-plan the path
6. **Completion** — certificate issues at 80% completion

---

## Why Content-First

Most AI tutors generate lessons live. That produces:

* Slow pages (10–15 seconds per load)
* High cost per learner
* Inconsistent quality

Learnova pre-writes content once and uses AI only for:

* Path routing
* Activity grading
* Prompt reframing

This keeps pages fast, costs low, and quality consistent — while personalising the *experience* per learner.

---

## Team

**Learnova Builders** — BFWAI Hack26

---

## License

Built for BFWAI Hack26. Not for commercial use.
