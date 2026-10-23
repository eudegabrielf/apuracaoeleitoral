"use client";

import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import { getCandidateColor } from "@/components/application/election/candidate-colors";
import type { SimulatedElectionMapResults } from "@/components/application/election/election-map";
import { cx } from "@/utils/cx";

type StateProperties = {
  id: string;
  name: string;
  uf: string;
  winnerId: string;
  winnerName: string;
  winnerColor: string;
  secondColor: string;
  firstVotes: number;
  firstPercentage: number;
  secondName: string;
  secondVotes: number;
  secondPercentage: number;
  firstRoundWinnerName: string;
  tie: boolean;
};

type StateBoundaries = FeatureCollection<Polygon | MultiPolygon, Omit<StateProperties,
  | "winnerId"
  | "winnerName"
  | "winnerColor"
  | "secondColor"
  | "firstVotes"
  | "firstPercentage"
  | "secondName"
  | "secondVotes"
  | "secondPercentage"
  | "firstRoundWinnerName"
  | "tie"
>>;

type SimulatedBoundaries = FeatureCollection<Polygon | MultiPolygon, StateProperties>;

type HoveredState = {
  id: string;
  name: string;
  winnerName: string;
  winnerColor: string;
  secondColor: string;
  firstVotes: number;
  firstPercentage: number;
  secondName: string;
  secondVotes: number;
  secondPercentage: number;
  firstRoundWinnerName: string;
  tie: boolean;
};

const numberFormat = new Intl.NumberFormat("pt-BR");
const percentFormat = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const statesGeoJsonUrl = "/maps/brazil-states.geojson";
const municipalitiesGeoJsonUrl = "/maps/brazil-municipalities.geojson";
const lightStyleUrl = "https://tiles.openfreemap.org/styles/positron";
const darkStyleUrl = "https://tiles.openfreemap.org/styles/dark";
const fillLayerId = "simulated-state-fill";
const outlineLayerId = "simulated-state-outline";

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

function getSimulatedBoundaries(
  boundaries: StateBoundaries,
  results: SimulatedElectionMapResults,
  firstRoundWinners: Record<string, string>,
): SimulatedBoundaries {
  return {
    ...boundaries,
    features: boundaries.features.map((feature) => {
      const stateResult = results.results[feature.properties.id];
      const first = stateResult?.leaders[0];
      const second = stateResult?.leaders[1];
      const firstCandidate = first
        ? results.candidates.find((candidate) => candidate.id === first.candidateId)
        : undefined;
      const secondCandidate = second
        ? results.candidates.find((candidate) => candidate.id === second.candidateId)
        : undefined;
      const tie = Boolean(
        first &&
          second &&
          Math.round(first.votes) === Math.round(second.votes),
      );

      return {
        ...feature,
        properties: {
          ...feature.properties,
          winnerId: tie ? "" : firstCandidate?.id ?? "",
          winnerName: tie ? "Empate" : firstCandidate?.name ?? "Sem votos atribuídos",
          winnerColor: firstCandidate
            ? resolveMapColor(getCandidateColor(firstCandidate).variable)
            : "#94a3b8",
          secondColor: secondCandidate
            ? resolveMapColor(getCandidateColor(secondCandidate).variable)
            : "#94a3b8",
          firstVotes: first?.votes ?? 0,
          firstPercentage: first?.percentage ?? 0,
          secondName: secondCandidate?.name ?? "",
          secondVotes: second?.votes ?? 0,
          secondPercentage: second?.percentage ?? 0,
          firstRoundWinnerName: firstRoundWinners[feature.properties.id] ?? "Sem dados oficiais",
          tie,
        },
      };
    }),
  };
}

function createStatePopup(state: HoveredState) {
  const container = document.createElement("div");
  container.className = "simulated-map-popup";

  const title = document.createElement("p");
  title.className = "simulated-map-popup-title";
  title.textContent = state.name;
  container.append(title);

  const comparison = document.createElement("p");
  comparison.className = "simulated-map-popup-winner";
  comparison.textContent = `1º turno oficial: ${state.firstRoundWinnerName}`;
  container.append(comparison);

  const scenarioLeader = document.createElement("p");
  scenarioLeader.className = "simulated-map-popup-winner";
  scenarioLeader.textContent = `Líder no cenário: ${state.winnerName}`;
  container.append(scenarioLeader);

  if (state.tie) {
    const tie = document.createElement("p");
    tie.className = "simulated-map-popup-tie";
    tie.textContent = "Empate entre os finalistas";
    container.append(tie);
  }

  const rows = [
    {
      name: state.winnerName,
      votes: state.firstVotes,
      percentage: state.firstPercentage,
      color: state.winnerColor,
    },
    {
      name: state.secondName,
      votes: state.secondVotes,
      percentage: state.secondPercentage,
      color: state.secondColor,
    },
  ];

  for (const row of rows) {
    if (!row.name || row.name === "Empate") continue;
    const item = document.createElement("div");
    item.className = "simulated-map-popup-row";
    const swatch = document.createElement("span");
    swatch.className = "simulated-map-popup-swatch";
    swatch.style.backgroundColor = row.color;
    const details = document.createElement("div");
    const name = document.createElement("p");
    name.textContent = row.name;
    const votes = document.createElement("p");
    votes.textContent = `${numberFormat.format(Math.round(row.votes))} votos · ${percentFormat.format(row.percentage)}%`;
    details.append(name, votes);
    item.append(swatch, details);
    container.append(item);
  }

  return container;
}

export function SimulatedElectionMap({
  results,
  scope,
  firstRoundWinners,
}: {
  results: SimulatedElectionMapResults;
  scope: "states" | "municipalities";
  firstRoundWinners: Record<string, string>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const boundariesRef = useRef<StateBoundaries | null>(null);
  const resultsRef = useRef(results);
  const firstRoundWinnersRef = useRef(firstRoundWinners);
  const installLayersRef = useRef<(() => void) | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredState, setHoveredState] = useState<HoveredState | null>(null);
  const [dark, setDark] = useState(false);

  resultsRef.current = results;
  firstRoundWinnersRef.current = firstRoundWinners;

  useEffect(() => {
    const root = document.documentElement;
    const updateTheme = () => setDark(root.classList.contains("dark"));
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    setError(null);
    boundariesRef.current = null;
    void fetch(scope === "states" ? statesGeoJsonUrl : municipalitiesGeoJsonUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            scope === "states"
              ? "Não foi possível carregar os limites estaduais oficiais do IBGE."
              : "Não foi possível carregar os limites municipais oficiais do IBGE.",
          );
        }
        return (await response.json()) as StateBoundaries;
      })
      .then((data) => {
        if (!active) return;
        boundariesRef.current = data;
        const source = mapRef.current?.getSource("simulated-states") as
          | import("maplibre-gl").GeoJSONSource
          | undefined;
        if (source) {
          source.setData(
            getSimulatedBoundaries(data, resultsRef.current, firstRoundWinnersRef.current),
          );
        }
        else installLayersRef.current?.();
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Não foi possível carregar os limites estaduais do IBGE.");
        }
      });

    return () => {
      active = false;
    };
  }, [scope]);

  useEffect(() => {
    let active = true;
    let map: MapLibreMap | null = null;
    let openPopup: import("maplibre-gl").Popup | null = null;

    void import("maplibre-gl")
      .then(({ Map, NavigationControl, Popup, setWorkerUrl }) => {
        if (!active || !containerRef.current) return;
        setWorkerUrl("/maplibre-gl-worker.mjs");
        map = new Map({
          container: containerRef.current,
          style: dark ? darkStyleUrl : lightStyleUrl,
          center: [-53, -14],
          zoom: 3.2,
          minZoom: 2.2,
          maxZoom: 9,
          attributionControl: {},
        });
        mapRef.current = map;
        map.addControl(new NavigationControl({ showCompass: false }), "top-right");

        const installStateLayer = () => {
          if (!map || !map.isStyleLoaded()) return;
          const beforeId = map.getLayer("boundary_3") ? "boundary_3" : undefined;
          if (!map.getSource("simulated-states") && boundariesRef.current) {
            map.addSource("simulated-states", {
              type: "geojson",
              data: getSimulatedBoundaries(
                boundariesRef.current,
                resultsRef.current,
                firstRoundWinnersRef.current,
              ),
              promoteId: "id",
            });
          }
          if (!map.getSource("simulated-states")) return;
          if (!map.getLayer(fillLayerId)) {
            map.addLayer(
              {
                id: fillLayerId,
                type: "fill",
                source: "simulated-states",
                paint: {
                  "fill-color": [
                    "case",
                    ["==", ["get", "tie"], true],
                    "#94a3b8",
                    ["get", "winnerColor"],
                  ],
                  "fill-opacity": [
                    "interpolate",
                    ["linear"],
                    ["abs", ["-", ["get", "firstPercentage"], ["get", "secondPercentage"]]],
                    0,
                    0.45,
                    20,
                    0.88,
                  ],
                },
              },
              beforeId,
            );
          }
          if (!map.getLayer(outlineLayerId)) {
            map.addLayer(
              {
                id: outlineLayerId,
                type: "line",
                source: "simulated-states",
                paint: {
                  "line-color": "#ffffff",
                  "line-width": [
                    "case",
                    ["boolean", ["feature-state", "hover"], false],
                    2,
                    0.8,
                  ],
                },
              },
              beforeId,
            );
          }
        };

        installLayersRef.current = installStateLayer;
        map.on("load", installStateLayer);
        map.on("load", () => {
          map?.fitBounds(
            [
              [-74.5, -34],
              [-34, 5.5],
            ],
            { padding: 36, duration: 0 },
          );
        });
        map.on("style.load", installStateLayer);
        map.on("error", (event) => {
          if (event.error && active) {
            setError("Não foi possível carregar o mapa-base do OpenFreeMap.");
          }
        });

        map.on("mousemove", fillLayerId, (event) => {
          const feature = event.features?.[0];
          if (!feature || !map) return;
          const properties = feature.properties as StateProperties;
          const id = properties.id;
          const changedState = hoveredIdRef.current !== id;
          if (hoveredIdRef.current && hoveredIdRef.current !== id) {
            map.setFeatureState(
              { source: "simulated-states", id: hoveredIdRef.current },
              { hover: false },
            );
          }
          hoveredIdRef.current = id;
          map.setFeatureState({ source: "simulated-states", id }, { hover: true });
          map.getCanvas().style.cursor = "pointer";

          const state: HoveredState = properties;
          if (changedState) setHoveredState(state);
          if (!openPopup || changedState) {
            openPopup?.remove();
            openPopup = new Popup({
              closeButton: false,
              closeOnClick: false,
              offset: 14,
              maxWidth: "280px",
            });
            openPopup.setDOMContent(createStatePopup(state)).addTo(map);
          }
          openPopup.setLngLat(event.lngLat);
        });

        map.on("mouseleave", fillLayerId, () => {
          if (!map) return;
          if (hoveredIdRef.current) {
            map.setFeatureState(
              { source: "simulated-states", id: hoveredIdRef.current },
              { hover: false },
            );
          }
          hoveredIdRef.current = null;
          map.getCanvas().style.cursor = "";
          openPopup?.remove();
          setHoveredState(null);
        });
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error
              ? "Não foi possível inicializar o mapa interativo. Atualize a página e tente novamente."
              : "Não foi possível inicializar o mapa interativo.",
          );
        }
      });

    return () => {
      active = false;
      openPopup?.remove();
      map?.remove();
      mapRef.current = null;
      installLayersRef.current = null;
    };
  }, [dark]);

  useEffect(() => {
    const source = mapRef.current?.getSource("simulated-states") as
      | import("maplibre-gl").GeoJSONSource
      | undefined;
    if (source && boundariesRef.current) {
      source.setData(
        getSimulatedBoundaries(boundariesRef.current, results, firstRoundWinners),
      );
    }
  }, [firstRoundWinners, results]);

  const legendCandidates = results.candidates.slice(0, 2);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-2xl border border-border-button-default bg-background-secondary-default">
        <div
          ref={containerRef}
          aria-label={`Mapa interativo do Brasil com a simulação por ${scope === "states" ? "estado" : "município"}`}
          className="h-[min(68vh,640px)] min-h-[420px] w-full"
        />
        {error && (
          <div role="alert" className="absolute inset-x-4 top-4 z-10 rounded-xl border border-border-error-default bg-background-primary-default p-3 text-body-2-regular text-text-primary shadow-card">
            {error}
          </div>
        )}
        {scope === "municipalities" && !error && !boundariesRef.current && (
          <div role="status" className="absolute inset-x-4 top-4 z-10 rounded-xl border border-border-button-default bg-background-primary-default p-3 text-body-2-regular text-text-primary shadow-card">
            Carregando limites municipais oficiais do IBGE…
          </div>
        )}
        {hoveredState && (
          <span className="sr-only" aria-live="polite">
            {hoveredState.name}: {hoveredState.winnerName}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul aria-label="Legenda de candidatos do mapa simulado" className="flex flex-wrap gap-x-5 gap-y-2">
          {legendCandidates.map((candidate) => {
            const color = getCandidateColor(candidate);
            return (
              <li key={candidate.id} className="flex items-center gap-2">
                <span
                  className={cx("size-3 rounded-sm", color.fill)}
                  aria-hidden
                />
                <span className="text-caption-1-regular text-text-secondary">
                  {candidate.name}
                </span>
              </li>
            );
          })}
          <li className="flex items-center gap-2">
            <span aria-hidden className="size-3 rounded-sm bg-background-quaternary-default" />
            <span className="text-caption-1-regular text-text-secondary">Empate ou sem votos atribuídos</span>
          </li>
        </ul>
        <span className="text-caption-1-regular text-text-tertiary">
          Cor mais intensa = maior margem no cenário
        </span>
      </div>
      <p className="text-caption-1-regular text-text-tertiary">
        Limites geográficos: IBGE. As cores representam o cenário hipotético definido pelo usuário, comparado à liderança oficial do 1º turno.
      </p>
    </div>
  );
}
