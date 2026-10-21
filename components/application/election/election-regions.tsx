"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { RiArrowLeftLine, RiExternalLinkLine } from "@remixicon/react";
import { Badge } from "@/components/base/badges/badge";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { ElectionMap, type MapFeature } from "@/components/application/election/election-map";
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

export function ElectionRegions() {
  const [state, setState] = useState<MapFeature | null>(null);
  const [municipality, setMunicipality] = useState<MapFeature | null>(null);
  const [turn, setTurn] = useState(2);
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const uf = state?.properties.sigla?.toLowerCase() ?? "br";
    const city = municipality?.properties.id
      ? `&municipio=${municipality.properties.id}`
      : "";
    setResults(null);
    setError(null);

    const refreshResults = async () => {
      try {
        const response = await fetch(`/api/election/results?turn=${turn}&uf=${uf}${city}`, {
          cache: "no-store",
        });
        const body = (await response.json()) as Results | { error?: string };
        if (!response.ok) throw new Error("error" in body ? body.error : "Falha ao consultar o TSE.");
        if (active) {
          setResults(body as Results);
          setError(null);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Falha ao consultar o TSE.");
      }
    };

    void refreshResults();
    const timer = window.setInterval(() => void refreshResults(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [municipality, state, turn]);

  return (
    <main className="min-h-screen bg-background-full px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <ButtonLink href="/" variant="secondary" size="small" leadingIcon={RiArrowLeftLine} className="self-start">
          Voltar ao painel
        </ButtonLink>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-caption-1-semibold uppercase tracking-wide text-text-tertiary">Resultados por localidade</p>
            <h1 className="mt-2 text-title-1-medium text-text-primary">Apuração por localidade</h1>
            <p className="mt-2 text-body-regular text-text-secondary">
              Selecione um estado para abrir o mapa municipal e consultar os resultados presidenciais.
            </p>
          </div>
          <Badge color="neutral">{turn}º turno · 2026</Badge>
        </header>

        <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <section className="order-1 rounded-3xl border border-border-button-default bg-background-primary-default p-5 shadow-card sm:p-6 xl:order-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-caption-1-semibold uppercase tracking-wide text-text-tertiary">Resultado oficial</p>
                <h2 className="mt-1 text-title-3-semibold text-text-primary">
                  {municipality?.properties.nome ?? state?.properties.nome ?? "Brasil"}
                </h2>
                {results && (
                  <p className="mt-1 text-caption-1-regular text-text-tertiary">
                    Última atualização: {results.updatedAt ?? "não informada"}
                  </p>
                )}
              </div>
              {turn === 2 && results?.sections.counted === 0 && (
                <Badge color="neutral">Aguardando início da apuração</Badge>
              )}
            </div>
            <div role="group" aria-label="Turno da eleição" className="mt-4 flex gap-2">
              {[1, 2].map((value) => (
                <Button
                  key={value}
                  variant="secondary"
                  size="small"
                  aria-pressed={turn === value}
                  className={turn === value ? "bg-text-primary text-background-full hover:bg-text-primary" : ""}
                  onClick={() => setTurn(value)}
                >
                  {value}º turno
                </Button>
              ))}
            </div>
            {error ? (
              <p role="alert" className="mt-4 rounded-2xl bg-background-secondary-default p-4 text-body-2-regular text-text-primary">
                {error}
              </p>
            ) : !results ? (
              <p className="mt-4 text-body-regular text-text-secondary">Carregando publicação oficial…</p>
            ) : (
              <div className="mt-4 flex flex-col divide-y divide-separator-border">
                {results.candidates.slice(0, 5).map((candidate, index) => (
                  <div key={candidate.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="w-5 text-caption-1-medium tabular-nums text-text-tertiary">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <Image
                        src={`/election/candidates/${candidate.id}.jpg`}
                        alt={`Foto oficial de campanha de ${candidate.name}`}
                        width={40}
                        height={40}
                        className="size-10 shrink-0 rounded-full border border-border-button-default object-cover"
                      />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate text-body-medium text-text-primary">
                          <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${getCandidateColor(candidate).activeBackground}`} />
                          {candidate.name}
                        </p>
                        <p className="text-caption-1-regular text-text-secondary">{candidate.party}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="text-body-medium tabular-nums text-text-primary">
                        {candidate.votes.toLocaleString("pt-BR")} votos
                      </p>
                      <p className="text-caption-1-regular tabular-nums text-text-secondary">
                        {candidate.percentage.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {results && (
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-separator-border pt-4">
                <div className="rounded-2xl bg-background-secondary-default p-3">
                  <p className="text-caption-1-regular text-text-tertiary">Votos válidos</p>
                  <p className="mt-1 text-title-3-semibold tabular-nums text-text-primary">
                    {results.statistics.validVotes?.toLocaleString("pt-BR") ?? "—"}
                  </p>
                </div>
                <div className="rounded-2xl bg-background-secondary-default p-3">
                  <p className="text-caption-1-regular text-text-tertiary">Seções totalizadas</p>
                  <p className="mt-1 text-title-3-semibold tabular-nums text-text-primary">
                    {results.sections.percentage?.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) ?? "—"}%
                  </p>
                </div>
                <div className="rounded-2xl bg-background-secondary-default p-3">
                  <p className="text-caption-1-regular text-text-tertiary">Abstenções</p>
                  <p className="mt-1 text-title-3-semibold tabular-nums text-text-primary">
                    {results.statistics.abstentions?.toLocaleString("pt-BR") ?? "—"}
                  </p>
                  <p className="text-caption-1-regular tabular-nums text-text-secondary">
                    {results.statistics.abstentionPercentage == null
                      ? "Percentual indisponível"
                      : `${results.statistics.abstentionPercentage.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% do eleitorado`}
                  </p>
                </div>
              </div>
            )}
            {results && (
              <a
                href={results.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-body-2-medium text-text-secondary hover:text-text-primary"
              >
                Conferir publicação de resultados
                <RiExternalLinkLine className="size-4" aria-hidden />
              </a>
            )}
          </section>
          <div className="order-2 xl:order-1">
            <ElectionMap
              selectedState={state}
              selectedMunicipality={municipality}
              turn={turn}
              onSelectState={(feature) => {
                setState(feature);
                setMunicipality(null);
              }}
              onSelectMunicipality={setMunicipality}
            />
          </div>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-separator-border pt-4">
          <p className="text-caption-1-regular text-text-tertiary">
            Créditos: resultados eleitorais — Tribunal Superior Eleitoral; malhas geográficas — IBGE.
          </p>
          <p className="text-caption-1-medium text-text-secondary">Desenvolvido por Eude Gabriel</p>
        </footer>
      </div>
    </main>
  );
}
