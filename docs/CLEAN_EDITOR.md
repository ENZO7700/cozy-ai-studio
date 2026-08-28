# Clean Editor

Tlačidlo vo Brief paneli, ktoré **natrvalo** vymaže celú session históriu.
Potvrdzuje sa **dvakrát** (ochrana pred nehodou).

## Ako to funguje

1. Klikni **Vyčistiť** (vpravo hore v Brief, pod quota badge).
2. Tlačidlo sa zmení na **Naozaj vymazať** (červené). Máš **5 sekúnd**.
3. Druhý klik → všetko preč + toast *Editor je čistý*.

Ak do 5 s neklikneš znova, tlačidlo sa vráti do pokoja.

Počas bežiaceho pipeline je tlačidlo vypnuté.

## Čo sa vymaže

| Oblasť | Stav po clean |
| --- | --- |
| Chat | jeden uvítací system message |
| Súbory | starter `App.tsx` + `styles.css` + `package.json` |
| Diff | prázdny |
| Agenti | idle G0 / G1 / G2 |
| HitL / preflight | žiadne |
| Share odkaz | preč |
| Telemetry buffer | prázdny |
| Pipeline | idle, bez errorov a retry |
| Preview | starter HTML |

## Čo ostáva

- téma (light / dark)
- zariadenie (default iPhone 17 Air)
- quota zo servera (FREE / propty / denný limit)
- production prefs
- showcase zoznam

## Kód

- Store: `cleanEditor()` → [`src/stores/studio-store.ts`](../src/stores/studio-store.ts)
- UI: button + arm state → [`src/components/studio/AgentPanel.tsx`](../src/components/studio/AgentPanel.tsx)
- Issue: [#26](https://github.com/NEXIFY-STUDIO/cozy-ai-studio/issues/26)

## UI texty (SK)

| Stav | Text |
| --- | --- |
| Tlačidlo (pokoj) | Vyčistiť |
| Tlačidlo (arm) | Naozaj vymazať |
| Toast (arm) | Ešte jeden klik — Celá história sa vymaže natrvalo. |
| Toast (hotovo) | Editor je čistý — Chat, súbory, diff a zdieľanie sú preč. |
| Toast (pipeline) | Najprv zastav pipeline |
