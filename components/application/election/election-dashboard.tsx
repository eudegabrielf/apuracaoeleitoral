"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RiArrowRightLine,
  RiExternalLinkLine,
  RiGithubFill,
  RiMoonLine,
  RiRefreshLine,
  RiSunLine,
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

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applySystem = () => {
      if (!window.localStorage.getItem("apuracaoeleitoral:theme")) {
        root.classList.toggle("dark", media.matches);
        setDark(media.matches);
      }
    };

    setDark(root.classList.contains("dark"));
    media.addEventListener("change", applySystem);
    const observer = new MutationObserver(() => setDark(root.classList.contains("dark")));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => {
      media.removeEventListener("change", applySystem);
      observer.disconnect();
    };
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("apuracaoeleitoral:theme", next ? "dark" : "light");
    setDark(next);
  };

  return (
    <Button
      variant="secondary"
      size="small"
      iconOnly
      leadingIcon={dark ? RiSunLine : RiMoonLine}
      aria-label={dark ? "Ativar tema claro" : "Ativar tema escuro"}
      title={dark ? "Ativar tema claro" : "Ativar tema escuro"}
      onClick={toggle}
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
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-background-tertiary-default"
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
  const [selectedTurn, setSelectedTurn] = useState(2);
  const refreshInFlight = useRef(false);

  const refresh = useCallback(async (isInitial = false, signal?: AbortSignal) => {
    if (refreshInFlight.current || signal?.aborted) return;
    refreshInFlight.current = true;
    if (isInitial) setLoading(true);
    else setRefreshing(true);

    try {
      const [first, live] = await Promise.allSettled([
        fetchResults(1, "br", undefined, signal),
        fetchResults(2, "br", undefined, signal),
      ]);
      if (signal?.aborted) return;
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
      refreshInFlight.current = false;
      if (!signal?.aborted) {
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
    };
  }, [refresh]);

  const selectedResults = selectedTurn === 1 ? firstRound : liveResults;
  const selectedError = selectedTurn === 1 ? firstRoundError : liveError;
  const selectedTurnName = selectedTurn === 1 ? "Primeiro turno" : "Segundo turno";
  const isWaitingForRunoff =
    selectedTurn === 2 &&
    selectedResults != null &&
    selectedResults.sections?.counted === 0;
  const lastSync = useMemo(
    () => liveResults?.updatedAt ?? firstRound?.updatedAt ?? "Aguardando arquivo do TSE",
    [firstRound?.updatedAt, liveResults?.updatedAt],
  );
  const initialResultsLoading = loading && !selectedResults && !selectedError;

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
                  disabled={refreshing}
                  onClick={() => void refresh()}
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

            <section className="flex flex-wrap items-end justify-between gap-4 px-1">
              <div className="max-w-3xl">
                <p className="text-caption-1-semibold uppercase tracking-wide text-text-tertiary">
                  Cobertura eleitoral
                </p>
                <h1 className="mt-2 text-title-1-medium text-text-primary">
                  A apuração presidencial, em um só lugar.
                </h1>
                <p className="mt-2 text-body-regular text-text-secondary">
                  Acompanhe os resultados presidenciais oficiais em todo o Brasil, com consulta por estado e município neste painel.
                </p>
              </div>
              <a
                href="https://resultados.tse.jus.br/oficial/app/index.html"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-body-2-medium text-text-secondary hover:text-text-primary"
              >
                Abrir resultados oficiais <RiExternalLinkLine className="size-4" aria-hidden />
              </a>
            </section>

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

            <section
              aria-label={`Estatísticas nacionais do ${selectedTurnName.toLowerCase()}`}
              aria-busy={initialResultsLoading}
              className="border-y border-separator-border py-4"
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-caption-1-semibold uppercase tracking-wide text-text-tertiary">
                    Brasil · {selectedTurn}º turno
                  </p>
                  <h2 className="mt-1 text-title-3-semibold text-text-primary">Estatísticas da apuração</h2>
                </div>
                {initialResultsLoading ? (
                  <ElectionSkeleton className="h-3.5 w-40" />
                ) : (
                  <p className="text-caption-1-regular text-text-tertiary">
                    Atualização do TSE: {selectedResults?.updatedAt ?? "aguardando arquivo"}
                  </p>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-5 sm:grid-cols-3 xl:grid-cols-4">
                <div className="border-t border-separator-border py-3">
                  <dt className="text-caption-1-regular text-text-tertiary">Eleitorado apto</dt>
                  <dd className="mt-1 text-title-3-semibold tabular-nums text-text-primary">
                    {initialResultsLoading ? <ElectionSkeleton className="h-7 w-28" /> : formatNumber(selectedResults?.statistics.eligibleVoters)}
                  </dd>
                </div>
                <div className="border-t border-separator-border py-3">
                  <dt className="text-caption-1-regular text-text-tertiary">Comparecimento</dt>
                  <dd className="mt-1 text-title-3-semibold tabular-nums text-text-primary">
                    {initialResultsLoading ? <ElectionSkeleton className="h-7 w-24" /> : formatNumber(selectedResults?.statistics.voters)}
                  </dd>
                  <dd className="text-caption-1-regular tabular-nums text-text-secondary">
                    {initialResultsLoading ? <ElectionSkeleton className="mt-1 h-3 w-24" /> : formatPercent(
                      selectedResults?.statistics.eligibleVoters && selectedResults.statistics.voters != null
                        ? (selectedResults.statistics.voters / selectedResults.statistics.eligibleVoters) * 100
                        : null,
                    )}{!initialResultsLoading && " do eleitorado"}
                  </dd>
                </div>
                <div className="border-t border-separator-border py-3">
                  <dt className="text-caption-1-regular text-text-tertiary">Abstenções</dt>
                  <dd className="mt-1 text-title-3-semibold tabular-nums text-text-primary">
                    {initialResultsLoading ? <ElectionSkeleton className="h-7 w-24" /> : formatNumber(selectedResults?.statistics.abstentions)}
                  </dd>
                  <dd className="text-caption-1-regular tabular-nums text-text-secondary">
                    {initialResultsLoading ? <ElectionSkeleton className="mt-1 h-3 w-24" /> : `${formatPercent(selectedResults?.statistics.abstentionPercentage)} do eleitorado`}
                  </dd>
                </div>
                <div className="border-t border-separator-border py-3">
                  <dt className="text-caption-1-regular text-text-tertiary">Votos válidos</dt>
                  <dd className="mt-1 text-title-3-semibold tabular-nums text-text-primary">
                    {initialResultsLoading ? <ElectionSkeleton className="h-7 w-24" /> : formatNumber(selectedResults?.statistics.validVotes)}
                  </dd>
                </div>
                <div className="border-t border-separator-border py-3">
                  <dt className="text-caption-1-regular text-text-tertiary">Votos em branco</dt>
                  <dd className="mt-1 text-title-3-semibold tabular-nums text-text-primary">
                    {initialResultsLoading ? <ElectionSkeleton className="h-7 w-20" /> : formatNumber(selectedResults?.statistics.blankVotes)}
                  </dd>
                  <dd className="text-caption-1-regular tabular-nums text-text-secondary">
                    {initialResultsLoading ? <ElectionSkeleton className="mt-1 h-3 w-24" /> : formatPercent(
                      selectedResults?.statistics.voters && selectedResults.statistics.blankVotes != null
                        ? (selectedResults.statistics.blankVotes / selectedResults.statistics.voters) * 100
                        : null,
                    )}{!initialResultsLoading && " dos votantes"}
                  </dd>
                </div>
                <div className="border-t border-separator-border py-3">
                  <dt className="text-caption-1-regular text-text-tertiary">Votos nulos</dt>
                  <dd className="mt-1 text-title-3-semibold tabular-nums text-text-primary">
                    {initialResultsLoading ? <ElectionSkeleton className="h-7 w-20" /> : formatNumber(selectedResults?.statistics.nullVotes)}
                  </dd>
                  <dd className="text-caption-1-regular tabular-nums text-text-secondary">
                    {initialResultsLoading ? <ElectionSkeleton className="mt-1 h-3 w-24" /> : formatPercent(
                      selectedResults?.statistics.voters && selectedResults.statistics.nullVotes != null
                        ? (selectedResults.statistics.nullVotes / selectedResults.statistics.voters) * 100
                        : null,
                    )}{!initialResultsLoading && " dos votantes"}
                  </dd>
                </div>
                <div className="border-t border-separator-border py-3">
                  <dt className="text-caption-1-regular text-text-tertiary">Seções totalizadas</dt>
                  <dd className="mt-1 text-title-3-semibold tabular-nums text-text-primary">
                    {initialResultsLoading ? <ElectionSkeleton className="h-7 w-28" /> : selectedResults?.sections?.counted == null
                      ? "—"
                      : `${formatNumber(selectedResults.sections.counted)} / ${formatNumber(selectedResults.sections.total)}`}
                  </dd>
                  <dd className="text-caption-1-regular tabular-nums text-text-secondary">
                    {initialResultsLoading ? <ElectionSkeleton className="mt-1 h-3 w-16" /> : formatPercent(selectedResults?.sections?.percentage)}
                  </dd>
                </div>
              </dl>
            </section>

            <CandidatePanel
              title={selectedTurn === 1 ? "Primeiro turno" : "Segundo turno · 25 de outubro"}
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
