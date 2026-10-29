# checklist_instalacion_asc

Checklist de preparación de instalación y agenda de entrega de equipos (Asia Robótica).

```
npm install
npm run dev
```

## Preguntas desde Google Sheets

Puedes alimentar preguntas automáticamente desde una hoja publicada como CSV.

1. En Google Sheets, publica la hoja: **Archivo → Compartir → Publicar en la web**.
2. Copia la URL CSV publicada.
3. Crea `.env` (o usa tu entorno) con:
   - `VITE_GOOGLE_SHEETS_CSV_URL=<tu_url_csv_publicada>`
   - `VITE_GOOGLE_SHEETS_MODE=append` (opcional, por defecto) o `replace`
4. Reinicia `npm run dev`.

También puedes pegar la URL normal de edición (`.../edit?gid=...`): la app intenta convertirla automáticamente a formato CSV. Aun así, la pestaña debe estar publicada o compartida para lectura pública; si no, Google redirige a login y el navegador bloqueará la petición por CORS.

Columnas soportadas (nombres flexibles): `ID`, `Compuerta/Fase`, `Control/Pregunta`, `Evidencia o dato/Texto`, `Tipo`, `Opciones`, `Estatus`, `Crítica`, `Línea`.
También toma metadatos para la vista checklist del cliente: `Captura`, `Valida`, `Si no pasa (por definir)`, `Sustento (encuestas)`, `Responsable de implementar`, `Fecha objetivo`, `Comentarios`.

- `Compuerta` define la fase (`Antes de la entrega`/logística → logística; instalación/capacitación → instalación).
- `Tipo` puede indicar respuesta (`texto`, `número`, `selección`) y si contiene `bloqueante` marca la pregunta como crítica.
- `Opciones` usa separador `|` (ejemplo: `Sí|No|No aplica`).
- Si `Línea` se deja vacía, aplica a todas las líneas de equipo.
- En la vista cliente, cada fase se muestra como checklist y cada punto refleja los campos de la fila de Google Sheets.
- Para la vista cliente, se muestran solo filas donde `Captura` incluye `Cliente` (por ejemplo `Cliente` o `Chofer o cliente`).
- Si Google Sheets está disponible, la vista cliente prioriza las filas del Sheet (IDs `gs-*`) para que el checklist dependa de esa fuente.

Demo: `/admin` (panel interno) y `/c/demo-shoppro` (vista del cliente).

## Demo de preparación y citas

- `/admin`: pedidos de ejemplo, estado independiente de logística y de instalación, enlaces para clientes y detalle de las dos agendas.
- `/admin/config`: editor de preguntas de muestra. Cambia entre el área de Logística (logística y maniobras) y el área de Ingeniería (instalación y capacitación); permite editar preguntas, tipo de respuesta, opciones y marcar pendientes críticos. Ingeniería también puede ajustar el regulador de la configuración seleccionada.
- `/confirm/72856/09af8a9fb95a8b091a8c02a3828e589c6408c1d672856?channel=whatsapp`: flujo de cliente de ejemplo con pedido y conversación en la ruta.

La entrega y la instalación se agendan por separado. El cliente puede confirmar la recepción del equipo aunque la preparación técnica para instalar todavía tenga pendientes.

En el panel, cada fase indica explícitamente “Preparación lista · falta agendar” cuando ya se completó el checklist, pero no se ha reservado la cita. Los pedidos se resaltan por estado: ámbar si falta agendar, azul si hay una propuesta por confirmar, rojo si hay puntos críticos bloqueantes y verde cuando ambas citas están confirmadas.

El editor recorre las cinco líneas incluidas en el catálogo y permite seleccionar sus modelos, potencias y demás atributos. El número de preguntas se calcula según la selección (por ejemplo, hay preguntas que solo aplican cuando se incluye el sistema neumático). Como referencia, el catálogo contiene 7 preguntas Shop Pro, 8 Fiber X0, 7 Bendworx, 4 Fiber Graver y 6 Works ATC, antes de aplicar condiciones. Los cambios personalizados se guardan por combinación seleccionada; las preguntas base siguen disponibles para las demás combinaciones.

Esta versión es un prototipo local: pedidos, respuestas, configuraciones y citas se guardan en `localStorage` del navegador; el selector de áreas solo simula permisos y el enlace `/confirm/...` no llama al servicio real ni valida una conversación externa. Para compartir datos entre el cliente y el panel o enviar citas al sistema productivo se requiere integrar el backend/API correspondiente. Confirma con Ingeniería los datos técnicos de ejemplo antes de usarlos con clientes.
