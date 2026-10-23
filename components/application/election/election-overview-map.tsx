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
type StateLabelCollection = FeatureCollection<
  import("geojson").Point,
  { uf: string }
>;
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
const countryMaskSourceId = "brazil-territory-mask";
const countryMaskLayerId = "brazil-territory-mask-fill";
const fillLayerId = "election-overview-fill";
const outlineLayerId = "election-overview-outline";
const stateBoundarySourceId = "election-overview-state-boundaries";
const stateBoundaryLayerId = "election-overview-state-boundary";
const stateLabelsSourceId = "election-overview-state-labels";
const stateLabelsLayerId = "election-overview-state-label";
const mapResultsRefreshInterval = 30_000;
const numberFormat = new Intl.NumberFormat("pt-BR");
const percentFormat = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
let municipalityBoundaries: Promise<BoundaryCollection> | null = null;
let stateBoundaries: Promise<BoundaryCollection> | null = null;

function createStateLabels(states: BoundaryCollection): StateLabelCollection {
  return {
    type: "FeatureCollection",
    features: states.features.map((feature) => {
      const [[west, south], [east, north]] = getGeometryBounds(feature.geometry);
      return {
        type: "Feature",
        properties: { uf: feature.properties.uf },
        geometry: {
          type: "Point",
          coordinates: [(west + east) / 2, (south + north) / 2],
        },
      };
    }),
  };
}

function getGeometryBounds(
  geometry: Polygon | MultiPolygon | Geometry,
): [[number, number], [number, number]] {
  const bounds = { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY };
  function visitCoordinates(coordinates: unknown) {
    if (!Array.isArray(coordinates)) return;
    if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
      const longitude = coordinates[0];
      const latitude = coordinates[1];
      bounds.minX = Math.min(bounds.minX, longitude);
      bounds.minY = Math.min(bounds.minY, latitude);
      bounds.maxX = Math.max(bounds.maxX, longitude);
      bounds.maxY = Math.max(bounds.maxY, latitude);
      return;
    }
    coordinates.forEach(visitCoordinates);
  }
  visitCoordinates(geometry.coordinates);
  return [[bounds.minX, bounds.minY], [bounds.maxX, bounds.maxY]];
}

function zoomToMunicipality(map: MapLibreMap, geometry: Geometry) {
  map.fitBounds(getGeometryBounds(geometry), {
    padding: 96,
    maxZoom: 6,
    duration: 900,
  });
}

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

function ringArea(ring: number[][]) {
  return ring.reduce((area, position, index) => {
    const next = ring[(index + 1) % ring.length];
    return area + (position[0] ?? 0) * (next?.[1] ?? 0) -
      (next?.[0] ?? 0) * (position[1] ?? 0);
  }, 0) / 2;
}

function createBrazilTerritoryMask(boundaries: BoundaryCollection): Feature<Polygon> {
  const exteriorRings: number[][][] = [];
  for (const feature of boundaries.features) {
    const polygons = feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
    for (const polygon of polygons) {
      const exterior = polygon[0]?.map((position) => [position[0], position[1]]);
      if (!exterior || exterior.length < 4) continue;
      if (ringArea(exterior) > 0) exterior.reverse();
      exteriorRings.push(exterior);
    }
  }

  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-180, -85],
          [180, -85],
          [180, 85],
          [-180, 85],
          [-180, -85],
        ],
        ...exteriorRings,
      ],
    },
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
  container.className = "election-map-popup";

  const header = document.createElement("div");
  header.className = "election-map-popup-header";
  const title = document.createElement("p");
  title.className = "election-map-popup-title";
  title.textContent = feature.properties.name;
  const status = document.createElement("span");
  status.className = "election-map-popup-status";

  if (feature.properties.tie) {
    status.textContent = "Empate";
  } else if (feature.properties.firstName) {
    status.textContent = "Apuração";
  } else {
    status.textContent = "Sem dados";
  }
  header.append(title, status);
  container.append(header);

  const candidates = [
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
  ].filter((candidate) => candidate.name);

  if (candidates.length === 0) {
    const empty = document.createElement("p");
    empty.className = "election-map-popup-empty";
    empty.textContent = "Aguardando publicação de votos pelo TSE.";
    container.append(empty);
  }

  candidates.forEach((candidate, index) => {
    const row = document.createElement("div");
    row.className = "election-map-popup-row";
    const swatch = document.createElement("span");
    swatch.className = "election-map-popup-swatch";
    swatch.style.backgroundColor = candidate.color;
    const details = document.createElement("div");
    details.className = "election-map-popup-details";
    const position = document.createElement("p");
    position.className = "election-map-popup-position";
    position.textContent = index === 0 ? "Mais votado" : "2º lugar";
    const name = document.createElement("p");
    name.className = "election-map-popup-candidate";
    name.textContent = candidate.name;
    const metrics = document.createElement("div");
    metrics.className = "election-map-popup-metrics";
    const votes = document.createElement("p");
    votes.className = "election-map-popup-votes";
    votes.textContent = `${numberFormat.format(Math.round(candidate.votes))} votos`;
    const percentage = document.createElement("p");
    percentage.className = "election-map-popup-percentage";
    percentage.textContent = `${percentFormat.format(candidate.percentage)}%`;
    metrics.append(votes, percentage);
    details.append(position, name, metrics);
    row.append(swatch, details);
    container.append(row);
  });

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
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectedMunicipalityRef = useRef(selectedMunicipality);
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
  selectedMunicipalityRef.current = selectedMunicipality;

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
    let popupFeatureId: string | null = null;
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
        const stateBoundaries = level === "municipalities"
          ? await loadBoundaries("states")
          : null;
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
        mapRef.current = map;
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
                "line-color": "#111111",
                "line-width": 0.65,
                "line-opacity": 0.85,
              },
            },
            beforeId,
          );

          if (stateBoundaries) {
            map.addSource(stateBoundarySourceId, {
              type: "geojson",
              data: stateBoundaries,
            });
            map.addLayer({
              id: stateBoundaryLayerId,
              type: "line",
              source: stateBoundarySourceId,
              paint: {
                "line-color": "#111111",
                "line-width": 0.65,
                "line-opacity": 0.85,
              },
            });
            map.addSource(stateLabelsSourceId, {
              type: "geojson",
              data: createStateLabels(stateBoundaries),
            });
            map.addLayer({
              id: stateLabelsLayerId,
              type: "symbol",
              source: stateLabelsSourceId,
              layout: {
                "text-field": ["get", "uf"],
                "text-font": ["Open Sans Semibold"],
                "text-size": ["interpolate", ["linear"], ["zoom"], 4, 10, 7, 13],
                "text-allow-overlap": true,
              },
              paint: {
                "text-color": dark ? "#f4f4f5" : "#27272a",
                "text-halo-color": dark ? "#18181b" : "#ffffff",
                "text-halo-width": 1.4,
                "text-opacity": 0.95,
              },
            });
          }

          const selectedMunicipality = selectedMunicipalityRef.current;
          const selectedBoundary = selectedMunicipality
            ? boundaries.features.find((feature) => feature.properties.id === selectedMunicipality.properties.id)
            : undefined;
          if (level === "municipalities" && selectedBoundary) {
            zoomToMunicipality(map, toMapGeometry(selectedBoundary.geometry));
          } else {
            map.fitBounds([[-74.5, -34], [-34, 5.5]], { padding: 36, duration: 0 });
          }
          map.addSource(countryMaskSourceId, {
            type: "geojson",
            data: createBrazilTerritoryMask(stateBoundaries ?? boundaries),
          });
          map.addLayer({
            id: countryMaskLayerId,
            type: "fill",
            source: countryMaskSourceId,
            paint: {
              "fill-color": dark ? "#18181b" : "#c4c9cb",
              "fill-opacity": 1,
            },
          });
          map.moveLayer(fillLayerId);
          map.moveLayer(outlineLayerId);
          if (map.getLayer(stateBoundaryLayerId)) map.moveLayer(stateBoundaryLayerId);
          if (map.getLayer(stateLabelsLayerId)) map.moveLayer(stateLabelsLayerId);
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
          const featureId = feature.properties.id;
          if (popupFeatureId === featureId) {
            popup?.setLngLat(event.lngLat);
            return;
          }
          popupFeatureId = featureId;
          popup ??= new Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 12,
            maxWidth: "280px",
            className: "election-map-popup-container",
          });
          popup.setDOMContent(createPopup(feature)).setLngLat(event.lngLat).addTo(map);
        });
        map.on("mouseleave", fillLayerId, () => {
          if (map) map.getCanvas().style.cursor = "";
          popupFeatureId = null;
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
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [
    dark,
    level,
    turn,
  ]);

  useEffect(() => {
    if (level !== "municipalities" || !selectedMunicipality) return;
    const map = mapRef.current;
    if (map) zoomToMunicipality(map, selectedMunicipality.geometry);
  }, [level, selectedMunicipality?.properties.id]);

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
