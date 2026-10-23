# Apuração Eleitoral Brasil

Painel open-source para acompanhar resultados oficiais da eleição presidencial brasileira de 2026, com consulta nacional, por estado e por município.

Criado por [Eude Gabriel](https://github.com/eudegabrielf). Este projeto é independente e não representa nem é afiliado ao Tribunal Superior Eleitoral (TSE) ou ao Instituto Brasileiro de Geografia e Estatística (IBGE).

## Visão geral

A aplicação reúne dados publicados pelo TSE e limites geográficos do IBGE. Ela não estima nem inventa votos: localidades sem publicação oficial permanecem identificadas como indisponíveis ou aguardando apuração.

### Recursos

- Resultados presidenciais do primeiro e do segundo turno, com votos, percentuais e estatísticas de comparecimento.
- Simulador do segundo turno com Flávio Bolsonaro e Lula como finalistas fixos. Configure a migração de votos de cada candidatura, votos em branco, votos nulos e abstenções; o painel mostra a distribuição até 100% e só exibe a projeção depois de salvar a simulação.
- Mapa interativo do OpenFreeMap no dashboard, recortado visualmente ao território brasileiro com limites do IBGE e resultados oficiais do TSE por estado ou pelos territórios dos municípios. No modo municipal, os resultados chegam em lotes e são aplicados progressivamente, com indicador de carregamento e atualização automática.
- Apuração nacional atualizada automaticamente a cada 30 segundos. Em falhas temporárias de consulta, o dashboard mantém os últimos resultados oficiais disponíveis e informa que a atualização falhou.
- Busca global de municípios, com seleção direta da cidade e do respectivo estado.
- Detalhes de liderança, empate e situação da publicação oficial ao interagir com o mapa.
- Zoom, navegação pelo mapa e recorte por município.
- Evolução dos resultados por publicação oficial em gráfico responsivo, sem rolagem horizontal, com seleção de candidaturas e escala ampliada ao destacar candidaturas fora da liderança. No segundo turno, o histórico local registra os percentuais oficiais observados a cada 10 minutos, preservando também a publicação final; passe sobre as curvas para consultar os percentuais e horários. O histórico fica no armazenamento local do navegador.
- Tema claro/escuro e layout responsivo.

## Fontes e atribuições

- **Resultados eleitorais:** arquivos e portal oficial do [TSE](https://resultados.tse.jus.br/oficial/app/index.html). A aplicação consulta os dados publicados e atualiza os painéis periodicamente.
- **Candidaturas e fotografias:** [Dados Abertos do TSE — Candidatos 2026](https://dadosabertos.tse.jus.br/dataset/candidatos-2026). As fotografias locais estão em `public/election/candidates/`.
- **Limites geográficos:** [API de Malhas do IBGE](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3).
- **Mapa do dashboard:** [OpenFreeMap](https://openfreemap.org/), com dados do OpenStreetMap e tiles do OpenMapTiles. Os limites estaduais e municipais locais são versões simplificadas das malhas oficiais do [IBGE 2022](https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2022/Brasil/BR/); o modo de urnas permanece indisponível porque os dados oficiais integrados não incluem coordenadas de seções ou locais de votação.
- **Interface:** componentes de código-fonte mantidos neste repositório e adaptados para a aplicação. Os avisos de autoria e a licença estão em [LICENSE](LICENSE).

A disponibilidade dos dados depende dos serviços externos do TSE e do IBGE. A aplicação não é um canal oficial de divulgação eleitoral. Marcas, dados e fotografias permanecem sujeitos aos direitos e condições de seus respectivos responsáveis.

## Tecnologias

- Next.js 16 e React 19
- TypeScript
- Tailwind CSS 4
- React Aria Components
- Recharts
- Remix Icon
- Componentes de interface mantidos como código-fonte no repositório

## Executar localmente

### Requisitos

- Node.js 20.9 ou superior
- npm

### Instalação

```bash
git clone https://github.com/eudegabrielf/apuracaoeleitoral.git
cd apuracaoeleitoral
npm ci
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Não é necessária chave de API ou arquivo `.env` para executar o painel. O servidor consulta TSE e IBGE; se algum serviço estiver indisponível, a interface informa que os dados não puderam ser carregados.

### Verificações e produção

```bash
npm run typecheck
npm run build
npm run start
```

`npm run start` inicia a versão de produção depois de `npm run build`.

## Organização

```text
app/
  api/election/       Endpoints de resultados e liderança no mapa
  api/ibge/           Endpoint das malhas geográficas
  page.tsx            Dashboard
components/
  application/election/  Dashboard, mapa e evolução dos resultados
  base/                  Componentes de interface usados pela aplicação
public/election/          Fotografias de candidaturas
styles/                   Tokens, tipografia e estilos globais
```

### Endpoints da aplicação

- `GET /api/election/results?turn=2&uf=br` — resultados oficiais de um turno e recorte. Aceita `turn=1|2`, `uf=br|<sigla>` e, junto de uma UF, `municipio=<código IBGE de 7 dígitos>`.
- `GET /api/election/map-results?turn=1&scope=states&uf=br` — liderança por estado ou município. Para municípios, use `scope=municipalities`; `uf=br` consulta o Brasil ou informe o código IBGE de dois dígitos do estado.
- `GET /api/election/map-results?turn=1&scope=states&uf=br&includeStateTotals=1` — inclui as estatísticas oficiais agregadas por estado usadas pelo simulador para calcular o mapa hipotético.
- `GET /api/election/map-results?turn=1&scope=municipalities&uf=br&includeMunicipalityTotals=1` — inclui as estatísticas oficiais agregadas por município usadas pelo modo municipal do mapa simulado.
- `GET /api/election/map-results?turn=1&scope=municipalities&uf=br&stream=1` — transmite os resultados municipais em lotes NDJSON para colorir o mapa e indicar o progresso enquanto as demais localidades são consultadas.
- `GET /api/ibge/map?scope=states` — limites estaduais; `scope=municipalities&uf=br` consulta a malha municipal nacional; `scope=municipalities&uf=<código IBGE>` consulta um estado.

Essas rotas fazem as consultas externas no servidor e devolvem respostas próprias para o dashboard. A rota do mapa agrega resultados oficiais do TSE com concorrência limitada, tentativas para falhas transitórias e cache em memória; no modo de transmissão, os lotes são enviados progressivamente e o mapa atualiza automaticamente a cada 30 segundos. A apuração nacional também é consultada a cada 30 segundos, com cache curto e proteção contra consultas concorrentes. A interface preserva os últimos dados oficiais recebidos quando uma atualização falha, sem substituir dados indisponíveis por estimativas. A disponibilidade continua sujeita aos serviços externos do TSE e do OpenFreeMap.

## Autor

Desenvolvido por [Eude Gabriel](https://github.com/eudegabrielf).

## Licença

Este repositório é distribuído sob a [licença MIT](LICENSE). Os avisos de copyright de terceiros foram preservados. Dados eleitorais, fotografias, marcas e demais materiais mantêm as atribuições e condições de seus respectivos responsáveis.
