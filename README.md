# Mi M² en Bancaria — versión ejecutiva

Esta versión reemplaza la demo `localStorage` por una arquitectura de producción preparada para:

- 600 m² con estados disponibles / reservados / adquiridos / bloqueados.
- Selección de uno o varios m² en una misma operación.
- Reserva real de 10 minutos en servidor, protegida contra dos compradores intentando tomar el mismo m².
- Mercado Pago Checkout Pro con una preferencia específica por reserva.
- `external_reference` por operación para asociar el pago a la reserva.
- Webhook de Mercado Pago con validación de `x-signature` y verificación del pago en la API de Mercado Pago.
- Confirmación solo cuando el monto coincide y el pago está `approved`.
- Voucher digital por email mediante Resend.
- Panel administrativo protegido por Supabase Auth y lista de 3 emails autorizados.
- Exportación CSV de operaciones.
- Cron de Vercel cada 5 minutos para liberar reservas vencidas.

## Importante antes de publicar

El código ya está preparado, pero **no se deben cargar secretos dentro de los archivos**. En Vercel hay que crear estas variables de entorno:

`SUPABASE_URL`
`SUPABASE_SERVICE_ROLE_KEY`
`SUPABASE_ANON_KEY`
`MP_ACCESS_TOKEN`
`MP_WEBHOOK_SECRET`
`PUBLIC_URL`
`RESEND_API_KEY`
`EMAIL_FROM`
`ADMIN_EMAILS`
`CRON_SECRET`

Los valores de ejemplo están en `.env.example`.

## 1. Crear Supabase

1. Crear un proyecto en Supabase.
2. Abrir **SQL Editor**.
3. Ejecutar todo `supabase_schema.sql`.
4. En Authentication → Users crear los 3 usuarios administradores con email + contraseña.
5. Colocar esos 3 emails, separados por coma, en `ADMIN_EMAILS`.

La tabla `m2_units` se inicializa automáticamente con los 600 m².

## 2. Mercado Pago

Usar el Access Token de PRODUCCIÓN en `MP_ACCESS_TOKEN`.

Crear/configurar Webhooks para pagos y utilizar como URL:

`https://TU-DOMINIO/api/webhook/mercadopago`

Guardar el secreto de firma de Mercado Pago en `MP_WEBHOOK_SECRET`.

La integración NO usa el QR/link general como mecanismo de conciliación de los m². Cuando una persona selecciona m², el servidor crea un Checkout Pro asociado a esa reserva. El QR/link general queda únicamente como alternativa para aportes que no necesitan asignación automática de m².

## 3. Email

Crear una API key en Resend y colocarla en `RESEND_API_KEY`. `EMAIL_FROM` debe usar un remitente/dominio autorizado en Resend.

## 4. Vercel

Importar este proyecto y cargar todas las variables de entorno para Production (y Preview si se desea probar).

`PUBLIC_URL` debe ser la URL pública final, sin `/` al final.

Vercel ejecutará `/api/cron-expire` cada 5 minutos usando `CRON_SECRET`.

## Flujo real

1. Usuario selecciona m².
2. `/api/create-preference` valida datos y llama a una función SQL transaccional.
3. La función SQL reserva los m² durante 10 minutos.
4. El backend crea una preferencia de Mercado Pago por el importe exacto.
5. Usuario paga en Mercado Pago.
6. Mercado Pago llama al webhook.
7. El webhook valida la firma, consulta el pago directamente en Mercado Pago, verifica `external_reference`, estado y monto.
8. Si todo coincide, la reserva pasa a `paid` y los m² a `acquired`.
9. Se genera un código de voucher y se envía el comprobante digital por email.
10. Las reservas vencidas se liberan automáticamente.

## Prueba recomendada

Antes de cobrar dinero real, hacer una prueba completa con credenciales de prueba de Mercado Pago y un usuario de prueba. Después cambiar las variables de entorno a producción y realizar una compra real de $10.000 para validar el circuito completo.
