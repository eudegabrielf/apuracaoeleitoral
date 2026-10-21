# Contribuindo

Issues e pull requests são bem-vindos. Para mudanças maiores, abra uma issue primeiro para alinhar o escopo.

## Ambiente local

Use Node.js 20.9 ou superior e npm:

```bash
npm ci
npm run dev
```

Antes de enviar um pull request, execute as verificações:

```bash
npm run typecheck
npm run build
```

## Diretrizes

- Use dados publicados pelo TSE; não estime votos nem preencha resultados ausentes.
- Mantenha a atribuição dos dados e das malhas ao TSE e ao IBGE.
- Siga os tokens semânticos e componentes já usados na interface.
- Não inclua chaves, tokens ou outros segredos em commits.
- Descreva o comportamento alterado e as verificações realizadas no pull request.

## Contato

Projeto mantido por [Eude Gabriel](https://github.com/eudegabrielf). Use as [issues do GitHub](https://github.com/eudegabrielf/apuracaoeleitoral/issues) para reportar problemas ou sugerir melhorias.
