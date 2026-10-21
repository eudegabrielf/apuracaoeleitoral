import { NextResponse } from "next/server";

const ELECTION_CODES = { "1": "6257", "2": "6258" } as const;
const MUNICIPALITIES_URL =
  "https://resultados.tse.jus.br/oficial/ele2026/6257/config/mun-e006257-cm.json";
const MAP_CACHE_TTL = 30_000;
const REQUEST_CONCURRENCY = 32;

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
  unpublished: number;
};

type CachedResults = { expiresAt: number; data: MapResults };
const resultCache = new Map<string, CachedResults>();
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

async function fetchPayload(url: string): Promise<TSEPayload | null> {
  const response = await fetch(url, {
    next: { revalidate: 20 },
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return (await response.json()) as TSEPayload;
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

function buildWinner(payload: TSEPayload | null): MapWinner {
  const candidates = payload ? getCandidates(payload) : [];
  const top = candidates[0];
  if (!top || top.votes === 0) {
    return { candidateId: null, tieCandidateIds: [], votes: null, percentage: null, leaders: [] };
  }

  const ties = candidates.filter((candidate) => candidate.votes === top.votes);
  return {
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

async function buildMapResults(turn: string, uf: string): Promise<MapResults> {
  const cacheKey = `${turn}:${uf}`;
  const cached = resultCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

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
  let unpublished = 0;
  const locations: { ibgeCode: string; resultUrl: string }[] = [];

  if (uf === "br") {
    for (const state of configuration.abr ?? []) {
      const ibgeCode = Object.entries(IBGE_STATE_UFS)
        .find(([, stateUf]) => stateUf === state.cd.toLowerCase())?.[0];
      if (!ibgeCode) continue;
      locations.push({ ibgeCode, resultUrl: getTSEUrl(turn, state.cd.toLowerCase()) });
    }
  } else {
    const state = (configuration.abr ?? []).find((entry) => entry.cd.toLowerCase() === uf);
    const stateCode = Object.entries(IBGE_STATE_UFS)
      .find(([, stateUf]) => stateUf === uf)?.[0];
    if (!state || !stateCode) throw new Error(`No TSE or IBGE state metadata for ${uf}`);
    for (const municipality of state.mu ?? []) {
      locations.push({
        ibgeCode: municipality.cdi,
        resultUrl: getTSEUrl(turn, uf, municipality.cd),
      });
    }
  }

  let nextLocation = 0;
  async function processLocationQueue() {
    while (nextLocation < locations.length) {
      const location = locations[nextLocation++];
      if (!location) continue;
      const payload = await fetchPayload(location.resultUrl);
      results[location.ibgeCode] = buildWinner(payload);
      if (!payload) unpublished++;
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
    unpublished,
  };
  resultCache.set(cacheKey, { expiresAt: Date.now() + MAP_CACHE_TTL, data });
  return data;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const turn = params.get("turn") ?? "1";
  const scope = params.get("scope") ?? "states";
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
  if (scope === "municipalities" && uf === "br") {
    return NextResponse.json({ error: "Selecione a UF antes de carregar municípios." }, { status: 400 });
  }

  try {
    const results = await buildMapResults(turn, uf);
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
