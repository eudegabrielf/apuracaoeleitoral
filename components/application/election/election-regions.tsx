"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { RiExternalLinkLine } from "@remixicon/react";
import { Badge } from "@/components/base/badges/badge";
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

const numberFormat = new Intl.NumberFormat("pt-BR");
const percentFormat = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatNumber(value: number | null | undefined) {
  return value == null ? "—" : numberFormat.format(value);
}

function formatPercent(value: number | null | undefined) {
  return value == null ? "—" : `${percentFormat.format(value)}%`;
}

export function ElectionRegions({ turn = 2 }: { turn?: number }) {
  const [state, setState] = useState<MapFeature | null>(null);
  const [municipality, setMunicipality] = useState<MapFeature | null>(null);
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

  const locality = municipality?.properties.nome ?? state?.properties.nome ?? "Brasil";
  const voters = results?.statistics.voters;
  const eligibleVoters = results?.statistics.eligibleVoters;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-caption-1-semibold uppercase tracking-wide text-text-tertiary">Resultados por localidade</p>
            <h2 className="mt-1 text-title-3-semibold text-text-primary">{locality}</h2>
            <p className="mt-1 text-body-2-regular text-text-secondary">
              Selecione um município no mapa para consultar a apuração local.
            </p>
          </div>
          {turn === 2 && results?.sections.counted === 0 && (
            <Badge color="neutral">Aguardando início da apuração</Badge>
          )}
      </header>

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
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

        <section className="min-w-0 rounded-3xl border border-border-button-default bg-background-primary-default p-5 shadow-card sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-caption-1-semibold uppercase tracking-wide text-text-tertiary">Resultado oficial · {turn}º turno</p>
                <h3 className="mt-1 text-title-3-semibold text-text-primary">{locality}</h3>
                {results && (
                  <p className="mt-1 text-caption-1-regular text-text-tertiary">
                    Atualização do TSE: {results.updatedAt ?? "não informada"}
                  </p>
                )}
              </div>
            </div>
            {error ? (
              <p role="alert" className="mt-4 rounded-2xl bg-background-secondary-default p-4 text-body-2-regular text-text-primary">
                {error}
              </p>
            ) : !results ? (
              <p className="mt-4 text-body-regular text-text-secondary">Carregando publicação oficial…</p>
            ) : (
              <>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 border-y border-separator-border sm:grid-cols-3">
                  <div className="py-3">
                    <dt className="text-caption-1-regular text-text-tertiary">Eleitorado apto</dt>
                    <dd className="mt-1 text-body-medium tabular-nums text-text-primary">{formatNumber(eligibleVoters)}</dd>
                  </div>
                  <div className="py-3">
                    <dt className="text-caption-1-regular text-text-tertiary">Comparecimento</dt>
                    <dd className="mt-1 text-body-medium tabular-nums text-text-primary">{formatNumber(voters)}</dd>
                    <dd className="text-caption-1-regular tabular-nums text-text-secondary">
                      {formatPercent(eligibleVoters && voters != null ? (voters / eligibleVoters) * 100 : null)}
                    </dd>
                  </div>
                  <div className="py-3">
                    <dt className="text-caption-1-regular text-text-tertiary">Abstenções</dt>
                    <dd className="mt-1 text-body-medium tabular-nums text-text-primary">{formatNumber(results.statistics.abstentions)}</dd>
                    <dd className="text-caption-1-regular tabular-nums text-text-secondary">
                      {formatPercent(results.statistics.abstentionPercentage)}
                    </dd>
                  </div>
                  <div className="py-3">
                    <dt className="text-caption-1-regular text-text-tertiary">Votos válidos</dt>
                    <dd className="mt-1 text-body-medium tabular-nums text-text-primary">{formatNumber(results.statistics.validVotes)}</dd>
                  </div>
                  <div className="py-3">
                    <dt className="text-caption-1-regular text-text-tertiary">Votos em branco</dt>
                    <dd className="mt-1 text-body-medium tabular-nums text-text-primary">{formatNumber(results.statistics.blankVotes)}</dd>
                    <dd className="text-caption-1-regular tabular-nums text-text-secondary">
                      {formatPercent(voters && results.statistics.blankVotes != null
                        ? (results.statistics.blankVotes / voters) * 100
                        : null)}
                    </dd>
                  </div>
                  <div className="py-3">
                    <dt className="text-caption-1-regular text-text-tertiary">Votos nulos</dt>
                    <dd className="mt-1 text-body-medium tabular-nums text-text-primary">{formatNumber(results.statistics.nullVotes)}</dd>
                    <dd className="text-caption-1-regular tabular-nums text-text-secondary">
                      {formatPercent(voters && results.statistics.nullVotes != null
                        ? (results.statistics.nullVotes / voters) * 100
                        : null)}
                    </dd>
                  </div>
                  <div className="py-3">
                    <dt className="text-caption-1-regular text-text-tertiary">Seções totalizadas</dt>
                    <dd className="mt-1 text-body-medium tabular-nums text-text-primary">
                      {results.sections.counted == null
                        ? "—"
                        : `${formatNumber(results.sections.counted)} / ${formatNumber(results.sections.total)}`}
                    </dd>
                    <dd className="text-caption-1-regular tabular-nums text-text-secondary">
                      {formatPercent(results.sections.percentage)}
                    </dd>
                  </div>
                </dl>

                <h4 className="mb-2 mt-5 text-body-medium text-text-primary">Votação nominal</h4>
                <div className="flex flex-col divide-y divide-separator-border">
                  {results.candidates.map((candidate, index) => (
                    <div key={candidate.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="w-5 shrink-0 text-caption-1-medium tabular-nums text-text-tertiary">
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
                          {formatNumber(candidate.votes)} votos
                        </p>
                        <p className="text-caption-1-regular tabular-nums text-text-secondary">
                          {formatPercent(candidate.percentage)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {results && (
              <a
                href={results.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-body-2-medium text-text-secondary hover:text-text-primary"
              >
                Conferir publicação do TSE
                <RiExternalLinkLine className="size-4" aria-hidden />
              </a>
            )}
        </section>
      </div>
    </section>
  );
}
