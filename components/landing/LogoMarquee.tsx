const ROW_1 = [
  "Google",
  "OpenAI",
  "Jane Street",
  "Stripe",
  "SpaceX",
  "Meta",
  "Citadel Securities",
  "NVIDIA",
  "Anduril",
  "Apple",
  "Hudson River Trading",
  "Databricks",
];

const ROW_2 = [
  "Netflix",
  "Neuralink",
  "Ramp",
  "Tesla",
  "Coinbase",
  "Together AI",
  "Palantir",
  "Figma",
  "Uber",
  "Scale AI",
  "Bloomberg",
  "Adobe",
];

const ROW_3 = [
  "Cloudflare",
  "Snap",
  "TikTok",
  "Amazon",
  "Robinhood",
  "Snowflake",
  "DoorDash",
  "Microsoft",
  "Roblox",
  "Splunk",
  "Walt Disney Imagineering",
];

function MarqueeRow({
  companies,
  reverse = false,
}: {
  companies: string[];
  reverse?: boolean;
}) {
  const items = companies.map((company, i) => (
    <div
      key={`${company}-${i}`}
      className="flex-shrink-0 px-6 md:px-10 flex items-center"
    >
      <span className="text-base md:text-lg font-heading font-bold text-[rgba(250,250,248,0.6)] hover:text-[rgba(250,250,248,0.85)] transition-colors duration-300 whitespace-nowrap select-none">
        {company}
      </span>
    </div>
  ));

  return (
    <div className="overflow-hidden">
      <div
        className={`flex w-max ${reverse ? "animate-marquee-reverse" : "animate-marquee"}`}
        style={{ willChange: "transform", backfaceVisibility: "hidden" }}
      >
        {items}
        {companies.map((company, i) => (
          <div
            key={`dup-${company}-${i}`}
            className="flex-shrink-0 px-6 md:px-10 flex items-center"
          >
            <span className="text-base md:text-lg font-heading font-bold text-[rgba(250,250,248,0.6)] hover:text-[rgba(250,250,248,0.85)] transition-colors duration-300 whitespace-nowrap select-none">
              {company}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LogoMarquee() {
  return (
    <section className="py-6 overflow-hidden border-y border-border">
      <p className="text-center text-[11px] font-medium uppercase tracking-[0.25em] text-text-muted mb-5">
        Where TSE Alumni Work
      </p>

      <div className="relative space-y-3">
        {/* Fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

        <MarqueeRow companies={ROW_1} />
        <MarqueeRow companies={ROW_2} reverse />
        <MarqueeRow companies={ROW_3} />
      </div>
    </section>
  );
}
