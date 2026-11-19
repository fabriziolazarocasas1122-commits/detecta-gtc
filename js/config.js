// ════════════════════════════════════════════════════════════════════
//  Conexión a la base de datos compartida (Supabase)
//  Pegue aquí los dos datos de su proyecto: Supabase → Project Settings → API.
//  · SUPABASE_URL: "Project URL"
//  · SUPABASE_ANON_KEY: clave "anon" / "public" (está hecha para ir en la página).
//  NUNCA pegue aquí la clave "service_role": esa es secreta.
//  Si los dejan vacíos, la plataforma funciona en modo demostración (datos en el navegador).
// ════════════════════════════════════════════════════════════════════
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// Dominio interno con el que se arma el correo técnico de cada usuario (usuario@dominio).
// No se envían correos a esta dirección. Debe coincidir con USER_EMAIL_DOMAIN de la función admin-users.
export const USER_EMAIL_DOMAIN = 'usuarios.detecta-gtc.local';
