"use client";

import { useEffect, useRef, useState } from "react";

interface StatItem {
  target: number;
  suffix: string;
  label: string;
}

const STATS: StatItem[] = [
  { target: 230, suffix: "+", label: "alumni and counting" },
  { target: 180, suffix: "+", label: "companies represented" },
  { target: 10, suffix: "+", label: "industries — from big tech to defense to AI startups" },
];

function useCountUp(target: number, inView: boolean, duration = 1500) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return;

    let start = 0;
    const startTime = performance.now();

    function step(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);

      if (current !== start) {
        start = current;
        setCount(current);
      }

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }, [inView, target, duration]);

  return count;
}

function StatCounter({ stat, inView }: { stat: StatItem; inView: boolean }) {
  const count = useCountUp(stat.target, inView);

  return (
    <div className="text-center">
      <p className="font-heading font-black text-5xl md:text-6xl lg:text-7xl tracking-tight text-foreground">
        {count}
        <span className="text-accent">{stat.suffix}</span>
      </p>
      <p className="mt-2 text-sm md:text-base text-text-muted max-w-[200px] mx-auto">
        {stat.label}
      </p>
    </div>
  );
}

export default function Stats() {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="py-20 border-b border-border">
      <div className="max-w-4xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
          {STATS.map((stat) => (
            <StatCounter key={stat.label} stat={stat} inView={inView} />
          ))}
        </div>
      </div>
    </section>
  );
}
