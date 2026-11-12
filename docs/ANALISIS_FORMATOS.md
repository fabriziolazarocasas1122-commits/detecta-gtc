# Análisis campo por campo de los formatos de GTC

Contraste de los cuatro formatos físicos (los únicos que digitaliza la plataforma) con los procedimientos **PRC-GTC-01**, **PRC-GTC-02** y **PRC-GTC-03** (V.01 · 01/09/2026), y de cómo quedó cada campo en la plataforma.

Leyenda: **Obl.** = obligatorio en la plataforma · **Cond.** = obligatorio solo si se cumple la condición indicada · **Auto** = calculado por el sistema.

---

## 1. RQ · Requerimiento de Personal (emisión 12/09/23)

| Campo del formato físico | Plataforma | Regla |
|---|---|---|
| Tipo de contrato: D.L. 728 (5ta) / Otra modalidad | Opción única | Obl. · si es “Otra”, se exige especificar |
| Modalidad de ingreso: Contrato / Temporal / Suplencia | Opción única | Obl. |
| Categoría ocupacional (6 opciones) | Opción única | Obl. · define DA o DM como director evaluador |
| — *(no existe)* | **Motivo**: reemplazo, suplencia, ampliación, puesto nuevo | Obl. · **campo nuevo** exigido por PRC-GTC-01 paso 1 |
| — *(no existe)* | **Modalidad de atracción**: interna, externa, mixta | Obl. · **campo nuevo** exigido por PRC-GTC-01 paso 1 |
| Nombre del puesto / Área | Texto / lista de áreas | Obl. |
| Nueva posición SÍ / NO | Auto (SÍ si el motivo es ampliación o puesto nuevo) | Ya no se marca a mano |
| Reemplaza a: nombre | Texto | Cond. reemplazo/suplencia |
| Motivo del reemplazo (6 opciones) + especificar | Opción única + texto | Cond. reemplazo/suplencia · aviso Ley 29733 |
| Fecha requerida inicio labores | Fecha | Obl. · no permite fechas pasadas |
| Jefe inmediato: nombre / puesto | Texto (precargado del usuario) | Obl. |
| TAS (Adm. 15 días / Asist. 10 días) | Auto según categoría | Solo referencia (ver observación 3) |
| Sistema de trabajo 48 h/sem · 150 h/mes | Opción única | Obl. |
| Actividades / justificación | Texto largo | Obl. · mínimo 40 caracteres |
| Profesión, experiencia mínima | Texto | Obl. |
| Especialidad ¿cuál? | Texto | Opcional |
| Oficina ubicada en | Texto | Obl. |
| Equipos (PC, Laptop, anexo, celular, sellos) × Se requiere / No | Matriz | Obl. todas las filas |
| “Adjuntar descripción de puesto (posición nueva)” | Reemplazado por el formato digital GTC.PRS.04 | Se activa solo para puesto nuevo |
| Datos del solicitante: nombre, cargo, fecha, firma | Firma digital “Solicitante” | Nombre, cargo y fecha se toman de la firma |
| Autorizaciones: Jefatura RRHH, DA, DM, GG | Firmas condicionales | DA/DM y GG solo en ampliación y puesto nuevo, con decisión Aprobado / Observado (/ Desaprobado en GG) |
| Registro de recepción RRHH: recibido por, fecha, firma | Integrado en la firma “Jefatura de GTC” | La firma fija la fecha de inicio del plazo |
| Remuneración: grado, moneda, rango min/prom/max, aprobada, V°B° | Sección exclusiva de GTC | Obl. · valida que promedio y aprobada estén dentro del rango |
| — *(no existe)* | Tipo de puesto (Anexo 5), grupo ocupacional (Anexo 2), analista asignada | **Campos nuevos** que activan plazos, entrevistadores y bandeja de la analista |

## 2. GTC.PRS.04 · Levantamiento de información de funciones y perfil del puesto

| Sección | Campos | Regla |
|---|---|---|
| I. Datos de la nueva posición | Puesto, área, jefatura, fecha, reporta a, supervisa a, N.º posiciones, sede | Todos Obl. · precarga desde el RQ |
| II. Justificación | ¿Por qué?, ¿qué problema resuelve?, ¿puesto similar? + cuál | Obl. · “cuál” Cond. si responde Sí |
| III. Objetivo | Una frase | Obl. |
| IV. Responsabilidades | Tabla de hasta 10 filas: qué, resultado, frecuencia | Obl. mínimo 3 filas, máximo 10 |
| V. Coordinación | Tabla área / para qué / frecuencia; reportes; decisiones | Obl. |
| VI. Perfil mínimo | Nivel, carreras, especialización, años y tipo de experiencia, conocimientos, sistemas, requisitos obligatorios, otros | Obl. excepto especialización, requisitos obligatorios y otros |
| VII. Habilidades clave | 12 opciones + otra | Obl. 1 a 5 (bloquea la sexta) |
| VIII. Validación GTC | Duplicidad + obs., ¿corresponde crear?, documentos a actualizar, observación | Obl. · solo “Sí” permite firmar |
| — *(nuevo)* IX. Área de Procesos | Funciones validadas, MOF actualizado, organigrama, observaciones | Cierra el paso 9 de PRC-GTC-01 |
| Firmas | Jefatura solicitante, Dirección/Gerencia revisora, GTC (+ Procesos) | En ese orden |

## 3. GTC.PRS.02 · Ficha de evaluación – entrevista en cadena

| Sección | Campos | Regla |
|---|---|---|
| 1. Datos generales | Candidato, puesto, área, jefatura, entrevistador RRHH, fecha, tipo de vacante, modalidad, disponibilidad, perfil, horario, remuneración | Obl. · precarga desde RQ y candidato |
| 2. Requisitos críticos | 6 requisitos × Cumple/No cumple/N/A × ¿Crítico? × evidencia | Obl. · evidencia Cond. si “No cumple” |
| 3. Entrevista RRHH (30) | 6 criterios 1–5 + evidencia, ¿continúa? | Obl. · evidencia Obl. en notas 1, 2 y 5 · guía 24–30 / 18–23 / <18 automática |
| 4. Técnica (50) | Entrevistador, cargo, fecha, área, 5 criterios | Solo se habilita tras “Remitir a jefatura” · ×2 automático |
| 5. Final (20) | ¿Aplica?, 4 criterios | Precargado según Anexo 2 |
| 6. Resultado | Consolidado, ¿información pendiente?, resultado, observación, recomendación | Resultado Auto: APTO / APTO CON OBS. / NO APTO / CONTINÚA · no permite “Contratar” si no es apto |
| Firmas | Jefatura solicitante, entrevistador final (si aplica), Responsable RRHH | La jefatura firma antes que RRHH (devolución en 24 h) |

## 4. GTC.PRS.03 · Formato de movimiento interno de personal

| Sección | Campos | Regla |
|---|---|---|
| 1. Colaborador | Apellidos y nombres, DNI | Obl. · DNI de 8 dígitos |
| 2. Movimiento | 6 tipos + otro, motivo / sustento | Obl. · sustento mínimo 30 caracteres |
| 3. Actual / nueva | Área, puesto, jefe, remuneración, jornada × actual / nueva; fecha efectiva | Obl. todas las casillas |
| 4. Adecuación | No aplica / 3 / 6 / otro (meses), inicio, fin, bono | Fin Auto · inicio no anterior a la fecha efectiva |
| Cierre del periodo | Responsable, fecha, resultado, ampliación, si no se confirma | Se habilita después de la firma de GTC |
| 5. Validaciones previas | 3 validaciones; aprobación adicional | Obl. · si sube la remuneración exige DA/GG |
| 6. Conformidad | Colaborador, jefe actual, jefe nueva posición, jefe GTC (+ DA/GG, Legal si aplica) | Firmas condicionales |
| 7. Control de ejecución | Fechas, 6 acciones, observaciones | Obl. todas las acciones |

---

## Observaciones e inconsistencias encontradas

1. **El RQ no recoge el motivo ni la modalidad de atracción**, que PRC-GTC-01 paso 1 exige. Se agregaron como campos obligatorios.
2. **La firma de Dirección Médica.** El RQ dice “Dirección Médica (para todo personal asistencial)”, pero PRC-GTC-01 §6.1 indica que reemplazos y suplencias no pasan por aprobación. La plataforma sigue el procedimiento y deja un parámetro en *Usuarios y datos* para exigir la firma de DM en todo asistencial, si así se decide.
3. **Plazos distintos.** El RQ fija TAS de 15 días (administrativo) y 10 días (asistencial); el Anexo 5 de PRC-GTC-02 fija 10, 21 y 35 días útiles según el tipo de puesto. La plataforma mide el plazo con el Anexo 5 y muestra el TAS solo como referencia. Conviene unificar.
4. **Horario en la ficha de entrevista.** GTC.PRS.02 dice “150 horas semanales”; el RQ dice “150 horas mensuales”. 150 horas semanales excede el límite legal de jornada, así que se corrigió a mensuales.
5. **Código duplicado.** El archivo del levantamiento de perfil se llama GTC.PRS.04, pero su encabezado dice GTC.PRS.01. Se usó GTC.PRS.04.
6. **Nombre del formato de movimiento.** PRC-GTC-03 lo llama “Formato de movimiento de personal” y el formato se titula “Formato de movimiento interno de personal (GTC.PRS.03)”.
7. **El RQ conserva la nomenclatura anterior**: “Recursos Humanos” en lugar de Gestión del Talento y Cultura, y no tiene código SIG ni versión como los demás formatos.
8. **Confidencialidad de la ficha.** PRC-GTC-02 §6.1 dice que la Ficha de Entrevista en Cadena se maneja solo en físico y no se envía por correo. Al digitalizarla, el procedimiento debe actualizarse (control de cambios) para indicar que se maneja en la plataforma con acceso restringido. La plataforma ya restringe su visualización a GTC, la jefatura y los evaluadores del Anexo 2.
9. **Medios de registro.** Las tablas 9.1 de los tres procedimientos declaran los registros como “Físico”. Con la plataforma pasan a “Digital”; también requiere actualización documental.
10. **Ficha de entrevista RRHH.** El encabezado de la sección 3 dice “Entrevista RRHH – 30 puntos” y el formato usa “Responsable RRHH”; en los procedimientos el rol se llama Analista de Selección / GTC. Es solo nomenclatura.
