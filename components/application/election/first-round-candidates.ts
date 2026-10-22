export type FirstRoundCandidate = {
  id: string;
  number: string;
  name: string;
  party: string;
  votes: number;
  percentage: number;
};

export const firstRoundCandidates: FirstRoundCandidate[] = [
  { id: "280002551544", number: "22", name: "FLAVIO BOLSONARO", party: "PL", votes: 56_104_503, percentage: 47.027772356 },
  { id: "280002542548", number: "13", name: "LULA", party: "PT", votes: 53_879_538, percentage: 45.162767911 },
  { id: "280002551547", number: "70", name: "ESCRITOR AUGUSTO CURY", party: "AVANTE", votes: 3_448_569, percentage: 2.890650647 },
  { id: "280002540694", number: "14", name: "RENAN SANTOS", party: "MISSÃO", votes: 2_675_887, percentage: 2.242975126 },
  { id: "280002551932", number: "55", name: "RONALDO CAIADO", party: "PSD", votes: 2_605_148, percentage: 2.183680463 },
];
