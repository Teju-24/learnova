"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Container } from "@/components/Container";
import StartLearningButton from "@/components/StartLearningButton";
import {
  ArrowRight,
  Brain,
  Compass,
  GraduationCap,
  Rocket,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";

const STEPS = [
  {
    icon: Target,
    kicker: "01 · Diagnose",
    title: "Tell us who you are",
    body: "Your field, level, and goal. A quick diagnostic maps what you already know so we never lecture you on the obvious.",
  },
  {
    icon: Brain,
    kicker: "02 · Personalize",
    title: "We build your path",
    body: "The same concept, taught through your world — biology becomes chemistry, engineering gets friction and loads.",
  },
  {
    icon: Rocket,
    kicker: "03 · Improve",
    title: "Practice, not lectures",
    body: "Interactive exercises with instant feedback, a visible mastery score, and Python skills you didn't know you had.",
  },
];

const PERSONAS = [
  {
    initials: "P",
    name: "Priya",
    field: "Chemistry",
    color: "#3B82F6",
    wants:
      "Is learning about neural networks hard when the example is a biological neuron? With Learnova, training data becomes a titration curve she reads every day.",
  },
  {
    initials: "R",
    name: "Rahul",
    field: "Engineering",
    color: "#10B981",
    wants:
      "Theory slides put him to sleep. Learnova frames every concept around friction, loads, and stress — his second language.",
  },
  {
    initials: "A",
    name: "Aisha",
    field: "Business",
    color: "#F59E0B",
    wants:
      "No math symbols spoken without a translation. Learnova explains evaluation metrics like a product dashboard she already runs.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-bgpage font-body text-ink">
      {/* Sticky nav */}
      <nav
        className="sticky top-0 z-40 border-b border-bgsubtle backdrop-blur-sm"
        style={{ backgroundColor: "rgba(247,243,234,0.82)" }}
      >
        <Container className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2" style={{ textDecoration: "none" }}>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Sparkles size={16} className="text-white" />
            </span>
            <span className="font-heading text-xl font-bold">Learnova</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-md px-4 py-2 text-sm font-semibold text-inkmuted transition-colors hover:text-ink"
              style={{ textDecoration: "none" }}
            >
              Sign in
            </Link>
            <StartLearningButton className="btn-primary !py-2 text-sm">
              Start learning <ArrowRight size={16} />
            </StartLearningButton>
          </div>
        </Container>
      </nav>

      {/* Hero */}
      <section className="relative flex min-h-[70vh] items-center justify-center overflow-hidden py-20 text-center">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
        >
          <motion.div
            className="absolute -left-24 top-10 h-80 w-80 rounded-full bg-primary-soft blur-3xl"
            animate={{ y: [0, 24, 0], scale: [1, 1.08, 1] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-success-soft blur-3xl"
            animate={{ x: [0, -20, 0], scale: [1, 1.1, 1] }}
            transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <Container>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative mx-auto max-w-3xl"
          >
          <p
            className="mb-6 inline-flex items-center gap-2 rounded-full border bg-primary-soft px-4 py-1.5 font-mono text-xs uppercase tracking-[0.18em] text-primary"
            style={{ borderColor: "rgba(91,79,233,0.28)" }}
          >
            <Sparkles size={13} /> BFWAI Hack26 · PS 03
          </p>
          <h1 className="font-heading text-5xl leading-[1.05] md:text-6xl">
            An AI tutor that learns how <span className="text-primary">you</span> learn.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-inkmuted">
            Learnova teaches AI concepts through your own field, skill level,
            and goal — with interactive practice, not lectures.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <StartLearningButton>
              Start learning <ArrowRight size={17} />
            </StartLearningButton>
            <Link
              href="/login"
              className="btn-secondary"
              style={{ textDecoration: "none" }}
            >
              Sign in
            </Link>
          </div>
        </motion.div>
        </Container>
      </section>

      {/* How it works */}
      <section className="border-y border-bgsubtle bg-bgcard py-20">
        <Container>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-xs font-bold uppercase tracking-[0.2em] text-primary"
          >
            How it works
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.05 }}
            className="mt-3 max-w-xl font-heading text-4xl"
          >
            From first question to visible mastery.
          </motion.h2>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="card hover:-translate-y-1"
                style={{ transition: "transform 0.2s ease, box-shadow 0.2s ease" }}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft">
                  <step.icon size={24} className="text-primary" />
                </span>
                <p className="mt-5 font-mono text-xs uppercase tracking-[0.16em] text-inkfaint">
                  {step.kicker}
                </p>
                <h3 className="mt-2 text-xl">{step.title}</h3>
                <p className="mt-2 text-sm text-inkmuted">{step.body}</p>
              </motion.div>
            ))}
          </div>
        </Container>
      </section>

      {/* Personas */}
      <section className="py-20">
        <Container>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <h2 className="font-heading text-4xl">
              One tutor, three very different learners.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-inkmuted">
              Your field is the lens — the concepts are the same, the story is yours.
            </p>
          </motion.div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PERSONAS.map((p, i) => (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="card"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-full font-heading text-lg font-bold text-white"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.initials}
                  </span>
                  <div>
                    <p className="font-heading text-lg font-bold leading-none">{p.name}</p>
                    <p className="text-sm text-inkmuted">{p.field}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-inkmuted">{p.wants}</p>
              </motion.div>
            ))}
          </div>
        </Container>
      </section>

      {/* Final CTA */}
      <section className="border-t border-bgsubtle bg-bgcard py-20">
        <Container className="text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto max-w-2xl"
          >
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success-soft">
            <Compass size={28} className="text-success" />
          </span>
          <h2 className="mt-6 font-heading text-4xl">
            Your path to Python starts here.
          </h2>
          <p className="mt-3 text-inkmuted">
            A few questions, then a personalized path with interactive practice
            from day one.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <StartLearningButton>
              Start learning <ArrowRight size={17} />
            </StartLearningButton>
            <Link
              href="/login"
              className="group inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
              style={{ textDecoration: "none" }}
            >
              Already have an account? Sign in
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="mt-10 flex items-center justify-center gap-8 text-inkmuted">
            <span className="flex items-center gap-1.5 text-sm">
              <TrendingUp size={15} className="text-success" /> Visible mastery
            </span>
            <span className="flex items-center gap-1.5 text-sm">
              <GraduationCap size={15} className="text-primary" /> Sparks & streaks
            </span>
          </div>
        </motion.div>
        </Container>
      </section>

      <footer className="border-t border-bgsubtle py-6 text-center text-sm text-inkfaint">
        Learnova · Built for BFWAI Hack26
      </footer>
    </main>
  );
}