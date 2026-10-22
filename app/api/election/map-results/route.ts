import { NextResponse } from "next/server";

const ELECTION_CODES = { "1": "6257", "2": "6258" } as const;
const MUNICIPALITIES_URL =
  "https://resultados.tse.jus.br/oficial/ele2026/6257/config/mun-e006257-cm.json";
const MAP_CACHE_TTL = 60_000;
const REQUEST_CONCURRENCY = 8;
const MAX_RETRIES = 3;

const IBGE_STATE_UFS: Record<string, string> = {
  "11": "ro", "12": "ac", "13": "am", "14": "rr", "15": "pa", "16": "ap", "17": "to",
  "21": "ma", "22": "pi", "23": "ce", "24": "rn", "25": "pb", "26": "pe", "27": "al",
  "28": "se", "29": "ba", "31": "mg", "32": "es", "33": "rj", "35": "sp", "41": "pr",
  "42": "sc", "43": "rs", "50": "ms", "51": "mt", "52": "go", "53": "df",
};

type TSECandidate = {
  sqcand?: string;
  nmu?: string;
  vap?: string;
  pvapn?: string;
  pvap?: string;
};

type ElectionCandidate = {
  id: string;
  name: string;
  party: string;
  votes: number;
  percentage: number;
};

type TSEPayload = {
  dt?: string;
  ht?: string;
  s?: Record<string, string>;
  e?: Record<string, string>;
  v?: Record<string, string>;
  carg?: Array<{
    agr?: Array<{
      par?: Array<{
        sg?: string;
        nm?: string;
        cand?: TSECandidate[];
      }>;
    }>;
  }>;
};

type TSEMunicipality = { cd: string; cdi: string; nm: string };
type TSECoverage = { cd: string; mu?: TSEMunicipality[] };
type TSEConfiguration = { abr?: TSECoverage[] };
type MapWinner = {
  available: boolean;
  published: boolean;
  candidateId: string | null;
  tieCandidateIds: string[];
  votes: number | null;
  percentage: number | null;
  leaders: { candidateId: string; votes: number; percentage: number }[];
};
type MapResults = {
  turn: number;
  uf: string;
  sourceUrl: string;
  updatedAt: string | null;
  candidates: ElectionCandidate[];
  results: Record<string, MapWinner>;
  stateTotals?: Record<string, {
    candidates: ElectionCandidate[];
    eligibleVoters: number | null;
    voters: number | null;
    abstentions: number | null;
    blankVotes: number | null;
    nullVotes: number | null;
  }>;
  municipalityTotals?: MapResults["stateTotals"];
  unpublished: number;
  failed: number;
};

type CachedResults = { expiresAt: number; data: MapResults };
const resultCache = new Map<string, CachedResults>();
const inFlightResults = new Map<string, Promise<MapResults>>();
let configurationPromise: Promise<TSEConfiguration> | null = null;

function parseCount(value?: string): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function getCandidates(payload: TSEPayload): ElectionCandidate[] {
  return (payload.carg ?? [])
    .flatMap((cargo) => cargo.agr ?? [])
    .flatMap((group) => group.par ?? [])
    .flatMap((party) =>
      (party.cand ?? []).flatMap((candidate) => {
        const votes = parseCount(candidate.vap);
        const percentage = parseCount(candidate.pvapn ?? candidate.pvap);
        if (!candidate.sqcand || !candidate.nmu || votes == null || percentage == null) return [];
        return [{
          id: candidate.sqcand,
          name: candidate.nmu,
          party: party.sg ?? party.nm ?? "",
          votes,
          percentage,
        }];
      }),
    )
    .sort((a, b) => b.votes - a.votes);
}

function getTSEUrl(
  turn: string,
  uf: string,
  municipalityCode?: string,
): string {
  const electionCode = ELECTION_CODES[turn as keyof typeof ELECTION_CODES];
  const fileName = `${uf}${municipalityCode ?? ""}-c0001-e${electionCode.padStart(6, "0")}-u.json`;
  return `https://resultados.tse.jus.br/oficial/ele2026/${electionCode}/dados/${uf}/${fileName}`;
}

async function fetchPayload(url: string, requestSignal?: AbortSignal): Promise<TSEPayload | null> {
  for (let attempt = 0; ; attempt += 1) {
    if (requestSignal?.aborted) throw new DOMException("Request aborted", "AbortError");
    let response: Response;
    try {
      response = await fetch(url, {
        next: { revalidate: 20 },
        signal: requestSignal
          ? AbortSignal.any([requestSignal, AbortSignal.timeout(12_000)])
          : AbortSignal.timeout(12_000),
      });
    } catch (error) {
      if (requestSignal?.aborted || attempt >= MAX_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
      continue;
    }
    if (response.status === 404) return null;
    if (!response.ok) {
      if ([429, 502, 503, 504].includes(response.status) && attempt < MAX_RETRIES) {
        await response.body?.cancel();
        await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
        continue;
      }
      throw new Error(`${url} returned HTTP ${response.status}`);
    }
    return (await response.json()) as TSEPayload;
  }
}

async function getConfiguration(): Promise<TSEConfiguration> {
  configurationPromise ??= fetch(MUNICIPALITIES_URL, {
    next: { revalidate: 86_400 },
    signal: AbortSignal.timeout(12_000),
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`${MUNICIPALITIES_URL} returned HTTP ${response.status}`);
      }
      return (await response.json()) as TSEConfiguration;
    })
    .catch((error: unknown) => {
      configurationPromise = null;
      throw error;
    });
  return configurationPromise;
}

function getLocations(
  configuration: TSEConfiguration,
  turn: string,
  uf: string,
  scope: string,
): { ibgeCode: string; resultUrl: string }[] {
  const locations: { ibgeCode: string; resultUrl: string }[] = [];

  if (uf === "br") {
    for (const state of configuration.abr ?? []) {
      const ibgeCode = Object.entries(IBGE_STATE_UFS)
        .find(([, stateUf]) => stateUf === state.cd.toLowerCase())?.[0];
      if (!ibgeCode) continue;
      locations.push({ ibgeCode, resultUrl: getTSEUrl(turn, state.cd.toLowerCase()) });
      if (scope === "municipalities") {
        for (const municipality of state.mu ?? []) {
          locations.push({
            ibgeCode: municipality.cdi,
            resultUrl: getTSEUrl(turn, state.cd.toLowerCase(), municipality.cd),
          });
        }
      }
    }
    return locations;
  }

  const state = (configuration.abr ?? []).find((entry) => entry.cd.toLowerCase() === uf);
  const stateCode = Object.entries(IBGE_STATE_UFS)
    .find(([, stateUf]) => stateUf === uf)?.[0];
  if (!state || !stateCode) throw new Error(`No TSE or IBGE state metadata for ${uf}`);
  return (state.mu ?? []).map((municipality) => ({
    ibgeCode: municipality.cdi,
    resultUrl: getTSEUrl(turn, uf, municipality.cd),
  }));
}

function buildWinner(payload: TSEPayload | null): MapWinner {
  const candidates = payload ? getCandidates(payload) : [];
  const top = candidates[0];
  if (!top || top.votes === 0) {
    return {
      published: payload !== null,
      available: true,
      candidateId: null,
      tieCandidateIds: [],
      votes: null,
      percentage: null,
      leaders: [],
    };
  }

  const ties = candidates.filter((candidate) => candidate.votes === top.votes);
  return {
    published: true,
    available: true,
    candidateId: ties.length === 1 ? top.id : null,
    tieCandidateIds: ties.length > 1 ? ties.map(({ id }) => id) : [],
    votes: top.votes,
    percentage: top.percentage,
    leaders: candidates.slice(0, 2).map(({ id, votes, percentage }) => ({
      candidateId: id,
      votes,
      percentage,
    })),
  };
}

async function buildMapResults(
  turn: string,
  uf: string,
  scope: string,
  includeStateTotals: boolean,
  includeMunicipalityTotals: boolean,
): Promise<MapResults> {
  const [configuration, nationalPayload] = await Promise.all([
    getConfiguration(),
    fetchPayload(getTSEUrl(turn, "br")),
  ]);
  if (!nationalPayload) throw new Error("The TSE has not published the national results file.");

  const nationalCandidates = getCandidates(nationalPayload);
  if (nationalCandidates.length === 0) {
    throw new Error("The TSE national results file does not contain candidate vote totals.");
  }

  const results: Record<string, MapWinner> = {};
  const stateTotals: NonNullable<MapResults["stateTotals"]> = {};
  const municipalityTotals: NonNullable<MapResults["municipalityTotals"]> = {};
  let unpublished = 0;
  let failed = 0;
  const locations = getLocations(configuration, turn, uf, scope);

  let nextLocation = 0;
  async function processLocationQueue() {
    while (nextLocation < locations.length) {
      const location = locations[nextLocation++];
      if (!location) continue;
      try {
        const payload = await fetchPayload(location.resultUrl);
        results[location.ibgeCode] = buildWinner(payload);
        if (!payload) {
          unpublished++;
        } else if (scope === "states" && includeStateTotals) {
          const eligibleVoters = parseCount(payload.e?.te);
          const voters = parseCount(payload.v?.tv);
          stateTotals[location.ibgeCode] = {
            candidates: getCandidates(payload),
            eligibleVoters,
            voters,
            abstentions:
              eligibleVoters !== null && voters !== null
                ? eligibleVoters - voters
                : null,
            blankVotes: parseCount(payload.v?.vb),
            nullVotes: parseCount(payload.v?.vn),
          };
        } else if (scope === "municipalities" && includeMunicipalityTotals) {
          const eligibleVoters = parseCount(payload.e?.te);
          const voters = parseCount(payload.v?.tv);
          municipalityTotals[location.ibgeCode] = {
            candidates: getCandidates(payload),
            eligibleVoters,
            voters,
            abstentions:
              eligibleVoters !== null && voters !== null
                ? eligibleVoters - voters
                : null,
            blankVotes: parseCount(payload.v?.vb),
            nullVotes: parseCount(payload.v?.vn),
          };
        }
      } catch {
        results[location.ibgeCode] = { ...buildWinner(null), available: false };
        failed++;
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(REQUEST_CONCURRENCY, locations.length) },
      () => processLocationQueue(),
    ),
  );

  const data: MapResults = {
    turn: Number(turn),
    uf: uf.toUpperCase(),
    sourceUrl: getTSEUrl(turn, "br"),
    updatedAt: nationalPayload.dt && nationalPayload.ht
      ? `${nationalPayload.dt} ${nationalPayload.ht}`
      : null,
    candidates: nationalCandidates,
    results,
    ...(scope === "states" && includeStateTotals ? { stateTotals } : {}),
    ...(scope === "municipalities" && includeMunicipalityTotals
      ? { municipalityTotals }
      : {}),
    unpublished,
    failed,
  };
  return data;
}

async function getMapResults(
  turn: string,
  uf: string,
  scope: string,
  includeStateTotals: boolean,
  includeMunicipalityTotals: boolean,
): Promise<MapResults> {
  const cacheKey = `${turn}:${scope}:${uf}:${includeStateTotals}:${includeMunicipalityTotals}`;
  const cached = resultCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  let pending = inFlightResults.get(cacheKey);
  if (!pending) {
    pending = buildMapResults(
      turn,
      uf,
      scope,
      includeStateTotals,
      includeMunicipalityTotals,
    );
    inFlightResults.set(cacheKey, pending);
  }

  try {
    const data = await pending;
    if (data.failed === 0) {
      resultCache.set(cacheKey, { expiresAt: Date.now() + MAP_CACHE_TTL, data });
    }
    return data;
  } finally {
    if (inFlightResults.get(cacheKey) === pending) inFlightResults.delete(cacheKey);
  }
}

type MapResultsStreamMessage =
  | {
      type: "start";
      turn: number;
      uf: string;
      sourceUrl: string;
      updatedAt: string | null;
      candidates: ElectionCandidate[];
      totalLocations: number;
    }
  | {
      type: "batch";
      results: Record<string, MapWinner>;
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

function streamMapResults(request: Request, turn: string, uf: string, scope: string): Response {
  const encoder = new TextEncoder();
  const cacheKey = `${turn}:${scope}:${uf}:false:false`;
  const streamAbortController = new AbortController();
  const streamSignal = AbortSignal.any([request.signal, streamAbortController.signal]);
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (message: MapResultsStreamMessage) => {
        if (!cancelled && !streamSignal.aborted) {
          controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
        }
      };
      const close = () => {
        if (!cancelled) controller.close();
      };

      void (async () => {
        try {
          const cached = resultCache.get(cacheKey);
          if (cached && cached.expiresAt > Date.now()) {
            const { data } = cached;
            send({
              type: "start",
              turn: data.turn,
              uf: data.uf,
              sourceUrl: data.sourceUrl,
              updatedAt: data.updatedAt,
              candidates: data.candidates,
              totalLocations: Object.keys(data.results).length,
            });
            send({
              type: "batch",
              results: data.results,
              completed: Object.keys(data.results).length,
              failed: data.failed,
              unpublished: data.unpublished,
            });
            send({
              type: "complete",
              completed: Object.keys(data.results).length,
              failed: data.failed,
              unpublished: data.unpublished,
            });
            close();
            return;
          }

          const [configuration, nationalPayload] = await Promise.all([
            getConfiguration(),
            fetchPayload(getTSEUrl(turn, "br"), streamSignal),
          ]);
          if (!nationalPayload) throw new Error("O TSE ainda não publicou os resultados nacionais.");
          const candidates = getCandidates(nationalPayload);
          if (candidates.length === 0) {
            throw new Error("O TSE ainda não publicou votos de candidatos neste turno.");
          }

          const locations = getLocations(configuration, turn, uf, scope);
          const sourceUrl = getTSEUrl(turn, "br");
          const updatedAt = nationalPayload.dt && nationalPayload.ht
            ? `${nationalPayload.dt} ${nationalPayload.ht}`
            : null;
          send({
            type: "start",
            turn: Number(turn),
            uf: uf.toUpperCase(),
            sourceUrl,
            updatedAt,
            candidates,
            totalLocations: locations.length,
          });

          const results: Record<string, MapWinner> = {};
          let completed = 0;
          let failed = 0;
          let unpublished = 0;
          const batchSize = 250;

          for (let offset = 0; offset < locations.length; offset += batchSize) {
            if (streamSignal.aborted || cancelled) return;
            const batch = locations.slice(offset, offset + batchSize);
            const batchResults: Record<string, MapWinner> = {};
            let nextLocation = 0;

            async function processBatch() {
              while (nextLocation < batch.length) {
                const location = batch[nextLocation++];
                if (!location) continue;
                try {
                  const payload = await fetchPayload(location.resultUrl, streamSignal);
                  const winner = buildWinner(payload);
                  batchResults[location.ibgeCode] = winner;
                  if (!payload) unpublished += 1;
                } catch (error) {
                  if (streamSignal.aborted || cancelled) return;
                  batchResults[location.ibgeCode] = { ...buildWinner(null), available: false };
                  failed += 1;
                }
              }
            }

            await Promise.all(
              Array.from(
                { length: Math.min(REQUEST_CONCURRENCY, batch.length) },
                () => processBatch(),
              ),
            );
            if (streamSignal.aborted || cancelled) return;
            Object.assign(results, batchResults);
            completed += batch.length;
            send({ type: "batch", results: batchResults, completed, failed, unpublished });
          }

          if (failed === 0) {
            resultCache.set(cacheKey, {
              expiresAt: Date.now() + MAP_CACHE_TTL,
              data: {
                turn: Number(turn),
                uf: uf.toUpperCase(),
                sourceUrl,
                updatedAt,
                candidates,
                results,
                unpublished,
                failed,
              },
            });
          }
          send({ type: "complete", completed, failed, unpublished });
          close();
        } catch (error) {
          if (!streamSignal.aborted && !cancelled) {
            send({
              type: "error",
              message: error instanceof Error
                ? error.message
                : "Não foi possível carregar os resultados oficiais do mapa.",
            });
            close();
          }
        }
      })();
    },
    cancel() {
      cancelled = true;
      streamAbortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const turn = params.get("turn") ?? "1";
  const scope = params.get("scope") ?? "states";
  const includeStateTotals = params.get("includeStateTotals") === "1";
  const includeMunicipalityTotals = params.get("includeMunicipalityTotals") === "1";
  const ufCode = params.get("uf") ?? "br";
  const uf = ufCode === "br" ? "br" : IBGE_STATE_UFS[ufCode] ?? "";

  if (!(turn in ELECTION_CODES)) {
    return NextResponse.json({ error: "Turno inválido." }, { status: 400 });
  }
  if ((scope !== "states" && scope !== "municipalities") || !uf) {
    return NextResponse.json({ error: "Recorte geográfico inválido." }, { status: 400 });
  }
  if (scope === "states" && uf !== "br") {
    return NextResponse.json({ error: "A malha de estados exige o recorte Brasil." }, { status: 400 });
  }
  try {
    if (params.get("stream") === "1") {
      return streamMapResults(request, turn, uf, scope);
    }
    const results = await getMapResults(
      turn,
      uf,
      scope,
      includeStateTotals,
      includeMunicipalityTotals,
    );
    return NextResponse.json(results, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("TSE map results request failed", error);
    return NextResponse.json(
      {
        error: "Não foi possível carregar os resultados oficiais do mapa do TSE.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
