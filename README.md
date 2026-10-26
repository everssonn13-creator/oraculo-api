# Oráculo — API

Dois produtos no mesmo servidor Express:

| Rota | Produto |
|---|---|
| `POST /oraculo` | Oráculo Financeiro (registro de despesas — já existente) |
| `/saneamento/` | **Oráculo do Saneamento** — app de inteligência de mercado do saneamento básico no Brasil |
| `/api/saneamento/*` | API da plataforma de saneamento |

## Oráculo do Saneamento

Tela principal é uma conversa com o **Assessor IA**: as análises aparecem com mapa do Brasil
(região/estado em foco), indicadores, gráficos e tabelas. A IA consulta primeiro a **base de conhecimento própria**
(documentos em `saneamento/conhecimento/` + PDFs/textos enviados pelo app) e depois as fontes públicas ao vivo.

App com visual futurista + **Assessor IA** que consulta fontes públicas antes de responder
e monta estudos de mercado completos (ETE/ETA, lodo e centrífugas, licitações, concessões, geologia).

### Fontes de dados (todas públicas)

| Dado | Fonte | Atualização |
|---|---|---|
| Editais/licitações | [PNCP](https://pncp.gov.br) — Lei 14.133/2021 | ao vivo (cache 15 min) |
| Diários oficiais municipais | [Querido Diário](https://queridodiario.ok.org.br) | ao vivo (cache 30 min) |
| Notícias do setor | Google News RSS (30 dias) | ao vivo (cache 20 min) |
| Município, população, centroide | [IBGE APIs](https://servicodados.ibge.gov.br/api/docs) — Censo 2022 | ao vivo |
| Geologia no ponto | [Macrostrat](https://macrostrat.org) + altitude [Open-Meteo](https://open-meteo.com) | ao vivo |
| Indicadores, marco legal, leilões, centrífugas | `saneamento/knowledge/base.js` (curado, **cada item com link da fonte**) | manual |

> Revise `saneamento/knowledge/base.js` quando o SINISA publicar um novo ano-base ou houver novo leilão.
> Itens com `confianca: "media"` aparecem no app como "a confirmar".

### Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/saneamento/painel` | KPIs, marco legal, concessões, players, centrífugas |
| GET | `/api/saneamento/licitacoes?q=&uf=&status=` | Busca no PNCP (sem `q` = radar do setor por segmento) |
| GET | `/api/saneamento/diarios?termo=&dias=` | Diários oficiais municipais |
| GET | `/api/saneamento/noticias?tema=geral\|leiloes\|regulacao\|lodo\|empresas` | Notícias |
| GET | `/api/saneamento/municipio?nome=&uf=` | Perfil IBGE + triagem geológica no centroide |
| GET | `/api/saneamento/geologia?lat=&lon=` | Triagem geológica/geotécnica em um ponto |
| POST | `/api/saneamento/mercado-lodo` | Estimativa de lodo, centrífugas, polímero e custo de destinação |
| POST | `/api/saneamento/assessor` | `{ mensagem, historico?, modo: "chat"\|"estudo", foco?: { tipo: "uf"\|"regiao", valor } }` → `{ resposta, visuais, baseUsada, ferramentas }` |
| GET/POST/DELETE | `/api/saneamento/conhecimento` | Lista, adiciona (texto ou arquivo PDF/TXT/MD/CSV em base64) e remove documentos da base própria |

### Variáveis de ambiente

| Variável | Uso |
|---|---|
| `ANTHROPIC_API_KEY` | Assessor IA com Claude (tem prioridade; modelo padrão `claude-opus-5-5`) |
| `OPENAI_API_KEY` | Alternativa: assessor com OpenAI (padrão `gpt-4o-mini`) quando não há chave da Anthropic |
| `SANEAMENTO_MODEL` | Opcional — troca o modelo do provedor ativo |
| `DATA_DIR` | Pasta onde ficam os documentos enviados pelo app (na Railway, aponte para um Volume, ex.: `/data`) |
| `SANEAMENTO_ADMIN_SENHA` | Opcional — exige senha para adicionar/remover documentos da base |
| `OPENAI_BASE_URL` | Opcional — endpoint compatível com a API OpenAI |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Oráculo Financeiro |

### Rodar

```bash
npm install    # Node 20+
npm start      # http://localhost:8080/saneamento/
npm test
```

Mapa dos estados: [svg-maps/brazil](https://github.com/VictorCazanave/svg-maps) por Victor Cazanave, licença CC BY 4.0 (`public/saneamento/brasil-mapa.json`).
