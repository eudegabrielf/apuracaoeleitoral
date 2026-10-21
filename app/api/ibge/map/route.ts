import { NextResponse } from "next/server";

const IBGE_BASE = "https://servicodados.ibge.gov.br/api/v3/malhas";
const TSE_MUNICIPALITIES =
  "https://resultados.tse.jus.br/oficial/ele2026/6257/config/mun-e006257-cm.json";

const IBGE_STATE_UFS: Record<string, string> = {
  "11": "ro", "12": "ac", "13": "am", "14": "rr", "15": "pa", "16": "ap", "17": "to",
  "21": "ma", "22": "pi", "23": "ce", "24": "rn", "25": "pb", "26": "pe", "27": "al",
  "28": "se", "29": "ba", "31": "mg", "32": "es", "33": "rj", "35": "sp", "41": "pr",
  "42": "sc", "43": "rs", "50": "ms", "51": "mt", "52": "go", "53": "df",
};

type GeoFeature = {
  type: "Feature";
  properties: { codarea: string };
  geometry: unknown;
};

type GeoCollection = { type: "FeatureCollection"; features: GeoFeature[] };
type TSEMunicipality = { cdi: string; nm: string };
type TSEState = { cd: string; ds: string; mu?: TSEMunicipality[] };
type TSECoverage = { abr?: TSEState[] };

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    next: { revalidate: 86_400 },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const scope = params.get("scope") ?? "states";
  const uf = params.get("uf") ?? "br";

  let mapUrl: string;
  if (scope === "states" && uf === "br") {
    mapUrl = `${IBGE_BASE}/paises/BR?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=UF`;
  } else if (scope === "municipalities" && /^\d{2}$/.test(uf)) {
    mapUrl = `${IBGE_BASE}/estados/${uf}?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=municipio`;
  } else {
    return NextResponse.json({ error: "Recorte geográfico inválido." }, { status: 400 });
  }

  try {
    const [map, tseConfig] = await Promise.all([
      loadJson<GeoCollection>(mapUrl),
      loadJson<TSECoverage>(TSE_MUNICIPALITIES),
    ]);

    const tseStateByUf = new Map(
      (tseConfig.abr ?? []).map((state) => [state.cd.toLowerCase(), state]),
    );
    const features = map.features.map((feature) => {
      const ibgeCode = feature.properties.codarea;
      const stateUf =
        scope === "states" ? IBGE_STATE_UFS[ibgeCode] : IBGE_STATE_UFS[uf];
      const state = stateUf ? tseStateByUf.get(stateUf) : undefined;

      if (!state) {
        throw new Error(`No TSE locality metadata for IBGE code ${ibgeCode}`);
      }

      if (scope === "states") {
        return {
          ...feature,
          properties: {
            id: ibgeCode,
            nome: state.ds,
            sigla: state.cd.toUpperCase(),
          },
        };
      }

      const municipality = state.mu?.find((item) => item.cdi === ibgeCode);
      if (!municipality) {
        throw new Error(`No TSE municipality metadata for IBGE code ${ibgeCode}`);
      }

      return {
        ...feature,
        properties: {
          id: ibgeCode,
          nome: municipality.nm,
          sigla: state.cd.toUpperCase(),
        },
      };
    });

    return NextResponse.json(
      { ...map, features },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } },
    );
  } catch (error) {
    console.error("IBGE/TSE map request failed", error);
    return NextResponse.json(
      { error: "Não foi possível carregar as malhas e os nomes oficiais do IBGE e do TSE." },
      { status: 502 },
    );
  }
}
