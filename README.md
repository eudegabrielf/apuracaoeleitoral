# Apuração Eleitoral Brasil

Painel open-source para acompanhar resultados oficiais da eleição presidencial brasileira de 2026, com consulta nacional, por estado e por município.

Criado por [Eude Gabriel](https://github.com/eudegabrielf). Este projeto é independente e não representa nem é afiliado ao Tribunal Superior Eleitoral (TSE) ou ao Instituto Brasileiro de Geografia e Estatística (IBGE).

[![Licença MIT](https://img.shields.io/github/license/eudegabrielf/apuracaoeleitoral)](LICENSE)

## Visão geral

A aplicação reúne dados publicados pelo TSE e limites geográficos do IBGE. Ela não estima nem inventa votos: localidades sem publicação oficial permanecem identificadas como indisponíveis ou aguardando apuração.

### Recursos

- Resultados presidenciais do primeiro e do segundo turno, com votos, percentuais e estatísticas de comparecimento.
- Mapa nacional colorido por estado; ao selecionar um estado, o mapa detalha seus municípios.
- Busca global de municípios, com seleção direta da cidade e do respectivo estado.
- Detalhes de liderança, empate e situação da publicação oficial ao interagir com o mapa.
- Zoom, navegação pelo mapa e recorte por município.
- Evolução dos resultados por publicação oficial. O histórico observado durante o uso fica no armazenamento local do navegador.
- Tema claro/escuro e layout responsivo.

## Fontes e atribuições

- **Resultados eleitorais:** arquivos e portal oficial do [TSE](https://resultados.tse.jus.br/oficial/app/index.html). A aplicação consulta os dados publicados e atualiza os painéis periodicamente.
- **Candidaturas e fotografias:** [Dados Abertos do TSE — Candidatos 2026](https://dadosabertos.tse.jus.br/dataset/candidatos-2026). As fotografias locais estão em `public/election/candidates/`.
- **Limites geográficos:** [API de Malhas do IBGE](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3).
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
- `GET /api/ibge/map?scope=states` — limites estaduais; `scope=municipalities&uf=br` consulta a malha municipal nacional; `scope=municipalities&uf=<código IBGE>` consulta um estado.

Essas rotas fazem as consultas externas no servidor e devolvem respostas próprias para o dashboard. A rota do mapa agrega resultados do TSE com concorrência limitada e cache em memória para reduzir chamadas repetidas.

## Autor

Desenvolvido por [Eude Gabriel](https://github.com/eudegabrielf).

## Licença

Este repositório é distribuído sob a [licença MIT](LICENSE). Os avisos de copyright de terceiros foram preservados. Dados eleitorais, fotografias, marcas e demais materiais mantêm as atribuições e condições de seus respectivos responsáveis.
