# Hub Acadêmico de Computação — UFBA

Portal centralizado de disciplinas do curso de Ciência da Computação da UFBA. Reúne conteúdo teórico, referências rápidas e simuladores interativos em um único lugar, desenvolvido e mantido pelos próprios alunos.

> Para rodar: instale as dependências com `pip install -r requirements.txt` e execute `bash iniciar.sh` para subir o backend na porta 5001. O frontend é HTML estático e abre direto no navegador.

---

## Organização do Projeto

```
/
├── index.html                          # Portal principal (Hub Acadêmico)
├── iniciar.sh                          # Sobe o backend Flask
├── requirements.txt                    # flask, flask-cors
│
├── backend/                            # API REST do simulador
│   ├── app.py                          # Rotas /simular e /casos
│   ├── models/
│   │   └── processo.py                 # Dataclass Processo
│   └── scheduler/
│       ├── base.py                     # Métricas e utilitários compartilhados
│       ├── fcfs.py
│       ├── sjf.py
│       ├── round_robin.py
│       ├── priority.py
│       ├── edf.py
│       ├── cfs.py
│       └── autoral.py
│
├── casos/                              # Cenários de teste em JSON
│   ├── caso_spec.json
│   ├── caso_base.json
│   ├── caso_deadline.json
│   └── caso_ociosidade.json
│
├── psb/
│   ├── index.html
│   └── img/
│
└── so/
    ├── index.html
    ├── img/
    └── simuladores/
        └── escalonamento/
            ├── index.html
            ├── script.js
            └── style.css
```

---

## Organização dos Arquivos

O projeto é dividido em três camadas independentes: o conteúdo estático (frontend), a lógica de simulação (backend) e os dados de teste (casos).

### Frontend

Todo o conteúdo das disciplinas — PSB e SO — é HTML estático puro, sem framework e sem build step. Cada disciplina tem sua própria pasta com um `index.html` autossuficiente. Os estilos usam Tailwind CSS carregado via CDN, o que elimina qualquer etapa de compilação. Os ícones vêm do Material Symbols do Google Fonts. As fontes Noto Serif (títulos) e Work Sans (corpo) também são carregadas via CDN.

O simulador de escalonamento (`so/simuladores/escalonamento/`) é o único módulo com JavaScript não-trivial. O `script.js` cuida de três responsabilidades: gerenciar o estado da interface (processos adicionados, algoritmo selecionado), se comunicar com o backend via `fetch`, e renderizar os resultados — Gantt no canvas e tabela no DOM. O `style.css` é um arquivo separado específico do simulador, já que ele tem uma identidade visual própria (layout de duas colunas com sidebar) distinta das páginas de conteúdo.

### Backend

O backend é uma API Flask mínima com duas rotas. Fica inteiramente dentro de `backend/` e não tem nenhum acoplamento com o frontend além do contrato JSON.

`app.py` é o ponto de entrada. Ele define as duas rotas (`/simular` e `/casos`), faz o parse dos parâmetros recebidos, instancia os objetos `Processo` e delega para o scheduler correspondente. Não tem lógica de simulação — é só roteamento e serialização.

`models/processo.py` define a dataclass `Processo` com os campos `pid`, `arrival`, `burst`, `deadline`, `priority` e `num_pages`. É o único tipo de dado que transita entre o app e os schedulers.

`scheduler/base.py` contém as funções utilitárias compartilhadas por todos os algoritmos: `compute_results()` calcula turnaround, espera e métricas globais a partir dos dados brutos; `merge_gantt()` une blocos consecutivos do mesmo processo para evitar fragmentação visual; `add_arrivals()` move processos da lista de pendentes para a fila de prontos conforme o tempo avança. Centralizar isso em `base.py` evita duplicação e garante que todos os algoritmos calculem métricas da mesma forma.

Cada arquivo em `scheduler/` implementa exatamente uma função pública — `run(processes, quantum, overhead)` — que retorna sempre o mesmo formato de dicionário. Essa interface uniforme é o que permite ao `app.py` chamar qualquer algoritmo de forma genérica e ao modo "Comparar Todos" rodar os sete em sequência sem código especial.

### Casos de Teste

A pasta `casos/` contém arquivos JSON com cenários prontos. O backend os serve via `GET /casos` e o frontend os exibe como botões de atalho na sidebar do simulador. Cada arquivo tem um campo `descricao` que aparece como tooltip e os campos de configuração (`quantum`, `sobrecarga`) junto com a lista de processos — o mesmo formato aceito pelo endpoint `/simular`.

---

## Hub Acadêmico (`index.html`)

Página de entrada do portal. Apresenta as disciplinas disponíveis em cards com status de disponibilidade. Cada card leva à página da respectiva disciplina.

**Disciplinas ativas:** PSB e Sistemas Operacionais.

**Planejadas (em breve):** Estruturas de Dados, Redes de Computadores, Arquitetura de Computadores — já aparecem na grade com estado desabilitado.

A navegação entre Hub → Disciplina → Simulador é feita por links diretos entre arquivos HTML, sem roteamento dinâmico. O simulador exibe um breadcrumb fixo no topo (Hub Acadêmico → Sistemas Operacionais → Simulador de Escalonamento).

---

## Módulo PSB (`psb/index.html`)

Cobre o conteúdo da disciplina de **Programação de Software Básico**, focado no microcontrolador ATmega328P e linguagem Assembly AVR.

### Teoria e Conceitos

Organizada em acordeões expansíveis com quatro tópicos:

**Introdução** — apresenta a arquitetura RISC/Harvard do ATmega328P com suas especificações: 32 KB de memória de programa, 2 KB de SRAM, 1 KB de EEPROM, 131 instruções e 32 registradores de propósito geral. Explica a separação de memória de programa e dados da arquitetura Harvard, e o porquê de apenas LOAD/STORE acessarem a memória de dados.

**Registradores** — detalha os registradores de propósito geral R0–R31, os pares de 16 bits X (R27:R26), Y (R29:R28) e Z (R31:R30), e os registradores de I/O interno mais importantes:
- **SREG** (Status Register): 8 flags — C (carry), Z (zero), N (negativo), V (overflow signed), S (sinal lógico), H (half carry), T (temporário), I (interrupções globais)
- **SP** (Stack Pointer): implementado em SPH e SPL, modelo Full Descending Stack

**Pinagem PDIP-28** — tabela com os pinos essenciais: VCC (pino 7), AVcc (pino 20), AREF (pino 21) e GND (pinos 8 e 22), com suas funções de alimentação e referência analógica.

**Instruções de Controle de Fluxo** — desvios incondicionais (JMP, RJMP, IJMP) com tamanho em palavras e ciclos de clock, e desvios condicionais via flags do SREG: instruções de comparação (CPI, CPC, CPSE) e as branches BRxx (BREQ, BRNE, BRLO, BRSH, BRLT, BRGE, BRVS, BRVC).

### Referência Rápida X86 → AVR

Sidebar interativa com acordeões mostrando a equivalência em código AVR para instruções comuns de x86: MOV, ADD, SUB, INC, DEC, PUSH e POP. Cada item exibe o snippet AVR correspondente com comentário explicativo.

### Laboratório SimulIDE

Guia de uso do simulador de circuitos eletrônicos SimulIDE com ATmega328P. Cobre o fluxo completo: escrita do código Assembly → compilação via AVRA (Linux) ou Microchip Studio (Windows) → geração do `.hex` → carregamento no SimulIDE via Load Firmware → execução. Acompanha playlist de videoaulas no YouTube linkada diretamente na página.

### Instruções de Base

Cinco exemplos práticos com código Assembly comentado e imagem do circuito no SimulIDE:

| # | Exemplo | O que demonstra |
|---|---|---|
| 01 | LED-VCC | Configuração de DDRD + saída em PORTD com pino como VCC |
| 02 | LED-GND | Mesma lógica com pino como GND (lógica invertida) |
| 03 | Blink | Rotina de atraso de ~1s com três laços aninhados (82 × 255 × 255 × 3 ciclos a 16 MHz) usando DEC + BRNE |
| 04 | Contador 4 bits | Contagem de 0 a 15 em PORTD com INC, CPI e BREQ para reset |
| 05 | Contador Decimal | Contagem 0–9 em PORTB com decodificação BCD e subrotinas separadas de incrementar e atrasar |

Cada exemplo usa o padrão de cards expansíveis com `max-height` animado e botão "Ver mais / Ver menos".

---

## Módulo SO (`so/index.html`)

Cobre o conteúdo da disciplina de **Sistemas Operacionais**, organizado em quatro módulos sequenciais acessíveis pela navbar.

### Módulo 01 — Conceitos Fundamentais

Grade de quatro cards de navegação (Processos, Threads, Escalonamento, Simuladores) que ancoram às seções correspondentes da página. Funcionam como índice visual do conteúdo.

### Módulo 02 — Processos

Dividido em coluna de acordeões à esquerda e sidebar de hierarquia à direita.

**Acordeões:**

- **O que é um Processo** — distinção entre programa (estático, em disco) e processo (dinâmico, em execução). Usa a analogia de Tanenbaum do cientista/receita para ilustrar o conceito. Detalha os componentes internos: código (text), dados (data/heap), pilha (stack) e PCB. Explica multiprogramação como ilusão de paralelismo por alternância rápida de processos.

- **Estados de um Processo** — três estados fundamentais (Running, Ready, Blocked) e as quatro transições possíveis entre eles, com diagrama de fluxo. Enfatiza que não existe transição direta de Blocked para Running.

- **Troca de Contexto** — o que o SO salva ao trocar processos (registradores gerais, contador de programa, ponteiro de pilha, PSW) e a sequência de etapas da troca. Nota sobre o custo: cache e TLB podem ser invalidados, tornando trocas excessivas prejudiciais ao desempenho.

**Sidebar:** explica `fork()` (cópia exata do processo pai, retorno diferente para pai e filho), `exec()` (substitui imagem de memória por novo programa) e `init` (raiz de todos os processos em sistemas UNIX).

### Módulo 03 — Threads

Grade 2×2 com quatro cards:

- **Vantagens das Threads** — quatro benefícios fundamentais em relação a múltiplos processos: Responsividade (programa não trava enquanto uma thread bloqueia), Partilha de Recursos (comunicação direta via memória compartilhada), Economia (criação muito mais barata que um processo), Escalabilidade (paralelismo real em arquiteturas multicore).

- **Processo vs Thread** — comparação direta de isolamento, velocidade de criação e necessidade de IPC. Inclui nota sobre Troca de Contexto: entre threads do mesmo processo não há troca de tabela de páginas nem limpeza da TLB, tornando a operação significativamente mais leve.

- **Modelos de Thread** — organizado em duas seções. Tipos de implementação: Threads de Utilizador (geridas por biblioteca, kernel-agnostic, mas bloqueio paralisa o processo inteiro) e Threads de Kernel (geridas pelo SO, overhead maior, paralelismo real). Modelos de mapeamento: Many-to-One, One-to-One (Linux e Windows) e Many-to-Many.

- **Sincronização** — condições de corrida e as três soluções clássicas: Mutex (exclusão mútua), Semáforo (controle por contador) e Monitor (abstração de alto nível com variáveis de condição).

### Módulo 04 — Algoritmos de Escalonamento

Grade 2×2 de acordeões com cinco algoritmos, cada um com descrição, tabela de vantagens/desvantagens e pseudocódigo Python. O código é intencionalmente didático — usa arrays simples em vez de classes, focando na lógica pura do algoritmo. Uma nota explica essa escolha no cabeçalho da seção.

Os algoritmos cobertos: FIFO/FCFS, SJF, Prioridade (preemptivo com aging), Round Robin e EDF.

**Tabela comparativa** ao final da seção: FIFO, SJF, Prioridade, Round Robin e EDF lado a lado com preemptividade, espera média esperada, risco de starvation e uso típico.

### Seção de Simuladores

Três cards: Escalonamento de Processos (ativo, leva ao simulador), Paginação de Memória (em breve) e Pipeline de Instruções (em breve).

---

## Simulador de Escalonamento (`so/simuladores/escalonamento/`)

Ferramenta interativa que implementa sete algoritmos de escalonamento de processos em uma CPU single-core simulada. A simulação roda no backend Python e os resultados são visualizados no frontend via canvas HTML5.

### Arquitetura

O frontend (`index.html` + `script.js`) envia os parâmetros via POST para a API Flask (`backend/app.py`). O backend executa o algoritmo e devolve um objeto JSON com três campos: `gantt` (lista de eventos com tipo, pid, início e fim), `processes` (métricas por processo) e `metrics` (métricas globais). O frontend então renderiza o Gantt no canvas e popula a tabela de resultados.

```
[Frontend] → POST /simular → [Flask] → scheduler/X.py → JSON → [Frontend canvas + tabela]
                                 ↑
                GET /casos ──────┘  (carrega casos prontos da pasta /casos)
```

### Backend — Estrutura dos Schedulers

Todos os algoritmos compartilham a mesma interface: `run(processes, quantum, overhead) → dict`. O módulo `base.py` fornece duas funções reutilizadas por todos:

- `compute_results()` — calcula turnaround, espera, deadline_met e métricas globais a partir dos dados brutos da simulação
- `merge_gantt()` — une blocos consecutivos do mesmo processo no Gantt para evitar fragmentação visual desnecessária

Cada arquivo de scheduler é independente e implementa apenas a lógica de seleção e preempção do seu algoritmo.

### Algoritmos Implementados

| Algoritmo | Arquivo | Tipo | Critério |
|---|---|---|---|
| FIFO / FCFS | `fcfs.py` | Não preemptivo | Ordem de chegada |
| SJF | `sjf.py` | Não preemptivo | Menor burst total |
| Round Robin | `round_robin.py` | Preemptivo | Fila circular com quantum fixo |
| Prioridade | `priority.py` | Preemptivo | Menor número = maior prioridade |
| EDF | `edf.py` | Preemptivo | Deadline mais próximo |
| CFS-Sim | `cfs.py` | Preemptivo | Menor `vruntime` |
| APS (Autoral) | `autoral.py` | Preemptivo | Score composto |

**CFS-Sim** é uma versão simplificada do Completely Fair Scheduler do kernel Linux. O `vruntime` de cada processo cresce conforme a fórmula `vruntime += Δt × 1.25^(prioridade - 1)` — processos de prioridade mais alta têm peso menor e crescem mais devagar, ganhando mais CPU ao longo do tempo. Ao chegar, um novo processo recebe o `vruntime` mínimo da fila (não o tempo atual), evitando que domine a CPU. Sem quantum fixo: a fatia emerge do reequilíbrio contínuo entre vruntimes.

**APS (Adaptive Priority Scoring)** é o algoritmo autoral. A cada evento, calcula um score para cada processo pronto com três componentes: urgência de deadline (50%, baseada no slack entre prazo e burst restante), prioridade normalizada (30%) e aging (20%, tempo de espera acumulado para evitar starvation). O processo com maior score recebe a CPU. Preempção ocorre quando a chegada de um novo processo altera o ranking.

### Entradas

**Por processo:** `pid`, `chegada`, `execucao`, `deadline` (opcional), `prioridade`, `num_paginas` (campo reservado, não afeta a simulação)

**Globais:** `quantum` (unidades de tempo por fatia no Round Robin) e `sobrecarga` (tempo de CPU ociosa inserido a cada troca de contexto)

### Saídas e Visualizações

**Gráfico de Gantt** renderizado em canvas HTML5, com scroll horizontal para timelines longas. Código de cores:

| Cor | Elemento |
|---|---|
| Cor única por processo | Execução normal |
| Cinza `#c5c6d2` | CPU ociosa |
| Âmbar `#d97706` | Sobrecarga de contexto |
| Vermelho `#dc2626` | Execução após deadline estourado |
| Linha ouro `#bdab51` | Marcador de deadline (apenas EDF) |

**Modo passo-a-passo:** o Gantt é navegado evento a evento. Eventos futuros aparecem esmaecidos como preview. Métricas e tabela de resultados são reveladas somente ao concluir a simulação completa.

**Tabela de resultados por processo:** `chegada`, `execução`, `deadline`, `prioridade`, `início(s)`, `término`, `espera`, `turnaround`, `deadline OK?`

**Métricas globais:** espera média, turnaround médio, throughput, % CPU ociosa, preempções e trocas de contexto.

**Modo "Comparar Todos":** executa os sete algoritmos em paralelo no backend e exibe os resultados com abas individuais de Gantt e uma tabela comparativa com ★ destacando o melhor valor em cada métrica.

### Casos de Teste

| Arquivo | Processos | Foco |
|---|---|---|
| `caso_spec.json` | 3 | Caso base exato do enunciado (P1 burst=5 dl=8, P2 burst=4 dl=12, P3 burst=2 dl=20) |
| `caso_base.json` | 5 | Cenário variado com diferentes bursts, chegadas e deadlines para demonstração geral |
| `caso_deadline.json` | 5 | Deadlines apertados — alguns processos estouram dependendo do algoritmo escolhido |
| `caso_ociosidade.json` | 4 | Processos com grandes intervalos entre chegadas, força períodos de CPU idle |

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5, Tailwind CSS (via CDN), JavaScript vanilla |
| Gantt | HTML5 Canvas API com 2D context |
| Backend | Python 3, Flask, flask-cors |
| Tipografia | Noto Serif (headlines), Work Sans (corpo), Material Symbols (ícones) |

Sem framework JS, sem build step. O frontend abre direto no navegador; o backend é necessário apenas para o simulador.

---

## Time

Desenvolvido por alunos de Ciência da Computação da UFBA:

- [Daniel Santana](https://www.linkedin.com/in/danielbcsantana)
- [Davi Guimarães](https://www.linkedin.com/in/davi-guimarães-de-freitas-6b71652b9/)
- [Gabriel Barreto](https://www.linkedin.com/in/gabriel-barreto-batista)
- [Leone Castro](https://www.linkedin.com/in/leone-castro-98486038a/)
