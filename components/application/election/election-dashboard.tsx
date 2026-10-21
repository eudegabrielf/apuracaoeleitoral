"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RiBarChartBoxLine,
  RiDashboardLine,
  RiExternalLinkLine,
  RiMap2Line,
  RiMoonLine,
  RiRefreshLine,
  RiSunLine,
  RiTimeLine,
  RiUserLine,
} from "@remixicon/react";
import { Badge } from "@/components/base/badges/badge";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { PillTab, PillTabList } from "@/components/base/tabs/pill-tab";
import { ElectionEvolutionChart } from "@/components/application/election/election-evolution-chart";
import { getCandidateColor } from "@/components/application/election/candidate-colors";
import { ElectionMap, type MapFeature } from "@/components/application/election/election-map";
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
  sections: { total: number | null; counted: number | null; percentage: number | null };
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
      if (!window.localStorage.getItem("boardui:theme")) {
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
    window.localStorage.setItem("boardui:theme", next ? "dark" : "light");
    setDark(next);
  };

  return (
    <Button
      variant="secondary"
      size="small"
      leadingIcon={dark ? RiSunLine : RiMoonLine}
      aria-label={dark ? "Ativar tema claro" : "Ativar tema escuro"}
      onClick={toggle}
    >
      {dark ? "Tema claro" : "Tema escuro"}
    </Button>
  );
}

async function fetchResults(turn: number, uf = "br", municipality?: string): Promise<ElectionResults> {
  const city = municipality ? `&municipio=${municipality}` : "";
  const response = await fetch(`/api/election/results?turn=${turn}&uf=${uf}${city}`, {
    cache: "no-store",
  });
  const result = (await response.json()) as ElectionResults | { error?: string };

  if (!response.ok) {
    throw new Error("error" in result ? result.error : "Não foi possível consultar a apuração do TSE.");
  }

  return result as ElectionResults;
}

function ResultCard({
  icon: Icon,
  title,
  value,
  detail,
}: {
  icon: typeof RiBarChartBoxLine;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-5 rounded-3xl border border-border-button-default bg-background-primary-default p-5 shadow-card">
      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-background-secondary-default p-2.5 text-foreground-icon-secondary">
          <Icon className="size-5" aria-hidden />
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-body-2-medium text-text-secondary">{title}</p>
        <p className="mt-1 truncate text-title-2-medium tabular-nums text-text-primary">{value}</p>
        <p className="mt-1 text-caption-1-regular text-text-tertiary">{detail}</p>
      </div>
    </div>
  );
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
  const sectionsCounted = results?.sections.counted ?? 0;
  const waiting = turn === 2 && sectionsCounted === 0;

  return (
    <section className="rounded-3xl border border-border-button-default bg-background-primary-default p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-caption-1-semibold uppercase tracking-wide text-text-tertiary">{subtitle}</p>
          <h2 className="mt-1 text-title-3-semibold text-text-primary">{title}</h2>
        </div>
        <Badge color="neutral">
          {loading ? "Consultando TSE" : waiting ? "Apuração ainda não iniciada" : "Dados do TSE"}
        </Badge>
      </div>

      {error ? (
        <div role="alert" className="mt-5 rounded-2xl bg-background-secondary-default p-4">
          <p className="text-body-medium text-text-primary">{error}</p>
          <p className="mt-1 text-body-2-regular text-text-secondary">
            Nenhum número de votação foi substituído por valores estimados.
          </p>
        </div>
      ) : loading && !results ? (
        <div className="mt-5 flex min-h-32 items-center justify-center text-body-regular text-text-secondary">
          Carregando dados oficiais…
        </div>
      ) : candidates.length > 0 ? (
        <div className="mt-5 flex flex-col gap-5">
          {candidates.map((candidate, index) => (
            <CandidateResult key={candidate.id} candidate={candidate} rank={index + 1} compact />
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-2xl bg-background-secondary-default p-4 text-body-regular text-text-secondary">
          O TSE ainda não publicou dados de votação para este recorte.
        </p>
      )}

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

function Sidebar() {
  const navigation = [
    { label: "Visão geral", href: "/", icon: RiDashboardLine },
    { label: "Mapa e localidades", href: "/mapa-apuracoes", icon: RiMap2Line },
  ];

  return (
    <aside className="fixed inset-y-4 start-4 z-20 hidden h-[calc(100vh-2rem)] w-60 flex-col rounded-3xl border border-border-button-default bg-background-primary-default p-4 shadow-card lg:flex">
      <Link href="/" className="flex items-center gap-3 rounded-2xl p-2">
        <span>
          <span className="block text-body-medium text-text-primary">Apuração</span>
          <span className="block text-caption-1-regular text-text-secondary">Eleições 2026</span>
        </span>
      </Link>
      <nav aria-label="Navegação principal" className="mt-8 flex flex-col gap-1">
        <p className="px-3 pb-2 text-caption-1-semibold uppercase tracking-wide text-text-tertiary">
          Painel
        </p>
        {navigation.map(({ label, href, icon: Icon }, index) => (
          <Link
            key={href}
            href={href}
            aria-current={index === 0 ? "page" : undefined}
            className={cx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-2-medium transition-colors",
              index === 0
                ? "bg-background-secondary-default text-text-primary"
                : "text-text-secondary hover:bg-background-secondary-default hover:text-text-primary",
            )}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-3 border-t border-separator-border pt-4">
        <ThemeToggle />
        <a
          href="https://resultados.tse.jus.br/oficial/app/index.html"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-2 text-caption-1-regular text-text-tertiary hover:text-text-primary"
        >
          Portal oficial do TSE <RiExternalLinkLine className="size-3.5" aria-hidden />
        </a>
      </div>
    </aside>
  );
}

export function ElectionDashboard() {
  const router = useRouter();
  const [firstRound, setFirstRound] = useState<ElectionResults | null>(null);
  const [liveResults, setLiveResults] = useState<ElectionResults | null>(null);
  const [firstRoundError, setFirstRoundError] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTurn, setSelectedTurn] = useState(2);

  const refresh = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    else setRefreshing(true);

    const [first, live] = await Promise.allSettled([fetchResults(1), fetchResults(2)]);
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

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void refresh(true);
    const timer = window.setInterval(() => void refresh(), refreshInterval);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const selectedResults = selectedTurn === 1 ? firstRound : liveResults;
  const selectedError = selectedTurn === 1 ? firstRoundError : liveError;
  const selectedTurnName = selectedTurn === 1 ? "Primeiro turno" : "Segundo turno";
  const isWaitingForRunoff =
    selectedTurn === 2 &&
    selectedResults != null &&
    selectedResults.sections.counted === 0;
  const lastSync = useMemo(
    () => liveResults?.updatedAt ?? firstRound?.updatedAt ?? "Aguardando arquivo do TSE",
    [firstRound?.updatedAt, liveResults?.updatedAt],
  );

  return (
    <div className="min-h-screen bg-background-full p-3 sm:p-4">
      <div className="mx-auto w-full max-w-[1600px] lg:ps-64">
        <Sidebar />

        <main className="min-w-0 rounded-3xl bg-background-full lg:px-2 lg:py-2">
          <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 pb-8">
            <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border-button-default bg-background-primary-default px-5 py-3 shadow-card">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-background-secondary-default text-foreground-icon-primary lg:hidden">
                  <RiBarChartBoxLine className="size-5" aria-hidden />
                </span>
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
                <ButtonLink
                  href="/mapa-apuracoes"
                  variant="secondary"
                  size="small"
                  leadingIcon={RiMap2Line}
                >
                  Mapa
                </ButtonLink>
                <span className="lg:hidden"><ThemeToggle /></span>
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
                  Acompanhe os resultados presidenciais oficiais em todo o Brasil. Os detalhes por estado e município estão no mapa eleitoral.
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
              <p
                role="alert"
                className="rounded-2xl border border-border-error-default bg-background-tertiary-default p-4 text-body-2-regular text-text-primary"
              >
                {selectedError}
              </p>
            )}

            <section aria-label={`Indicadores nacionais do ${selectedTurnName.toLowerCase()}`} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ResultCard
                icon={RiBarChartBoxLine}
                title={`Votos válidos · ${selectedTurn}º turno`}
                value={formatNumber(selectedResults?.statistics.validVotes)}
                detail="Resultado presidencial oficial"
              />
              <ResultCard
                icon={RiDashboardLine}
                title="Eleitorado apto"
                value={formatNumber(selectedResults?.statistics.eligibleVoters)}
                detail="Total de eleitores registrados"
              />
              <ResultCard
                icon={RiMap2Line}
                title="Seções totalizadas"
                value={
                  selectedResults?.sections.counted == null
                    ? "—"
                    : `${formatNumber(selectedResults.sections.counted)} / ${formatNumber(selectedResults.sections.total)}`
                }
                detail={formatPercent(selectedResults?.sections.percentage)}
              />
              <ResultCard
                icon={RiTimeLine}
                title={`Comparecimento · ${selectedTurn}º turno`}
                value={formatNumber(selectedResults?.statistics.voters)}
                detail={`${formatPercent(
                  selectedResults?.statistics.eligibleVoters && selectedResults.statistics.voters != null
                    ? (selectedResults.statistics.voters / selectedResults.statistics.eligibleVoters) * 100
                    : null,
                )} do eleitorado apto`}
              />
              <ResultCard
                icon={RiUserLine}
                title={`Abstenções · ${selectedTurn}º turno`}
                value={formatNumber(selectedResults?.statistics.abstentions)}
                detail={`${formatPercent(selectedResults?.statistics.abstentionPercentage)} do eleitorado apto`}
              />
              <ResultCard
                icon={RiBarChartBoxLine}
                title="Votos em branco"
                value={formatNumber(selectedResults?.statistics.blankVotes)}
                detail={`${formatPercent(
                  selectedResults?.statistics.voters && selectedResults.statistics.blankVotes != null
                    ? (selectedResults.statistics.blankVotes / selectedResults.statistics.voters) * 100
                    : null,
                )} dos votos registrados`}
              />
              <ResultCard
                icon={RiBarChartBoxLine}
                title="Votos nulos"
                value={formatNumber(selectedResults?.statistics.nullVotes)}
                detail={`${formatPercent(
                  selectedResults?.statistics.voters && selectedResults.statistics.nullVotes != null
                    ? (selectedResults.statistics.nullVotes / selectedResults.statistics.voters) * 100
                    : null,
                )} dos votos registrados`}
              />
            </section>

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
              <CandidatePanel
                title={selectedTurn === 1 ? "Primeiro turno" : "Segundo turno · 25 de outubro"}
                subtitle={selectedTurn === 1 ? "Resultado oficial · Brasil" : "Apuração nacional ao vivo"}
                results={selectedResults}
                loading={loading}
                error={selectedError}
                turn={selectedTurn}
              />

              <ElectionMap
                selectedState={null}
                selectedMunicipality={null}
                turn={selectedTurn}
                preview
                onSelectState={(_feature: MapFeature | null) => router.push("/mapa-apuracoes")}
                onSelectMunicipality={() => router.push("/mapa-apuracoes")}
              />
            </div>

            <ElectionEvolutionChart turn={selectedTurn} results={selectedResults} />

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-separator-border px-1 pt-4">
              <p className="text-caption-1-regular text-text-tertiary">
                Créditos: dados eleitorais e fotografias de campanha — Tribunal Superior Eleitoral; malhas geográficas — IBGE.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-caption-1-regular tabular-nums text-text-tertiary">
                  Última atualização oficial: {lastSync}
                </p>
                <p className="text-caption-1-medium text-text-secondary">Desenvolvido por Eude Gabriel</p>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
