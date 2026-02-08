"use client";

import { useEffect, useMemo, useState } from "react";

type AnimatedWordProps = {
  text: string;
  charset?: string;
  tickMs?: number;
  firstLockMs?: number;
  lockStaggerMs?: number;
};

const DEFAULT_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function getScrambledChar(target: string, index: number, step: number, charset: string): string {
  const source = charset[(index * 7 + step) % charset.length] ?? "A";
  return target === target.toLowerCase() ? source.toLowerCase() : source;
}

export default function AnimatedWord({
  text,
  charset = DEFAULT_CHARSET,
  tickMs = 40,
  firstLockMs = 260,
  lockStaggerMs = 100,
}: AnimatedWordProps) {
  const letters = useMemo(() => [...text], [text]);
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;

    const lockableCount = letters.filter((char) => char !== " ").length;
    const lastLockMs = firstLockMs + Math.max(lockableCount - 1, 0) * lockStaggerMs;
    const stopAtMs = Math.max(lastLockMs + 220, 1000);
    const startTime = performance.now();

    const frameFor = (elapsedMs: number) => {
      const step = Math.floor(elapsedMs / tickMs);
      let seenLetters = 0;

      return letters
        .map((target, index) => {
          if (target === " ") return target;

          const lockAt = firstLockMs + seenLetters * lockStaggerMs;
          seenLetters += 1;

          if (elapsedMs >= lockAt) return target;
          return getScrambledChar(target, index, step, charset);
        })
        .join("");
    };

    let timer: number | undefined;

    const tick = () => {
      const elapsedMs = performance.now() - startTime;
      if (elapsedMs >= stopAtMs) {
        setDisplay(text);
        timer = undefined;
        return;
      }

      setDisplay(frameFor(elapsedMs));
      timer = window.setTimeout(tick, tickMs);
    };

    timer = window.setTimeout(tick, 0);

    return () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [charset, firstLockMs, letters, lockStaggerMs, text, tickMs]);

  return (
    <span aria-label={text}>
      <span aria-hidden="true">{display}</span>
    </span>
  );
}
