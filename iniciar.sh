#!/bin/bash
# Inicia o backend Flask na porta 5001
cd "$(dirname "$0")/backend"
echo "==================================="
echo " Hub Academico de Computacao"
echo "==================================="
echo " Backend (API): http://localhost:5001"
echo ""
echo " Abra no navegador:"
echo "   Portal:      index.html"
echo "   PSB:         psb/index.html"
echo "   Sist. Op.:   so/index.html"
echo "   Simulador:   so/simuladores/escalonamento/index.html"
echo "==================================="
python3 app.py
