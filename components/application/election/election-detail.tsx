"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RiArrowLeftLine, RiExternalLinkLine } from "@remixicon/react";
import { Badge } from "@/components/base/badges/badge";
import { ButtonLink } from "@/components/base/buttons/button";
import { PillTab, PillTabList } from "@/components/base/tabs/pill-tab";
import { getCandidateColor } from "@/components/application/election/candidate-colors";

type Candidate = {
  id: string;
  number: string;
  name: string;
  party: string;
  votes: number;
  percentage: number;
};

type Results = {
  sourceUrl: string;
  updatedAt: string | null;
  sections: { total: number | null; counted: number | null; percentage: number | null };
  statistics: {
    eligibleVoters: number | null;
    voters: number | null;
    validVotes: number | null;
    blankVotes: number | null;
    nullVotes: number | null;
  };
  candidates: Candidate[];
};

const copy = {
  "votos-validos": {
    title: "Votos válidos",
    description: "Total oficial de votos válidos para presidente no Brasil.",
    value: (data: Results) => data.statistics.validVotes,
  },
  eleitorado: {
    title: "Eleitorado apto",
    description: "Eleitoras e eleitores aptos registrados para a eleição.",
    value: (data: Results) => data.statistics.eligibleVoters,
  },
  secoes: {
    title: "Seções totalizadas",
    description: "Seções totalizadas em relação ao total de seções previsto.",
    value: (data: Results) => data.sections.counted,
  },
  comparecimento: {
    title: "Comparecimento",
    description: "Votantes registrados na apuração presidencial.",
    value: (data: Results) => data.statistics.voters,
  },
} as const;

function formatNumber(value: number | null | undefined) {
  return value == null ? "—" : new Intl.NumberFormat("pt-BR").format(value);
}

export function ElectionDetail({ slug, turn }: { slug: string; turn: number }) {
  const router = useRouter();
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const metric = copy[slug as keyof typeof copy];

  useEffect(() => {
    let active = true;
    fetch(`/api/election/results?turn=${turn}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as Results | { error?: string };
        if (!response.ok) {
          throw new Error("error" in body ? body.error : "Falha ao consultar o TSE.");
        }
        return body as Results;
      })
      .then((data) => {
        if (active) setResults(data);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Falha ao consultar o TSE.");
      });
    return () => {
      active = false;
    };
  }, [turn]);

  if (!metric) {
    return (
      <main className="min-h-screen bg-background-full p-6 text-text-primary">
        <h1 className="text-title-2-medium">Indicador não encontrado</h1>
        <Link href="/" className="mt-4 inline-block text-body-medium underline">Voltar ao painel</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background-full px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <ButtonLink href="/" variant="secondary" size="small" leadingIcon={RiArrowLeftLine} className="self-start">
          Voltar ao painel
        </ButtonLink>

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-caption-1-semibold uppercase tracking-wide text-text-tertiary">Eleição presidencial · 2026</p>
            <h1 className="mt-2 text-title-1-medium text-text-primary">{metric.title}</h1>
            <p className="mt-2 max-w-2xl text-body-regular text-text-secondary">{metric.description}</p>
          </div>
          <Badge color="neutral">{turn}º turno · Brasil</Badge>
        </header>

        <PillTabList aria-label="Turno dos resultados detalhados">
          <PillTab
            variant="gray"
            isSelected={turn === 1}
            onSelect={() => router.push(`/dados/${slug}?turn=1`)}
          >
            1º turno
          </PillTab>
          <PillTab
            variant="gray"
            isSelected={turn === 2}
            onSelect={() => router.push(`/dados/${slug}?turn=2`)}
          >
            2º turno
          </PillTab>
        </PillTabList>

        <section className="rounded-3xl border border-border-button-default bg-background-primary-default p-6 shadow-card">
          {error ? (
            <p role="alert" className="rounded-2xl bg-background-secondary-default p-4 text-body-medium text-text-primary">
              {error}
            </p>
          ) : !results ? (
            <p className="py-12 text-center text-body-regular text-text-secondary">Carregando publicação oficial…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-separator-border pb-5">
                <div>
                  <p className="text-body-2-medium text-text-secondary">Valor apurado</p>
                  <p className="mt-1 text-title-1-medium tabular-nums text-text-primary">
                    {formatNumber(metric.value(results))}
                    {slug === "secoes" ? ` / ${formatNumber(results.sections.total)}` : ""}
                  </p>
                </div>
                <p className="text-caption-1-regular text-text-tertiary">
                  Última atualização do arquivo do TSE: {results.updatedAt ?? "não informada"}
                </p>
              </div>

              <h2 className="mb-4 mt-6 text-title-3-semibold text-text-primary">Votação nominal · Brasil · {turn}º turno</h2>
              <div className="flex flex-col divide-y divide-separator-border">
                {results.candidates.map((candidate, index) => (
                  <div key={candidate.id} className="flex items-center gap-3 py-4">
                  <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${getCandidateColor(candidate).activeBackground}`} />
                  <span className="w-6 shrink-0 text-caption-1-medium tabular-nums text-text-tertiary">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <Image
                      src={`/election/candidates/${candidate.id}.jpg`}
                      alt={`Foto oficial de campanha de ${candidate.name}`}
                      width={48}
                      height={48}
                      className="size-12 shrink-0 rounded-full border border-border-button-default object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-medium text-text-primary">{candidate.name}</p>
                      <p className="text-caption-1-regular text-text-secondary">
                        {candidate.party} · {formatNumber(candidate.votes)} votos
                      </p>
                    </div>
                    <p className="text-body-medium tabular-nums text-text-primary">
                      {candidate.percentage.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                    </p>
                  </div>
                ))}
              </div>

              <a
                href={results.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex items-center gap-2 text-body-2-medium text-text-secondary hover:text-text-primary"
              >
                Conferir arquivo oficial do TSE <RiExternalLinkLine className="size-4" aria-hidden />
              </a>
            </>
          )}
        </section>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-separator-border pt-4">
          <p className="text-caption-1-regular text-text-tertiary">
            Crédito: dados oficiais e fotografias de campanha — Tribunal Superior Eleitoral.
          </p>
          <p className="text-caption-1-medium text-text-secondary">Desenvolvido por Eude Gabriel</p>
        </footer>
      </div>
    </main>
  );
}
