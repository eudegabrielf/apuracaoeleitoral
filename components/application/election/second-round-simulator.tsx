"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  RiArrowLeftLine,
  RiCloseLine,
  RiExternalLinkLine,
} from "@remixicon/react";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { Badge } from "@/components/base/badges/badge";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { getCandidateColor } from "@/components/application/election/candidate-colors";
import { ElectionDataNotice } from "@/components/application/election/election-data-notice";
import { firstRoundCandidates } from "@/components/application/election/first-round-candidates";
import { cx } from "@/utils/cx";

type Candidate = {
  id: string;
  number: string;
  name: string;
  party: string;
  votes: number;
  percentage: number;
};
type CandidateIdentity = Pick<Candidate, "id" | "name">;

type FirstRoundResults = {
  sourceUrl: string;
  updatedAt: string | null;
  statistics: {
    eligibleVoters: number | null;
    voters: number | null;
    abstentions: number | null;
    validVotes: number | null;
    blankVotes: number | null;
    nullVotes: number | null;
  };
  candidates: Candidate[];
};

type Allocation = {
  first: number;
  second: number;
  blank: number;
  null: number;
  abstention: number;
};
type AllocationTarget = keyof Allocation;
type Finalists = { first: string; second: string };
type MigrationGroup = { id: string; label: string; detail: string };
type LocalityTotals = {
  candidates: Candidate[];
  eligibleVoters: number | null;
  voters: number | null;
  abstentions: number | null;
  blankVotes: number | null;
  nullVotes: number | null;
};

const numberFormat = new Intl.NumberFormat("pt-BR");
const percentFormat = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const refreshInterval = 5 * 60_000;
const defaultFinalists: Finalists = {
  first: "280002551544",
  second: "280002542548",
};

function emptyAllocation(): Allocation {
  return { first: 0, second: 0, blank: 0, null: 0, abstention: 0 };
}

function sumAllocation(allocation: Allocation) {
  return allocation.first + allocation.second + allocation.blank + allocation.null + allocation.abstention;
}

function formatNumber(value: number | null | undefined) {
  return value == null ? "—" : numberFormat.format(value);
}

function formatPercent(value: number) {
  return `${percentFormat.format(value)}%`;
}

function CandidatePhoto({
  candidate,
  size = "medium",
  decorative = false,
}: {
  candidate: CandidateIdentity;
  size?: "small" | "medium";
  decorative?: boolean;
}) {
  const pixels = size === "small" ? 32 : 48;

  return (
    <Image
      src={`/election/candidates/${candidate.id}.jpg`}
      alt={decorative ? "" : `Foto oficial de campanha de ${candidate.name}`}
      width={pixels}
      height={pixels}
      className={cx(
        size === "small" ? "size-8" : "size-12",
        "shrink-0 rounded-full border border-border-button-default object-cover",
      )}
    />
  );
}

function getMigrationGroups(results: FirstRoundResults): MigrationGroup[] {
  return [
    ...results.candidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.name,
      detail: `${candidate.party} · ${formatNumber(candidate.votes)} votos`,
    })),
    {
      id: "blank",
      label: "Votos em branco",
      detail: `${formatNumber(results.statistics.blankVotes)} votos`,
    },
    {
      id: "null",
      label: "Votos nulos",
      detail: `${formatNumber(results.statistics.nullVotes)} votos`,
    },
    {
      id: "abstention",
      label: "Abstenções",
      detail: `${formatNumber(results.statistics.abstentions)} eleitores`,
    },
  ];
}

function calculateProjection(
  candidates: Candidate[],
  statistics: Pick<LocalityTotals, "eligibleVoters" | "voters" | "abstentions" | "blankVotes" | "nullVotes">,
  allocations: Record<string, Allocation>,
) {
  const sourceVotes = [
    ...candidates.map((candidate) => ({
      votes: candidate.votes,
      allocation: allocations[candidate.id],
    })),
    { votes: statistics.blankVotes ?? 0, allocation: allocations.blank },
    { votes: statistics.nullVotes ?? 0, allocation: allocations.null },
    { votes: statistics.abstentions ?? 0, allocation: allocations.abstention },
  ];
  const votesTo = (target: "first" | "second") =>
    sourceVotes.reduce(
      (total, source) =>
        total + source.votes * ((source.allocation?.[target] ?? 0) / 100),
      0,
    );
  const firstVotes = votesTo("first");
  const secondVotes = votesTo("second");
  const votersBecomingAbsent =
    [
      ...candidates.map((candidate) => ({
        votes: candidate.votes,
        allocation: allocations[candidate.id],
      })),
      { votes: statistics.blankVotes ?? 0, allocation: allocations.blank },
      { votes: statistics.nullVotes ?? 0, allocation: allocations.null },
    ].reduce(
      (total, source) =>
        total + source.votes * ((source.allocation?.abstention ?? 0) / 100),
      0,
    );
  const abstentionsBecomingPresent =
    (statistics.abstentions ?? 0) *
    ((
      (allocations.abstention?.first ?? 0) +
      (allocations.abstention?.second ?? 0) +
      (allocations.abstention?.blank ?? 0) +
      (allocations.abstention?.null ?? 0)
    ) / 100);
  const unallocatedCandidateVotes = candidates.reduce((total, candidate) => {
    const allocation = allocations[candidate.id] ?? emptyAllocation();
    return total + candidate.votes * ((100 - sumAllocation(allocation)) / 100);
  }, 0);
  const projectedVoters =
    statistics.voters == null
      ? null
      : Math.max(
          0,
          Math.min(
            statistics.eligibleVoters ?? Number.POSITIVE_INFINITY,
            statistics.voters - votersBecomingAbsent + abstentionsBecomingPresent,
          ),
        );
  const projectedAbstentions =
    statistics.eligibleVoters == null || projectedVoters == null
      ? null
      : Math.max(0, statistics.eligibleVoters - projectedVoters);
  const finalistVotes = firstVotes + secondVotes;

  return {
    firstVotes,
    secondVotes,
    firstPercentage: finalistVotes > 0 ? (firstVotes / finalistVotes) * 100 : 0,
    secondPercentage: finalistVotes > 0 ? (secondVotes / finalistVotes) * 100 : 0,
    projectedVoters,
    projectedAbstentions,
    unallocatedCandidateVotes,
  };
}

function createInitialAllocations(
  candidates: Candidate[],
): Record<string, Allocation> {
  return Object.fromEntries(
    [
      ...candidates.map((candidate) => [candidate.id, emptyAllocation()]),
      ["blank", emptyAllocation()],
      ["null", emptyAllocation()],
      ["abstention", emptyAllocation()],
    ],
  );
}

function createFinalistsRetention(
  candidates: Candidate[],
  finalists: Finalists,
  current: Record<string, Allocation>,
): Record<string, Allocation> {
  const allocations = { ...createInitialAllocations(candidates), ...current };
  if (allocations[finalists.first]) {
    allocations[finalists.first] = {
      ...emptyAllocation(),
      first: 100,
    };
  }
  if (allocations[finalists.second]) {
    allocations[finalists.second] = {
      ...emptyAllocation(),
      second: 100,
    };
  }
  return allocations;
}

function MigrationSlider({
  sourceLabel,
  targetLabel,
  targetCandidate,
  color,
  value,
  max,
  onChange,
}: {
  sourceLabel: string;
  targetLabel: string;
  targetCandidate?: CandidateIdentity;
  color: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const filledPercent = value;

  return (
    <label className="grid min-w-0 grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-3 gap-y-1.5">
      <span className="flex min-w-0 items-center gap-2 text-caption-1-regular text-text-secondary">
        {targetCandidate && <CandidatePhoto candidate={targetCandidate} size="small" decorative />}
        <span className="truncate">{targetLabel}</span>
      </span>
      <span className="text-right text-caption-1-medium tabular-nums text-text-primary">
        {formatPercent(value)}
      </span>
      <input
        aria-label={`Percentual de ${sourceLabel} destinado a ${targetLabel}`}
        className="migration-slider col-span-2 h-2 w-full cursor-pointer appearance-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        style={{
          "--migration-slider-color": color,
          "--migration-slider-value": `${filledPercent}%`,
          accentColor: color,
        } as CSSProperties}
        type="range"
        min={0}
        max={100}
        aria-valuemax={max}
        step={0.5}
        value={value}
        onChange={(event) => onChange(Math.min(Number(event.currentTarget.value), max))}
      />
    </label>
  );
}

export function SecondRoundSimulator() {
  const [results, setResults] = useState<FirstRoundResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasSimulated, setHasSimulated] = useState(false);
  const [migrationModalOpen, setMigrationModalOpen] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, Allocation>>({});
  const [draftAllocations, setDraftAllocations] = useState<Record<string, Allocation>>({});
  const initializedAllocations = useRef(false);

  const fetchResults = useCallback(async (signal?: AbortSignal) => {
    setError(null);

    try {
      const response = await fetch("/api/election/results?turn=1&uf=br", {
        cache: "no-store",
        signal,
      });
      const payload = (await response.json()) as FirstRoundResults | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Não foi possível consultar os resultados oficiais do TSE.",
        );
      }

      const officialResults = payload as FirstRoundResults;
      if (officialResults.candidates.length < 2) {
        throw new Error("Ainda não há dados oficiais suficientes para montar uma simulação.");
      }
      if (
        officialResults.statistics.voters == null ||
        officialResults.statistics.eligibleVoters == null ||
        officialResults.statistics.abstentions == null ||
        officialResults.statistics.blankVotes == null ||
        officialResults.statistics.nullVotes == null
      ) {
        throw new Error("O TSE ainda não publicou todas as estatísticas necessárias para simular migrações.");
      }

      setResults(officialResults);
      if (!initializedAllocations.current) {
        initializedAllocations.current = true;
        const initialAllocations = createInitialAllocations(officialResults.candidates);
        setAllocations(initialAllocations);
        setDraftAllocations(initialAllocations);
      }
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === "AbortError") return;
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Não foi possível consultar os resultados oficiais do TSE.",
      );
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchResults(controller.signal);
    const timer = window.setInterval(() => void fetchResults(controller.signal), refreshInterval);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [fetchResults]);

  const firstFinalist = useMemo(
    () => results?.candidates.find((candidate) => candidate.id === defaultFinalists.first) ?? null,
    [results],
  );
  const secondFinalist = useMemo(
    () => results?.candidates.find((candidate) => candidate.id === defaultFinalists.second) ?? null,
    [results],
  );
  const migrationGroups = useMemo(
    () => results ? getMigrationGroups(results) : [],
    [results],
  );
  const allocationTargets = firstFinalist && secondFinalist
    ? [
        {
          key: "first",
          label: firstFinalist.name,
          candidate: firstFinalist,
          color: getCandidateColor(firstFinalist).variable,
        },
        {
          key: "second",
          label: secondFinalist.name,
          candidate: secondFinalist,
          color: getCandidateColor(secondFinalist).variable,
        },
        { key: "blank", label: "Voto em branco", color: "var(--color-text-tertiary)" },
        { key: "null", label: "Voto nulo", color: "var(--color-text-secondary)" },
        { key: "abstention", label: "Abstenções", color: "var(--color-text-primary)" },
      ] satisfies { key: AllocationTarget; label: string; color: string; candidate?: CandidateIdentity }[]
    : [];

  const projection = useMemo(() => {
    if (!hasSimulated || !results || !firstFinalist || !secondFinalist) return null;
    const values = calculateProjection(results.candidates, results.statistics, allocations);
    return {
      ...values,
    };
  }, [allocations, firstFinalist, hasSimulated, results, secondFinalist]);

  const updateAllocation = (
    candidateId: string,
    slot: AllocationTarget,
    value: number,
  ) => {
    setDraftAllocations((current) => {
      const allocation = current[candidateId] ?? emptyAllocation();
      const totalOther = sumAllocation(allocation) - allocation[slot];
      const nextValue = Math.min(value, 100 - totalOther);
      return {
        ...current,
        [candidateId]: {
          ...allocation,
          [slot]: nextValue,
        },
      };
    });
  };

  const setFinalistsRetention = () => {
    if (results) {
      setDraftAllocations(createFinalistsRetention(results.candidates, defaultFinalists, draftAllocations));
    }
  };

  const clearMigration = () => {
    if (results) {
      setDraftAllocations(
        Object.fromEntries(
          [...results.candidates.map((candidate) => candidate.id), "blank", "null", "abstention"]
            .map((id) => [id, emptyAllocation()]),
        ),
      );
    }
  };

  const openMigrationModal = () => {
    setDraftAllocations(allocations);
    setMigrationModalOpen(true);
  };

  const applySimulation = () => {
    setAllocations(draftAllocations);
    setHasSimulated(true);
    setMigrationModalOpen(false);
  };
  const canApplySimulation = Boolean(
    results &&
      firstFinalist &&
      secondFinalist &&
      Object.values(draftAllocations).some((allocation) => sumAllocation(allocation) > 0),
  );

  return (
    <div className="min-h-screen bg-background-full p-3 sm:p-4">
      <main className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 pb-8">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border-button-default bg-background-primary-default px-5 py-3 shadow-card">
          <div>
            <p className="text-body-medium text-text-primary">Apuração</p>
            <p className="text-caption-1-regular text-text-tertiary">Eleição presidencial · 2026</p>
          </div>
          <ButtonLink
            href="/"
            variant="secondary"
            size="small"
            leadingIcon={RiArrowLeftLine}
          >
            Voltar à apuração
          </ButtonLink>
        </header>

        <section className="flex flex-wrap items-end justify-between gap-4 px-1">
          <div className="max-w-3xl">
            <p className="text-caption-1-semibold uppercase tracking-wide text-text-tertiary">
              Cenários eleitorais
            </p>
            <h1 className="mt-2 text-title-1-medium text-text-primary">Simulador do 2º turno</h1>
            <p className="mt-2 text-body-regular text-text-secondary">
              Explore como diferentes hipóteses de migração dos votos do primeiro turno mudariam a disputa.
              Os resultados são cenários definidos por você, não previsões eleitorais.
            </p>
          </div>
          <a
            href="https://resultados.tse.jus.br/oficial/app/index.html"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-body-2-medium text-text-secondary hover:text-text-primary"
          >
            Fonte oficial do TSE <RiExternalLinkLine className="size-4" aria-hidden />
          </a>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
          <div className={cx(
            "flex min-w-0 flex-col gap-5 lg:order-1",
            hasSimulated ? "order-2" : "order-1",
          )}>
            <section
              aria-labelledby="scenario-heading"
              className="rounded-3xl border border-border-button-default bg-background-primary-default p-5 shadow-card sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-caption-1-semibold uppercase tracking-wide text-text-tertiary">
                    Configuração
                  </p>
                  <h2 id="scenario-heading" className="mt-1 text-title-3-semibold text-text-primary">
                    Cenário do segundo turno
                  </h2>
                </div>
                <Badge color="neutral">Baseado no 1º turno oficial</Badge>
              </div>

              <div className="mt-5 flex flex-wrap gap-4">
                {[firstRoundCandidates[0], firstRoundCandidates[1]].map((candidate) => (
                  <div
                    key={candidate.id}
                    className="flex min-w-[180px] flex-1 items-center gap-3 rounded-2lg border border-border-button-default bg-background-secondary-default px-3 py-2"
                  >
                    <CandidatePhoto candidate={candidate} />
                    <span className="text-body-medium text-text-primary">{candidate.name}</span>
                  </div>
                ))}
              </div>
              {!results && (
                <p className="mt-3 text-caption-1-regular text-text-tertiary">
                  Os números e as migrações serão exibidos após carregar os resultados oficiais do TSE.
                </p>
              )}

              {loading && !results && (
                <p role="status" className="mt-4 rounded-2xl bg-background-secondary-default p-4 text-body-2-regular text-text-secondary">
                  Consultando resultados oficiais do TSE…
                </p>
              )}
              {error && (
                <div className="mt-4">
                  <ElectionDataNotice
                    message={error}
                    detail="Os dados serão consultados novamente automaticamente. Nenhum voto é estimado para preencher dados ausentes."
                  />
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-separator-border pt-4">
                <p className="text-caption-1-regular text-text-tertiary">
                  {hasSimulated
                    ? "Cenário aplicado. Edite as migrações para recalcular."
                    : "Defina as migrações para iniciar a simulação."}
                </p>
                <Button
                  variant="secondary"
                  size="small"
                  className="runoff-simulation-trigger"
                  onClick={openMigrationModal}
                  disabled={!results || !firstFinalist || !secondFinalist}
                >
                  {hasSimulated ? "Editar simulação" : "Iniciar simulação"}
                </Button>
              </div>

              {results && (
                <section
                  aria-labelledby="first-round-results-heading"
                  aria-busy={loading}
                  className="mt-5 border-t border-separator-border pt-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-caption-1-semibold uppercase tracking-wide text-text-tertiary">
                        Dados oficiais do TSE
                      </p>
                      <h3
                        id="first-round-results-heading"
                        className="mt-1 text-body-medium text-text-primary"
                      >
                        Apuração do 1º turno · Brasil
                      </h3>
                    </div>
                    <p className="text-caption-1-regular text-text-tertiary">
                      Atualização: {results.updatedAt ?? "não informada"}
                    </p>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-x-4 border-y border-separator-border sm:grid-cols-3 xl:grid-cols-6">
                    {([
                      ["Eleitorado apto", results.statistics.eligibleVoters],
                      ["Comparecimento", results.statistics.voters],
                      ["Abstenções", results.statistics.abstentions],
                      ["Votos válidos", results.statistics.validVotes],
                      ["Votos em branco", results.statistics.blankVotes],
                      ["Votos nulos", results.statistics.nullVotes],
                    ] as const).map(([label, value]) => (
                      <div key={label} className="py-3">
                        <p className="text-caption-1-regular text-text-tertiary">{label}</p>
                        <p className="mt-1 text-body-medium tabular-nums text-text-primary">
                          {formatNumber(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 divide-y divide-separator-border">
                    {results.candidates.map((candidate) => (
                      <div
                        key={candidate.id}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <CandidatePhoto candidate={candidate} size="small" />
                          <div className="min-w-0">
                            <p className="truncate text-body-2-medium text-text-primary">
                              {candidate.name}
                            </p>
                            <p className="text-caption-1-regular text-text-secondary">
                              {candidate.party}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-body-2-medium tabular-nums text-text-primary">
                            {formatNumber(candidate.votes)} votos
                          </p>
                          <p className="text-caption-1-regular tabular-nums text-text-secondary">
                            {formatPercent(candidate.percentage)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </section>
          </div>

          <aside className={cx(
            "flex min-w-0 flex-col gap-5 lg:order-2",
            hasSimulated ? "order-1" : "order-2",
          )}>
            <section
              aria-labelledby="projection-heading"
              className="rounded-3xl border border-border-button-default bg-background-primary-default p-5 shadow-card sm:p-6 lg:sticky lg:top-4"
            >
              <p className="text-caption-1-semibold uppercase tracking-wide text-text-secondary">
                Resultado hipotético
              </p>
              <h2 id="projection-heading" className="mt-2 text-title-3-semibold text-text-primary">
                Projeção do cenário
              </h2>

              {hasSimulated && projection && firstFinalist && secondFinalist ? (
                <>
                  <div className="mt-5 flex flex-col gap-5">
                    {[
                      {
                        candidate: firstFinalist,
                        votes: projection.firstVotes,
                        percentage: projection.firstPercentage,
                      },
                      {
                        candidate: secondFinalist,
                        votes: projection.secondVotes,
                        percentage: projection.secondPercentage,
                      },
                    ].map(({ candidate, votes, percentage }) => (
                      <div key={candidate.id}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <CandidatePhoto candidate={candidate} />
                            <p className="truncate text-body-medium text-text-primary">{candidate.name}</p>
                          </div>
                          <p className="shrink-0 text-title-3-semibold tabular-nums text-text-primary">
                            {formatPercent(percentage)}
                          </p>
                        </div>
                        <p className="mt-1 text-caption-1-regular tabular-nums text-text-secondary">
                          {formatNumber(Math.round(votes))} votos no cenário
                        </p>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-background-quaternary-default">
                          <div
                            className={cx("h-full rounded-full transition-[width]", getCandidateColor(candidate).activeBackground)}
                            style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 border-t border-separator-border pt-4">
                    <div>
                      <p className="text-caption-1-regular text-text-tertiary">Comparecimento simulado</p>
                      <p className="mt-1 text-body-medium tabular-nums text-text-primary">
                        {projection.projectedVoters == null
                          ? "—"
                          : formatNumber(Math.round(projection.projectedVoters))}
                      </p>
                    </div>
                    <div>
                      <p className="text-caption-1-regular text-text-tertiary">Abstenções simuladas</p>
                      <p className="mt-1 text-body-medium tabular-nums text-text-primary">
                        {projection.projectedAbstentions == null
                          ? "—"
                          : formatNumber(Math.round(projection.projectedAbstentions))}
                      </p>
                    </div>
                  </div>

                  {projection.firstVotes === projection.secondVotes ? (
                    <Badge color="neutral" className="mt-4">Empate neste cenário</Badge>
                  ) : (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Badge color="neutral">Cenário favorável a</Badge>
                      <div className="flex items-center gap-2">
                        <CandidatePhoto
                          candidate={projection.firstVotes > projection.secondVotes ? firstFinalist : secondFinalist}
                          size="small"
                        />
                        <span className="text-body-2-medium text-text-primary">
                          {projection.firstVotes > projection.secondVotes
                            ? firstFinalist.name
                            : secondFinalist.name}
                        </span>
                      </div>
                    </div>
                  )}
                  <p className="mt-4 rounded-2xl bg-background-secondary-default p-3 text-caption-1-regular text-text-secondary">
                    {formatNumber(Math.round(projection.unallocatedCandidateVotes))} votos de candidaturas permanecem sem destinação, não entram na votação dos finalistas e não alteram o comparecimento projetado.
                  </p>
                </>
              ) : (
                <p className="mt-4 rounded-2xl bg-background-secondary-default p-4 text-body-2-regular text-text-secondary">
                  Preencha as migrações e selecione “Iniciar simulação” para ver os resultados.
                </p>
              )}
            </section>

          </aside>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-separator-border px-1 pt-4 text-caption-1-regular text-text-tertiary">
          <p>Simulador independente. Dados eleitorais: Tribunal Superior Eleitoral (TSE).</p>
          <a
            href="https://github.com/eudegabrielf"
            target="_blank"
            rel="noreferrer"
            className="text-caption-1-medium text-text-secondary hover:text-text-primary"
          >
            Desenvolvido por Eude Gabriel
          </a>
        </footer>
      </main>
      <ModalOverlay
        isOpen={migrationModalOpen}
        onOpenChange={setMigrationModalOpen}
        isDismissable
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm"
      >
        <Modal className="w-full max-w-4xl outline-none">
          <Dialog
            aria-labelledby="migration-heading"
            className="flex max-h-[90vh] flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default shadow-card outline-none"
          >
            <header className="relative flex items-start justify-between gap-4 border-b border-separator-border bg-background-secondary-default p-5 pe-16 sm:p-6 sm:pe-16">
              <div className="min-w-0">
                <p className="text-caption-1-semibold uppercase tracking-wide text-text-tertiary">
                  Configuração da simulação
                </p>
                <h2 id="migration-heading" className="mt-1 text-title-3-semibold text-text-primary">
                  Migração de votos
                </h2>
              </div>
              <Button
                variant="secondary"
                size="small"
                iconOnly
                leadingIcon={RiCloseLine}
                aria-label="Fechar configurações da simulação"
                title="Fechar"
                onClick={() => setMigrationModalOpen(false)}
                className="absolute end-5 top-5 sm:end-6 sm:top-6"
              >
              </Button>
            </header>

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-separator-border bg-background-secondary-default px-5 py-3 sm:px-6">
              <p className="text-caption-1-regular text-text-tertiary">
                {results
                  ? "Parâmetros de migração dos votos"
                  : "Aguardando resultados oficiais do TSE"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="small" onClick={setFinalistsRetention} disabled={!results}>
                  Manter votos dos finalistas
                </Button>
                <Button variant="secondary" size="small" onClick={clearMigration} disabled={!results}>
                  Zerar migração
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-6">
              {results && firstFinalist && secondFinalist ? (
                <div className="divide-y divide-separator-border">
                  {migrationGroups.map((group) => {
                    const allocation = draftAllocations[group.id] ?? emptyAllocation();
                    const candidate = results.candidates.find((entry) => entry.id === group.id);
                    const allocated = sumAllocation(allocation);
                    const remaining = Math.max(0, 100 - allocated);

                    return (
                      <article key={group.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,0.65fr)_minmax(0,1.35fr)] sm:items-center">
                        <div className="flex min-w-0 items-center gap-3">
                          {candidate ? (
                            <CandidatePhoto candidate={candidate} size="small" />
                          ) : (
                            <span
                              className={cx(
                                "size-2.5 shrink-0 rounded-full",
                                "bg-background-quaternary-default",
                              )}
                              aria-hidden
                            />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-body-medium text-text-primary">
                              {group.label}
                            </p>
                            <p className="text-caption-1-regular text-text-secondary">{group.detail}</p>
                          </div>
                        </div>
                        <div className="grid gap-x-5 gap-y-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                          {allocationTargets.map((target) => {
                            const otherAllocated = sumAllocation(allocation) - allocation[target.key];
                            return (
                              <MigrationSlider
                                key={target.key}
                                sourceLabel={group.label}
                                targetLabel={target.label}
                                targetCandidate={target.candidate}
                                color={target.color}
                                value={allocation[target.key]}
                                max={100 - otherAllocated}
                                onChange={(value) => updateAllocation(group.id, target.key, value)}
                              />
                            );
                          })}
                        </div>
                        <div className="sm:col-start-2">
                          <div
                            className="h-1.5 overflow-hidden rounded-full bg-background-quaternary-default"
                            role="progressbar"
                            aria-label={`Percentual de ${group.label} distribuído`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={allocated}
                          >
                            <div
                              className="h-full rounded-full transition-[width,background-color]"
                              style={{
                                width: `${allocated}%`,
                                backgroundColor: allocated >= 100
                                  ? "var(--color-chart-7-active)"
                                  : "var(--color-chart-11-active)",
                              }}
                            />
                          </div>
                          <p className="mt-1 text-right text-caption-1-regular text-text-tertiary">
                            Distribuído: {formatPercent(allocated)} · Faltam {formatPercent(remaining)} para 100%
                          </p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : error ? (
                <p role="alert" className="my-5 rounded-2xl border border-border-error-default bg-background-tertiary-default p-4 text-body-2-regular text-text-primary">
                  {error}
                </p>
              ) : (
                <p role="status" className="my-5 rounded-2xl bg-background-secondary-default p-4 text-body-2-regular text-text-secondary">
                  Consultando resultados oficiais do TSE…
                </p>
              )}
            </div>

            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-separator-border bg-background-secondary-default p-5 sm:p-6">
              <Button variant="secondary" onClick={() => setMigrationModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="secondary"
                onClick={applySimulation}
                disabled={!canApplySimulation}
              >
                Salvar simulação
              </Button>
            </footer>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </div>
  );
}
