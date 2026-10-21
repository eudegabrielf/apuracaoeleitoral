type CandidateIdentity = { id: string; name: string };

const candidateColors = [
  { fill: "fill-chart-1", background: "bg-chart-1", activeBackground: "bg-chart-1-active", variable: "var(--color-chart-1-active)" },
  { fill: "fill-chart-2", background: "bg-chart-2", activeBackground: "bg-chart-2-active", variable: "var(--color-chart-2-active)" },
  { fill: "fill-chart-3", background: "bg-chart-3", activeBackground: "bg-chart-3-active", variable: "var(--color-chart-3-active)" },
  { fill: "fill-chart-4", background: "bg-chart-4", activeBackground: "bg-chart-4-active", variable: "var(--color-chart-4-active)" },
  { fill: "fill-chart-5", background: "bg-chart-5", activeBackground: "bg-chart-5-active", variable: "var(--color-chart-5-active)" },
  { fill: "fill-chart-6", background: "bg-chart-6", activeBackground: "bg-chart-6-active", variable: "var(--color-chart-6-active)" },
  { fill: "fill-chart-7", background: "bg-chart-7", activeBackground: "bg-chart-7-active", variable: "var(--color-chart-7-active)" },
  { fill: "fill-chart-8", background: "bg-chart-8", activeBackground: "bg-chart-8-active", variable: "var(--color-chart-8-active)" },
  { fill: "fill-chart-9", background: "bg-chart-9", activeBackground: "bg-chart-9-active", variable: "var(--color-chart-9-active)" },
  { fill: "fill-chart-10", background: "bg-chart-10", activeBackground: "bg-chart-10-active", variable: "var(--color-chart-10-active)" },
  { fill: "fill-chart-11", background: "bg-chart-11", activeBackground: "bg-chart-11-active", variable: "var(--color-chart-11-active)" },
  { fill: "fill-chart-12", background: "bg-chart-12", activeBackground: "bg-chart-12-active", variable: "var(--color-chart-12-active)" },
] as const;

const officialCandidateColors: Record<string, number> = {
  "280002551544": 5,
  "280002542548": 9,
  "280002551547": 7,
  "280002540694": 10,
  "280002551932": 6,
  "280002539826": 4,
  "280002538811": 2,
  "280002541457": 3,
  "280002552484": 11,
  "280002551975": 1,
  "280002548139": 8,
  "280002552487": 0,
};

export function getCandidateColor(candidate: CandidateIdentity) {
  const normalizedName = candidate.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const preferredColor =
    normalizedName.includes("flavio") ? 5
      : normalizedName.includes("lula") ? 9
        : normalizedName.includes("renan") ? 10
          : undefined;
  const knownColor = officialCandidateColors[candidate.id] ?? preferredColor;
  const fallback = [...candidate.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % candidateColors.length;
  return candidateColors[knownColor ?? fallback]!;
}
