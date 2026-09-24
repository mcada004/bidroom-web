export const TRAINING_TIMEZONE = "America/Los_Angeles";
export const TRAINING_OWNER_EMAIL = "mcada004@gmail.com";

export type Workout = {
  title: string;
  sport: "run" | "bike" | "strength" | "rest" | "walk-run";
  miles?: number;
  minutes?: string;
  intensityMinutes: number;
  pace: string;
  effort: string;
  steps: string[];
  recovery: string;
  status?: "completed" | "planned";
  actual?: string;
};
export type Meal = { name: string; items: string[] };
export type Fueling = {
  status: "confirmed" | "provisional";
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  duringCarbs: number;
  before: string;
  during: string;
  after: string;
  preparation: string;
  meals: Meal[];
  notes: string[];
};
export type TrainingDay = {
  date: string;
  status: "confirmed" | "provisional";
  focus: string;
  workouts: Workout[];
  fueling: Fueling | null;
};
export type TrainingWeek = {
  start: string;
  type: string;
  miles: string;
  intensityMinutes: string;
  cyclingMinutes: string;
  strengthMinutes: string;
  sessions: { day: string; workout: string }[];
  note?: string;
};
export type TrainingSnapshot = {
  schemaVersion: 1;
  generatedAt: string;
  recordVersion: number;
  dataThrough: string;
  confirmedThrough: string;
  timezone: "America/Los_Angeles";
  dailyRefreshActive: boolean;
  race: { name: string; date: string; goal: string };
  days: TrainingDay[];
  weeks: TrainingWeek[];
  paces: { name: string; pace: string; cue: string }[];
  changes: { date: string; title: string; before: string; after: string; reason: string }[];
  guidance: string[];
};

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, limit = 1200): value is string {
  return typeof value === "string" && value.length <= limit;
}
function strings(value: unknown, max = 30): value is string[] {
  return Array.isArray(value) && value.length <= max && value.every((v) => text(v));
}
function finite(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
}
export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function pacificDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TRAINING_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function addDays(date: string, count: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
export function weekStart(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}
export function dateLabel(date: string, long = false): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: long ? "long" : "short", month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00Z`));
}
export function validateTrainingSnapshot(value: unknown): asserts value is TrainingSnapshot {
  const invalid = () => { throw new Error("The training update is incomplete or has invalid values."); };
  if (!object(value) || value.schemaVersion !== 1 || value.timezone !== TRAINING_TIMEZONE || !finite(value.recordVersion, 1e9) || !Number.isInteger(value.recordVersion) || !text(value.generatedAt) || !Number.isFinite(Date.parse(value.generatedAt)) || !text(value.dataThrough) || !isDateKey(value.confirmedThrough)) return invalid();
  if (typeof value.dailyRefreshActive !== "boolean" || !object(value.race) || !text(value.race.name) || !isDateKey(value.race.date) || !text(value.race.goal)) return invalid();
  if (!Array.isArray(value.days) || value.days.length < 1 || value.days.length > 200 || !Array.isArray(value.weeks) || value.weeks.length > 60 || !Array.isArray(value.paces) || value.paces.length > 12 || !Array.isArray(value.changes) || value.changes.length > 100 || !strings(value.guidance)) return invalid();
  const dates = new Set<string>();
  for (const day of value.days) {
    if (!object(day) || !isDateKey(day.date) || dates.has(day.date) || !["confirmed", "provisional"].includes(String(day.status)) || !text(day.focus) || !Array.isArray(day.workouts) || day.workouts.length > 5) return invalid();
    dates.add(day.date);
    for (const w of day.workouts) {
      if (!object(w) || !text(w.title) || !["run", "bike", "strength", "rest", "walk-run"].includes(String(w.sport)) || !finite(w.intensityMinutes, 600) || !text(w.pace) || !text(w.effort) || !strings(w.steps) || !text(w.recovery) || (w.miles !== undefined && !finite(w.miles, 150)) || (w.minutes !== undefined && !text(w.minutes)) || (w.actual !== undefined && !text(w.actual)) || (w.status !== undefined && !["completed", "planned"].includes(String(w.status)))) return invalid();
    }
    if (day.fueling !== null) {
      const f = day.fueling;
      if (!object(f) || !["confirmed", "provisional"].includes(String(f.status)) || !finite(f.calories, 12000) || !finite(f.carbs, 2000) || !finite(f.protein, 500) || !finite(f.fat, 500) || !finite(f.duringCarbs, 1000) || f.duringCarbs > f.carbs || Math.abs(f.calories - (4 * (f.carbs + f.protein) + 9 * f.fat)) > 60 || !text(f.before) || !text(f.during) || !text(f.after) || !text(f.preparation) || !strings(f.notes) || !Array.isArray(f.meals) || f.meals.length > 8) return invalid();
      for (const meal of f.meals) if (!object(meal) || !text(meal.name) || !strings(meal.items, 20)) return invalid();
    }
  }
  for (const w of value.weeks) {
    if (!object(w) || !isDateKey(w.start) || !text(w.type) || !text(w.miles) || !text(w.intensityMinutes) || !text(w.cyclingMinutes) || !text(w.strengthMinutes) || !Array.isArray(w.sessions) || w.sessions.length > 8 || (w.note !== undefined && !text(w.note))) return invalid();
    for (const s of w.sessions) if (!object(s) || !text(s.day) || !text(s.workout)) return invalid();
  }
  for (const p of value.paces) if (!object(p) || !text(p.name) || !text(p.pace) || !text(p.cue)) return invalid();
  for (const c of value.changes) if (!object(c) || !isDateKey(c.date) || !text(c.title) || !text(c.before) || !text(c.after) || !text(c.reason)) return invalid();
}
