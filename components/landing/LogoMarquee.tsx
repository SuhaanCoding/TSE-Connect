const ROW_1 = [
  "Google",
  "Amazon",
  "Meta",
  "Apple",
  "Microsoft",
  "Stripe",
  "Palantir",
  "ServiceNow",
  "Intuit",
  "Oracle",
  "TikTok",
  "Roblox",
];

const ROW_2 = [
  "Boeing",
  "Visa",
  "Tesla",
  "SpaceX",
  "Adobe",
  "NVIDIA",
  "Cloudflare",
  "Coinbase",
  "Jane Street",
  "Snowflake",
  "OpenAI",
  "Netflix",
  "Capital One",
  "LinkedIn",
  "Uber",
  "Northrop Grumman",
  "Anduril",
  "DoorDash",
  "Databricks",
  "Snap",
];

function MarqueeRow({
  companies,
  reverse = false,
}: {
  companies: string[];
  reverse?: boolean;
}) {
  const doubled = [...companies, ...companies];

  return (
    <div
      className={`flex ${reverse ? "animate-marquee-reverse" : "animate-marquee"}`}
    >
      {doubled.map((company, i) => (
        <div
          key={`${company}-${i}`}
          className="flex-shrink-0 px-6 md:px-10 flex items-center"
        >
          <span className="text-base md:text-lg font-heading font-bold text-[rgba(250,250,248,0.6)] hover:text-[rgba(250,250,248,0.85)] transition-colors duration-300 whitespace-nowrap select-none">
            {company}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function LogoMarquee() {
  return (
    <section className="py-10 overflow-hidden border-y border-border">
      <p className="text-center text-[11px] font-medium uppercase tracking-[0.25em] text-text-muted mb-8">
        Where TSE Alumni Work
      </p>

      <div className="relative space-y-4">
        {/* Fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

        <MarqueeRow companies={ROW_1} />
        <MarqueeRow companies={ROW_2} reverse />
      </div>
    </section>
  );
}
