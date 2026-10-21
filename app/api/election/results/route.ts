import { NextResponse } from "next/server";

const ELECTION_CODES = { "1": "6257", "2": "6258" } as const;
const VALID_UFS = new Set([
  "ac", "al", "ap", "am", "ba", "ce", "df", "es", "go", "ma", "mt", "ms",
  "mg", "pa", "pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc",
  "sp", "se", "to",
]);

type TSECandidate = {
  n?: string;
  sqcand?: string;
  nmu?: string;
  sgp?: string;
  vap?: string;
  pvap?: string;
  pvapn?: string;
};

type ElectionCandidate = {
  id: string;
  number: string;
  name: string;
  party: string;
  votes: number | null;
  percentage: number | null;
};

type TSEPayload = {
  dg?: string;
  hg?: string;
  dt?: string;
  ht?: string;
  tf?: string;
  and?: string;
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

type TSEMunicipality = { cd: string; cdi: string };
type TSECoverage = { cd: string; mu?: TSEMunicipality[] };
type TSEMunicipalities = { abr?: TSECoverage[] };

function parseCount(value?: string): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const turn = params.get("turn") ?? "2";
  const uf = (params.get("uf") ?? "br").toLowerCase();
  const ibgeMunicipality = params.get("municipio");

  if (!(turn in ELECTION_CODES)) {
    return NextResponse.json({ error: "Turno inválido." }, { status: 400 });
  }
  if (uf !== "br" && !VALID_UFS.has(uf)) {
    return NextResponse.json({ error: "UF inválida." }, { status: 400 });
  }
  if (ibgeMunicipality && !/^\d{7}$/.test(ibgeMunicipality)) {
    return NextResponse.json({ error: "Código de município inválido." }, { status: 400 });
  }
  if (ibgeMunicipality && uf === "br") {
    return NextResponse.json(
      { error: "Selecione a UF antes de consultar um município." },
      { status: 400 },
    );
  }

  const electionCode = ELECTION_CODES[turn as keyof typeof ELECTION_CODES];
  let municipalityCode: string | null = null;

  if (ibgeMunicipality) {
    const configUrl = `https://resultados.tse.jus.br/oficial/ele2026/6257/config/mun-e006257-cm.json`;
    try {
      const configResponse = await fetch(configUrl, {
        next: { revalidate: 86_400 },
        signal: AbortSignal.timeout(12_000),
      });
      if (!configResponse.ok) {
        console.error(`TSE municipality config returned HTTP ${configResponse.status}: ${configUrl}`);
        return NextResponse.json(
          { error: "O TSE não disponibilizou o cadastro de municípios neste momento." },
          { status: 502 },
        );
      }
      const config = (await configResponse.json()) as TSEMunicipalities;
      municipalityCode = config.abr
        ?.find((item) => item.cd.toLowerCase() === uf)
        ?.mu?.find((item) => item.cdi === ibgeMunicipality)?.cd ?? null;
    } catch (error) {
      console.error("TSE municipality config request failed", error);
      return NextResponse.json(
        { error: "Não foi possível consultar o cadastro oficial de municípios do TSE." },
        { status: 502 },
      );
    }

    if (!municipalityCode) {
      return NextResponse.json(
        { error: "O município não foi encontrado no cadastro oficial do TSE." },
        { status: 404 },
      );
    }
  }

  const fileName = `${uf}${municipalityCode ?? ""}-c0001-e${electionCode.padStart(6, "0")}-u.json`;
  const sourceUrl = `https://resultados.tse.jus.br/oficial/ele2026/${electionCode}/dados/${uf}/${fileName}`;

  let response: Response;
  try {
    response = await fetch(sourceUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    console.error("TSE results request failed", error);
    return NextResponse.json(
      { error: "Não foi possível consultar os dados oficiais do TSE." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    console.error(`TSE results returned HTTP ${response.status}: ${sourceUrl}`);
    return NextResponse.json(
      {
        error:
          response.status === 404
            ? "O arquivo desta localidade ainda não foi publicado pelo TSE."
            : "O TSE não disponibilizou os dados neste momento.",
      },
      { status: 502 },
    );
  }

  let payload: TSEPayload;
  try {
    payload = (await response.json()) as TSEPayload;
  } catch (error) {
    console.error("TSE results payload was not valid JSON", error);
    return NextResponse.json(
      { error: "O TSE retornou um arquivo de apuração inválido." },
      { status: 502 },
    );
  }

  const rawCandidates: ElectionCandidate[] = (payload.carg ?? [])
    .flatMap((cargo) => cargo.agr ?? [])
    .flatMap((group) => group.par ?? [])
    .flatMap((party) =>
      (party.cand ?? []).map((candidate) => ({
        id: candidate.sqcand ?? "",
        number: candidate.n ?? "",
        name: candidate.nmu ?? "",
        party: party.sg ?? party.nm ?? "",
        votes: parseCount(candidate.vap),
        percentage: parseCount(candidate.pvapn ?? candidate.pvap),
      })),
    );

  const candidates = rawCandidates.filter(
    (candidate): candidate is ElectionCandidate & { votes: number; percentage: number } =>
      Boolean(candidate.id && candidate.name) &&
      candidate.votes !== null &&
      candidate.percentage !== null,
  );
  if (candidates.length === 0 || candidates.length !== rawCandidates.length) {
    console.error("TSE results payload omitted candidate names or vote totals", sourceUrl);
    return NextResponse.json(
      { error: "O TSE retornou dados de votação incompletos para este recorte." },
      { status: 502 },
    );
  }
  candidates.sort((a, b) => b.votes - a.votes);

  const sections = payload.s ?? {};
  const electors = payload.e ?? {};
  const votes = payload.v ?? {};
  const eligibleVoters = parseCount(electors.te);
  const voters = parseCount(votes.tv);
  const abstentions = eligibleVoters !== null && voters !== null
    ? eligibleVoters - voters
    : null;

  return NextResponse.json(
    {
      turn: Number(turn),
      uf: uf.toUpperCase(),
      municipality: ibgeMunicipality,
      sourceUrl,
      updatedAt: payload.dt && payload.ht
        ? `${payload.dt} ${payload.ht}`
        : payload.dg && payload.hg
          ? `${payload.dg} ${payload.hg}`
          : null,
      completed: payload.tf === "s" || payload.and === "f",
      sections: {
        total: parseCount(sections.ts),
        counted: parseCount(sections.st),
        percentage: parseCount(sections.pstn ?? sections.pst),
      },
      statistics: {
        eligibleVoters,
        voters,
        abstentions,
        abstentionPercentage: abstentions !== null && eligibleVoters
          ? (abstentions / eligibleVoters) * 100
          : null,
        validVotes: parseCount(votes.vv),
        blankVotes: parseCount(votes.vb),
        nullVotes: parseCount(votes.vn),
      },
      candidates,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
