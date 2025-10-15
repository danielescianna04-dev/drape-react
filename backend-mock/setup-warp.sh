#!/bin/bash

echo "🚀 Setup Warp AI IDE - Backend AWS"
echo "=================================="

# Controlla se Node.js è disponibile
if ! command -v node &> /dev/null; then
    echo "❌ Node.js non trovato nel container"
    echo "💡 Il container Warp deve avere Node.js installato"
    exit 1
fi

# Crea alias globali se non esistono
echo ""
echo "📝 Configurando alias..."

# Aggiungi al .bashrc o .zshrc se esiste
SHELL_RC=""
if [ -f ~/.zshrc ]; then
    SHELL_RC="~/.zshrc"
elif [ -f ~/.bashrc ]; then
    SHELL_RC="~/.bashrc"
fi

if [ ! -z "$SHELL_RC" ]; then
    echo "# Warp AI IDE Aliases" >> $SHELL_RC
    echo "alias aws-ide='$(pwd)/aws-ide'" >> $SHELL_RC
    echo "alias flutter-aws='$(pwd)/aws-ide flutter'" >> $SHELL_RC
    echo "alias python-aws='$(pwd)/aws-ide python'" >> $SHELL_RC
    echo "alias ide-status='$(pwd)/aws-ide health'" >> $SHELL_RC
    echo "✅ Alias aggiunti a $SHELL_RC"
fi

echo ""
echo "🎯 Setup completato!"
echo ""
echo "Comandi disponibili:"
echo "  ./aws-ide health          # Controlla stato backend"
echo "  ./aws-ide flutter --version"
echo "  ./aws-ide python --version"
echo "  ./aws-ide exec \"ls -la\""
echo ""
echo "Alias disponibili (riavvia shell):"
echo "  aws-ide health"
echo "  flutter-aws --version"
echo "  python-aws --version"
echo "  ide-status"
echo ""
echo "🚀 Il tuo IDE è pronto!"