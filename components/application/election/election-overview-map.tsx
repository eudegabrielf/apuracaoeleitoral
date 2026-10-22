"use client";

import { useEffect, useRef, useState } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import { getCandidateColor } from "@/components/application/election/candidate-colors";
import type {
  Geometry,
  MapFeature,
  SimulatedElectionMapResults,
} from "@/components/application/election/election-map";
import { cx } from "@/utils/cx";

type BoundaryProperties = { id: string; name: string; uf: string };
type BoundaryCollection = FeatureCollection<Polygon | MultiPolygon, BoundaryProperties>;
type OverviewFeature = Feature<Polygon | MultiPolygon, BoundaryProperties & {
  winnerColor: string;
  secondColor: string;
  winnerName: string;
  firstName: string;
  firstVotes: number;
  firstPercentage: number;
  secondName: string;
  secondVotes: number;
  secondPercentage: number;
  tie: boolean;
}>;
type OverviewResults = SimulatedElectionMapResults;
type OverviewResultsMetadata = Pick<
  OverviewResults,
  "sourceUrl" | "updatedAt" | "candidates"
>;
type MapResultsStreamMessage =
  | {
      type: "start";
      turn: number;
      uf: string;
      sourceUrl: string;
      updatedAt: string | null;
      candidates: OverviewResults["candidates"];
      totalLocations: number;
    }
  | {
      type: "batch";
      results: OverviewResults["results"];
      completed: number;
      failed: number;
      unpublished: number;
    }
  | {
      type: "complete";
      completed: number;
      failed: number;
      unpublished: number;
    }
  | { type: "error"; message: string };

const statesUrl = "/maps/brazil-states.geojson";
const municipalitiesUrl = "/maps/brazil-municipalities.geojson";
const lightStyleUrl = "https://tiles.openfreemap.org/styles/positron";
const darkStyleUrl = "https://tiles.openfreemap.org/styles/dark";
const sourceId = "election-overview-regions";
const fillLayerId = "election-overview-fill";
const outlineLayerId = "election-overview-outline";
const mapResultsRefreshInterval = 30_000;
const numberFormat = new Intl.NumberFormat("pt-BR");
const percentFormat = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
let municipalityBoundaries: Promise<BoundaryCollection> | null = null;
let stateBoundaries: Promise<BoundaryCollection> | null = null;

async function readMapResultsStream(
  response: Response,
  onUpdate: (results: OverviewResults, completed: number, total: number) => void,
  initialResults: OverviewResults["results"] = {},
): Promise<OverviewResults> {
  if (!response.body) throw new Error("A transmissão dos resultados municipais foi interrompida.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pendingText = "";
  let metadata: OverviewResultsMetadata | null = null;
  let results: OverviewResults["results"] = { ...initialResults };
  let failed = 0;
  let unpublished = 0;
  let completed = 0;
  let totalLocations = 0;
  let streamCompleted = false;
  const getMetadata = () => metadata;

  const processLine = (line: string) => {
    if (!line.trim()) return;
    const message = JSON.parse(line) as MapResultsStreamMessage;
    if (message.type === "error") throw new Error(message.message);
    if (message.type === "start") {
      metadata = {
        sourceUrl: message.sourceUrl,
        updatedAt: message.updatedAt,
        candidates: message.candidates,
      };
      totalLocations = message.totalLocations;
      return;
    }
    if (message.type === "batch") {
      const currentMetadata = getMetadata();
      if (!currentMetadata) throw new Error("A transmissão de resultados começou sem os metadados do TSE.");
      results = { ...results, ...message.results };
      completed = message.completed;
      failed = message.failed;
      unpublished = message.unpublished;
      onUpdate({ ...currentMetadata, results, failed, unpublished }, completed, totalLocations);
      return;
    }
    if (message.type === "complete") {
      completed = message.completed;
      failed = message.failed;
      unpublished = message.unpublished;
      streamCompleted = true;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      pendingText += decoder.decode(value, { stream: !done });
      const lines = pendingText.split("\n");
      pendingText = lines.pop() ?? "";
      for (const line of lines) processLine(line);
      if (done) break;
    }
    processLine(pendingText);
  } catch (error) {
    await reader.cancel(error);
    throw error;
  } finally {
    reader.releaseLock();
  }

  const finalMetadata = getMetadata();
  if (!finalMetadata) throw new Error("O TSE não retornou metadados para os resultados do mapa.");
  if (!streamCompleted || completed !== totalLocations) {
    throw new Error("A transmissão dos resultados municipais terminou antes de concluir todas as localidades.");
  }
  return { ...finalMetadata, results, failed, unpublished };
}

async function loadBoundaries(level: "states" | "municipalities"): Promise<BoundaryCollection> {
  if (level === "municipalities") {
    municipalityBoundaries ??= fetch(municipalitiesUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar os limites municipais oficiais do IBGE.");
        return (await response.json()) as BoundaryCollection;
      })
      .catch((error: unknown) => {
        municipalityBoundaries = null;
        throw error;
      });
    return municipalityBoundaries;
  }

  stateBoundaries ??= fetch(statesUrl)
    .then(async (response) => {
      if (!response.ok) throw new Error("Não foi possível carregar os limites estaduais oficiais do IBGE.");
      return (await response.json()) as BoundaryCollection;
    })
    .catch((error: unknown) => {
      stateBoundaries = null;
      throw error;
    });
  return stateBoundaries;
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function resolveMapColor(cssVariable: string): string {
  const token = cssVariable.match(/var\((--[^)]+)\)/)?.[1];
  const value = token
    ? getComputedStyle(document.documentElement).getPropertyValue(token).trim()
    : "";
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context || !value) return "#64748b";
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const pixel = context.getImageData(0, 0, 1, 1).data;
  return `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
}

function addElectionResults(
  boundaries: BoundaryCollection,
  results: OverviewResults,
): FeatureCollection<Polygon | MultiPolygon, OverviewFeature["properties"]> {
  const candidateColors = new Map(
    results.candidates.map((candidate) => [
      candidate.id,
      resolveMapColor(getCandidateColor(candidate).variable),
    ]),
  );
  const neutralColor = resolveMapColor("var(--color-text-tertiary)");

  return {
    type: "FeatureCollection",
    features: boundaries.features.map((feature) => {
      const locality = results.results[feature.properties.id];
      const first = locality?.leaders[0];
      const second = locality?.leaders[1];
      const firstCandidate = first ? results.candidates.find((candidate) => candidate.id === first.candidateId) : undefined;
      const secondCandidate = second ? results.candidates.find((candidate) => candidate.id === second.candidateId) : undefined;
      const tie = Boolean(
        first &&
          second &&
          Math.round(first.votes) === Math.round(second.votes),
      );

      return {
        ...feature,
        properties: {
          ...feature.properties,
          winnerColor: firstCandidate ? candidateColors.get(firstCandidate.id) ?? neutralColor : neutralColor,
          secondColor: secondCandidate ? candidateColors.get(secondCandidate.id) ?? neutralColor : neutralColor,
          winnerName: tie ? "Empate" : firstCandidate?.name ?? "Aguardando dados",
          firstName: firstCandidate?.name ?? "",
          firstVotes: first?.votes ?? 0,
          firstPercentage: first?.percentage ?? 0,
          secondName: secondCandidate?.name ?? "",
          secondVotes: second?.votes ?? 0,
          secondPercentage: second?.percentage ?? 0,
          tie,
        },
      };
    }),
  };
}

function toMapGeometry(geometry: Polygon | MultiPolygon): Geometry {
  const toPosition = (position: number[]): [number, number] => [
    position[0] ?? 0,
    position[1] ?? 0,
  ];
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geometry.coordinates.map((ring) => ring.map(toPosition)),
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: geometry.coordinates.map((polygon) =>
      polygon.map((ring) => ring.map(toPosition)),
    ),
  };
}

function toMapFeature(feature: Feature<Polygon | MultiPolygon, BoundaryProperties>): MapFeature {
  return {
    properties: {
      id: feature.properties.id,
      nome: feature.properties.name,
      sigla: feature.properties.uf,
    },
    geometry: toMapGeometry(feature.geometry),
  };
}

function createPopup(feature: OverviewFeature) {
  const container = document.createElement("div");
  container.className = "simulated-map-popup";
  const title = document.createElement("p");
  title.className = "simulated-map-popup-title";
  title.textContent = feature.properties.name;
  container.append(title);

  if (feature.properties.tie) {
    const tie = document.createElement("p");
    tie.className = "simulated-map-popup-tie";
    tie.textContent = "Empate entre as candidaturas";
    container.append(tie);
  } else if (feature.properties.firstName) {
    const winner = document.createElement("p");
    winner.className = "simulated-map-popup-winner";
    winner.textContent = `Mais votado: ${feature.properties.winnerName}`;
    container.append(winner);
  }

  for (const candidate of [
    {
      name: feature.properties.firstName,
      votes: feature.properties.firstVotes,
      percentage: feature.properties.firstPercentage,
      color: feature.properties.winnerColor,
    },
    {
      name: feature.properties.secondName,
      votes: feature.properties.secondVotes,
      percentage: feature.properties.secondPercentage,
      color: feature.properties.secondColor,
    },
  ]) {
    if (!candidate.name) continue;
    const row = document.createElement("div");
    row.className = "simulated-map-popup-row";
    const swatch = document.createElement("span");
    swatch.className = "simulated-map-popup-swatch";
    swatch.style.backgroundColor = candidate.color;
    const details = document.createElement("div");
    const name = document.createElement("p");
    name.textContent = candidate.name;
    const votes = document.createElement("p");
    votes.textContent = `${numberFormat.format(Math.round(candidate.votes))} votos · ${percentFormat.format(candidate.percentage)}%`;
    details.append(name, votes);
    row.append(swatch, details);
    container.append(row);
  }
  return container;
}

export function ElectionOverviewMap({
  selectedState,
  selectedMunicipality,
  turn,
  onSelectState,
  onSelectMunicipality,
}: {
  selectedState: MapFeature | null;
  selectedMunicipality: MapFeature | null;
  turn: number;
  onSelectState: (feature: MapFeature | null) => void;
  onSelectMunicipality: (feature: MapFeature | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectStateRef = useRef(onSelectState);
  const onSelectMunicipalityRef = useRef(onSelectMunicipality);
  const resultsCache = useRef(new Map<string, OverviewResults>());
  const [level, setLevel] = useState<"states" | "municipalities">("states");
  const [municipalityQuery, setMunicipalityQuery] = useState("");
  const [municipalitySuggestions, setMunicipalitySuggestions] = useState<
    BoundaryCollection["features"]
  >([]);
  const [dark, setDark] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(true);
  const [resultsStatus, setResultsStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  onSelectStateRef.current = onSelectState;
  onSelectMunicipalityRef.current = onSelectMunicipality;

  useEffect(() => {
    const root = document.documentElement;
    const updateTheme = () => setDark(root.classList.contains("dark"));
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const query = normalizeSearch(municipalityQuery.trim());
    if (query.length < 2) {
      setMunicipalitySuggestions([]);
      return;
    }

    let active = true;
    void loadBoundaries("municipalities")
      .then((boundaries) => {
        if (!active) return;
        setMunicipalitySuggestions(
          boundaries.features
            .filter((feature) =>
              normalizeSearch(`${feature.properties.name} ${feature.properties.uf}`).includes(query),
            )
            .slice(0, 8),
        );
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Não foi possível buscar municípios no mapa do IBGE.");
        }
      });

    return () => {
      active = false;
    };
  }, [municipalityQuery]);

  useEffect(() => {
    let active = true;
    let map: MapLibreMap | null = null;
    let popup: import("maplibre-gl").Popup | null = null;
    let mapReady = false;
    let latestResultsData: ReturnType<typeof addElectionResults> | null = null;
    let resultsRefreshTimer: number | null = null;
    const controller = new AbortController();
    setLoading(true);
    setResultsLoading(true);
    setResultsStatus(null);
    setError(null);

    const load = async () => {
      try {
        const boundaries = await loadBoundaries(level);
        if (!active) return;
        const resultsCacheKey = `${turn}:${level}`;
        const cachedResults = resultsCache.current.get(resultsCacheKey);
        const data = addElectionResults(boundaries, {
          ...(cachedResults ?? {
            candidates: [],
            results: {},
            unpublished: 0,
            failed: 0,
            updatedAt: null,
            sourceUrl: "",
            turn,
            uf: "BR",
          }),
        });
        latestResultsData = data;
        const { Map, NavigationControl, Popup, setWorkerUrl } = await import("maplibre-gl");
        if (!active || !containerRef.current) return;
        setWorkerUrl("/maplibre-gl-worker.mjs");
        map = new Map({
          container: containerRef.current,
          style: dark ? darkStyleUrl : lightStyleUrl,
          center: [-53, -14],
          zoom: 3.2,
          minZoom: 2.2,
          maxZoom: 12,
          attributionControl: {},
        });
        map.addControl(new NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => {
          if (!map || !active) return;
          const beforeId = map.getLayer("boundary_3") ? "boundary_3" : undefined;
          map.addSource(sourceId, { type: "geojson", data, promoteId: "id" });
          map.addLayer(
            {
              id: fillLayerId,
              type: "fill",
              source: sourceId,
              paint: {
                "fill-color": ["get", "winnerColor"],
                "fill-opacity": [
                  "interpolate",
                  ["linear"],
                  ["abs", ["-", ["get", "firstPercentage"], ["get", "secondPercentage"]]],
                  0, 0.72,
                  20, 0.9,
                ],
              },
            },
            beforeId,
          );
          map.addLayer(
            {
              id: outlineLayerId,
              type: "line",
              source: sourceId,
              paint: {
                "line-color": dark ? "#52525b" : "#ffffff",
                "line-width": 0.65,
              },
            },
            beforeId,
          );

          map.fitBounds([[-74.5, -34], [-34, 5.5]], { padding: 36, duration: 0 });
          mapReady = true;
          if (latestResultsData) {
            const source = map.getSource(sourceId);
            if (source && "setData" in source && typeof source.setData === "function") {
              source.setData(latestResultsData);
            }
          }
          setLoading(false);
        });
        map.on("error", (event) => {
          if (event.error && active) {
            setError("Não foi possível carregar o mapa-base do OpenFreeMap.");
            setLoading(false);
          }
        });
        map.on("mousemove", fillLayerId, (event) => {
          const feature = event.features?.[0] as OverviewFeature | undefined;
          if (!feature || !map) return;
          map.getCanvas().style.cursor = "pointer";
          popup ??= new Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: "280px" });
          popup.setDOMContent(createPopup(feature)).setLngLat(event.lngLat).addTo(map);
        });
        map.on("mouseleave", fillLayerId, () => {
          if (map) map.getCanvas().style.cursor = "";
          popup?.remove();
        });
        map.on("click", fillLayerId, (event) => {
          const feature = event.features?.[0] as OverviewFeature | undefined;
          if (!feature) return;
          const selectedFeature = toMapFeature(feature);
          if (level === "states") {
            onSelectStateRef.current(selectedFeature);
            onSelectMunicipalityRef.current(null);
          } else {
            void loadBoundaries("states")
              .then((states) => {
                const state = states.features.find(
                  (entry) => entry.properties.uf.toUpperCase() === feature.properties.uf.toUpperCase(),
                );
                if (!state) throw new Error("Não foi possível encontrar a UF deste município na malha do IBGE.");
                onSelectStateRef.current(toMapFeature(state));
                onSelectMunicipalityRef.current(selectedFeature);
              })
              .catch((reason: unknown) => {
                setError(reason instanceof Error ? reason.message : "Não foi possível selecionar este município.");
              });
          }
        });
        function fetchMapResults() {
          if (!active) return;
          setResultsLoading(true);
          setError(null);
          void fetch(`/api/election/map-results?turn=${turn}&scope=${level}&uf=br&stream=1`, {
            cache: "no-store",
            signal: controller.signal,
          })
            .then(async (resultsResponse) => {
              if (!resultsResponse.ok) {
                const payload = (await resultsResponse.json()) as { error?: string };
                throw new Error(payload.error ?? "Não foi possível consultar os resultados oficiais do TSE.");
              }
              return readMapResultsStream(
                resultsResponse,
                (partialResults, completed, totalLocations) => {
                  if (!active) return;
                  resultsCache.current.set(resultsCacheKey, partialResults);
                  latestResultsData = addElectionResults(boundaries, partialResults);
                  if (mapReady && map) {
                    const source = map.getSource(sourceId);
                    if (source && "setData" in source && typeof source.setData === "function") {
                      source.setData(latestResultsData);
                    }
                  }
                  if (level === "municipalities") {
                    setResultsStatus(
                      `Carregando resultados oficiais: ${numberFormat.format(completed)} de ${numberFormat.format(totalLocations)} localidades consultadas.`,
                    );
                  }
                },
                resultsCache.current.get(resultsCacheKey)?.results,
              );
            })
            .then((results) => {
              if (!active) return;
              resultsCache.current.set(resultsCacheKey, results);
              const municipalitiesWithVotes = boundaries.features.filter(
                (feature) => (results.results[feature.properties.id]?.leaders.length ?? 0) > 0,
              ).length;
              const unavailableMunicipalities = boundaries.features.filter(
                (feature) => results.results[feature.properties.id]?.available === false,
              ).length;

              latestResultsData = addElectionResults(boundaries, results);
              if (level === "municipalities") {
                if (unavailableMunicipalities > 0) {
                  setResultsStatus(
                    `Resultados oficiais carregados para ${numberFormat.format(municipalitiesWithVotes)} de ${numberFormat.format(boundaries.features.length)} municípios. Falha temporária ao consultar ${numberFormat.format(unavailableMunicipalities)} municípios; os demais resultados foram mantidos.`,
                  );
                } else if (municipalitiesWithVotes === 0) {
                  setResultsStatus(
                    `O TSE ainda não publicou votos municipais para o ${turn}º turno. A malha do IBGE está carregada, mas não há resultados oficiais para colorir os municípios.`,
                  );
                } else {
                  setResultsStatus(
                    `Resultados oficiais carregados para ${numberFormat.format(municipalitiesWithVotes)} de ${numberFormat.format(boundaries.features.length)} municípios.`,
                  );
                }
              }
              if (mapReady && map) {
                const source = map.getSource(sourceId);
                if (source && "setData" in source && typeof source.setData === "function") {
                  source.setData(latestResultsData);
                }
              }
            })
            .catch((reason: unknown) => {
              if (!active || (reason instanceof Error && reason.name === "AbortError")) return;
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Não foi possível consultar os resultados oficiais do TSE.",
              );
            })
            .finally(() => {
              if (active) {
                setResultsLoading(false);
                resultsRefreshTimer = window.setTimeout(fetchMapResults, mapResultsRefreshInterval);
              }
            });
        }
        fetchMapResults();
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Não foi possível carregar o mapa eleitoral.");
          setLoading(false);
          setResultsLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
      controller.abort();
      if (resultsRefreshTimer !== null) window.clearTimeout(resultsRefreshTimer);
      popup?.remove();
      map?.remove();
    };
  }, [
    dark,
    level,
    turn,
  ]);

  const selectMunicipality = async (
    feature: BoundaryCollection["features"][number],
  ) => {
    try {
      const states = await loadBoundaries("states");
      const state = states.features.find(
        (entry) => entry.properties.uf.toUpperCase() === feature.properties.uf.toUpperCase(),
      );
      if (!state) throw new Error("Não foi possível encontrar a UF deste município na malha do IBGE.");
      onSelectState(toMapFeature(state));
      onSelectMunicipality(toMapFeature(feature));
      setMunicipalityQuery("");
      setMunicipalitySuggestions([]);
      setLevel("municipalities");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível selecionar este município.");
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-border-button-default bg-background-secondary-default p-1" role="group" aria-label="Nível geográfico do mapa">
          {([
            ["states", "Estados"],
            ["municipalities", "Municípios"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={level === value}
              onClick={() => {
                if (value === "states") {
                  onSelectState(null);
                  onSelectMunicipality(null);
                }
                setLevel(value);
              }}
              className={cx(
                "rounded-lg px-3 py-1.5 text-caption-1-medium transition",
                level === value
                  ? "bg-background-primary-default text-text-primary shadow-xs"
                  : "text-text-secondary hover:bg-background-primary-hover",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {selectedState && (
          <button
            type="button"
            onClick={() => {
              onSelectState(null);
              onSelectMunicipality(null);
              setLevel("states");
            }}
            className="rounded-lg border border-border-button-default bg-background-primary-default px-3 py-2 text-caption-1-medium text-text-secondary hover:bg-background-secondary-default"
          >
            Brasil · {selectedState.properties.nome}
          </button>
        )}
        {selectedMunicipality && (
          <span className="text-caption-1-regular text-text-tertiary">
            {selectedMunicipality.properties.nome}
          </span>
        )}
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <label className="sr-only" htmlFor="dashboard-municipality-search">
            Buscar município
          </label>
          <input
            id="dashboard-municipality-search"
            type="search"
            value={municipalityQuery}
            onChange={(event) => setMunicipalityQuery(event.currentTarget.value)}
            placeholder="Buscar município ou UF"
            className="h-10 w-full rounded-xl border border-border-button-default bg-background-primary-default px-3 text-body-2-regular text-text-primary outline-none placeholder:text-text-tertiary focus-visible:border-text-primary focus-visible:ring-1 focus-visible:ring-text-primary"
          />
          {municipalitySuggestions.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border-button-default bg-background-primary-default p-1 shadow-card">
              {municipalitySuggestions.map((feature) => (
                <li key={feature.properties.id}>
                  <button
                    type="button"
                    onClick={() => void selectMunicipality(feature)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-body-2-regular text-text-primary hover:bg-background-secondary-default"
                  >
                    <span>{feature.properties.name}</span>
                    <span className="text-caption-1-medium text-text-tertiary">{feature.properties.uf}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-border-button-default bg-background-secondary-default">
        <div
          ref={containerRef}
          aria-label={`Mapa eleitoral do Brasil por ${level === "states" ? "estado" : "município"}`}
          className="h-[min(58vh,560px)] min-h-[380px] w-full"
        />
        {(loading || resultsLoading) && (
          <div role="status" className="absolute inset-x-4 top-4 z-10 rounded-xl border border-border-button-default bg-background-primary-default p-3 text-body-2-regular text-text-secondary shadow-card">
            {loading ? "Carregando malha e mapa-base…" : "Carregando resultados oficiais do TSE…"}
          </div>
        )}
        {error && (
          <div role="alert" className="absolute inset-x-4 top-4 z-10 rounded-xl border border-border-error-default bg-background-primary-default p-3 text-body-2-regular text-text-primary shadow-card">
            {error}
          </div>
        )}
      </div>
      {resultsStatus && (
        <p role="status" className="text-caption-1-regular text-text-secondary">
          {resultsStatus}
        </p>
      )}
    </div>
  );
}
