"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/src/context/AuthContext";
import { addDays, dateLabel, pacificDate, TRAINING_OWNER_EMAIL, validateTrainingSnapshot, weekStart, type TrainingDay, type TrainingSnapshot, type Workout } from "@/src/lib/training";

function timestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
}
function WorkoutCard({ workout }: { workout: Workout }) {
  return <article className={`training-workout training-workout-${workout.sport}`}>
    <div className="training-card-top"><span className="training-eyebrow">{workout.sport === "walk-run" ? "Walk / run" : workout.sport}</span><span className={`training-badge ${workout.status === "completed" ? "is-complete" : ""}`}>{workout.status === "completed" ? "Completed" : "Planned"}</span></div>
    <h2>{workout.title}</h2>
    <div className="training-workout-stats">{workout.miles !== undefined && <div><strong>{workout.miles}</strong><span>{workout.sport === "walk-run" ? "mixed miles" : "planned miles"}</span></div>}{workout.minutes && <div><strong>{workout.minutes}</strong><span>minutes</span></div>}{workout.intensityMinutes > 0 && <div><strong>{workout.intensityMinutes}</strong><span>quality minutes</span></div>}</div>
    <p className="training-pace">{workout.pace}</p><p className="training-effort">{workout.effort}</p>
    <ol className="training-steps">{workout.steps.map((step, i) => <li key={i}><span>{String(i + 1).padStart(2, "0")}</span><p>{step}</p></li>)}</ol>
    {workout.recovery !== "None" && <div className="training-recovery"><strong>Between efforts</strong><p>{workout.recovery}</p></div>}
    {workout.actual && <div className="training-actual"><strong>Recorded result</strong><p>{workout.actual}</p></div>}
  </article>;
}
function DayView({ day }: { day: TrainingDay }) {
  const fuel = day.fueling;
  return <><div className="training-day-heading"><div><span className="training-eyebrow">{dateLabel(day.date, true)}</span><h2>{day.focus}</h2></div><span className={`training-badge ${day.status === "provisional" ? "is-provisional" : ""}`}>{day.status === "confirmed" ? "Confirmed plan" : "Provisional · next review"}</span></div>
    <div className="training-day-grid"><section className="training-workouts" aria-label="Workouts">{day.workouts.map((workout, i) => <WorkoutCard key={i} workout={workout} />)}</section>
      <section className="training-panel training-fuel" aria-label="Daily fueling"><div className="training-card-top"><span className="training-eyebrow">Fuel for the work</span>{fuel?.status === "provisional" && <span className="training-badge is-provisional">Provisional</span>}</div><h2>Daily targets</h2>{fuel ? <><div className="training-carb-target"><strong>{fuel.carbs}<small>g</small></strong><span>carbohydrate</span></div><div className="training-macro-row"><div><strong>~{fuel.calories.toLocaleString()}</strong><span>kcal</span></div><div><strong>{fuel.protein} g</strong><span>protein</span></div><div><strong>{fuel.fat} g</strong><span>fat</span></div></div><p className="training-fuel-inclusion">Includes {fuel.duringCarbs} g of during-workout carbohydrate. Starting targets, not ceilings.</p><div className="training-fuel-timing">{[["Before", fuel.before], ["During", fuel.during], ["After", fuel.after]].map(([label, content]) => <div key={label}><strong>{label}</strong><p>{content}</p></div>)}</div></> : <p>Meal targets for this date will be set at the next coaching review. Keep normal meals and fuel the planned session.</p>}</section></div>
    {fuel && <><section className="training-meals-section"><div className="training-section-heading"><h2>Your meals</h2><p>Food weights in grams · starch and meat weighed cooked</p></div><div className="training-meals">{fuel.meals.map((meal) => <article className="training-panel training-meal" key={meal.name}><h3>{meal.name}</h3><ul>{meal.items.map((item, i) => <li key={i}>{item}</li>)}</ul></article>)}</div></section><section className="training-preparation"><span className="training-eyebrow">Set up tomorrow</span><p>{fuel.preparation}</p></section><details className="training-notes"><summary>Portion assumptions and substitutions</summary><ul>{fuel.notes.map((note, i) => <li key={i}>{note}</li>)}</ul></details></>}
  </>;
}
export function TrainingView({ snapshot, warning, feedConnected, onRefresh, refreshing }: { snapshot: TrainingSnapshot; warning: string | null; feedConnected: boolean; onRefresh: () => void; refreshing: boolean }) {
  const [today, setToday] = useState(pacificDate);
  const [clock, setClock] = useState(() => Date.now());
  const [selectedDate, setSelectedDate] = useState(today);
  const [tab, setTab] = useState("day");
  useEffect(() => { const id = window.setInterval(() => { const date = pacificDate(); setClock(Date.now()); if (today !== date) { setToday(date); setSelectedDate((selected) => selected === today ? date : selected); } }, 30000); return () => clearInterval(id); }, [today]);
  const day = snapshot.days.find((d) => d.date === selectedDate);
  const dates = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const currentWeek = snapshot.weeks.find((w) => w.start === weekStart(selectedDate));
  const raceDays = Math.max(0, Math.round((Date.parse(`${snapshot.race.date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000));
  const stale = clock - Date.parse(snapshot.generatedAt) > 30 * 3600000;
  return <main className="page training-page"><div className="training-heading"><div><span className="training-eyebrow">Your daily plan</span><h1>Training <span>&</span> fuel</h1></div><div className="training-race"><strong>{snapshot.race.name}</strong><span>{raceDays} days to race day · {snapshot.race.goal}</span></div></div>
    <div className="training-toolbar"><div role="tablist" aria-label="Training views" className="training-tabs">{[["day", "Daily plan"], ["week", "This week"], ["plan", "Full build"], ["changes", "Changes"]].map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} aria-controls={`training-${id}`} onClick={() => setTab(id)}>{label}</button>)}</div><button className="training-refresh" onClick={onRefresh} disabled={refreshing} aria-label="Refresh saved plan">{refreshing ? "Refreshing…" : "Refresh"}</button></div>
    <div className="training-update"><span>Plan updated {timestamp(snapshot.generatedAt)}</span><span>{feedConnected ? "Connected updates" : "Saved plan"} · {snapshot.dailyRefreshActive ? "Daily review at 9 a.m. Pacific" : "Daily refresh setup pending"}</span></div>
    {(warning || stale) && <div role="status" className="training-warning">{warning ?? "The daily update is overdue. These are the last saved prescriptions; check the update time before a key session."}</div>}
    <div id={`training-${tab}`} role="tabpanel">
    {tab === "day" && <><div className="training-date-strip" aria-label="Choose a day">{dates.map((date, i) => { const entry = snapshot.days.find((d) => d.date === date); return <button key={date} onClick={() => setSelectedDate(date)} aria-pressed={selectedDate === date} className={selectedDate === date ? "is-selected" : ""}><span>{i === 0 ? "Today" : i === 1 ? "Tomorrow" : dateLabel(date).split(",")[0]}</span><strong>{new Date(`${date}T12:00:00Z`).getUTCDate()}</strong><small>{entry?.workouts[0]?.sport.replace("walk-run", "walk/run") ?? "Review"}</small></button>; })}</div>{day ? <DayView day={day} /> : <section className="training-panel"><h2>{dateLabel(selectedDate, true)}</h2><p>The detailed daily plan for this date has not been published yet. The agreed outline is in Full build.</p></section>}</>}
    {tab === "week" && <><div className="training-week-controls"><button onClick={() => setSelectedDate(addDays(weekStart(selectedDate), -7))} aria-label="Previous week">←</button><h2>Week of {dateLabel(weekStart(selectedDate))}</h2><button onClick={() => setSelectedDate(addDays(weekStart(selectedDate), 7))} aria-label="Next week">→</button><button onClick={() => setSelectedDate(today)}>Current week</button></div>{currentWeek ? <><div className="training-week-stats">{[[currentWeek.miles, "running miles"], [currentWeek.intensityMinutes, "quality minutes"], [currentWeek.cyclingMinutes, "bike minutes"], [currentWeek.strengthMinutes, "strength minutes"]].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div><div className="training-week-list">{Array.from({ length: 7 }, (_, i) => addDays(currentWeek.start, i)).map((date, i) => { const entry = snapshot.days.find((d) => d.date === date); return <button key={date} onClick={() => { setSelectedDate(date); setTab("day"); }} disabled={!entry}><span>{dateLabel(date)}</span><div><strong>{entry?.workouts.map((w) => w.title).join(" + ") ?? currentWeek.sessions[i]?.workout}</strong><small>{entry?.workouts.map((w) => w.pace).filter((p) => p !== "—").join(" · ")}</small></div><span>{entry?.fueling ? `${entry.fueling.carbs} g carbs` : "Fuel at review"}</span></button>; })}</div><p className="training-note">Planned totals; recovery walks, commuting and completed mileage are tracked separately. Equal quality minutes do not mean equal training load.</p>{currentWeek.note && <p className="training-note">{currentWeek.note}</p>}</> : <section className="training-panel"><p>No week has been published for this date.</p></section>}</>}
    {tab === "plan" && <><section className="training-panel training-pace-guide"><h2>Current working paces</h2><p>Effort governs on hills, in wind and in heat. These targets progress through coaching reviews.</p><div>{snapshot.paces.map((p) => <article key={p.name}><strong>{p.name}</strong><span>{p.pace}</span><p>{p.cue}</p></article>)}</div></section><div className="training-build">{snapshot.weeks.map((week) => <details key={week.start} open={week.start === weekStart(today)}><summary><span>{dateLabel(week.start)}</span><strong>{week.type}</strong><span>{week.miles} mi · {week.intensityMinutes} quality min</span></summary><dl>{week.sessions.map((session) => <div key={session.day}><dt>{session.day}</dt><dd>{session.workout}</dd></div>)}</dl>{week.note && <p>{week.note}</p>}</details>)}</div></>}
    {tab === "changes" && <section className="training-changes"><h2>What changed, and why</h2>{snapshot.changes.map((change, i) => <article className="training-panel" key={i}><span className="training-eyebrow">{dateLabel(change.date)}</span><h3>{change.title}</h3><dl><div><dt>Previously</dt><dd>{change.before}</dd></div><div><dt>Now</dt><dd>{change.after}</dd></div><div><dt>Reason</dt><dd>{change.reason}</dd></div></dl></article>)}<section className="training-panel"><h3>How we keep the plan current</h3><ul>{snapshot.guidance.map((note, i) => <li key={i}>{note}</li>)}</ul></section></section>}
    </div><footer className="training-footer"><span>Reviewed data: {snapshot.dataThrough}</span><span>Detailed workouts confirmed through {dateLabel(snapshot.confirmedThrough)}. Later prescriptions are provisional.</span></footer></main>;
}
export default function TrainingDashboard() {
  const { user, loading } = useAuth();
  const [snapshot, setSnapshot] = useState<TrainingSnapshot | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedConnected, setFeedConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const [attempted, setAttempted] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  useEffect(() => {
    if (!user || user.email?.toLowerCase() !== TRAINING_OWNER_EMAIL) { setSnapshot(null); setAttempted(false); return; }
    let active = true, busy = false;
    async function refresh() {
      if (busy || !user) return;
      busy = true; setRefreshing(true);
      try {
        const response = await fetch("/api/training", { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "The update could not be loaded.");
        if (result.snapshot) validateTrainingSnapshot(result.snapshot);
        if (active) {
          setSnapshot((previous) => previous && result.snapshot && Date.parse(previous.generatedAt) > Date.parse(result.snapshot.generatedAt) ? previous : result.snapshot);
          setWarning(result.warning); setFeedConnected(result.feedConnected); setError(null);
        }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "Could not refresh the plan."); }
      finally { busy = false; if (active) { setRefreshing(false); setAttempted(true); } }
    }
    void refresh();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60000);
    const foreground = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", foreground);
    return () => { active = false; clearInterval(interval); document.removeEventListener("visibilitychange", foreground); };
  }, [user, refreshCount]);
  if (loading) return <main className="page training-page"><p role="status">Opening your training plan…</p></main>;
  if (!user) return <main className="page training-page training-login"><span className="training-eyebrow">Private dashboard</span><h1>Your training.<br />Your daily fuel.</h1><p>Sign in with your existing Bidroom account to open your plan.</p><Link className="button" href="/login?next=/training">Sign in to Bidroom</Link></main>;
  if (user.email?.toLowerCase() !== TRAINING_OWNER_EMAIL) return <main className="page training-page"><h1>Private training dashboard</h1><p>This plan is only available to its owner.</p></main>;
  if (!snapshot) return <main className="page training-page"><h1>Training & fuel</h1>{!attempted ? <p role="status">Loading your saved plan…</p> : error ? <><p role="alert">{error}</p><button className="button" onClick={() => setRefreshCount((n) => n + 1)}>Try again</button></> : <><p>Your dashboard is ready to connect to the saved plan.</p><Link className="button" href="/training/setup">Connect training plan</Link></>}</main>;
  return <TrainingView snapshot={snapshot} warning={error ?? warning} feedConnected={feedConnected} refreshing={refreshing} onRefresh={() => setRefreshCount((n) => n + 1)} />;
}
