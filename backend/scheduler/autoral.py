from .base import compute_results, add_arrivals


def _score(p, time, remaining, all_ready):
    """
    APS — Adaptive Priority Scoring (algoritmo autoral).

    Pontuação multi-critério que combina:
      • Urgência de deadline: quanto mais próximo o deadline e menor o slack, maior a urgência.
      • Prioridade do processo: processos com maior prioridade (número menor) recebem bônus.
      • Envelhecimento (aging): processos esperando há mais tempo recebem bônus para evitar starvação.

    O processo com maior score é escalonado a seguir.
    """
    # --- Urgência ---
    if p.deadline is not None:
        slack = (p.deadline - time) - remaining[p.pid]
        if remaining[p.pid] > 0:
            urgency = max(0.0, min(2.0, 1.0 - slack / max(remaining[p.pid], 1)))
        else:
            urgency = 0.0
    else:
        max_rem = max((remaining[q.pid] for q in all_ready), default=1)
        urgency = 1.0 - remaining[p.pid] / max_rem if max_rem > 0 else 0.0

    # --- Prioridade normalizada (1 = mais alta, valores maiores = mais baixa) ---
    priorities = [q.priority for q in all_ready]
    min_p, max_p = min(priorities), max(priorities)
    if max_p == min_p:
        priority_score = 1.0
    else:
        priority_score = (max_p - p.priority) / (max_p - min_p)

    # --- Aging: tempo esperando desde a chegada ---
    wait_approx = time - p.arrival
    max_wait = max((time - q.arrival) for q in all_ready) if all_ready else 1
    aging = wait_approx / max_wait if max_wait > 0 else 0.0

    return 0.50 * urgency + 0.30 * priority_score + 0.20 * aging


def _score_detail(p, time, remaining, all_ready):
    """Returns score breakdown dict for display in the frontend."""
    if p.deadline is not None:
        slack = (p.deadline - time) - remaining[p.pid]
        urgency = max(0.0, min(2.0, 1.0 - slack / max(remaining[p.pid], 1))) if remaining[p.pid] > 0 else 0.0
    else:
        max_rem = max((remaining[q.pid] for q in all_ready), default=1)
        urgency = 1.0 - remaining[p.pid] / max_rem if max_rem > 0 else 0.0

    priorities = [q.priority for q in all_ready]
    min_p, max_p = min(priorities), max(priorities)
    priority_score = 1.0 if max_p == min_p else (max_p - p.priority) / (max_p - min_p)

    wait = time - p.arrival
    max_wait = max((time - q.arrival) for q in all_ready) if all_ready else 1
    aging = wait / max_wait if max_wait > 0 else 0.0

    total = 0.50 * urgency + 0.30 * priority_score + 0.20 * aging
    return {
        'pid':      p.pid,
        'urgency':  round(urgency, 2),
        'priority': round(priority_score, 2),
        'aging':    round(aging, 2),
        'total':    round(total, 2),
    }


def _log_decision(score_log, time, candidates, chosen, remaining):
    score_log.append({
        'time':    time,
        'scores':  sorted(
            [_score_detail(p, time, remaining, candidates) for p in candidates],
            key=lambda d: -d['total']
        ),
        'chosen':  chosen.pid,
    })


def run(processes, quantum, overhead, **kwargs):
    """
    APS — Adaptive Priority Scheduling (algoritmo autoral, preemptivo).
    Escalonador heurístico que recalcula scores dinamicamente a cada evento,
    equilibrando urgência de deadline, prioridade e envelhecimento.
    """
    time = 0
    gantt = []
    remaining = {p.pid: p.burst for p in processes}
    start_times = {p.pid: [] for p in processes}
    end_times = {}
    score_log = []

    pending = sorted(processes, key=lambda p: (p.arrival, p.pid))
    ready = []
    last_pid = None
    context_switches = 0
    preemptions = 0

    add_arrivals(pending, ready, time)

    current = None

    while pending or ready or current:
        if not ready and current is None:
            if not pending:
                break
            next_t = min(p.arrival for p in pending)
            gantt.append({'type': 'idle', 'pid': None, 'start': time, 'end': next_t})
            time = next_t
            add_arrivals(pending, ready, time)
            last_pid = None

        if current is None and ready:
            all_candidates = ready[:]
            current = max(all_candidates, key=lambda p: _score(p, time, remaining, all_candidates))
            _log_decision(score_log, time, all_candidates, current, remaining)
            ready.remove(current)
            start_times[current.pid].append(time)

        if current is None:
            continue

        next_event = time + remaining[current.pid]
        if pending:
            next_event = min(next_event, min(p.arrival for p in pending))

        run_for = next_event - time
        if run_for <= 0:
            run_for = remaining[current.pid]
            next_event = time + run_for

        gantt.append({'type': 'execution', 'pid': current.pid,
                      'start': time, 'end': next_event})
        time = next_event
        remaining[current.pid] -= run_for
        add_arrivals(pending, ready, time)

        if remaining[current.pid] <= 0:
            end_times[current.pid] = time
            last_pid = current.pid
            current = None
        else:
            if ready:
                all_candidates = ready + [current]
                best = max(all_candidates, key=lambda p: _score(p, time, remaining, all_candidates))
                if best.pid != current.pid:
                    preemptions += 1
                    ready.append(current)
                    last_pid = current.pid
                    current = None
                    if overhead > 0:
                        gantt.append({'type': 'overhead', 'pid': last_pid,
                                      'start': time, 'end': time + overhead})
                        time += overhead
                        add_arrivals(pending, ready, time)
                    context_switches += 1
                    all_c = ready[:]
                    current = max(all_c, key=lambda p: _score(p, time, remaining, all_c))
                    _log_decision(score_log, time, all_c, current, remaining)
                    ready.remove(current)
                    start_times[current.pid].append(time)

    result = compute_results(processes, start_times, end_times, gantt, context_switches, preemptions)
    result['score_log'] = score_log
    return result
