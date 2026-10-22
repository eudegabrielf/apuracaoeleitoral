import type { Metadata } from "next";
import { SecondRoundSimulator } from "@/components/application/election/second-round-simulator";

export const metadata: Metadata = {
  title: "Simulador do segundo turno — Apuração",
  description:
    "Explore cenários hipotéticos de migração de votos usando resultados oficiais do primeiro turno publicados pelo TSE.",
};

export default function SecondRoundSimulatorPage() {
  return <SecondRoundSimulator />;
}
