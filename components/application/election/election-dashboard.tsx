"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RiArrowRightLine,
  RiExternalLinkLine,
  RiGithubFill,
  RiRefreshLine,
  RiTimeLine,
} from "@remixicon/react";
import { Badge } from "@/components/base/badges/badge";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { PillTab, PillTabList } from "@/components/base/tabs/pill-tab";
import { ElectionEvolutionChart } from "@/components/application/election/election-evolution-chart";
import { ElectionRegions } from "@/components/application/election/election-regions";
import { ElectionDataNotice } from "@/components/application/election/election-data-notice";
import { getCandidateColor } from "@/components/application/election/candidate-colors";
import { ElectionSkeleton } from "@/components/application/election/election-skeleton";
import { ThemeToggle } from "@/components/application/election/theme-toggle";
import { cx } from "@/utils/cx";

type Candidate = {
  id: string;
  number: string;
  name: string;
  party: string;
  votes: number;
  percentage: number;
};

export type ElectionResults = {
  turn: number;
  uf: string;
  sourceUrl: string;
  updatedAt: string | null;
  completed: boolean;
  sections?: { total: number | null; counted: number | null; percentage: number | null };
  statistics: {
    eligibleVoters: number | null;
    voters: number | null;
    abstentions: number | null;
    abstentionPercentage: number | null;
    validVotes: number | null;
    blankVotes: number | null;
    nullVotes: number | null;
  };
  candidates: Candidate[];
};

const numberFormat = new Intl.NumberFormat("pt-BR");
const percentFormat = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const refreshInterval = 30_000;
const brazilDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function isElectionDayOrLater(now = new Date()) {
  const dateParts = Object.fromEntries(
    brazilDateFormatter.formatToParts(now).map(({ type, value }) => [type, value]),
  );
  const localDate = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
  return localDate >= "2026-10-25";
}

function getMillisecondsUntilNextBrazilianMidnight(now: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });
  const getLocalTimestamp = (date: Date) => {
    const parts = Object.fromEntries(
      formatter.formatToParts(date).map(({ type, value }) => [type, Number(value)]),
    );
    return Date.UTC(
      parts.year ?? 0,
      (parts.month ?? 1) - 1,
      parts.day ?? 1,
      parts.hour ?? 0,
      parts.minute ?? 0,
      parts.second ?? 0,
    );
  };
  const localNow = getLocalTimestamp(now);
  const localDate = new Date(localNow);
  const midnightTomorrow = Date.UTC(
    localDate.getUTCFullYear(),
    localDate.getUTCMonth(),
    localDate.getUTCDate() + 1,
  );
  const offset = localNow - Math.floor(now.getTime() / 1000) * 1000;
  let target = midnightTomorrow - offset;
  target = midnightTomorrow - (getLocalTimestamp(new Date(target)) - Math.floor(target / 1000) * 1000);
  return Math.max(0, target - now.getTime() + 50);
}

function formatNumber(value: number | null | undefined) {
  return value == null ? "—" : numberFormat.format(value);
}

function formatPercent(value: number | null | undefined) {
  return value == null ? "—" : `${percentFormat.format(value)}%`;
}

function CandidatePhoto({ candidate, size = "medium" }: { candidate: Candidate; size?: "small" | "medium" }) {
  const dimensions = size === "small" ? "size-10" : "size-14";
  const pixels = size === "small" ? 40 : 56;

  return (
    <Image
      src={`/election/candidates/${candidate.id}.jpg`}
      alt={`Foto oficial de campanha de ${candidate.name}`}
      width={pixels}
      height={pixels}
      className={cx(dimensions, "shrink-0 rounded-full border border-border-button-default object-cover")}
    />
  );
}

async function fetchResults(
  turn: number,
  uf = "br",
  municipality?: string,
  signal?: AbortSignal,
): Promise<ElectionResults> {
  const city = municipality ? `&municipio=${municipality}` : "";
  const response = await fetch(`/api/election/results?turn=${turn}&uf=${uf}${city}`, {
    cache: "no-store",
    signal,
  });
  const result = (await response.json()) as ElectionResults | { error?: string };

  if (!response.ok) {
    throw new Error("error" in result ? result.error : "Não foi possível consultar a apuração do TSE.");
  }

  return result as ElectionResults;
}

function CandidateResult({
  candidate,
  rank,
  compact = false,
}: {
  candidate: Candidate;
  rank: number;
  compact?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {compact ? (
        <span className="w-5 shrink-0 text-caption-1-medium tabular-nums text-text-tertiary">
          {rank.toString().padStart(2, "0")}
        </span>
      ) : null}
      <CandidatePhoto candidate={candidate} size={compact ? "small" : "medium"} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="truncate text-body-medium text-text-primary">{candidate.name}</p>
          <p className="shrink-0 text-body-medium tabular-nums text-text-primary">
            {formatPercent(candidate.percentage)}
          </p>
        </div>
        <p className="truncate text-caption-1-regular text-text-secondary">
          {candidate.party} · {formatNumber(candidate.votes)} votos
        </p>
        <div
          aria-label={`${formatPercent(candidate.percentage)} dos votos`}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-background-quaternary-default"
        >
          <div
            className={cx("h-full rounded-full transition-[width]", getCandidateColor(candidate).activeBackground)}
            style={{ width: `${Math.max(0, Math.min(100, candidate.percentage))}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function CandidatePanel({
  title,
  subtitle,
  results,
  loading,
  error,
  turn,
}: {
  title: string;
  subtitle: string;
  results: ElectionResults | null;
  loading: boolean;
  error: string | null;
  turn: number;
}) {
  const candidates = results?.candidates ?? [];
  const sectionsCounted = results?.sections?.counted ?? 0;
  const waiting = turn === 2 && sectionsCounted === 0;

  return (
    <section className="rounded-3xl border border-border-button-default bg-background-primary-default p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-caption-1-semibold uppercase tracking-wide text-text-tertiary">{subtitle}</p>
          <h2 className="mt-1 text-title-3-semibold text-text-primary">{title}</h2>
        </div>
        <Badge color="neutral">
          {loading
            ? "Consultando TSE"
            : error
              ? "Última consulta disponível"
              : waiting
                ? "Apuração ainda não iniciada"
                : "Dados do TSE"}
        </Badge>
      </div>

      {loading && !results ? (
        <div role="status" aria-label="Carregando resultados oficiais" className="mt-5 flex flex-col gap-5">
          <span className="sr-only">Carregando dados oficiais do TSE…</span>
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="flex min-w-0 items-center gap-3">
              <ElectionSkeleton className="size-10 rounded-full" />
              <div className="min-w-0 flex-1">
                <ElectionSkeleton className="h-4 w-2/3" />
                <ElectionSkeleton className="mt-2 h-3 w-1/3" />
                <ElectionSkeleton className="mt-2 h-1.5 w-full rounded-full" />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <ElectionSkeleton className="h-4 w-20" />
                <ElectionSkeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
      ) : candidates.length > 0 ? (
        <div className="mt-5 flex flex-col gap-5">
          {candidates.map((candidate, index) => (
            <CandidateResult key={candidate.id} candidate={candidate} rank={index + 1} compact />
          ))}
        </div>
      ) : !error ? (
        <p className="mt-5 rounded-2xl bg-background-secondary-default p-4 text-body-regular text-text-secondary">
          O TSE ainda não publicou dados de votação para este recorte.
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-separator-border pt-4">
        <span className="inline-flex items-center gap-1.5 text-caption-1-regular text-text-tertiary">
          <RiTimeLine className="size-4" aria-hidden />
          Atualização informada pelo TSE: {results?.updatedAt ?? "aguardando arquivo"}
        </span>
        {results && (
          <a
            href={results.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-caption-1-medium text-text-secondary hover:text-text-primary"
          >
            Fonte TSE <RiExternalLinkLine className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
    </section>
  );
}

export function ElectionDashboard() {
  const [firstRound, setFirstRound] = useState<ElectionResults | null>(null);
  const [liveResults, setLiveResults] = useState<ElectionResults | null>(null);
  const [firstRoundError, setFirstRoundError] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshIconSpinning, setRefreshIconSpinning] = useState(false);
  const [selectedTurn, setSelectedTurn] = useState(2);
  const [electionDayReached, setElectionDayReached] = useState(false);
  const refreshSequence = useRef(0);
  const refreshIconTimer = useRef<number | null>(null);

  const refresh = useCallback(async (isInitial = false, signal?: AbortSignal) => {
    if (signal?.aborted) return;
    const requestId = ++refreshSequence.current;
    if (isInitial) setLoading(true);
    else setRefreshing(true);

    try {
      const [first, live] = await Promise.allSettled([
        fetchResults(1, "br", undefined, signal),
        fetchResults(2, "br", undefined, signal),
      ]);
      if (signal?.aborted || requestId !== refreshSequence.current) return;
      if (first.status === "fulfilled") {
        setFirstRound(first.value);
        setFirstRoundError(null);
      } else {
        setFirstRoundError(first.reason instanceof Error ? first.reason.message : "Falha ao consultar o TSE.");
      }
      if (live.status === "fulfilled") {
        setLiveResults(live.value);
        setLiveError(null);
      } else {
        setLiveError(live.reason instanceof Error ? live.reason.message : "Falha ao consultar o TSE.");
      }
    } finally {
      if (!signal?.aborted && requestId === refreshSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(true, controller.signal);
    const timer = window.setInterval(() => void refresh(false, controller.signal), refreshInterval);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      if (refreshIconTimer.current !== null) {
        window.clearTimeout(refreshIconTimer.current);
      }
    };
  }, [refresh]);

  const refreshManually = () => {
    setRefreshIconSpinning(true);
    if (refreshIconTimer.current !== null) {
      window.clearTimeout(refreshIconTimer.current);
    }
    refreshIconTimer.current = window.setTimeout(() => {
      setRefreshIconSpinning(false);
      refreshIconTimer.current = null;
    }, 3000);
    void refresh();
  };

  useEffect(() => {
    let timer: number | null = null;
    const updateElectionDay = () => {
      const now = new Date();
      setElectionDayReached(isElectionDayOrLater(now));
      if (isElectionDayOrLater(now)) return;
      timer = window.setTimeout(updateElectionDay, getMillisecondsUntilNextBrazilianMidnight(now));
    };

    updateElectionDay();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  const selectedResults = selectedTurn === 1 ? firstRound : liveResults;
  const selectedError = selectedTurn === 1 ? firstRoundError : liveError;
  const isWaitingForRunoff =
    selectedTurn === 2 &&
    selectedResults != null &&
    selectedResults.sections?.counted === 0;
  const isRunoffCounting =
    liveResults?.sections?.counted != null &&
    liveResults.sections.counted > 0;
  const lastSync = useMemo(
    () => liveResults?.updatedAt ?? firstRound?.updatedAt ?? "Aguardando arquivo do TSE",
    [firstRound?.updatedAt, liveResults?.updatedAt],
  );
  return (
    <div className="min-h-screen bg-background-full p-3 sm:p-4">
      <div className="mx-auto w-full max-w-[1600px]">
        <main className="min-w-0 rounded-3xl bg-background-full lg:px-2 lg:py-2">
          <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 pb-8">
            <header className="relative flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border-button-default bg-background-primary-default px-5 py-3 shadow-card">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-body-medium text-text-primary">Apuração</p>
                  <p className="text-caption-1-regular text-text-tertiary">Eleição presidencial · 2026</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-background-secondary-default px-3 py-2 text-caption-1-medium text-text-secondary">
                  <span className="size-2 rounded-full bg-text-primary" aria-hidden />
                  Atualização automática · 30 s
                </span>
                <Button
                  variant="secondary"
                  size="small"
                  leadingIcon={RiRefreshLine}
                  className={refreshIconSpinning ? "[&_svg]:animate-spin" : undefined}
                  onClick={refreshManually}
                >
                  Atualizar
                </Button>
              </div>
              <div className="absolute end-5 top-3 flex items-center gap-1 sm:static">
                <ThemeToggle />
                <a
                  href="https://github.com/eudegabrielf"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Perfil de Eude Gabriel no GitHub"
                  title="Perfil de Eude Gabriel no GitHub"
                  className="flex size-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-background-secondary-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                >
                  <RiGithubFill className="size-5" aria-hidden />
                </a>
              </div>
            </header>

            {!isRunoffCounting && (
              <section
                aria-label="Simulador de segundo turno"
                className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border-button-default bg-background-secondary-default p-5 shadow-card sm:px-6"
              >
                <div className="max-w-2xl">
                  <p className="text-caption-1-semibold uppercase tracking-wide text-text-tertiary">
                    Cenários eleitorais
                  </p>
                  <h2 className="mt-1 text-title-3-semibold text-text-primary">
                    Simulador de segundo turno
                  </h2>
                  <p className="mt-1 text-body-2-regular text-text-secondary">
                    Configure migrações de votos para explorar cenários hipotéticos, sem alterar os resultados oficiais.
                  </p>
                </div>
                <ButtonLink
                  href="/simulador-2t"
                  variant="secondary"
                  size="medium"
                  trailingIcon={RiArrowRightLine}
                  className="simulator-cta"
                >
                  Simular segundo turno
                </ButtonLink>
              </section>
            )}

            <section
              aria-label="Turno dos resultados nacionais"
              className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border-button-default bg-background-primary-default px-5 py-3 shadow-card"
            >
              <div>
                <p className="text-body-medium text-text-primary">Resultados do Brasil</p>
                <p className="text-caption-1-regular text-text-tertiary">
                  Resultados presidenciais consolidados por turno
                </p>
              </div>
              <PillTabList aria-label="Turno dos resultados nacionais">
                <PillTab
                  variant="gray"
                  isSelected={selectedTurn === 1}
                  onSelect={() => setSelectedTurn(1)}
                >
                  1º turno
                </PillTab>
                <PillTab
                  variant="gray"
                  isSelected={selectedTurn === 2}
                  onSelect={() => setSelectedTurn(2)}
                >
                  2º turno
                </PillTab>
              </PillTabList>
            </section>

            {isWaitingForRunoff && (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-background-secondary-default px-4 py-3"
              >
                <p className="text-body-2-regular text-text-secondary">
                  O TSE ainda não iniciou a apuração do segundo turno. Os dados serão atualizados automaticamente.
                </p>
                <Badge color="neutral">Aguardando apuração</Badge>
              </div>
            )}

            {selectedError && (
              <ElectionDataNotice
                message={selectedError}
                detail="Os resultados serão exibidos quando a consulta oficial estiver disponível. Nenhum voto é estimado."
              />
            )}

            <CandidatePanel
              title={
                selectedTurn === 1
                  ? "Primeiro turno"
                  : electionDayReached
                    ? "Segundo turno"
                    : "Segundo turno · 25 de outubro"
              }
              subtitle={selectedTurn === 1 ? "Resultado oficial · Brasil" : "Apuração nacional ao vivo"}
              results={selectedResults}
              loading={loading}
              error={selectedError}
              turn={selectedTurn}
            />

            <ElectionRegions turn={selectedTurn} />

            <ElectionEvolutionChart turn={selectedTurn} results={selectedResults} loading={loading} />

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-separator-border px-1 pt-4">
              <p className="text-caption-1-regular text-text-tertiary">
                Créditos: dados eleitorais e fotografias de campanha — Tribunal Superior Eleitoral; malhas geográficas — IBGE.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-caption-1-regular tabular-nums text-text-tertiary">
                  Última atualização oficial: {lastSync}
                </p>
                <a
                  href="https://github.com/eudegabrielf"
                  target="_blank"
                  rel="noreferrer"
                  className="text-caption-1-medium text-text-secondary hover:text-text-primary"
                >
                  Desenvolvido por Eude Gabriel
                </a>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
