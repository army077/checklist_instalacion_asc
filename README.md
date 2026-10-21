# checklist_instalacion_asc

Checklist de preparación de instalación y agenda de entrega de equipos (Asia Robótica).

```
npm install
npm run dev
```

Demo: `/admin` (panel interno) y `/c/demo-shoppro` (vista del cliente).

## Demo de preparación y citas

- `/admin`: pedidos de ejemplo, estado independiente de logística y de instalación, enlaces para clientes y detalle de las dos agendas.
- `/admin/config`: editor de preguntas de muestra. Cambia entre el área de Logística (logística y maniobras) y el área de Ingeniería (instalación y capacitación); permite editar preguntas, tipo de respuesta, opciones y marcar pendientes críticos. Ingeniería también puede ajustar el regulador de la configuración seleccionada.
- `/confirm/72856/09af8a9fb95a8b091a8c02a3828e589c6408c1d672856?channel=whatsapp`: flujo de cliente de ejemplo con pedido y conversación en la ruta.

La entrega y la instalación se agendan por separado. El cliente puede confirmar la recepción del equipo aunque la preparación técnica para instalar todavía tenga pendientes.

En el panel, cada fase indica explícitamente “Preparación lista · falta agendar” cuando ya se completó el checklist, pero no se ha reservado la cita. Los pedidos se resaltan por estado: ámbar si falta agendar, azul si hay una propuesta por confirmar, rojo si hay puntos críticos bloqueantes y verde cuando ambas citas están confirmadas.

El editor recorre las cinco líneas incluidas en el catálogo y permite seleccionar sus modelos, potencias y demás atributos. El número de preguntas se calcula según la selección (por ejemplo, hay preguntas que solo aplican cuando se incluye el sistema neumático). Como referencia, el catálogo contiene 7 preguntas Shop Pro, 8 Fiber X0, 7 Bendworx, 4 Fiber Graver y 6 Works ATC, antes de aplicar condiciones. Los cambios personalizados se guardan por combinación seleccionada; las preguntas base siguen disponibles para las demás combinaciones.

Esta versión es un prototipo local: pedidos, respuestas, configuraciones y citas se guardan en `localStorage` del navegador; el selector de áreas solo simula permisos y el enlace `/confirm/...` no llama al servicio real ni valida una conversación externa. Para compartir datos entre el cliente y el panel o enviar citas al sistema productivo se requiere integrar el backend/API correspondiente. Confirma con Ingeniería los datos técnicos de ejemplo antes de usarlos con clientes.
