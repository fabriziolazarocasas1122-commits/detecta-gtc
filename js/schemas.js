// Definición declarativa de los formatos digitalizados.
// Cada campo replica un campo del formato físico; los campos marcados `nuevo` cierran brechas
// detectadas al contrastar los formatos con los procedimientos PRC-GTC-01/02/03.
import {
  MOTIVOS, AREAS, TIPOS_PUESTO, GRUPOS_OCUP, requiereAprobacion, esAsistencial, directorDeLinea,
  calcularFicha, guiaRRHH, CONFIG, aplicaEntrevistaFinal, addMonthsSafe,
} from './rules.js';

const opt = (...xs) => xs.map((x) => (typeof x === 'string' ? { v: x, l: x } : x));
const SINO = opt('Sí', 'No');
const FRECUENCIAS = opt('Diaria', 'Semanal', 'Quincenal', 'Mensual', 'Eventual');
const isReemplazo = (rq) => ['reemplazo', 'suplencia'].includes(rq?.motivo);

/* ───────────────────────── RQ · Requerimiento de Personal ───────────────────────── */
export const RQ = {
  key: 'RQ',
  code: 'RQ-GTC',
  title: 'Requerimiento de Personal',
  version: 'Digital V.01 (base: emisión 12/09/23)',
  procedure: 'PRC-GTC-01',
  sections: [
    {
      id: 'tipo', title: 'Tipo de contrato, motivo y categoría', by: ['jefe'],
      fields: [
        { k: 'tipo_contrato', t: 'radio', label: 'Tipo de contrato', req: true, opts: opt('Contrato D.L. 728 (5ta)', 'Otra modalidad') },
        { k: 'tipo_contrato_otro', t: 'text', label: '¿Qué modalidad?', req: true, show: (d) => d.tipo_contrato === 'Otra modalidad' },
        { k: 'modalidad_ingreso', t: 'radio', label: 'Modalidad de ingreso', req: true, opts: opt('Contrato', 'Temporal', 'Suplencia (maternidad / vacaciones / enfermedad)') },
        { k: 'categoria', t: 'radio', label: 'Categoría ocupacional', req: true, opts: opt('Directivo', 'Administrativo', 'Asistencial', 'Residente', 'Interno', 'Practicante') },
        { k: 'motivo', t: 'radio', label: 'Motivo del requerimiento', req: true, opts: MOTIVOS, nuevo: 'PRC-GTC-01 paso 1',
          hint: 'Ampliación y puesto nuevo pasan por aprobación de Dirección y Gerencia General antes de llegar a GTC.' },
        { k: 'atraccion', t: 'radio', label: 'Modalidad de atracción', req: true, opts: opt('Interna', 'Externa', 'Mixta'), nuevo: 'PRC-GTC-01 paso 1',
          hint: 'La atracción interna tiene prioridad; la externa se usa cuando el talento no existe dentro de la clínica.' },
      ],
    },
    {
      id: 'posicion', title: 'Características de la posición', by: ['jefe'],
      fields: [
        { k: 'puesto', t: 'text', label: 'Nombre del puesto / cargo', req: true, w: 'half' },
        { k: 'area', t: 'select', label: 'Área a la que pertenece', req: true, opts: opt(...AREAS), w: 'half' },
        { k: 'nueva_posicion', t: 'calc', label: 'Nueva posición', calc: (d) => (requiereAprobacion(d) ? 'Sí' : d.motivo ? 'No' : '—'), w: 'third' },
        { k: 'reemplaza_nombre', t: 'text', label: '¿A quién reemplaza? (nombre)', req: true, show: isReemplazo, w: 'twothirds' },
        { k: 'motivo_reemplazo', t: 'radio', label: 'Motivo del reemplazo', req: true, show: isReemplazo, opts: opt('Cese', 'Promoción', 'Maternidad', 'Licencia', 'Vacaciones', 'Otro'),
          hint: 'Ley 29733: en suplencias por enfermedad o licencia médica solo se registra el motivo, nunca diagnósticos ni datos clínicos.' },
        { k: 'motivo_reemplazo_otro', t: 'text', label: 'Especificar otro motivo', req: true, show: (d) => isReemplazo(d) && d.motivo_reemplazo === 'Otro' },
        { k: 'fecha_inicio', t: 'date', label: 'Fecha requerida de inicio de labores', req: true, w: 'third', min: 'today' },
        { k: 'tas', t: 'calc', label: 'TAS de referencia (formato RQ)', w: 'third',
          calc: (d) => (d.categoria === 'Asistencial' ? '10 días' : d.categoria ? '15 días' : '—') },
        { k: 'sistema_trabajo', t: 'radio', label: 'Sistema de trabajo', req: true, opts: opt('48 horas a la semana', '150 horas mensuales'), w: 'third' },
        { k: 'jefe_nombre', t: 'text', label: 'Jefe inmediato · nombre', req: true, w: 'half', prefill: 'user.name' },
        { k: 'jefe_puesto', t: 'text', label: 'Jefe inmediato · puesto', req: true, w: 'half', prefill: 'user.cargo' },
      ],
    },
    {
      id: 'especiales', title: 'Requerimientos especiales del puesto', by: ['jefe'],
      fields: [
        { k: 'justificacion', t: 'textarea', label: 'Actividades / justificación de la contratación', req: true, minLen: 40,
          hint: 'Para ampliaciones: indicadores, carga laboral o demanda que sustentan la solicitud (la Dirección evalúa con esto).' },
        { k: 'profesion', t: 'text', label: 'Profesión / técnico requerido', req: true, w: 'half' },
        { k: 'experiencia_min', t: 'text', label: 'Tiempo de experiencia mínima en el puesto', req: true, w: 'half', placeholder: 'Ej.: 2 años en hospitalización' },
        { k: 'especialidad', t: 'text', label: 'Especialidad profesional requerida (¿cuál?)', w: 'half', placeholder: 'Dejar vacío si no aplica' },
        { k: 'oficina', t: 'text', label: 'Oficina ubicada en', req: true, w: 'half' },
        { k: 'equipos', t: 'matrix', label: 'Requerimiento de equipos / implementos', req: true,
          rows: ['PC', 'Laptop', 'Teléfono (anexo oficina)', 'Teléfono celular', 'Sello de V°B', 'Sello para informes'], opts: opt('Se requiere', 'No se requiere') },
        { k: 'info_desc', t: 'info', show: (d) => d.motivo === 'puesto_nuevo',
          text: 'Posición nueva: la descripción del puesto se registrará en el formato digital “Levantamiento de información de funciones y perfil del puesto” una vez que GTC valide este requerimiento.' },
      ],
    },
    {
      id: 'remuneracion', title: 'Uso exclusivo de GTC · recepción y remuneración', by: ['gtc'], unlockAfter: (ctx) => ctx.readyForGTC,
      fields: [
        { k: 'grado', t: 'text', label: 'Grado', req: true, w: 'third' },
        { k: 'moneda', t: 'calc', label: 'Moneda', calc: () => 'Soles (S/)', w: 'third' },
        { k: 'tipo_puesto', t: 'select', label: 'Tipo de puesto (plazo Anexo 5 PRC-GTC-02)', req: true, w: 'third', nuevo: 'PRC-GTC-02 Anexo 5',
          opts: TIPOS_PUESTO.map((t) => ({ v: t.v, l: `${t.l} · ${t.dias} días útiles` })) },
        { k: 'sal_min', t: 'money', label: 'Rango salarial · mínimo', req: true, w: 'third' },
        { k: 'sal_prom', t: 'money', label: 'Rango salarial · promedio', req: true, w: 'third' },
        { k: 'sal_max', t: 'money', label: 'Rango salarial · máximo', req: true, w: 'third' },
        { k: 'sal_aprobada', t: 'money', label: 'Remuneración aprobada', req: true, w: 'third' },
        { k: 'grupo_ocupacional', t: 'select', label: 'Grupo ocupacional (define quién entrevista)', req: true, w: 'twothirds', nuevo: 'PRC-GTC-02 Anexo 2',
          opts: GRUPOS_OCUP.map((g) => ({ v: g.v, l: g.l })) },
        { k: 'analista_id', t: 'select', label: 'Analista de Selección asignada', req: true, opts: 'users:analista', nuevo: 'PRC-GTC-01 paso 4' },
      ],
    },
  ],
  validate(d) {
    const e = [];
    const n = (k) => Number(d[k]);
    if (d.sal_min && d.sal_max && n('sal_min') > n('sal_max')) e.push({ k: 'sal_max', m: 'El máximo no puede ser menor que el mínimo.' });
    if (d.sal_prom && d.sal_min && d.sal_max && (n('sal_prom') < n('sal_min') || n('sal_prom') > n('sal_max'))) e.push({ k: 'sal_prom', m: 'El promedio debe estar dentro del rango.' });
    if (d.sal_aprobada && d.sal_min && d.sal_max && (n('sal_aprobada') < n('sal_min') || n('sal_aprobada') > n('sal_max'))) e.push({ k: 'sal_aprobada', m: 'La remuneración aprobada está fuera del rango salarial.' });
    return e;
  },
  signatures: [
    { key: 'solicitante', label: 'Solicitante (Jefe inmediato)', roles: ['jefe'], requires: ['tipo', 'posicion', 'especiales'] },
    { key: 'director', label: (d) => (directorDeLinea(d) === 'dm' ? 'Dirección Médica' : 'Dirección Administrativa'),
      roles: (d) => [directorDeLinea(d)], requires: ['tipo', 'posicion', 'especiales'], decision: ['Aprobado', 'Observado'],
      when: (d) => requiereAprobacion(d), after: ['solicitante'] },
    { key: 'dm_asistencial', label: 'Dirección Médica (personal asistencial)', roles: ['dm'], requires: ['tipo', 'posicion', 'especiales'], decision: ['Aprobado', 'Observado'],
      when: (d) => CONFIG.DM_FIRMA_TODO_ASISTENCIAL && esAsistencial(d) && !requiereAprobacion(d), after: ['solicitante'] },
    { key: 'gg', label: 'Gerencia General', roles: ['gg'], requires: ['tipo', 'posicion', 'especiales'], decision: ['Aprobado', 'Observado', 'Desaprobado'],
      when: (d) => requiereAprobacion(d), after: ['director'] },
    { key: 'gtc', label: 'Jefatura de GTC · valida y autoriza el inicio', roles: ['gtc'], requires: ['tipo', 'posicion', 'especiales', 'remuneracion'], decision: ['Aprobado', 'Observado'],
      after: ['solicitante', 'director', 'dm_asistencial', 'gg'] },
  ],
  conformidad: { entrega: 'solicitante', recibe: 'gtc', textoEntrega: 'El solicitante declara que la necesidad y los datos registrados son veraces y completos.', textoRecibe: 'GTC declara que recibió el requerimiento registrado, sustentado y firmado, y autoriza el inicio del proceso.' },
};

/* ──────────────── GTC.PRS.04 · Levantamiento de funciones y perfil ──────────────── */
export const PERFIL = {
  key: 'PERFIL',
  code: 'GTC.PRS.04',
  title: 'Levantamiento de información de funciones y perfil del puesto',
  version: 'V.01 · 01/09/2026',
  procedure: 'PRC-GTC-01 pasos 6–9',
  intro: 'Complete con lenguaje simple y describa la necesidad real del puesto. No es necesario redactar técnicamente las funciones: GTC validará, ordenará y convertirá la información al formato final del MOF.',
  sections: [
    { id: 'p1', title: 'Datos de la nueva posición', by: ['jefe', 'analista'], fields: [
      { k: 'puesto', t: 'text', label: 'Nombre del puesto', req: true, w: 'half', prefill: 'rq.puesto' },
      { k: 'area', t: 'select', label: 'Área', req: true, w: 'half', opts: opt(...AREAS), prefill: 'rq.area' },
      { k: 'jefatura', t: 'text', label: 'Jefatura solicitante', req: true, w: 'half', prefill: 'rq.jefe_nombre' },
      { k: 'fecha', t: 'date', label: 'Fecha', req: true, w: 'half', prefill: 'today' },
      { k: 'reporta_a', t: 'text', label: 'Reporta a', req: true, w: 'half' },
      { k: 'supervisa_a', t: 'text', label: 'Supervisa a', req: true, w: 'half', placeholder: 'Escriba “Nadie” si no supervisa' },
      { k: 'n_posiciones', t: 'number', label: 'N.º de posiciones', req: true, w: 'half', min: 1 },
      { k: 'sede', t: 'text', label: 'Sede / servicio', req: true, w: 'half' },
    ] },
    { id: 'p2', title: 'Justificación de la creación', by: ['jefe', 'analista'], fields: [
      { k: 'por_que', t: 'textarea', label: '¿Por qué se necesita este puesto?', req: true },
      { k: 'problema', t: 'textarea', label: '¿Qué problema, necesidad o carga de trabajo resolverá?', req: true },
      { k: 'similar', t: 'radio', label: '¿Existe un puesto similar actualmente?', req: true, opts: SINO },
      { k: 'similar_cual', t: 'text', label: 'Indicar cuál', req: true, show: (d) => d.similar === 'Sí' },
    ] },
    { id: 'p3', title: 'Objetivo del puesto', by: ['jefe', 'analista'], fields: [
      { k: 'objetivo', t: 'textarea', label: 'En una frase: ¿para qué existe el puesto y qué resultado principal debe lograr?', req: true, rows: 2 },
    ] },
    { id: 'p4', title: 'Principales responsabilidades / actividades', by: ['jefe', 'analista'], fields: [
      { k: 'actividades', t: 'table', label: 'Hasta 10 actividades, en sus propias palabras', req: true, minRows: 3, maxRows: 10,
        hint: 'Ejemplo: “Revisar las solicitudes de…” o “Coordinar con…”.',
        cols: [
          { k: 'que', t: 'textarea', label: '¿Qué debe hacer?', req: true },
          { k: 'resultado', t: 'textarea', label: '¿Qué resultado se espera?', req: true },
          { k: 'frecuencia', t: 'select', label: 'Frecuencia', req: true, opts: FRECUENCIAS },
        ] },
    ] },
    { id: 'p5', title: 'Coordinación, reportes y nivel de decisión', by: ['jefe', 'analista'], fields: [
      { k: 'coordinacion', t: 'table', label: 'Áreas o puestos con los que coordina', req: true, minRows: 1, maxRows: 8,
        cols: [
          { k: 'area', t: 'text', label: 'Área / puesto', req: true },
          { k: 'para_que', t: 'text', label: '¿Para qué coordina?', req: true },
          { k: 'frecuencia', t: 'select', label: 'Frecuencia', req: true, opts: FRECUENCIAS },
        ] },
      { k: 'reportes', t: 'textarea', label: 'Principales reportes / controles que debe emitir', req: true },
      { k: 'decisiones', t: 'textarea', label: 'Decisiones que puede tomar sin autorización previa', req: true },
    ] },
    { id: 'p6', title: 'Perfil mínimo requerido', by: ['jefe', 'analista'], fields: [
      { k: 'nivel', t: 'radio', label: 'Nivel de formación', req: true, opts: opt('Secundaria', 'Técnico', 'Universitario', 'Posgrado') },
      { k: 'carreras', t: 'text', label: 'Carrera(s) requerida(s)', req: true },
      { k: 'especializacion', t: 'text', label: 'Especialización / certificación', placeholder: 'Opcional' },
      { k: 'exp_anios', t: 'number', label: 'Experiencia requerida (años)', req: true, w: 'third', min: 0 },
      { k: 'exp_tipo', t: 'text', label: 'Área / rubro / tipo de experiencia', req: true, w: 'twothirds' },
      { k: 'conocimientos', t: 'textarea', label: 'Conocimientos técnicos indispensables', req: true, rows: 2 },
      { k: 'sistemas', t: 'text', label: 'Sistemas / software / herramientas', req: true },
      { k: 'obligatorios', t: 'text', label: 'Requisitos obligatorios del puesto', placeholder: 'Ej.: colegiatura, habilitación, licencia, curso o certificación exigible' },
      { k: 'otros', t: 'text', label: 'Otros requisitos relevantes', placeholder: 'Opcional' },
    ] },
    { id: 'p7', title: 'Habilidades clave', by: ['jefe', 'analista'], fields: [
      { k: 'habilidades', t: 'checks', label: 'Marque hasta 5 indispensables para el puesto', req: true, max: 5,
        opts: opt('Planificación', 'Organización', 'Comunicación', 'Trabajo en equipo', 'Atención al detalle', 'Análisis', 'Resolución de problemas', 'Liderazgo', 'Orientación al paciente/cliente', 'Manejo de presión', 'Negociación', 'Otra') },
      { k: 'habilidad_otra', t: 'text', label: '¿Cuál otra?', req: true, show: (d) => (d.habilidades || []).includes('Otra') },
    ] },
    { id: 'p8', title: 'Validación interna · Gestión de Talento y Cultura', by: ['analista', 'gtc'], fields: [
      { k: 'duplicidad', t: 'radio', label: '¿Existe duplicidad o solapamiento con otra posición?', req: true, opts: SINO },
      { k: 'duplicidad_obs', t: 'text', label: 'Observación', req: true, show: (d) => d.duplicidad === 'Sí' },
      { k: 'corresponde', t: 'radio', label: '¿Corresponde crear la posición?', req: true, opts: opt('Sí', 'No', 'Requiere ajuste') },
      { k: 'documentos', t: 'checks', label: 'Documentos para actualizar', req: true, opts: opt('MOF', 'Organigrama', 'Perfil', 'Otros') },
      { k: 'obs_gtc', t: 'textarea', label: 'Observación de Gestión de Talento', req: (d) => d.corresponde !== 'Sí' },
    ] },
    { id: 'p9', title: 'Área de Procesos · validación de funciones y MOF', by: ['procesos'], nuevo: 'PRC-GTC-01 paso 9', unlockAfter: (ctx, form) => !!form.signatures?.gtc_perfil, fields: [
      { k: 'funciones_validadas', t: 'radio', label: 'Funciones validadas', req: true, opts: opt('Sí', 'Con ajustes') },
      { k: 'mof_actualizado', t: 'radio', label: 'MOF actualizado', req: true, opts: SINO },
      { k: 'organigrama_actualizado', t: 'radio', label: 'Puesto incluido en el organigrama', req: true, opts: SINO },
      { k: 'obs_procesos', t: 'textarea', label: 'Observaciones del Área de Procesos', req: (d) => d.funciones_validadas === 'Con ajustes', rows: 2 },
    ] },
  ],
  validate(d) {
    const e = [];
    if ((d.habilidades || []).length > 5) e.push({ k: 'habilidades', m: 'Marque como máximo 5 habilidades.' });
    if (d.corresponde && d.corresponde !== 'Sí') e.push({ k: 'corresponde', m: 'Para continuar, la posición debe quedar validada como “Sí”. Ajuste el perfil con la jefatura y vuelva a validar.', soft: true });
    if (d.mof_actualizado === 'No' || d.organigrama_actualizado === 'No') e.push({ k: 'mof_actualizado', m: 'El Área de Procesos debe actualizar MOF y organigrama antes de cerrar el perfil.', soft: true });
    return e;
  },
  signatures: [
    { key: 'jefatura', label: 'Jefatura solicitante', roles: ['jefe'], requires: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'] },
    { key: 'revisora', label: 'Dirección / Gerencia revisora', roles: ['da', 'dm', 'gg'], requires: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'], decision: ['Aprobado', 'Observado'], after: ['jefatura'] },
    { key: 'gtc_perfil', label: 'Gestión de Talento y Cultura', roles: ['gtc', 'analista'], requires: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'], after: ['revisora'], blockIfSoft: ['corresponde'] },
    { key: 'procesos', label: 'Área de Procesos', roles: ['procesos'], requires: ['p9'], after: ['gtc_perfil'], blockIfSoft: ['mof_actualizado'] },
  ],
  conformidad: { entrega: 'jefatura', recibe: 'gtc_perfil', textoEntrega: 'La jefatura confirma que el perfil describe la necesidad real del puesto.', textoRecibe: 'GTC confirma que validó el perfil y lo deriva al Área de Procesos.' },
};

/* ──────────────── GTC.PRS.02 · Ficha de evaluación – entrevista en cadena ──────────────── */
const score = (k, label) => ({ k, t: 'score', label, req: true });
const REQUISITOS = ['Formación / título requerido', 'Colegiatura y habilitación (si aplica)', 'Experiencia específica mínima', 'Conocimiento / certificación indispensable', 'Disponibilidad para horario / turnos requeridos', 'Otro requisito crítico del perfil'];
const tecnicaAplica = (d) => d.continua === 'Sí';

export const FICHA = {
  key: 'FICHA',
  code: 'GTC.PRS.02',
  title: 'Ficha de evaluación – entrevista en cadena',
  version: 'V.01 · 22/05/2026',
  procedure: 'PRC-GTC-02 pasos 14–23',
  confidential: true,
  visibleTo: ['analista', 'gtc', 'jefe', 'da', 'dm', 'gg'],
  sections: [
    { id: 'f1', title: 'Datos generales', by: ['analista'], fields: [
      { k: 'candidato', t: 'text', label: 'Candidato', req: true, w: 'half', prefill: 'cand.nombre' },
      { k: 'puesto', t: 'text', label: 'Puesto', req: true, w: 'half', prefill: 'rq.puesto' },
      { k: 'area', t: 'text', label: 'Área', req: true, w: 'half', prefill: 'rq.area' },
      { k: 'jefatura', t: 'text', label: 'Jefatura solicitante', req: true, w: 'half', prefill: 'rq.jefe_nombre' },
      { k: 'entrevistador_rrhh', t: 'text', label: 'Entrevistador RRHH', req: true, w: 'half', prefill: 'user.name' },
      { k: 'fecha', t: 'date', label: 'Fecha', req: true, w: 'half', prefill: 'today' },
      { k: 'tipo_vacante', t: 'radio', label: 'Tipo de vacante', req: true, opts: opt('Nueva', 'Reemplazo', 'Ampliación', 'Suplencia'), prefill: 'rq.tipo_vacante' },
      { k: 'modalidad', t: 'radio', label: 'Modalidad', req: true, opts: opt('Presencial', 'Virtual') },
      { k: 'perfil', t: 'radio', label: 'Perfil', req: true, opts: opt('Administrativo', 'Asistencial'), prefill: 'rq.perfil' },
      { k: 'horario', t: 'radio', label: 'Horario', req: true, opts: opt('48 horas semanales', '150 horas mensuales'), prefill: 'rq.horario',
        hint: 'El formato físico dice “150 horas semanales”; se corrigió a mensuales para coincidir con el RQ y con el límite legal de jornada.' },
      { k: 'disponibilidad', t: 'text', label: 'Disponibilidad de ingreso', req: true, w: 'half' },
      { k: 'remuneracion', t: 'money', label: 'Remuneración', req: true, w: 'half', prefill: 'rq.sal_aprobada' },
    ] },
    { id: 'f2', title: 'Filtro de requisitos críticos', by: ['analista'],
      note: 'Un requisito indispensable marcado “No cumple” impide declarar APTO al candidato, aunque el puntaje total sea alto.', fields: [
      { k: 'requisitos', t: 'table', fixedRows: REQUISITOS, label: 'Requisitos', req: true, cols: [
        { k: 'resultado', t: 'select', label: 'Resultado', req: true, opts: opt('Cumple', 'No cumple', 'N/A') },
        { k: 'critico', t: 'select', label: '¿Crítico?', req: true, opts: SINO },
        { k: 'evidencia', t: 'text', label: 'Evidencia breve', req: (r) => r.resultado === 'No cumple' },
      ] },
    ] },
    { id: 'f3', title: 'Entrevista RRHH · 30 puntos', by: ['analista'],
      note: 'Escala: 1 = No evidencia · 2 = Bajo · 3 = Cumple · 4 = Supera · 5 = Sobresaliente. La evidencia es obligatoria en notas 1, 2 y 5.', fields: [
      score('rr1', 'Experiencia y trayectoria relevante'), score('rr2', 'Motivación e interés por la posición'), score('rr3', 'Comunicación efectiva'),
      score('rr4', 'Orientación al paciente / cliente'), score('rr5', 'Trabajo colaborativo y adaptabilidad'), score('rr6', 'Capacidad resolutiva'),
      { k: 'puntaje_rrhh', t: 'calc', label: 'Puntaje RRHH', w: 'half', calc: (d) => { const r = calcularFicha(d).rrhh; return r ? `${r} / 30 · ${guiaRRHH(r)}` : '— / 30'; } },
      { k: 'continua', t: 'radio', label: '¿Continúa a la entrevista técnica?', req: true, opts: SINO, w: 'half' },
    ] },
    { id: 'f4', title: 'Entrevista técnica · Jefatura inmediata · 50 puntos', by: ['jefe'], show: tecnicaAplica, unlockAfter: (ctx, form) => !!form.remitidaAt,
      note: 'Notas: 1 = No demuestra · 2 = Bajo · 3 = Cumple · 4 = Avanzado · 5 = Sobresaliente. Mínimo técnico sugerido: 18/25 (72 %).', fields: [
      { k: 'entrevistador_tec', t: 'text', label: 'Entrevistador', req: true, w: 'half', prefill: 'user.name' },
      { k: 'cargo_tec', t: 'text', label: 'Cargo', req: true, w: 'half', prefill: 'user.cargo' },
      { k: 'fecha_tec', t: 'date', label: 'Fecha', req: true, w: 'half', prefill: 'today' },
      { k: 'area_tec', t: 'text', label: 'Área', req: true, w: 'half', prefill: 'rq.area' },
      score('tc1', 'Dominio técnico de las funciones del puesto'), score('tc2', 'Aplicación de procedimientos, normas y protocolos'),
      score('tc3', 'Manejo de herramientas, sistemas y recursos del puesto'), score('tc4', 'Análisis y resolución de situaciones técnicas'),
      score('tc5', 'Calidad y precisión en la ejecución técnica'),
      { k: 'puntaje_tec', t: 'calc', label: 'Puntaje técnico / ponderado', calc: (d) => { const r = calcularFicha(d); return `${r.tecnico} / 25 → ${r.ponderado} / 50 (${r.tecPct} %)`; } },
    ] },
    { id: 'f5', title: 'Entrevista final · 20 puntos (solo si aplica)', by: ['jefe', 'gtc', 'da', 'dm', 'gg'], show: tecnicaAplica, unlockAfter: (ctx, form) => !!form.remitidaAt,
      note: 'Si no aplica, marque N/A: el resultado se calcula sobre 80 puntos y se convierte a porcentaje.', fields: [
      { k: 'final_aplica', t: 'radio', label: '¿Aplica entrevista final?', req: true, opts: opt('Sí', 'N/A'), prefill: 'rq.final_aplica',
        hint: 'Según el Anexo 2 de PRC-GTC-02, los coordinadores, supervisores, jefes y directores tienen entrevista adicional.' },
      { k: 'final_entrevistador', t: 'text', label: 'Entrevistador final', req: true, show: (d) => d.final_aplica === 'Sí' },
      { ...score('fn1', 'Ajuste al nivel de responsabilidad'), show: (d) => d.final_aplica === 'Sí' },
      { ...score('fn2', 'Toma de decisiones / criterio'), show: (d) => d.final_aplica === 'Sí' },
      { ...score('fn3', 'Orientación a resultados'), show: (d) => d.final_aplica === 'Sí' },
      { ...score('fn4', 'Alineación con el propósito institucional'), show: (d) => d.final_aplica === 'Sí' },
    ] },
    { id: 'f6', title: 'Resultado consolidado y decisión', by: ['jefe', 'analista'], unlockAfter: (ctx, form, d) => d.continua === 'No' || !!form.remitidaAt, fields: [
      { k: 'consolidado', t: 'calc', label: 'Consolidado', wide: true, calc: (d) => calcularFicha(d), render: 'consolidado' },
      { k: 'info_pendiente', t: 'radio', label: '¿Existe información pendiente?', req: true, opts: SINO, w: 'half' },
      { k: 'resultado', t: 'calc', label: 'Resultado final (automático)', w: 'half', calc: (d) => calcularFicha(d).resultado, render: 'resultado' },
      { k: 'observacion', t: 'textarea', label: 'Observación clave / riesgo', req: true, rows: 2 },
      { k: 'recomendacion', t: 'radio', label: 'Recomendación', req: true, opts: opt('Contratar', 'Continuar proceso', 'Segunda opción', 'No recomendar') },
    ] },
  ],
  validate(d) {
    const e = [];
    const r = calcularFicha(d);
    if (d.recomendacion === 'Contratar' && r.resultado !== 'APTO' && r.resultado !== 'APTO CON OBSERVACIONES')
      e.push({ k: 'recomendacion', m: `No se puede recomendar “Contratar” con resultado ${r.resultado}.` });
    if (d.recomendacion === 'Contratar' && d.info_pendiente === 'Sí') e.push({ k: 'recomendacion', m: 'Hay información pendiente: la decisión debe ser “Continuar proceso”.' });
    return e;
  },
  signatures: [
    { key: 'jefatura', label: 'Jefatura solicitante · V°B°', roles: ['jefe'], requires: ['f4', 'f5', 'f6'], when: tecnicaAplica },
    { key: 'final', label: 'Entrevistador final · V°B°', roles: ['gtc', 'da', 'dm', 'gg'], requires: ['f5'], when: (d) => tecnicaAplica(d) && d.final_aplica === 'Sí' },
    { key: 'rrhh', label: 'Responsable RRHH · V°B°', roles: ['analista', 'gtc'], requires: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'], after: ['jefatura', 'final'] },
  ],
  conformidad: { entrega: 'jefatura', recibe: 'rrhh', textoEntrega: 'La jefatura devuelve la ficha con su evaluación técnica (plazo: 24 horas).', textoRecibe: 'GTC recibe la ficha completa y consolida el resultado.', fallbackEntrega: (d) => d.continua === 'No' },
};

/* ──────────────── GTC.PRS.03 · Movimiento interno de personal ──────────────── */
const conAdecuacion = (d) => d.adecuacion && d.adecuacion !== 'No aplica';
export const MOV = {
  key: 'MOV',
  code: 'GTC.PRS.03',
  title: 'Formato de movimiento interno de personal',
  version: 'V.01 · 01/09/2026',
  procedure: 'PRC-GTC-03 paso 5',
  sections: [
    { id: 'm1', title: 'Datos del colaborador', by: ['analista', 'gtc', 'jefe'], fields: [
      { k: 'colaborador', t: 'text', label: 'Apellidos y nombres', req: true, w: 'twothirds' },
      { k: 'dni', t: 'text', label: 'DNI', req: true, w: 'third', pattern: '^[0-9]{8}$', patternMsg: 'El DNI tiene 8 dígitos.' },
    ] },
    { id: 'm2', title: 'Movimiento solicitado', by: ['analista', 'gtc', 'jefe'], fields: [
      { k: 'tipo', t: 'radio', label: 'Tipo de movimiento', req: true, opts: opt('Ascenso', 'Traslado de área', 'Cambio de puesto', 'Movimiento lateral', 'Encargo temporal', 'Cambio de jornada/turno', 'Otro') },
      { k: 'tipo_otro', t: 'text', label: 'Especificar', req: true, show: (d) => d.tipo === 'Otro' },
      { k: 'motivo', t: 'textarea', label: 'Motivo / sustento', req: true, minLen: 30 },
    ] },
    { id: 'm3', title: 'Posición actual / nueva posición', by: ['analista', 'gtc', 'jefe'], fields: [
      { k: 'posiciones', t: 'compare', label: 'Comparativo', req: true, rows: ['Área', 'Puesto', 'Jefe directo', 'Remuneración (S/)', 'Jornada / turno'], cols: ['Posición actual', 'Nueva posición'] },
      { k: 'fecha_efectiva', t: 'date', label: 'Fecha efectiva', req: true, w: 'half' },
    ] },
    { id: 'm4', title: 'Periodo de adecuación al puesto', by: ['analista', 'gtc', 'jefe'],
      note: 'Durante el periodo, el colaborador desempeña las funciones de la nueva posición. Al cierre, la jefatura de la nueva posición informa el resultado a GTC. En puestos medios y superiores, si no se supera la adecuación no se realiza la promoción.', fields: [
      { k: 'adecuacion', t: 'radio', label: 'Periodo', req: true, opts: opt('No aplica', '03 meses', '06 meses', 'Otro') },
      { k: 'adecuacion_meses', t: 'number', label: 'Meses', req: true, min: 1, max: 12, w: 'third', show: (d) => d.adecuacion === 'Otro' },
      { k: 'adec_inicio', t: 'date', label: 'Inicio', req: true, w: 'third', show: conAdecuacion },
      { k: 'adec_fin', t: 'calc', label: 'Fin (automático)', w: 'third', show: conAdecuacion,
        calc: (d) => { const m = d.adecuacion === 'Otro' ? d.adecuacion_meses : parseInt(d.adecuacion, 10); return addMonthsSafe(d.adec_inicio, m) || '—'; } },
      { k: 'bono', t: 'radio', label: 'Bono de adecuación', req: true, opts: opt('No aplica', 'Sí'), w: 'half', show: conAdecuacion },
      { k: 'bono_monto', t: 'money', label: 'Monto del bono', req: true, w: 'half', show: (d) => conAdecuacion(d) && d.bono === 'Sí' },
    ] },
    { id: 'm5', title: 'Validaciones previas', by: ['analista', 'gtc'], fields: [
      { k: 'validaciones', t: 'matrix', label: 'Validaciones', req: true, rows: ['Perfil/MOF y funciones comunicadas', 'Requisitos profesionales / habilitación verificados', 'Jornada / turno validado'], opts: opt('Verificado', 'No aplica') },
      { k: 'aprob_adicional', t: 'checks', label: 'Aprobación adicional', req: true,
        opts: opt('No aplica', 'Dirección Administrativa / GG (impacto económico u organizacional)', 'Revisión Legal / Relaciones Laborales') },
    ] },
    { id: 'm7', title: 'Cierre del periodo de adecuación', by: ['jefe', 'gtc'], show: conAdecuacion, unlockAfter: (ctx, form) => !!form.signatures?.gtc, fields: [
      { k: 'cierre_responsable', t: 'text', label: 'Responsable', req: true, w: 'half' },
      { k: 'cierre_fecha', t: 'date', label: 'Fecha', req: true, w: 'half' },
      { k: 'cierre_resultado', t: 'radio', label: 'Resultado', req: true, opts: opt('Apto', 'No apto', 'Ampliación autorizada') },
      { k: 'cierre_ampliacion', t: 'number', label: 'Meses de ampliación', req: true, min: 1, max: 6, show: (d) => d.cierre_resultado === 'Ampliación autorizada' },
      { k: 'no_confirma', t: 'radio', label: 'Si no se confirma', req: true, opts: opt('Retorno a posición anterior', 'Otra condición formalmente acordada'), show: (d) => d.cierre_resultado === 'No apto' },
      { k: 'no_confirma_otro', t: 'text', label: 'Condición acordada', req: true, show: (d) => d.no_confirma === 'Otra condición formalmente acordada' },
    ] },
    { id: 'm8', title: 'Control de ejecución · RR.HH.', by: ['analista', 'gtc'], unlockAfter: (ctx, form) => !!form.signatures?.gtc, fields: [
      { k: 'f_requerimiento', t: 'date', label: 'Requerimiento', req: true, w: 'half' },
      { k: 'f_recepcion', t: 'date', label: 'Recepción RR.HH.', req: true, w: 'half' },
      { k: 'ejecucion', t: 'checks', label: 'Ejecutado', req: true, all: true, opts: opt('Planilla', 'Asistencia / turno', 'Organigrama / directorio', 'Accesos', 'Documento archivado', 'Comunicación emitida') },
      { k: 'observaciones', t: 'textarea', label: 'Observaciones', rows: 2 },
    ] },
  ],
  validate(d) {
    const e = [];
    const p = d.posiciones || {};
    const ra = Number(p['Remuneración (S/)']?.[0]), rn = Number(p['Remuneración (S/)']?.[1]);
    const adic = d.aprob_adicional || [];
    if (rn > ra && adic.includes('No aplica')) e.push({ k: 'aprob_adicional', m: 'La nueva remuneración es mayor: requiere aprobación de Dirección Administrativa / GG.' });
    if (adic.includes('No aplica') && adic.length > 1) e.push({ k: 'aprob_adicional', m: '“No aplica” no puede combinarse con otra aprobación.' });
    if (d.adec_inicio && d.fecha_efectiva && d.adec_inicio < d.fecha_efectiva) e.push({ k: 'adec_inicio', m: 'La adecuación no puede iniciar antes de la fecha efectiva.' });
    return e;
  },
  signatures: [
    { key: 'colaborador', label: 'Colaborador', roles: ['colaborador', 'analista'], requires: ['m1', 'm2', 'm3', 'm4', 'm5'], tablet: true },
    { key: 'jefe_actual', label: 'Jefe actual', roles: ['jefe'], requires: ['m1', 'm2', 'm3', 'm4', 'm5'] },
    { key: 'jefe_nuevo', label: 'Jefe de la nueva posición', roles: ['jefe'], requires: ['m1', 'm2', 'm3', 'm4', 'm5'] },
    { key: 'adicional', label: 'Dirección Administrativa / GG', roles: ['da', 'gg'], requires: ['m1', 'm2', 'm3', 'm4', 'm5'], decision: ['Aprobado', 'Observado'],
      when: (d) => (d.aprob_adicional || []).some((x) => x.startsWith('Dirección')) },
    { key: 'legal', label: 'Legal / Relaciones Laborales', roles: ['gtc', 'da'], requires: ['m1', 'm2', 'm3', 'm4', 'm5'], when: (d) => (d.aprob_adicional || []).some((x) => x.startsWith('Revisión')) },
    { key: 'gtc', label: 'Jefe de GTC', roles: ['gtc'], requires: ['m1', 'm2', 'm3', 'm4', 'm5'], after: ['colaborador', 'jefe_actual', 'jefe_nuevo', 'adicional', 'legal'] },
    { key: 'ejecucion', label: 'RR.HH. · ejecución registrada', roles: ['analista', 'gtc'], requires: ['m7', 'm8'], after: ['gtc'] },
  ],
  conformidad: { entrega: 'colaborador', recibe: 'gtc', textoEntrega: 'El colaborador declara haber recibido información sobre la nueva posición, funciones, jefatura, remuneración, jornada, fecha efectiva y condiciones de adecuación.', textoRecibe: 'GTC confirma que el movimiento cuenta con las aprobaciones y lo ejecuta.' },
};

export const FORMS = { RQ, PERFIL, FICHA, MOV };
export { calcularFicha, aplicaEntrevistaFinal };
