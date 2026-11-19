# Conectar la plataforma a la base de datos compartida (Supabase)

Con esto la plataforma deja de guardar los datos en cada navegador. Todos trabajan sobre la misma información, el inicio de sesión lo valida un servidor y las reglas de acceso y de firmas se aplican allí. Toma unos 20 minutos y no requiere instalar nada.

> **Importante.** La cuenta de Supabase debe ser de Detecta Clínica (créala con un correo institucional). Nunca compartas la clave **service_role** ni la pegues en la plataforma o en GitHub.

---

## 1. Crear el proyecto

1. Entra a **supabase.com** → **Start your project** y crea una cuenta con el correo de la clínica.
2. **New project**:
   - **Name:** `detecta-gtc`
   - **Database password:** genera una y guárdala en un lugar seguro (no la necesitará la plataforma).
   - **Region:** la más cercana es *South America (São Paulo)*. Los datos quedarían fuera del Perú: confirma con el área legal si corresponde comunicarlo a la Autoridad Nacional de Protección de Datos Personales.
3. Espera a que el proyecto termine de crearse (1 o 2 minutos).

## 2. Crear las tablas y las reglas de acceso

1. Menú izquierdo → **SQL Editor** → **New query**.
2. Abre el archivo [`supabase/schema.sql`](../supabase/schema.sql) de este repositorio, copia **todo** su contenido y pégalo.
3. Pulsa **Run**. Debe terminar con *Success. No rows returned*.

Esto crea los expedientes, movimientos, perfiles de usuario, la bitácora y las reglas: cada rol ve solo lo suyo, una firma registrada no se puede alterar y la hora de cada firma la pone el servidor.

## 3. Cerrar el registro libre

Los usuarios solo los crea la Jefatura de GTC desde la plataforma.

1. **Authentication** → **Sign In / Providers** (o *Providers* → *Email*).
2. Desactiva **Allow new users to sign up** y guarda.

## 4. Publicar la función de administración de usuarios

1. Menú izquierdo → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. **Function name:** `admin-users` (exactamente así).
3. Borra el código de ejemplo, abre [`supabase/functions/admin-users/index.ts`](../supabase/functions/admin-users/index.ts), copia todo y pégalo.
4. Pulsa **Deploy function**.

## 5. Crear la primera cuenta de Jefatura de GTC

Las demás cuentas se crean después desde la plataforma, pero la primera se crea a mano:

1. **Authentication** → **Users** → **Add user** → **Create new user**.
   - **Email:** `jefegtc@usuarios.detecta-gtc.local` (el usuario será `jefegtc`).
   - **Password:** una contraseña temporal de al menos 8 caracteres.
   - Marca **Auto Confirm User** y pulsa **Create user**.
2. Vuelve a **SQL Editor** → **New query**, pega esto (cambia el nombre) y pulsa **Run**:

```sql
insert into public.profiles (id, username, name, cargo, role, area, must_change)
select id, 'jefegtc', 'Nombre y Apellido de la Jefatura', 'Jefe de Gestión del Talento y Cultura', 'gtc',
       'Gestión del Talento y Cultura', true
from auth.users where email = 'jefegtc@usuarios.detecta-gtc.local';
```

## 6. Conectar la plataforma

1. **Project Settings** (engranaje) → **API** (o *Data API*).
2. Copia **Project URL** y la clave **anon public**.
3. En GitHub abre `js/config.js` → lápiz (*Edit*) y pega los dos valores:

```js
export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

4. **Commit changes**. En 1 o 2 minutos GitHub Pages publica la versión conectada.

La clave *anon* está hecha para ir en la página: por sí sola no da acceso a nada, porque las reglas del paso 2 exigen un usuario con perfil activo.

## 7. Primer ingreso

1. Abre la plataforma, ingresa con `jefegtc` y la contraseña temporal. Te pedirá crear tu contraseña personal.
2. Ve a **Usuarios y datos** y crea las cuentas de las jefaturas, Direcciones, Gerencia, analistas y Procesos. A cada persona entrégale su usuario y su contraseña temporal por un canal privado; al ingresar deberá cambiarla.
3. Si alguien deja la clínica, usa **Desactivar**: ya no podrá ingresar, pero sus firmas y registros se conservan.

---

## Qué protege el servidor

| Regla | Cómo |
|---|---|
| Cada rol ve solo lo suyo | Reglas de acceso por fila: jefaturas ven sus requerimientos; Direcciones y Gerencia, las vacantes que deben aprobar; Procesos, los puestos nuevos validados; GTC, todo |
| Nadie se hace pasar por otro | Una firma nueva solo se acepta a nombre del usuario conectado; el nombre y el cargo los toma del perfil |
| Las firmas no se alteran | Una firma registrada no se puede modificar; solo se retira cuando el documento se devuelve con una observación |
| Hora oficial | La fecha y hora de cada firma las pone el servidor |
| Dos personas a la vez | Control de versión: si alguien guardó antes, se avisa y se carga la versión más reciente |
| Expedientes no se borran | No existe permiso de eliminación |
| Bitácora | Cada creación y cada firma quedan registradas en `audit_log` (solo GTC puede consultarla) |
| Cuentas | Solo la Jefatura de GTC crea, desactiva o cambia roles, mediante la función `admin-users` |

## Si algo falla

- **"Usuario o contraseña incorrectos"** con datos correctos: revisa que el correo del usuario en Supabase sea `usuario@usuarios.detecta-gtc.local` y que exista su fila en `profiles`.
- **"Tu usuario no tiene un perfil activo"**: falta la fila en `profiles` (paso 5) o la cuenta está desactivada.
- **No se pueden crear usuarios**: confirma que la función se llama exactamente `admin-users` y que quien la usa tiene el rol `gtc`.
- **Supabase no acepta el correo `...@usuarios.detecta-gtc.local`** al crear un usuario: usa el dominio real de la clínica (por ejemplo `usuarios.tudominio.com.pe`). Cámbialo en `USER_EMAIL_DOMAIN` de `js/config.js` y agrega el secreto `USER_EMAIL_DOMAIN` con el mismo valor en **Edge Functions → Secrets**. No se envían correos a esas direcciones.
- **Quieres volver al modo demostración**: deja vacíos los dos valores de `js/config.js`.
