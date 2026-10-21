"use client";

import Image from "next/image";
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RiAddLine, RiArrowLeftLine, RiArrowUpLine, RiMapPin2Line, RiRestartLine, RiSubtractLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { getCandidateColor } from "@/components/application/election/candidate-colors";
import { cx } from "@/utils/cx";

export type Position = [number, number];
export type Geometry =
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

export type MapFeature = {
  properties: { id?: string; nome?: string; sigla?: string };
  geometry: Geometry;
};

type MapData = { features: MapFeature[] };
type Candidate = {
  id: string;
  name: string;
  party: string;
  votes: number;
  percentage: number;
};
type LocalityWinner = {
  candidateId: string | null;
  tieCandidateIds: string[];
  votes: number | null;
  percentage: number | null;
  leaders: { candidateId: string; votes: number; percentage: number }[];
};
type ElectionMapResults = {
  candidates: Candidate[];
  results: Record<string, LocalityWinner>;
  unpublished: number;
  updatedAt: string | null;
  sourceUrl: string;
};
type HoveredFeature = { feature: MapFeature; left: number; top: number };

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const mapStateFlags: Record<string, string> = {
  ac: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20do%20Acre.svg?width=96",
  al: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20de%20Alagoas.svg?width=96",
  ap: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20do%20Amap%C3%A1.svg?width=96",
  am: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20do%20Amazonas.svg?width=96",
  ba: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20da%20Bahia.svg?width=96",
  ce: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20do%20Cear%C3%A1.svg?width=96",
  df: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20do%20Distrito%20Federal%20%28Brasil%29.svg?width=96",
  es: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20do%20Esp%C3%ADrito%20Santo.svg?width=96",
  go: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Goi%C3%A1s.svg?width=96",
  ma: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20do%20Maranh%C3%A3o.svg?width=96",
  mg: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20de%20Minas%20Gerais.svg?width=96",
  ms: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20de%20Mato%20Grosso%20do%20Sul.svg?width=96",
  mt: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20de%20Mato%20Grosso.svg?width=96",
  pa: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20do%20Par%C3%A1.svg?width=96",
  pb: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20da%20Para%C3%ADba.svg?width=96",
  pe: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20de%20Pernambuco.svg?width=96",
  pi: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20do%20Piau%C3%AD.svg?width=96",
  pr: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20do%20Paran%C3%A1.svg?width=96",
  rj: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20do%20estado%20do%20Rio%20de%20Janeiro.svg?width=96",
  rn: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20do%20Rio%20Grande%20do%20Norte.svg?width=96",
  rs: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20do%20Rio%20Grande%20do%20Sul.svg?width=96",
  ro: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20de%20Rond%C3%B4nia.svg?width=96",
  rr: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20de%20Roraima.svg?width=96",
  sc: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20de%20Santa%20Catarina.svg?width=96",
  sp: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20do%20estado%20de%20S%C3%A3o%20Paulo.svg?width=96",
  se: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20de%20Sergipe.svg?width=96",
  to: "https://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20do%20Tocantins.svg?width=96",
};

function getWinnerIntensity(winner: LocalityWinner | undefined) {
  const first = winner?.leaders[0];
  const second = winner?.leaders[1];
  if (!first || !second) return 1;
  const margin = Math.max(0, first.percentage - second.percentage);
  return 0.35 + 0.65 * Math.min(margin / 20, 1);
}

function formatVotes(value: number | null) {
  return value == null ? null : new Intl.NumberFormat("pt-BR").format(value);
}

function getPolygons(geometry: Geometry): Position[][][] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

function featureBounds(feature: MapFeature): Bounds {
  const points = getPolygons(feature.geometry).flat(2);
  return points.reduce<Bounds>(
    (bounds, [longitude, latitude]) => ({
      minX: Math.min(bounds.minX, longitude),
      minY: Math.min(bounds.minY, latitude),
      maxX: Math.max(bounds.maxX, longitude),
      maxY: Math.max(bounds.maxY, latitude),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function featurePath(feature: MapFeature, bounds: Bounds): string {
  const width = 640;
  const height = 580;
  const padding = 8;
  const rangeX = Math.max(bounds.maxX - bounds.minX, 0.01);
  const rangeY = Math.max(bounds.maxY - bounds.minY, 0.01);
  const scale = Math.min((width - padding * 2) / rangeX, (height - padding * 2) / rangeY);
  const offsetX = (width - rangeX * scale) / 2;
  const offsetY = (height - rangeY * scale) / 2;

  return getPolygons(feature.geometry)
    .flatMap((polygon) =>
      polygon.map((ring) =>
        ring
          .map(([longitude, latitude], index) => {
            const x = offsetX + (longitude - bounds.minX) * scale;
            const y = height - offsetY - (latitude - bounds.minY) * scale;
            return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
          })
          .join(" ") + " Z",
      ),
    )
    .join(" ");
}

export function ElectionMap({
  onSelectState,
  onSelectMunicipality,
  selectedState,
  selectedMunicipality,
  turn,
  preview = false,
}: {
  onSelectState: (feature: MapFeature | null) => void;
  onSelectMunicipality: (feature: MapFeature | null) => void;
  selectedState: MapFeature | null;
  selectedMunicipality: MapFeature | null;
  turn: number;
  preview?: boolean;
}) {
  const [states, setStates] = useState<MapData | null>(null);
  const [municipalities, setMunicipalities] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMunicipalities, setLoadingMunicipalities] = useState(false);
  const [electionResults, setElectionResults] = useState<ElectionMapResults | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [hoveredFeature, setHoveredFeature] = useState<HoveredFeature | null>(null);
  const [pinnedFeature, setPinnedFeature] = useState<HoveredFeature | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    let active = true;
    fetch("/api/ibge/map?scope=states&version=2")
      .then(async (response) => {
        if (!response.ok) {
          const result = (await response.json()) as { error?: string };
          throw new Error(result.error ?? "Não foi possível carregar o mapa do Brasil.");
        }
        return response.json() as Promise<MapData>;
      })
      .then((data) => {
        if (active) setStates(data);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar o mapa do IBGE.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedState?.properties.id) {
      setMunicipalities(null);
      return;
    }

    let active = true;
    setLoadingMunicipalities(true);
    setError(null);
    fetch(`/api/ibge/map?scope=municipalities&uf=${selectedState.properties.id}&version=2`)
      .then(async (response) => {
        if (!response.ok) {
          const result = (await response.json()) as { error?: string };
          throw new Error(result.error ?? "Não foi possível carregar os municípios.");
        }
        return response.json() as Promise<MapData>;
      })
      .then((data) => {
        if (active) setMunicipalities(data);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar os municípios do IBGE.");
      })
      .finally(() => {
        if (active) setLoadingMunicipalities(false);
      });
    return () => {
      active = false;
    };
  }, [selectedState]);

  const refreshElectionResults = useCallback(async () => {
    const scope = selectedState ? "municipalities" : "states";
    const uf = selectedState?.properties.id ?? "br";
    try {
      const response = await fetch(
        `/api/election/map-results?turn=${turn}&scope=${scope}&uf=${uf}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as ElectionMapResults | { error?: string };
      if (!response.ok) {
        throw new Error(
          "error" in data ? data.error : "Não foi possível consultar os resultados oficiais.",
        );
      }
      setElectionResults(data as ElectionMapResults);
      setResultsError(null);
    } catch (reason) {
      setResultsError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível consultar os resultados oficiais do TSE.",
      );
    }
  }, [selectedState, turn]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [selectedState?.properties.id]);

  useEffect(() => {
    setElectionResults(null);
    void refreshElectionResults();
    const timer = window.setInterval(() => void refreshElectionResults(), 30_000);
    return () => window.clearInterval(timer);
  }, [refreshElectionResults]);

  const features = selectedState ? municipalities?.features ?? [] : states?.features ?? [];
  const bounds = useMemo(() => {
    if (!features.length) return null;
    return features.reduce<Bounds>(
      (result, feature) => {
        const next = featureBounds(feature);
        return {
          minX: Math.min(result.minX, next.minX),
          minY: Math.min(result.minY, next.minY),
          maxX: Math.max(result.maxX, next.maxX),
          maxY: Math.max(result.maxY, next.maxY),
        };
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    );
  }, [features]);

  const drillDown = (feature: MapFeature) => {
    if (selectedState) onSelectMunicipality(feature);
    else onSelectState(feature);
  };

  const getTooltipPosition = useCallback((feature: MapFeature, clientX: number, clientY: number) => {
    const container = mapContainerRef.current;
    if (!container) return null;
    const bounds = container.getBoundingClientRect();
    return {
      feature,
      left: Math.max(8, Math.min(clientX - bounds.left + 14, bounds.width - 260)),
      top: Math.max(8, Math.min(clientY - bounds.top + 14, bounds.height - 124)),
    };
  }, []);

  const showFeatureTooltip = useCallback((feature: MapFeature, clientX: number, clientY: number) => {
    const position = getTooltipPosition(feature, clientX, clientY);
    if (position) setHoveredFeature(position);
  }, [getTooltipPosition]);

  const handleMapPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    if (event.target instanceof SVGElement) {
      event.target.setPointerCapture(event.pointerId);
    }
  };

  const handleMapPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(event.clientX - (drag.x), event.clientY - (drag.y)) < 4) return;
    drag.moved = true;
    setIsPanning(true);
    const bounds = event.currentTarget.getBoundingClientRect();
    setPan((current) => ({
      x: current.x + (deltaX / bounds.width) * 640,
      y: current.y + (deltaY / bounds.height) * 580,
    }));
    drag.x = event.clientX;
    drag.y = event.clientY;
  };

  const handleMapPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClickRef.current = drag.moved;
    dragRef.current = null;
    setIsPanning(false);
    if (event.target instanceof SVGElement && event.target.hasPointerCapture(event.pointerId)) {
      event.target.releasePointerCapture(event.pointerId);
    }
  };

  const tooltipFeature = hoveredFeature ?? pinnedFeature;

  return (
    <section className="rounded-3xl border border-border-button-default bg-background-primary-default p-5 shadow-card sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-caption-1-semibold uppercase tracking-wide text-text-tertiary">
            Mapa eleitoral
          </p>
          <h2 className="mt-1 text-title-3-semibold text-text-primary">
            {selectedMunicipality?.properties.nome ??
              selectedState?.properties.nome ??
              "Brasil por estado"}
          </h2>
          <p className="mt-1 text-body-2-regular text-text-secondary">
            {preview
              ? "Passe o cursor para comparar as lideranças. Clique para abrir o mapa detalhado."
              : "Selecione uma área para consultar a liderança e os resultados locais."}
          </p>
        </div>
        {selectedState && (
          <Button
            variant="secondary"
            size="small"
            leadingIcon={RiArrowLeftLine}
            onClick={() => {
              onSelectState(null);
              onSelectMunicipality(null);
            }}
          >
            Voltar ao Brasil
          </Button>
        )}
      </div>

      {error ? (
        <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl bg-background-secondary-default p-6 text-center">
          <p className="text-body-medium text-text-primary">{error}</p>
          <p className="text-body-2-regular text-text-secondary">
            Os limites do mapa são consultados diretamente no serviço do IBGE.
          </p>
        </div>
      ) : !bounds || (selectedState && loadingMunicipalities) ? (
        <div
          aria-label="Carregando malha geográfica do IBGE"
          className="flex min-h-72 items-center justify-center rounded-2xl bg-background-secondary-default text-body-regular text-text-secondary"
        >
          Carregando mapa oficial…
        </div>
      ) : (
        <div
          ref={mapContainerRef}
          className="relative overflow-hidden rounded-2xl bg-background-secondary-default p-2 sm:p-4"
        >
          {resultsError && (
            <p
              role="alert"
              className="mb-3 rounded-xl border border-border-error-default bg-background-tertiary-default p-3 text-body-2-regular text-text-primary"
            >
              {resultsError} Sem dados oficiais disponíveis para colorir o mapa.
            </p>
          )}
          {!resultsError && electionResults && electionResults.unpublished > 0 && (
            <p className="mb-3 rounded-xl bg-background-tertiary-default p-3 text-body-2-regular text-text-secondary">
              Ainda não há resultados publicados para {electionResults.unpublished} áreas deste mapa.
            </p>
          )}
          {turn === 2 && electionResults && Object.values(electionResults.results).every(
            ({ candidateId }) => !candidateId,
          ) && (
            <p className="mb-3 rounded-xl bg-background-tertiary-default p-3 text-body-2-regular text-text-secondary">
              Aguardando início da apuração do segundo turno. Nenhuma localidade foi colorida sem votos oficiais.
            </p>
          )}
          <svg
            role="group"
            aria-label={selectedState ? `Municípios de ${selectedState.properties.nome}` : "Estados do Brasil"}
            viewBox="0 0 640 580"
            className={cx(
              "mx-auto block max-h-[560px] w-full touch-none select-none",
              isPanning ? "cursor-grabbing" : "cursor-grab",
              selectedState ? "max-w-[720px]" : "max-w-[600px]",
            )}
            onWheel={(event) => {
              event.preventDefault();
              setZoom((current) => Math.max(1, Math.min(4, current + (event.deltaY < 0 ? 0.2 : -0.2))));
            }}
            onPointerDown={handleMapPointerDown}
            onPointerMove={handleMapPointerMove}
            onPointerUp={handleMapPointerUp}
            onPointerCancel={handleMapPointerUp}
          >
            <g transform={`translate(${320 + pan.x} ${290 + pan.y}) scale(${zoom}) translate(-320 -290)`}>
              {features.map((feature) => {
              const selected =
                selectedState
                  ? selectedMunicipality?.properties.id === feature.properties.id
                  : false;
              const winner = feature.properties.id
                ? electionResults?.results[feature.properties.id]
                : undefined;
              const candidate = electionResults?.candidates.find((entry) => entry.id === winner?.candidateId);
              const color = candidate ? getCandidateColor(candidate) : null;
              return (
                <path
                  key={feature.properties.id}
                  d={featurePath(feature, bounds)}
                  role="button"
                  tabIndex={0}
                  aria-label={
                    `${feature.properties.nome}${!selectedState && feature.properties.sigla ? `, ${feature.properties.sigla}` : ""}${winner?.leaders.map((leader, index) => {
                      const name = electionResults?.candidates.find((entry) => entry.id === leader.candidateId)?.name;
                      return name ? `, ${index === 0 ? "primeiro" : "segundo"} lugar: ${name}, ${formatVotes(leader.votes)} votos, ${leader.percentage.toLocaleString("pt-BR")} por cento` : "";
                    }).join("") ?? ""}`
                  }
                  className={cx(
                    "cursor-pointer stroke-background-primary-default transition-[fill,opacity] hover:opacity-80",
                    selected ? "stroke-accent-500" : "",
                    selectedState ? "stroke-[0.75]" : "stroke-[2]",
                    "outline-none focus-visible:stroke-accent-500 focus-visible:stroke-[3]",
                  )}
                  style={color
                    ? { fill: color.variable, fillOpacity: getWinnerIntensity(winner) }
                    : { fill: "var(--color-background-tertiary-default)" }}
                  onClick={(event) => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      event.preventDefault();
                      return;
                    }
                    setPinnedFeature(getTooltipPosition(feature, event.clientX, event.clientY));
                    drillDown(feature);
                  }}
                  onPointerEnter={(event) => {
                    setPinnedFeature(null);
                    showFeatureTooltip(feature, event.clientX, event.clientY);
                  }}
                  onPointerMove={(event) => {
                    showFeatureTooltip(feature, event.clientX, event.clientY);
                  }}
                  onPointerLeave={() => setHoveredFeature(null)}
                  onFocus={(event) => {
                    const pathBounds = event.currentTarget.getBoundingClientRect();
                    showFeatureTooltip(
                      feature,
                      pathBounds.left + pathBounds.width / 2,
                      pathBounds.top + pathBounds.height / 2,
                    );
                  }}
                  onBlur={() => setHoveredFeature(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      drillDown(feature);
                    }
                  }}
                >
                  <title>
                    {feature.properties.nome}
                    {!selectedState && feature.properties.sigla ? ` (${feature.properties.sigla})` : ""}
                    {winner?.leaders.map((leader, index) => {
                      const name = electionResults?.candidates.find((entry) => entry.id === leader.candidateId)?.name;
                      return name ? ` · ${index + 1}º ${name}: ${formatVotes(leader.votes)} votos` : "";
                    }).join("")}
                  </title>
                </path>
              );
              })}
            </g>
          </svg>
          <div className="absolute end-4 top-4 z-10 flex gap-1.5">
            <Button
              variant="secondary"
              size="small"
              leadingIcon={RiSubtractLine}
              aria-label="Reduzir zoom do mapa"
              disabled={zoom <= 1}
              onClick={() => setZoom((current) => Math.max(1, current - 0.2))}
            />
            <Button
              variant="secondary"
              size="small"
              leadingIcon={RiAddLine}
              aria-label="Aumentar zoom do mapa"
              disabled={zoom >= 4}
              onClick={() => setZoom((current) => Math.min(4, current + 0.2))}
            />
            <Button
              variant="secondary"
              size="small"
              leadingIcon={RiRestartLine}
              aria-label="Redefinir zoom e posição do mapa"
              disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            />
          </div>
          {tooltipFeature && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute z-10 max-w-64 rounded-xl border border-border-button-default bg-background-primary-default p-3 shadow-card"
              style={{ left: tooltipFeature.left, top: tooltipFeature.top }}
            >
              <div className="flex items-center gap-3">
                {!selectedState && tooltipFeature.feature.properties.sigla && (
                  <Image
                    src={mapStateFlags[tooltipFeature.feature.properties.sigla.toLowerCase()]}
                    alt={`Bandeira de ${tooltipFeature.feature.properties.nome}`}
                    width={44}
                    height={30}
                    unoptimized
                    className="h-8 w-11 shrink-0 rounded-md border border-border-button-default object-contain"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate text-body-medium text-text-primary">
                    {tooltipFeature.feature.properties.nome}
                  </p>
                  {!selectedState && tooltipFeature.feature.properties.sigla && (
                    <p className="text-caption-1-medium text-text-secondary">
                      {tooltipFeature.feature.properties.sigla}
                    </p>
                  )}
                </div>
              </div>
              {(() => {
                const result = tooltipFeature.feature.properties.id
                  ? electionResults?.results[tooltipFeature.feature.properties.id]
                  : undefined;
                const leaders = result?.leaders.flatMap((leader) => {
                  const candidate = electionResults?.candidates.find((entry) => entry.id === leader.candidateId);
                  return candidate ? [{ ...leader, candidate }] : [];
                }) ?? [];
                if (leaders.length > 0) {
                  return (
                    <div className="mt-3 flex flex-col gap-3 border-t border-separator-border pt-3">
                      {leaders.map(({ candidate: entry, votes, percentage }, index) => (
                        <div key={entry.id} className="flex items-center gap-2">
                          <Image
                            src={`/election/candidates/${entry.id}.jpg`}
                            alt={`Foto oficial de campanha de ${entry.name}`}
                            width={36}
                            height={36}
                            className="size-9 shrink-0 rounded-full border border-border-button-default object-cover"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-caption-1-medium text-text-tertiary">
                              {index === 0 ? "1º lugar" : "2º lugar"}
                            </p>
                            <p className="truncate text-body-2-medium text-text-primary">{entry.name}</p>
                            <p className="text-caption-1-regular text-text-secondary">
                              {formatVotes(votes)} votos · {percentage.toLocaleString("pt-BR")}%
                            </p>
                          </div>
                        </div>
                      ))}
                      {result && result.tieCandidateIds.length > 1 && (
                        <p className="text-caption-1-regular text-text-secondary">Empate na liderança dos dados oficiais.</p>
                      )}
                    </div>
                  );
                }
                if (result && result.tieCandidateIds.length > 0) {
                  return (
                    <p className="mt-2 text-caption-1-regular text-text-secondary">
                      Empate nos resultados publicados.
                    </p>
                  );
                }
                return (
                  <p className="mt-2 text-caption-1-regular text-text-secondary">
                    {turn === 2 ? "Aguardando início da apuração." : "Resultado ainda não publicado."}
                  </p>
                );
              })()}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-body-2-regular text-text-secondary">
          <RiMapPin2Line className="size-4" aria-hidden />
          {selectedState
            ? `${municipalities?.features.length ?? 0} municípios disponíveis`
            : `${states?.features.length ?? 0} unidades da federação`}
        </span>
        {selectedState && (
          <Button
            variant="ghost"
            size="small"
            leadingIcon={RiArrowUpLine}
            onClick={() => onSelectMunicipality(null)}
          >
            Limpar município
          </Button>
        )}
      </div>
      {electionResults && (
        <div className="mt-5 border-t border-separator-border pt-4">
          <p className="text-caption-1-semibold text-text-primary">
            Liderança por {selectedState ? "município" : "estado"} · {turn}º turno
          </p>
          <ul aria-label="Legenda de candidatos do mapa" className="mt-3 flex flex-wrap gap-x-4 gap-y-3">
            {electionResults.candidates.map((candidate) => {
              const color = getCandidateColor(candidate);
              return (
              <li key={candidate.id} className="flex items-center gap-2">
                <Image
                  src={`/election/candidates/${candidate.id}.jpg`}
                  alt={`Foto oficial de campanha de ${candidate.name}`}
                  width={24}
                  height={24}
                  className="size-6 shrink-0 rounded-full border border-border-button-default object-cover"
                />
                <span
                  aria-hidden
                  className={cx("size-3 rounded-sm", color.fill)}
                />
                <span className="text-caption-1-regular text-text-secondary">{candidate.name}</span>
              </li>
              );
            })}
            <li className="flex items-center gap-2">
              <span aria-hidden className="size-3 rounded-sm bg-background-tertiary-default" />
              <span className="text-caption-1-regular text-text-secondary">
                Empate ou resultado não publicado
              </span>
            </li>
          </ul>
          <p className="mt-3 text-caption-1-regular text-text-tertiary">
            A intensidade da cor representa a vantagem em pontos percentuais. Créditos: resultados oficiais — Tribunal Superior Eleitoral; malhas territoriais — IBGE. · Atualização a cada 30 segundos.
          </p>
          <a
            href={electionResults.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex text-caption-1-medium text-text-secondary hover:text-text-primary"
          >
            Conferir dados nacionais do turno no TSE
          </a>
        </div>
      )}
    </section>
  );
}
