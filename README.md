# Plataforma GTC · Detecta Clínica

Plataforma web para digitalizar los formatos de **Gestión del Talento y Cultura** de Detecta Clínica, desde el requerimiento de personal hasta la selección del candidato, según:

- **PRC-GTC-01** Gestión de Requerimientos de Personal y Perfiles de Puesto
- **PRC-GTC-02** Reclutamiento y Evaluación de Candidatos
- **PRC-GTC-03** Contratación e Ingreso de Personal

Formatos digitalizados (los cuatro formatos oficiales en PDF):

| Código | Formato | Momento del flujo |
|---|---|---|
| RQ | Requerimiento de Personal | Solicitud, aprobaciones y validación GTC |
| GTC.PRS.04 | Levantamiento de información de funciones y perfil del puesto | Solo para puesto nuevo |
| GTC.PRS.02 | Ficha de evaluación – entrevista en cadena | Una por cada candidato de la terna |
| GTC.PRS.03 | Formato de movimiento interno de personal | Ascensos, traslados, cambios de puesto o jornada; también cuando el seleccionado es interno |

El análisis campo por campo y las inconsistencias encontradas están en [`docs/ANALISIS_FORMATOS.md`](docs/ANALISIS_FORMATOS.md).

## Portales por rol

Cada persona entra con su **usuario y contraseña** y ve solo su propia ventana:

| Portal | Rol en los procedimientos | Qué hace |
|---|---|---|
| Solicitante | Jefe inmediato | Crea requerimientos, sigue su avance y evalúa a los candidatos (entrevista técnica) |
| Jefatura de GTC | Jefe de GTC | Valida requerimientos, define remuneración, asigna analista, administra usuarios |
| Analista de Selección | Analista de GTC | Perfil del puesto, terna, fichas de entrevista y cierre del proceso |
| Dirección Administrativa / Dirección Médica | DA / DM | Aprueba u observa ampliaciones y puestos nuevos de su línea |
| Gerencia General | GG | Aprobación final de ampliaciones y puestos nuevos |
| Área de Procesos | Procesos | Valida funciones y actualiza MOF y organigrama de puestos nuevos |
| Colaborador | Colaborador | Firma sus movimientos internos |

Usuarios de demostración (contraseña `Detecta2026`): `rmedina` y `cparedes` (solicitantes), `jefegtc`, `analista`, `dadministrativa`, `dmedica`, `ggeneral`, `procesos`, `colaborador`. La Jefatura de GTC crea y administra usuarios en **Usuarios y datos**; las cuentas nuevas reciben la contraseña inicial y deben cambiarla al ingresar.

## Qué hace

- **Detecto, el asistente.** El robot de Detecta Clínica que le dice a cada persona qué le toca hacer y celebra cuando un documento queda con doble conformidad o cuando se completa el procedimiento.
- **Modo guiado.** Quien debe llenar un formato lo hace un paso a la vez, viendo solo las secciones que le corresponden. Al terminar, la plataforma le pide la firma de inmediato.
- **Firma guardada.** La firma se dibuja una vez y se guarda; las siguientes veces basta con confirmar.

- **Llenado obligatorio.** Ningún formato se puede firmar si falta un campo obligatorio. Los campos condicionales (por ejemplo, “¿a quién reemplaza?”) se exigen solo cuando aplican. Un medidor muestra cuántos datos faltan y lleva al siguiente pendiente.
- **Firmas manuscritas digitales.** Se firman en pantalla con mouse, dedo o lápiz, y cada firma incluye una declaración expresa de conformidad.
- **Doble conformidad.** Cada documento define quién **entrega** y quién **recibe y valida**; solo se cierra con ambas firmas. Una misma persona no puede firmar dos casilleros del mismo formato.
- **Integridad.** Cada firma guarda una huella SHA-256 del contenido que respalda. Si alguien altera los datos después, la firma aparece como “Contenido alterado”. Las secciones firmadas quedan bloqueadas.
- **Flujo automático por motivo.** Reemplazo y suplencia van directo a GTC; ampliación y puesto nuevo pasan por Dirección (DA o DM según la categoría) y Gerencia General. “Observado” devuelve el documento a borrador con el comentario; “Desaprobado” cierra el expediente.
- **Bandeja por rol.** Cada usuario ve solo lo que le toca firmar o completar.
- **Reglas de los procedimientos.** Plazos del Anexo 5 con semáforo en días útiles, entrevistadores por grupo ocupacional (Anexo 2), terna de hasta 3, devolución de la ficha en 24 horas y cálculo automático del resultado de la entrevista.
- **Versión imprimible** de cada formato con el encabezado SIG, firmas y huellas.
- **Historial** inalterable de cada acción.

## Publicarlo en GitHub Pages

No necesita compilación: son archivos estáticos (HTML, CSS y JavaScript).

```bash
git init
git add .
git commit -m "Plataforma GTC Detecta Clínica"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/detecta-gtc.git
git push -u origin main
```

En GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**. En uno o dos minutos estará en `https://<tu-usuario>.github.io/detecta-gtc/`.

Para probarlo en tu computadora:

```bash
python3 -m http.server 8080
# abrir http://localhost:8080
```

(Abrir `index.html` con doble clic no funciona porque el navegador bloquea los módulos JavaScript fuera de un servidor.)

## Cómo probar el flujo

Ingresa con cualquiera de los usuarios de demostración y usa **Cerrar sesión** para cambiar de rol. Vienen dos expedientes de ejemplo:

1. **RQ-xxxx-0002 · Enfermera de hospitalización (reemplazo).** Entra como `rmedina`, completa los datos que faltan y firma. Luego, como `jefegtc`, registra la remuneración, asigna la analista y firma. Sigue como `analista`: registra la terna, llena la ficha y remítela. Vuelve como `rmedina` a **Entrevistas por evaluar**, completa la entrevista técnica y firma. Termina como `analista`: firma la ficha y cierra el proceso.
2. **RQ-xxxx-0001 · Asistente de almacén (ampliación).** Ya tiene la aprobación de Dirección Administrativa; entra como `ggeneral` para aprobarla u observarla.

En **Usuarios y datos** puedes renombrar usuarios, exportar o importar un respaldo y restablecer la demostración.

## Estructura

```
index.html            Entrada
css/styles.css        Identidad visual (cinta celeste y lima del isotipo)
assets/               Logo e isotipo
js/main.js            Arranque
js/portal.js          Inicio de sesión, portales por rol y navegación
js/detecto.js         Detecto: mensajes y celebraciones
js/rules.js           Reglas y parámetros de los procedimientos y anexos
js/schemas.js         Definición de cada formato: campos, obligatoriedad, firmas y conformidad
js/engine.js          Motor de formularios y validación
js/workflow.js        Etapas, firmas, bloqueo, doble conformidad, bandejas
js/signature.js       Lienzo de firma y confirmaciones
js/store.js           Datos: navegador (demostración) o base de datos compartida
js/backend.js         Conexión con Supabase
js/config.js          URL y clave pública del proyecto Supabase
supabase/schema.sql   Tablas, reglas de acceso y protección de firmas
supabase/functions/   Función admin-users (cuentas de usuario)
js/views.js           Pantallas
docs/                 Análisis de formatos
```

Para cambiar un formato (agregar un campo, volverlo obligatorio, cambiar quién firma) se edita **solo** `js/schemas.js`. Para cambiar un plazo, un área de Infocorp o una regla de puntaje, se edita `js/rules.js`.

## Modo demostración y modo conectado

- **Modo demostración** (como viene): los datos se guardan en el navegador de cada equipo. Sirve para conocer el flujo; incluye usuarios de prueba con la contraseña `Detecta2026`.
- **Modo conectado** (para operar): los datos viven en una base de datos compartida en **Supabase**, el inicio de sesión lo valida el servidor y las reglas de acceso y de firmas se aplican allí. La guía paso a paso está en [`docs/SUPABASE.md`](docs/SUPABASE.md); al terminar solo se pegan dos valores en `js/config.js`.

En modo conectado:
- Cada persona ingresa con su usuario y contraseña propios; la Jefatura de GTC crea las cuentas, restablece contraseñas y desactiva usuarios.
- Una firma registrada no se puede modificar, solo se acepta a nombre de quien está conectado y lleva la hora del servidor.
- Si dos personas editan el mismo documento, la segunda recibe un aviso y se carga la versión más reciente.
- Los cambios de otras personas aparecen sin recargar la página.
- La firma es electrónica simple (trazo, declaración, usuario autenticado, hora del servidor y huella SHA-256 del contenido). La plataforma no se usa para contratos.

### Pendiente de la clínica

- **Protección de datos (Ley N° 29733):** decidir con el área legal la región del servidor, el registro del banco de datos ante la Autoridad Nacional de Protección de Datos Personales si corresponde, y el texto de autorización para candidatos.
- **Actualizar los procedimientos** (control de cambios): los registros de estos cuatro formatos pasan de "Físico" a "Digital" y PRC-GTC-02 debe dejar de indicar que la ficha de entrevista se maneja solo en físico.
- El repositorio público de GitHub solo contiene código. Los datos nunca se guardan en GitHub.
