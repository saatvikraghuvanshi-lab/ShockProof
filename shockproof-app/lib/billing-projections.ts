export type TariffSlab = {
  slab_start: number | string;
  slab_end: number | string | null;
  rate: number | string;
  fixed_charge: number | string | null;
};

export type ProjectionInput = {
  currentReadingKwh: number;
  previousReadingKwh?: number | null;
  capturedAt: Date;
  billingCycleDay?: number | null;
  slabs: TariffSlab[];
};

export type ProjectionResult = {
  currentUsage: number;
  projectedUnits: number;
  nextSlabAt: number | null;
  unitsToNextSlab: number | null;
  estimatedBill: number;
  estimatedDelta: number;
  daysElapsed: number;
  daysLeft: number;
  billRisk: "low" | "medium" | "high";
};

function toNumber(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getCycleStart(capturedAt: Date, cycleDay: number | null | undefined = 1) {
  const safeCycleDay = Math.min(Math.max(cycleDay || 1, 1), 31);
  const year = capturedAt.getFullYear();
  const month = capturedAt.getMonth();
  const candidate = new Date(year, month, safeCycleDay);

  if (candidate > capturedAt) {
    return new Date(year, month - 1, safeCycleDay);
  }

  return candidate;
}

function calculateBill(units: number, slabs: TariffSlab[]) {
  if (slabs.length === 0) {
    return 0;
  }

  const fixedChargeSlab =
    slabs.find((slab) => {
      const start = toNumber(slab.slab_start);
      const end =
        slab.slab_end === null ? Number.POSITIVE_INFINITY : toNumber(slab.slab_end);

      return units > start && units <= end;
    }) ?? slabs[slabs.length - 1];
  const fixedCharge = toNumber(fixedChargeSlab.fixed_charge);

  const usageCharge = slabs.reduce((total, slab) => {
    const start = toNumber(slab.slab_start);
    const end = slab.slab_end === null ? Number.POSITIVE_INFINITY : toNumber(slab.slab_end);
    const rate = toNumber(slab.rate);
    const unitsInSlab = Math.max(Math.min(units, end) - start, 0);

    return total + unitsInSlab * rate;
  }, 0);

  return Math.round((usageCharge + fixedCharge) * 100) / 100;
}

export function calculateProjection(input: ProjectionInput): ProjectionResult {
  const cycleStart = getCycleStart(input.capturedAt, input.billingCycleDay);
  const nextCycleStart = new Date(cycleStart);
  nextCycleStart.setMonth(nextCycleStart.getMonth() + 1);

  const elapsedMs = Math.max(input.capturedAt.getTime() - cycleStart.getTime(), 0);
  const totalMs = Math.max(nextCycleStart.getTime() - cycleStart.getTime(), 1);
  const daysElapsed = Math.max(Math.ceil(elapsedMs / 86_400_000), 1);
  const cycleDays = Math.max(Math.ceil(totalMs / 86_400_000), 1);
  const daysLeft = Math.max(cycleDays - daysElapsed, 0);
  const currentUsage = Math.max(
    input.currentReadingKwh - (input.previousReadingKwh ?? 0),
    0
  );
  const projectedUnits = Math.round((currentUsage / daysElapsed) * cycleDays);
  const sortedSlabs = [...input.slabs].sort(
    (a, b) => toNumber(a.slab_start) - toNumber(b.slab_start)
  );
  const nextSlabAt =
    sortedSlabs
      .map((slab) => slab.slab_end)
      .filter((end): end is number | string => end !== null)
      .map((end) => toNumber(end))
      .find((end) => end > currentUsage) ?? null;
  const unitsToNextSlab =
    nextSlabAt === null ? null : Math.max(Math.round(nextSlabAt - currentUsage), 0);
  const estimatedBill = calculateBill(projectedUnits, sortedSlabs);
  const currentPaceBill = calculateBill(currentUsage, sortedSlabs);
  const estimatedDelta = Math.round((estimatedBill - currentPaceBill) * 100) / 100;
  const billRisk =
    unitsToNextSlab !== null && unitsToNextSlab <= 10
      ? "high"
      : projectedUnits > currentUsage * 1.25
        ? "medium"
        : "low";

  return {
    currentUsage: Math.round(currentUsage),
    projectedUnits,
    nextSlabAt,
    unitsToNextSlab,
    estimatedBill,
    estimatedDelta,
    daysElapsed,
    daysLeft,
    billRisk,
  };
}
