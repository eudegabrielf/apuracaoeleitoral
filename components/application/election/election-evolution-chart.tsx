"use client";

import Image from "next/image";
import { useEffect, useId, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getCandidateColor } from "@/components/application/election/candidate-colors";
import type { ElectionResults } from "@/components/application/election/election-dashboard";

type Snapshot = {
  observedAt: number;
  sourceUpdatedAt: string;
  sectionsCounted: number | null;
  candidates: { id: string; votes: number; percentage: number }[];
};

function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.observedAt !== "number" ||
    typeof record.sourceUpdatedAt !== "string" ||
    (record.sectionsCounted !== null && typeof record.sectionsCounted !== "number") ||
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
  const stored = window.localStorage.getItem(`boardui:election-history:${turn}`);
  if (!stored) return [];
  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every(isSnapshot)) {
    throw new Error("O histórico local da apuração tem um formato inválido.");
  }
  return parsed.filter(isSnapshot);
}

const formatTime = (value: number) =>
  new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function ElectionEvolutionChart({
  turn,
  results,
}: {
  turn: number;
  results: ElectionResults | null;
}) {
  const gradientId = useId().replace(/:/g, "");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loadedTurn, setLoadedTurn] = useState<number | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
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
    if (loadedTurn !== turn || historyError || !results?.updatedAt || results.sections.counted === 0) return;

    const snapshot: Snapshot = {
      observedAt: Date.now(),
      sourceUpdatedAt: results.updatedAt,
      sectionsCounted: results.sections.counted,
      candidates: results.candidates.map(({ id, votes, percentage }) => ({ id, votes, percentage })),
    };

    setSnapshots((current) => {
      const previous = current[current.length - 1];
      const previousSignature = previous
        ? JSON.stringify([previous.sourceUpdatedAt, previous.sectionsCounted, previous.candidates])
        : null;
      const nextSignature = JSON.stringify([snapshot.sourceUpdatedAt, snapshot.sectionsCounted, snapshot.candidates]);
      if (previousSignature === nextSignature) return current;
      return [...current, snapshot].slice(-1200);
    });
  }, [historyError, loadedTurn, results, turn]);

  useEffect(() => {
    if (loadedTurn !== turn || snapshots.length === 0) return;
    try {
      window.localStorage.setItem(`boardui:election-history:${turn}`, JSON.stringify(snapshots));
      setHistoryError(null);
    } catch (reason) {
      setHistoryError(reason instanceof Error ? reason.message : "Não foi possível salvar o histórico local.");
    }
  }, [loadedTurn, snapshots, turn]);

  const chartCandidates = results?.candidates.slice(0, turn === 1 ? 5 : 2) ?? [];
  const data = snapshots.map((snapshot) => ({
    ...Object.fromEntries(snapshot.candidates.map((candidate) => [candidate.id, candidate.percentage])),
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
            Percentual de votos dos candidatos ao longo das publicações observadas.
          </p>
        </div>
        <span className="rounded-full bg-background-secondary-default px-3 py-1.5 text-caption-1-medium text-text-secondary">
          {turn}º turno · Brasil
        </span>
      </div>

      {historyError ? (
        <p role="alert" className="mt-5 rounded-xl bg-background-secondary-default p-4 text-body-2-regular text-text-primary">
          {historyError}
        </p>
      ) : turn === 2 && results?.sections.counted === 0 ? (
        <p role="status" className="mt-5 rounded-xl bg-background-secondary-default p-4 text-body-2-regular text-text-secondary">
          A evolução aparecerá quando a primeira votação oficial do segundo turno for publicada.
        </p>
      ) : snapshots.length === 0 ? (
        <p className="mt-5 rounded-xl bg-background-secondary-default p-4 text-body-2-regular text-text-secondary">
          Ainda não há publicações para traçar uma evolução. O histórico neste dispositivo começa quando um resultado oficial for atualizado.
        </p>
      ) : (
        <>
          <div className="mt-5 h-80 w-full min-w-0 rounded-2xl bg-background-secondary-default p-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <defs>
                  {chartCandidates.map((candidate) => {
                    const color = getCandidateColor(candidate);
                    return (
                      <linearGradient key={candidate.id} id={`${gradientId}-${candidate.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color.variable} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={color.variable} stopOpacity={0} />
                      </linearGradient>
                    );
                  })}
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-separator-border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="observedAt"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={formatTime}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={12}
                  tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }}
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
                  formatter={(value, name) => [`${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`, String(name)]}
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
                    <Area
                      key={`area-${candidate.id}`}
                      type="monotone"
                      dataKey={candidate.id}
                      stroke="none"
                      fill={`url(#${gradientId}-${candidate.id})`}
                      connectNulls
                      isAnimationActive={false}
                    />
                  );
                })}
                {chartCandidates.map((candidate) => {
                  const color = getCandidateColor(candidate);
                  return (
                    <Line
                      key={candidate.id}
                      dataKey={candidate.id}
                      name={candidate.name}
                      stroke={color.variable}
                      type="monotone"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 5, fill: color.variable, stroke: "var(--color-background-secondary-default)", strokeWidth: 2 }}
                      connectNulls
                    />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <ul aria-label="Candidatos exibidos no gráfico" className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {chartCandidates.map((candidate) => {
              const color = getCandidateColor(candidate);
              return (
                <li key={candidate.id} className="flex items-center gap-2">
                  <span aria-hidden className={`size-2.5 rounded-full ${color.activeBackground}`} />
                  <Image
                    src={`/election/candidates/${candidate.id}.jpg`}
                    alt={`Foto oficial de campanha de ${candidate.name}`}
                    width={24}
                    height={24}
                    className="size-6 rounded-full border border-border-button-default object-cover"
                  />
                  <span className="text-caption-1-regular text-text-secondary">{candidate.name}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-caption-1-regular text-text-tertiary">
            As amostras são registradas a partir do momento em que este dispositivo observa novas publicações oficiais; não há pontos anteriores estimados.
          </p>
        </>
      )}
    </section>
  );
}
