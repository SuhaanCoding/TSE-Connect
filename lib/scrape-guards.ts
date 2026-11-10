type EventPrice = {
  isOneTimeEvent?: boolean;
  eventPriceUsd?: number;
  eventTieredPricingUsd?: { FREE?: { tieredEventPriceUsd?: number } };
};
type Pricing = {
  pricingModel?: string;
  pricingPerEvent?: { actorChargeEvents?: Record<string, EventPrice> };
};

export function verifyScraperPricing(
  pricing: Pricing | undefined,
  profileCount: number,
  maxRunCharge = 2,
): boolean {
  const events = pricing?.pricingPerEvent?.actorChargeEvents || {};
  const price =
    events.main_result?.eventTieredPricingUsd?.FREE?.tieredEventPriceUsd;
  const startPrice = events["apify-actor-start"]?.eventPriceUsd || 0;
  return (
    pricing?.pricingModel === "PAY_PER_EVENT" &&
    typeof price === "number" &&
    price > 0 &&
    price <= 0.005 &&
    startPrice <= 0.001 &&
    Object.keys(events).every((event) =>
      ["main_result", "apify-actor-start"].includes(event),
    ) &&
    profileCount > 0 &&
    profileCount * price + startPrice <= maxRunCharge
  );
}

export function isLimitedScrape(message: string | null | undefined): boolean {
  return /free.{0,60}(limit|cap)|limit.{0,30}free|\bskipped\b.{0,30}(urls|profiles)|max(?:imum)?.{0,40}charg|charg.{0,40}(limit|max)/i.test(
    message || "",
  );
}

export function verifyRecoveryPricing(
  pricing: Pricing | undefined,
  count: number,
  cap = 1,
): boolean {
  const events = pricing?.pricingPerEvent?.actorChargeEvents || {};
  const price =
    events.profile?.eventTieredPricingUsd?.FREE?.tieredEventPriceUsd ??
    events.profile?.eventPriceUsd;
  return (
    pricing?.pricingModel === "PAY_PER_EVENT" &&
    typeof price === "number" &&
    price > 0 &&
    price <= 0.0032 &&
    count > 0 &&
    count * price <= cap &&
    Object.keys(events).every((event) =>
      ["profile", "profile-with-email"].includes(event),
    )
  );
}
