"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getCandidateColor } from "@/components/application/election/candidate-colors";
import { ElectionSkeleton } from "@/components/application/election/election-skeleton";
import { firstRoundCandidates } from "@/components/application/election/first-round-candidates";
import type { ElectionResults } from "@/components/application/election/election-dashboard";

type Snapshot = {
  observedAt: number;
  sourceUpdatedAt: string;
  sectionsCounted: number | null;
  completed?: boolean;
  candidates: { id: string; votes: number; percentage: number }[];
};

const snapshotInterval = 10 * 60 * 1000;

const firstRoundHistory: Snapshot[] = [
  {
    observedAt: new Date("2026-10-04T17:25:57-03:00").getTime(),
    sourceUpdatedAt: "04/10/2026 17:25:57",
    sectionsCounted: 8_489,
    candidates: [
      { id: "280002551544", votes: 970_881, percentage: 49.185776830 },
      { id: "280002542548", votes: 832_776, percentage: 42.189243054 },
      { id: "280002551547", votes: 60_783, percentage: 3.079325966 },
      { id: "280002540694", votes: 48_694, percentage: 2.466885455 },
      { id: "280002551932", votes: 46_010, percentage: 2.330911401 },
    ],
  },
  {
    observedAt: new Date("2026-10-04T22:27:56-03:00").getTime(),
    sourceUpdatedAt: "04/10/2026 22:27:56",
    sectionsCounted: 498_745,
    candidates: [
      { id: "280002551544", votes: 56_079_781, percentage: 47.052823008 },
      { id: "280002542548", votes: 53_792_426, percentage: 45.133655207 },
      { id: "280002551547", votes: 3_446_597, percentage: 2.891810840 },
      { id: "280002540694", votes: 2_674_931, percentage: 2.244357104 },
      { id: "280002551932", votes: 2_604_065, percentage: 2.184898146 },
    ],
  },
  {
    observedAt: new Date("2026-10-05T01:56:22-03:00").getTime(),
    sourceUpdatedAt: "05/10/2026 01:56:22",
    sectionsCounted: 499_247,
    candidates: [
      { id: "280002551544", votes: 56_104_500, percentage: 47.027910964 },
      { id: "280002542548", votes: 53_879_187, percentage: 45.162609221 },
      { id: "280002551547", votes: 3_448_569, percentage: 2.890659321 },
      { id: "280002540694", votes: 2_675_886, percentage: 2.242975126 },
      { id: "280002551932", votes: 2_605_145, percentage: 2.183684501 },
    ],
  },
  {
    observedAt: new Date("2026-10-05T02:58:39-03:00").getTime(),
    sourceUpdatedAt: "05/10/2026 02:58:39",
    sectionsCounted: 499_248,
    candidates: [
      { id: "280002551544", votes: 56_104_503, percentage: 47.027772356 },
      { id: "280002542548", votes: 53_879_538, percentage: 45.162767911 },
      { id: "280002551547", votes: 3_448_569, percentage: 2.890650647 },
      { id: "280002540694", votes: 2_675_887, percentage: 2.242975126 },
      { id: "280002551932", votes: 2_605_148, percentage: 2.183680463 },
    ],
  },
  {
    observedAt: new Date("2026-10-05T12:51:05-03:00").getTime(),
    sourceUpdatedAt: "05/10/2026 12:51:05",
    sectionsCounted: 499_248,
    completed: true,
    candidates: [
      { id: "280002551544", votes: 56_104_503, percentage: 47.027772356 },
      { id: "280002542548", votes: 53_879_538, percentage: 45.162767911 },
      { id: "280002551547", votes: 3_448_569, percentage: 2.890650647 },
      { id: "280002540694", votes: 2_675_887, percentage: 2.242975126 },
      { id: "280002551932", votes: 2_605_148, percentage: 2.183680463 },
    ],
  },
];

const firstRoundArchiveUrl =
  "https://web.archive.org/web/20261006093612id_/https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json";

function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.observedAt !== "number" ||
    typeof record.sourceUpdatedAt !== "string" ||
    (record.sectionsCounted !== null && typeof record.sectionsCounted !== "number") ||
    (record.completed !== undefined && typeof record.completed !== "boolean") ||
    !Array.isArray(record.candidates)
  ) {
    return false;
  }
  return record.candidates.every((candidate: unknown) => {
    if (typeof candidate !== "object" || candidate === null) return false;
    const item = candidate as Record<string, unknown>;
    return typeof item.id === "string" && typeof item.votes === "number" && typeof item.percentage === "number";
  });
}

function readSnapshots(turn: number): Snapshot[] {
  const stored = window.localStorage.getItem(`apuracaoeleitoral:election-history:${turn}`);
  if (!stored) return [];
  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every(isSnapshot)) {
    throw new Error("O histórico local da apuração tem um formato inválido.");
  }
  const snapshots = parsed
    .filter(isSnapshot)
    .flatMap((snapshot) => {
      return snapshot.sectionsCounted === 0
        ? []
        : [{ ...snapshot, completed: snapshot.completed ?? false }];
    })
    .sort((left, right) => left.observedAt - right.observedAt);

  return snapshots.reduce<Snapshot[]>((sampled, snapshot) => {
    const previous = sampled[sampled.length - 1];
    if (!previous || snapshot.observedAt - previous.observedAt >= snapshotInterval || snapshot.completed) {
      sampled.push(snapshot);
    }
    return sampled;
  }, []);
}

const formatTime = (value: number) =>
  new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

function getTimeTicks(snapshots: Snapshot[], interval: number) {
  const first = snapshots[0]?.observedAt;
  const last = snapshots[snapshots.length - 1]?.observedAt;
  if (first == null || last == null) return [];

  const ticks = [first];
  for (let tick = Math.ceil(first / interval) * interval; tick < last; tick += interval) {
    ticks.push(tick);
  }
  if (last !== first) ticks.push(last);
  return ticks;
}

function formatTimeTick(value: number, first: number, last: number, interval: number) {
  if (value === first || value === last) return formatTime(value);
  if (interval === 60 * 60 * 1000) {
    const hour = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
    }).format(value);
    return `${hour}h`;
  }
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function ElectionEvolutionChart({
  turn,
  results,
  loading,
}: {
  turn: number;
  results: ElectionResults | null;
  loading: boolean;
}) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loadedTurn, setLoadedTurn] = useState<number | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (turn === 1) {
      setSnapshots([]);
      setHistoryError(null);
      setLoadedTurn(turn);
      return;
    }
    try {
      setSnapshots(readSnapshots(turn));
      setHistoryError(null);
    } catch (reason) {
      setHistoryError(reason instanceof Error ? reason.message : "Não foi possível ler o histórico local.");
      setSnapshots([]);
    }
    setLoadedTurn(turn);
  }, [turn]);

  useEffect(() => {
    if (
      turn === 1 ||
      loadedTurn !== turn ||
      historyError ||
      !results?.updatedAt ||
      results.sections?.counted == null ||
      results.sections.counted === 0 ||
      snapshots.some((snapshot) => snapshot.completed)
    ) return;
    const snapshot: Snapshot = {
      observedAt: Date.now(),
      sourceUpdatedAt: results.updatedAt,
      sectionsCounted: results.sections.counted,
      completed: results.completed,
      candidates: results.candidates
        .filter((candidate) => candidate.name.trim())
        .map(({ id, votes, percentage }) => ({ id, votes, percentage })),
    };
    if (snapshot.candidates.length === 0) return;

    setSnapshots((current) => {
      if (current.some((entry) => entry.completed)) return current;
      const previous = current[current.length - 1];
      if (previous && snapshot.observedAt - previous.observedAt < snapshotInterval && !snapshot.completed) {
        return current;
      }
      return [...current, snapshot].slice(-1200);
    });
  }, [historyError, loadedTurn, results, snapshots, turn]);

  useEffect(() => {
    if (turn === 1 || loadedTurn !== turn || snapshots.length === 0) return;
    try {
      window.localStorage.setItem(`apuracaoeleitoral:election-history:${turn}`, JSON.stringify(snapshots));
      setHistoryError(null);
    } catch (reason) {
      setHistoryError(reason instanceof Error ? reason.message : "Não foi possível salvar o histórico local.");
    }
  }, [loadedTurn, snapshots, turn]);

  const chartCandidates = turn === 1
    ? firstRoundCandidates
    : results?.candidates.filter((candidate) => candidate.name.trim()).slice(0, 2) ?? [];
  const chartSnapshots = turn === 1 ? firstRoundHistory : snapshots;
  const historyLoading = turn === 2 && (loadedTurn !== turn || (loading && !results));
  const visibleCandidateIds = new Set(chartCandidates.map((candidate) => candidate.id));
  const tickInterval = turn === 1 ? 60 * 60 * 1000 : snapshotInterval;
  const timeTicks = turn === 1
    ? getTimeTicks(chartSnapshots, tickInterval)
    : chartSnapshots.map((snapshot) => snapshot.observedAt);
  const firstTimestamp = chartSnapshots[0]?.observedAt ?? 0;
  const lastTimestamp = chartSnapshots[chartSnapshots.length - 1]?.observedAt ?? 0;
  const chartWidth = Math.max(1480, timeTicks.length * 72);
  const data = chartSnapshots.map((snapshot) => ({
    ...Object.fromEntries(
      snapshot.candidates
        .filter((candidate) => visibleCandidateIds.has(candidate.id))
        .map((candidate) => [candidate.id, candidate.percentage]),
    ),
    observedAt: snapshot.observedAt,
    sourceUpdatedAt: snapshot.sourceUpdatedAt,
  }));

  return (
    <section className="rounded-3xl border border-border-button-default bg-background-primary-default p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-caption-1-semibold uppercase tracking-wide text-text-tertiary">
            Acompanhamento por horário
          </p>
          <h2 className="mt-1 text-title-3-semibold text-text-primary">Evolução da apuração</h2>
          <p className="mt-1 text-body-2-regular text-text-secondary">
            {turn === 2
              ? "Percentuais oficiais observados a cada 10 minutos. Passe sobre a curva para consultar os valores e horários."
              : "Percentual de votos dos candidatos ao longo das publicações observadas."}
          </p>
        </div>
        <span className="rounded-full bg-background-secondary-default px-3 py-1.5 text-caption-1-medium text-text-secondary">
          {turn}º turno · Brasil
        </span>
      </div>

      {historyLoading ? (
        <div role="status" aria-label="Carregando histórico da apuração" className="mt-5 space-y-4">
          <span className="sr-only">Carregando histórico local da apuração…</span>
          <div className="flex h-80 items-end gap-3 rounded-2xl bg-background-secondary-default p-5">
            {Array.from({ length: 12 }, (_, index) => (
              <ElectionSkeleton
                key={index}
                className="min-w-4 flex-1 rounded-t-md rounded-b-none"
                style={{ height: `${24 + ((index * 17) % 63)}%` }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            {Array.from({ length: 3 }, (_, index) => (
              <ElectionSkeleton key={index} className="h-4 w-28" />
            ))}
          </div>
        </div>
      ) : turn === 2 && historyError ? (
        <p role="alert" className="mt-5 rounded-xl bg-background-secondary-default p-4 text-body-2-regular text-text-primary">
          {historyError}
        </p>
      ) : turn === 2 && results?.sections?.counted === 0 ? (
        <p role="status" className="mt-5 rounded-xl bg-background-secondary-default p-4 text-body-2-regular text-text-secondary">
          A evolução aparecerá quando a primeira votação oficial do segundo turno for publicada.
        </p>
      ) : chartSnapshots.length === 0 ? (
        <p className="mt-5 rounded-xl bg-background-secondary-default p-4 text-body-2-regular text-text-secondary">
          Ainda não há publicações do segundo turno neste dispositivo para traçar uma evolução.
        </p>
      ) : (
        <>
          <div className="mt-5 w-full overflow-x-auto overscroll-x-contain rounded-2xl bg-background-secondary-default">
            <div className="h-80 p-4" style={{ width: `${chartWidth}px` }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-separator-border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="observedAt"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  ticks={timeTicks}
                  interval={0}
                  tickFormatter={(value) => formatTimeTick(Number(value), firstTimestamp, lastTimestamp, tickInterval)}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={12}
                  tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
                />
                <YAxis
                  domain={[0, 100]}
                  width={42}
                  tickFormatter={(value: number) => `${value}%`}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }}
                />
                <Tooltip
                  labelFormatter={(value) => `Observado às ${formatTime(Number(value))}`}
                  formatter={(value, name) => [
                    `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`,
                    String(name),
                  ]}
                  cursor={{ stroke: "var(--color-chart-cursor)", strokeWidth: 1, strokeDasharray: "4 4" }}
                  contentStyle={{
                    background: "var(--color-background-primary-default)",
                    border: "1px solid var(--color-border-button-default)",
                    borderRadius: 12,
                    color: "var(--color-text-primary)",
                  }}
                />
                {chartCandidates.map((candidate) => {
                  const color = getCandidateColor(candidate);
                  return (
                    <Line
                      key={candidate.id}
                      dataKey={candidate.id}
                      name={candidate.name}
                      stroke={color.variable}
                      type="linear"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={false}
                      connectNulls
                    />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
            </div>
          </div>

          <ul aria-label="Candidatos do gráfico" className="mt-4 grid grid-cols-1 gap-x-5 sm:grid-cols-2 xl:grid-cols-3">
            {chartCandidates.map((candidate) => {
              const color = getCandidateColor(candidate);
              return (
                <li key={candidate.id} title={candidate.name} className="flex min-w-0 items-center gap-2 border-b border-separator-border py-2">
                  <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${color.activeBackground}`} />
                  <span className="min-w-0 flex-1 truncate text-caption-1-regular text-text-secondary">{candidate.name}</span>
                </li>
              );
            })}
          </ul>
          {turn === 1 && (
            <p className="mt-3 text-caption-1-regular text-text-tertiary">
                Série oficial do TSE, do início da apuração em 04/10 às 17:25 até a conclusão em 05/10 às 12:51. Eixo horário a cada hora; os pontos são as capturas oficiais disponíveis. Dados via{" "}
                <a href={firstRoundArchiveUrl} target="_blank" rel="noreferrer" className="underline hover:text-text-primary">
                  captura arquivada
                </a>.
            </p>
          )}
        </>
      )}
    </section>
  );
}
