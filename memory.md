# Memory — Proyecto Avanxo Feedbacks

> Archivo de contexto para retomar decisiones acordadas en este chat.
> Rama principal de trabajo: **`avanxo-main`**.

## Identidad / Branding
- El fork se llama **Avanxo Feedbacks** (antes AgentEcho). Funcionalidad idéntica, rebranding para entrega de feedback a clientes.
- Extension name en `manifest.json`: `"Avanxo Feedbacks"`.
- Todo el texto visible va en **inglés**.
- Reporte generado: `# Avanxo Feedbacks Report`.
- **NO existe logo real de Avanxo como asset dentro del repo.** Los `assets/logo*.jpg` pertenecen al proyecto original AgentEcho, NO a Avanxo.
  - Decisión: el header del popup usa **solo texto, sin logo** (no generar logo con CSS, no reinterpretar). Si se consigue el asset real de Avanxo, se agregará tal cual.

## Repositorio / Git
- `origin` = fork propio: `victoria-avanxo/agentecho`.
- `upstream` = original: `Areshkew/agentecho`.
- `main` = espejo limpio de `upstream/main`. Solo para sync.
- `avanxo-main` = rama de trabajo personal (rebrand + funcionalidad). **Trabajar SIEMPRE acá; nunca en `main`.**
- Autor de commits: **vicky** (`gregoriovictoriam...` / `victoriaharpercol@gmail.com`).

## PRs del original (Areshkew) evaluados
- **PR #1** (inject content script on activate / already-open tabs) → MERGED.
- **PR #2** (README clone URL) → CLOSED (redundante con rebrand).
- **PR #3** (custom hotkey + badge de estado) → MERGED.
- **PR #4** (inline text editing) → CLOSED (duplicado de PR #5).
- **PR #5** (feat/inline-text-edits) → MERGED. Trae: modo edición de texto inline, re-aplicar al recargar, overlay restore, descarga `.txt`, atajos protegidos.
- **PR #2 (Pinmark)** → **SKIP**. El título decía "Set Vite base" pero el contenido era una reescritura completa a otro producto ("Pinmark", 32k líneas, wxt/pnpm/webhooks/githubToken/MCP server/network interceptor). No es un fix; reemplazaría el codebase.

## Licencia
- Polyform Noncommercial 1.0.0 (original de AgentEcho / Areshk).
- Se mantiene el copyright de Areshk; se añadió atribución del fork en README.
- Publicar/comercializar (aunque sea gratis) en Chrome Web Store cae en zona comercial → se necesita licencia comercial de Areshk para estar 100% protegido.

## Google Chrome Web Store (declaración de cuenta)
- Cuenta = cuenta de **trader** (producto profesional para clientes de Avanxo). Se eligió "trader" por ser uso profesional.
- Campo **D-U-N-S** es opcional ("to make verification faster"). No bloquea.
  - `dnb.com.co` NO existe. El dominio correcto es **`dnb.com`** (Look Up / Apply: `https://www.dnb.com/en-us/smb/duns.html`).

## Popup UI / Diseño (rebrand visual)
- Rediseño del popup con identidad Avanxo: fondo navy `#071426`, superficie `#0d1b2d`, acento azul eléctrico `#1769ff`, texto `#f7f9fc` / secundario `#8797b2`. Fuente Inter. Header solo texto, sin logo.
- **Solo CSS** (`src/popup/popup.css`): no se tocó `popup.ts` ni `index.html`. Todos los hooks/IDs/classes se preservaron.
- Validado con UI/UX Pro Max: contraste AA+ en textos; el gradiente del botón activo usa `#1769ff → #1466db` porque ambos extremos pasan AA para texto blanco (versiones más claras fallaban).
- Incluido `prefers-reduced-motion` y `cursor:pointer` en elementos clickeables (checklist del skill).
- Validación: sin overflow horizontal a 300–360px, checks/indicadores/states correctos, 0 errores de consola.

## Testing / Build
- Typecheck: `npx tsc --noEmit`
- Build: `npm run build` (salida `dist/`)
- Dev server (CRXJS): `npm run dev` → sirve `dist` y manifest en `http://localhost:5173` (cargar `dist/` como unpacked).
- Validación runtime: se inyecta el bundle de content script con un shim de `window.chrome` (callback + promise) sobre una página servida vía `python3 -m http.server`.

## Pendientes / Notas
- El asset del logo real de Avanxo **no está aún** en el repo para el header del popup (sigue solo texto).
- **Sí existe ya un icono real de Avanxo**: `assets/icon-extension.png` (1254×1254, PNG). Versión actual = `icon-contrast.png` provista por vicky (reemplazó a `icon-extension.png` original porque no se veía bien). Con él se regeneraron `assets/icon{16,32,48,128}.png` vía `sips` (reemplazan los iconos de AgentEcho). El manifest ya apuntaba a esas rutas, no hubo que tocarlo.
- La extensión se publica/instala como unpacked desde `dist/`.
