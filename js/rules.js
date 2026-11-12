// Reglas de negocio extraídas de PRC-GTC-01, PRC-GTC-02, PRC-GTC-03 y de los formatos.
// Todo lo que aquí está parametrizado puede ajustarse sin tocar el resto del código.
import { normalize, businessDaysBetween } from './util.js';

export const CONFIG = {
  // PRC-GTC-01 §6.1: los reemplazos y suplencias NO pasan por aprobación DA/DM/GG.
  // El formato RQ indica "Dirección Médica (para todo personal asistencial)". Si la clínica
  // decide mantener esa firma también en reemplazos/suplencias asistenciales, poner true.
  DM_FIRMA_TODO_ASISTENCIAL: false,
  // PRC-GTC-02 paso 23: la jefatura devuelve la ficha en máximo 24 horas.
  HORAS_DEVOLUCION_FICHA: 24,
  // PRC-GTC-02 lineamiento "Reingresos": 1 año desde el cese.
  MESES_REINGRESO: 12,
  MAX_TERNA: 3,
};

export const ROLES = {
  jefe: 'Jefe inmediato',
  da: 'Director Administrativo',
  dm: 'Director Médico',
  gg: 'Gerente General',
  gtc: 'Jefe de GTC',
  analista: 'Analista de Selección',
  procesos: 'Área de Procesos',
  colaborador: 'Colaborador',
};

export const MOTIVOS = [
  { v: 'reemplazo', l: 'Reemplazo' },
  { v: 'suplencia', l: 'Suplencia' },
  { v: 'ampliacion', l: 'Ampliación' },
  { v: 'puesto_nuevo', l: 'Puesto nuevo' },
];
export const motivoLabel = (v) => MOTIVOS.find((m) => m.v === v)?.l || '—';

export const requiereAprobacion = (rq) => ['ampliacion', 'puesto_nuevo'].includes(rq?.motivo);
export const esAsistencial = (rq) => rq?.categoria === 'Asistencial';

// Director que evalúa la ampliación / puesto nuevo (PRC-GTC-01, paso a)
export function directorDeLinea(rq) {
  return esAsistencial(rq) || rq?.categoria === 'Residente' || rq?.categoria === 'Interno' ? 'dm' : 'da';
}

// Anexo 1 PRC-GTC-02: áreas con verificación crediticia
export const AREAS_INFOCORP = [
  'Call Center', 'Tesorería', 'Farmacia', 'Admisión Emergencia', 'Admisión Ambulatoria',
  'Admisión Hospitalaria', 'Admisión Quimioterapia', 'Cartas de Garantía',
  'Finanzas (cobranzas, facturación)', 'Logística', 'Gestión del Talento y Cultura',
];
export const requiereInfocorp = (area) => AREAS_INFOCORP.some((a) => normalize(a) === normalize(area));

export const AREAS = [
  ...AREAS_INFOCORP, 'Hospitalización', 'Emergencia', 'Centro Quirúrgico', 'UCI', 'Consulta Externa',
  'Laboratorio Clínico', 'Imagenología', 'Oncología', 'Nutrición', 'Dirección Médica',
  'Dirección Administrativa', 'Gerencia General', 'Procesos', 'Sistemas', 'Mantenimiento', 'Calidad',
].sort((a, b) => a.localeCompare(b, 'es'));

// Anexo 4 PRC-GTC-02: fuente primaria según puesto asistencial
const FP = [
  { re: /(tecnic[oa]).*(enfermer|farmac)/, fuente: 'MINEDU (títulos desde 2016) o constancia visada DRE/GRE (antes de 2016)', colegiado: false },
  { re: /(enfermer|quimic|farmaceut|tecnolog|medic|obstetr|psicolog|nutricion)/, fuente: 'SUNEDU (título universitario) + habilitación vigente en el colegio profesional', colegiado: true },
];
export function fuentePrimaria(puesto) {
  const p = normalize(puesto);
  const hit = FP.find((f) => f.re.test(p));
  return hit || null;
}

// Anexo 5 PRC-GTC-02: tiempos de atracción y selección (días útiles)
export const TIPOS_PUESTO = [
  { v: 'operativo', l: 'Operativo', dias: 10, ej: 'Admisionista, Auxiliar, Asistente, Enfermero de hospitalización, Secretaria, Técnico' },
  { v: 'medio', l: 'Mando medio o especializado', dias: 21, ej: 'Analista, Coordinador, Enfermero especialista, Supervisor' },
  { v: 'superior', l: 'Mando superior', dias: 35, ej: 'Asistente de Gerencia, Jefe' },
];
export function sugerirTipoPuesto(puesto) {
  const p = normalize(puesto);
  if (/(jefe|asistente de gerencia|gerente|director)/.test(p)) return 'superior';
  if (/(analista|coordinador|especialista|supervisor|encargad)/.test(p)) return 'medio';
  return 'operativo';
}
export function plazo(caso) {
  const tipo = TIPOS_PUESTO.find((t) => t.v === caso.tipoPuesto) || TIPOS_PUESTO[0];
  const inicio = caso.fechas?.validacionGTC;
  if (!inicio) return { tipo, usados: 0, total: tipo.dias, estado: 'pendiente' };
  const fin = caso.fechas?.bienvenida || undefined;
  const usados = businessDaysBetween(inicio, fin);
  const ratio = usados / tipo.dias;
  return { tipo, usados, total: tipo.dias, estado: fin ? 'cerrado' : ratio > 1 ? 'vencido' : ratio > 0.75 ? 'riesgo' : 'en_plazo' };
}

// Anexo 2 PRC-GTC-02: responsables de entrevistas según grupo ocupacional
export const GRUPOS_OCUP = [
  { v: 'base', l: 'Personal administrativo, de contacto y asistencial', entrevistan: ['Selección de Personal', 'Jefe del área solicitante'] },
  { v: 'coord', l: 'Coordinador, Supervisor, Encargado', entrevistan: ['Selección de Personal', 'Jefe del área solicitante', 'Director Administrativo (línea administrativa) o Director Médico (línea médica)'] },
  { v: 'jefe', l: 'Jefe de área', entrevistan: ['Jefatura GTC', 'Director Administrativo (línea administrativa) o Director Médico (línea médica)', 'Gerencia General'] },
  { v: 'da', l: 'Director Administrativo', entrevistan: ['Selección de Personal', 'Gerencia General'] },
  { v: 'dm', l: 'Director Médico', entrevistan: ['Selección de Personal', 'Gerencia General'] },
];
export const aplicaEntrevistaFinal = (grupo) => grupo && grupo !== 'base';

// GTC.PRS.02 – cálculo del resultado consolidado
export function calcularFicha(d = {}) {
  const sum = (keys) => keys.reduce((a, k) => a + (Number(d[k]) || 0), 0);
  const rrhhKeys = [1, 2, 3, 4, 5, 6].map((i) => `rr${i}`);
  const tecKeys = [1, 2, 3, 4, 5].map((i) => `tc${i}`);
  const finKeys = [1, 2, 3, 4].map((i) => `fn${i}`);
  const rrhh = sum(rrhhKeys);
  const tecnico = sum(tecKeys);
  const ponderado = tecnico * 2;
  const aplicaFinal = d.final_aplica === 'Sí';
  const final = aplicaFinal ? sum(finKeys) : 0;
  const base = aplicaFinal ? 100 : 80;
  const total = rrhh + ponderado + final;
  const pct = Math.round((total / base) * 1000) / 10;
  const tecPct = Math.round((tecnico / 25) * 1000) / 10;
  const criticos = (d.requisitos || []).filter((r) => r?.resultado === 'No cumple' && r?.critico === 'Sí');
  const completo = [...rrhhKeys, ...tecKeys, ...(aplicaFinal ? finKeys : [])].every((k) => Number(d[k]) > 0);
  let resultado;
  if (d.continua === 'No') resultado = 'NO APTO';
  else if (d.info_pendiente === 'Sí' || !completo) resultado = 'CONTINÚA EN EVALUACIÓN';
  else if (criticos.length || pct < 70 || tecPct < 72) resultado = 'NO APTO';
  else if (pct >= 80) resultado = 'APTO';
  else resultado = 'APTO CON OBSERVACIONES';
  return { rrhh, tecnico, ponderado, final, base, total, pct, tecPct, criticos: criticos.length, resultado, aplicaFinal, completo };
}

export function guiaRRHH(p) {
  if (!p) return '';
  if (p >= 24) return 'Sólido';
  if (p >= 18) return 'Cumple con observaciones';
  return 'Evidencia insuficiente';
}

// PRC-GTC-03 Anexo 1: expediente de ingreso
export const EXPEDIENTE = [
  { k: 'dni', l: 'Documento Nacional de Identidad (copia)' },
  { k: 'cv', l: 'CV documentado o CV certificado' },
  { k: 'estudios', l: 'Certificado de estudios, grado o título (copia)' },
  { k: 'colegiatura', l: 'Constancia de colegiatura y habilitación vigente; especialidad registrada, si corresponde', soloColegiado: true },
  { k: 'aptitud', l: 'Certificado de aptitud médica ocupacional' },
  { k: 'antecedentes', l: 'Informe de antecedentes policiales, penales y judiciales' },
  { k: 'derechohabientes', l: 'Documentos de derechohabientes para EsSalud', opcional: true },
  { k: 'pensiones', l: 'Constancia de afiliación al sistema de pensiones (ONP o AFP)' },
  { k: 'banco', l: 'Datos de cuenta bancaria para el pago de remuneraciones' },
  { k: 'foto', l: 'Fotografía tamaño carné' },
  { k: 'f_datos', l: 'Ficha de Datos Personales (firmada por el colaborador)' },
  { k: 'f_dolencia', l: 'Compromiso de Información de Evento o Dolencia Médica (archivo reservado)' },
  { k: 'f_dj', l: 'DJ de prestación de servicios en otro centro del sector salud o empleador' },
];

export { addMonths as addMonthsSafe } from './util.js';
