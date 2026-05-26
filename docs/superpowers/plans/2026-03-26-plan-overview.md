# Bynot "Production-Ready App Builder" — Master Plan

> 3 piani indipendenti, da eseguire in ordine. Ogni piano produce software testabile.

## Piano 1: Auth + DB Production-Ready (Priorita MASSIMA)
**File:** `2026-03-26-plan-1-auth-db.md`
**Goal:** Un progetto creato con Cloud Mode ha login funzionante, DB con vincoli, e funziona sia in Bynot che esportato.
**Durata stimata:** 2-3 giorni

## Piano 2: Self-Healing Verification con Screenshot (Priorita ALTA)
**File:** `2026-03-26-plan-2-self-healing.md`
**Goal:** Dopo la generazione, un agente prende screenshot di ogni pagina, verifica con Claude Vision, e fixa automaticamente errori.
**Durata stimata:** 2-3 giorni

## Piano 3: Fix Preview "String Length" Bug (Quick Fix)
**File:** `2026-03-26-plan-3-string-length-fix.md`
**Goal:** Risolvere il crash "String length exceeds limit" nella preview.
**Durata stimata:** 1-2 ore

## Ordine di esecuzione
1. Piano 3 (quick fix, sblocca testing)
2. Piano 1 (auth + DB, il fondamento)
3. Piano 2 (self-healing, il differenziatore)
