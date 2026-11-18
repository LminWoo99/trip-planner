// Today's exchange rates (free, no key; updated once a day by the provider).

const URL_KRW = "https://open.er-api.com/v6/latest/KRW";

/** Won per one unit of each currency, rounded to 4 significant digits; null when offline or the service fails. */
export async function todaysKrwRates(currencies: readonly string[]): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(URL_KRW);
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (body.result !== "success" || !body.rates) return null;
    const out: Record<string, number> = {};
    for (const c of currencies) {
      const perKrw = body.rates[c];
      if (perKrw > 0) out[c] = Number((1 / perKrw).toPrecision(4));
    }
    return out;
  } catch {
    return null;
  }
}
