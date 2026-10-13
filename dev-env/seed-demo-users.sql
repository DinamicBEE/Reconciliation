-- Siembra de la DB local de desarrollo con las 26 cuentas demo del portal (ids 2-27), los 5 roles de la
-- matriz 7.16, el catálogo de subsidiarias/ubicaciones y los catálogos organizacionales (cargo, puesto,
-- departamento, área) con su asignación por empleado. Es idempotente.
-- Se aplica DESPUÉS de levantar la pila de DEV (db-migration ya creó el esquema; el auth-service ya
-- creó el administrador id 1). NO es una migración del backend: vive en este repo (dev-env/).
--
-- Contraseñas: son las de desarrollo que muestra la pantalla de login (hash bcrypt, nunca en claro).
-- Matriz de permisos: se AGREGA lo que el front usa (7.16) además de lo que siembra DEV — p. ej.
-- 'view_catalogs', que DEV no define (ver docs/analisis-front-vs-back-dev_v3.pdf, §5.1-5.2).
-- Los JSON de `empleado` aún traen departamento/area/puesto de la DB anterior: json_populate_recordset
-- ignora esas llaves (las columnas ya no existen); esos valores ahora viven en los catálogos de abajo.
BEGIN;

-- Catálogos de organización
INSERT INTO subsidiaria SELECT * FROM json_populate_recordset(null::subsidiaria, $seed$[{"id":1,"brand_id_api":1,"nombre":"Conciliación Bancaria","razon_social":"Conciliación Bancaria SA de CV","nit":"RFC-CB010101AAA","created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.36334+00:00","modified_at":"2026-09-30T18:14:37.36334+00:00","enabled":true}]$seed$::json) ON CONFLICT (id) DO NOTHING;
INSERT INTO ubicacion SELECT * FROM json_populate_recordset(null::ubicacion, $seed$[{"id":1,"subsidiaria_id":1,"store_id_api":1,"nombre":"Sucursal Polanco","prefijo_fiscal":"POLE","created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.369057+00:00","modified_at":"2026-09-30T18:14:37.369057+00:00","enabled":true}, 
 {"id":2,"subsidiaria_id":1,"store_id_api":2,"nombre":"Sucursal Condesa","prefijo_fiscal":"CONE","created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.369057+00:00","modified_at":"2026-09-30T18:14:37.369057+00:00","enabled":true}, 
 {"id":3,"subsidiaria_id":1,"store_id_api":3,"nombre":"Sucursal Roma","prefijo_fiscal":"ROME","created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.369057+00:00","modified_at":"2026-09-30T18:14:37.369057+00:00","enabled":true}, 
 {"id":4,"subsidiaria_id":1,"store_id_api":4,"nombre":"Sucursal Centro","prefijo_fiscal":"CENE","created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.369057+00:00","modified_at":"2026-09-30T18:14:37.369057+00:00","enabled":true}]$seed$::json) ON CONFLICT (id) DO NOTHING;

-- Permisos que el front usa y DEV no siembra
INSERT INTO app_permission (code, description, module)
SELECT code, description, module FROM json_to_recordset($seed$[{"code":"view_catalogs","description":"Consultar catalogos cargados","module":"Catalogos"}]$seed$::json) AS x(code text, description text, module text)
ON CONFLICT (code) DO NOTHING;

-- Roles: DEV ya no siembra roles predefinidos (los crea el usuario y no hay POST /roles todavía), así que
-- se siembran aquí los 5 de la matriz 7.16 que usan las cuentas demo.
INSERT INTO app_role (code, name) VALUES
  ('ADMIN', 'Administrador'),
  ('ALTAS', 'Encargado de altas de usuarios'),
  ('CONTABILIDAD', 'Contabilidad'),
  ('TESORERIA', 'Tesorería'),
  ('COSTOS', 'Costos')
ON CONFLICT (code) DO NOTHING;

-- Matriz rol → permisos por defecto (aditiva)
INSERT INTO app_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM json_to_recordset($seed$[{"role_code":"ADMIN","perm_code":"view_dashboard"}, 
 {"role_code":"ADMIN","perm_code":"capture_sales"}, 
 {"role_code":"ADMIN","perm_code":"view_reconciliation"}, 
 {"role_code":"ADMIN","perm_code":"manage_differences"}, 
 {"role_code":"ADMIN","perm_code":"import_settlements"}, 
 {"role_code":"ADMIN","perm_code":"export_reports"}, 
 {"role_code":"ADMIN","perm_code":"manage_users"}, 
 {"role_code":"ADMIN","perm_code":"manage_roles"}, 
 {"role_code":"ADMIN","perm_code":"view_audit_log"}, 
 {"role_code":"ALTAS","perm_code":"manage_users"}, 
 {"role_code":"ALTAS","perm_code":"manage_roles"}, 
 {"role_code":"ALTAS","perm_code":"view_audit_log"}, 
 {"role_code":"CONTABILIDAD","perm_code":"view_dashboard"}, 
 {"role_code":"TESORERIA","perm_code":"view_reconciliation"}, 
 {"role_code":"TESORERIA","perm_code":"manage_differences"}, 
 {"role_code":"TESORERIA","perm_code":"import_settlements"}, 
 {"role_code":"TESORERIA","perm_code":"export_reports"}, 
 {"role_code":"ADMIN","perm_code":"view_catalogs"}, 
 {"role_code":"CONTABILIDAD","perm_code":"view_catalogs"}, 
 {"role_code":"TESORERIA","perm_code":"view_catalogs"}, 
 {"role_code":"COSTOS","perm_code":"view_catalogs"}, 
 {"role_code":"TESORERIA","perm_code":"view_dashboard"}, 
 {"role_code":"COSTOS","perm_code":"view_dashboard"}, 
 {"role_code":"COSTOS","perm_code":"export_reports"}, 
 {"role_code":"CONTABILIDAD","perm_code":"export_reports"}]$seed$::json) AS x(role_code text, perm_code text)
JOIN app_role r ON r.code = x.role_code JOIN app_permission p ON p.code = x.perm_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Empleados, cuentas, pertenencia y acceso
INSERT INTO empleado SELECT * FROM json_populate_recordset(null::empleado, $seed$[{"id":2,"first_name":"Administrador","last_name":"Principal","phone":"+52 55 1234 5678","supervisor_id":null,"departamento":null,"area":null,"puesto":null,"employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.37537+00:00","modified_at":"2026-09-30T18:14:37.37537+00:00","enabled":true}, 
 {"id":3,"first_name":"Carlos","last_name":"Medina","phone":"+52 55 6789 0123","supervisor_id":2,"departamento":null,"area":null,"puesto":null,"employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.394004+00:00","modified_at":"2026-09-30T18:14:37.394004+00:00","enabled":true}, 
 {"id":4,"first_name":"Roberto","last_name":"Sanchez","phone":"+52 55 0123 4567","supervisor_id":2,"departamento":null,"area":null,"puesto":null,"employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.403252+00:00","modified_at":"2026-09-30T18:14:37.403252+00:00","enabled":true}, 
 {"id":5,"first_name":"Gabriela","last_name":"Vargas","phone":"+52 55 7788 9900","supervisor_id":8,"departamento":null,"area":null,"puesto":null,"employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.412707+00:00","modified_at":"2026-09-30T18:14:37.412707+00:00","enabled":true}, 
 {"id":6,"first_name":"Laura","last_name":"Pineda","phone":"+52 55 5678 0066","supervisor_id":2,"departamento":null,"area":null,"puesto":null,"employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.428371+00:00","modified_at":"2026-09-30T18:14:37.428371+00:00","enabled":true}, 
 {"id":7,"first_name":"Ana","last_name":"Martínez","phone":"+52 55 2345 6789","supervisor_id":2,"departamento":"Finanzas","area":"Conciliación Bancaria","puesto":"Analista de Conciliación","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":"Femenino","city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.699627+00:00","modified_at":"2026-09-30T18:48:46.699627+00:00","enabled":true}, 
 {"id":8,"first_name":"Daniela","last_name":"Torres","phone":"+52 55 3456 7890","supervisor_id":2,"departamento":"Finanzas","area":"Conciliación Bancaria","puesto":"Supervisor de Conciliación","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.80269+00:00","modified_at":"2026-09-30T18:48:46.80269+00:00","enabled":true}, 
 {"id":9,"first_name":"Jorge","last_name":"Ramírez","phone":"+52 55 4567 8901","supervisor_id":8,"departamento":"Finanzas","area":"Conciliación Bancaria","puesto":"Analista de Conciliación","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.825413+00:00","modified_at":"2026-09-30T18:48:46.825413+00:00","enabled":true}, 
 {"id":10,"first_name":"Marina","last_name":"López","phone":"+52 55 5678 9012","supervisor_id":8,"departamento":"Finanzas","area":"Conciliación Bancaria","puesto":"Analista de Conciliación","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.848529+00:00","modified_at":"2026-09-30T18:48:46.848529+00:00","enabled":true}, 
 {"id":11,"first_name":"Sofía","last_name":"Hernández","phone":"+52 55 7890 1234","supervisor_id":8,"departamento":"Finanzas","area":"Conciliación Bancaria","puesto":"Analista de Conciliación","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.874532+00:00","modified_at":"2026-09-30T18:48:46.874532+00:00","enabled":true}, 
 {"id":12,"first_name":"Luis","last_name":"Fernández","phone":"+52 55 8901 2345","supervisor_id":2,"departamento":"Finanzas","area":"Tesorería","puesto":"Supervisor de Tesorería","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.901291+00:00","modified_at":"2026-09-30T18:48:46.901291+00:00","enabled":true}, 
 {"id":13,"first_name":"Fernanda","last_name":"Cruz","phone":"+52 55 9012 3456","supervisor_id":8,"departamento":"Finanzas","area":"Conciliación Bancaria","puesto":"Analista de Conciliación","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.926181+00:00","modified_at":"2026-09-30T18:48:46.926181+00:00","enabled":true}, 
 {"id":14,"first_name":"Patricia","last_name":"Gómez","phone":"+52 55 1122 3344","supervisor_id":2,"departamento":"Auditoría Interna","area":"Cumplimiento","puesto":"Auditor de Procesos","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.947339+00:00","modified_at":"2026-09-30T18:48:46.947339+00:00","enabled":true}, 
 {"id":15,"first_name":"Fernando","last_name":"Castillo","phone":"+52 55 2233 4455","supervisor_id":8,"departamento":"Finanzas","area":"Conciliación Bancaria","puesto":"Analista de Conciliación","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.969119+00:00","modified_at":"2026-09-30T18:48:46.969119+00:00","enabled":true}, 
 {"id":16,"first_name":"Alejandra","last_name":"Reyes","phone":"+52 55 3344 5566","supervisor_id":8,"departamento":"Finanzas","area":"Contabilidad","puesto":"Analista de Conciliación","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.992254+00:00","modified_at":"2026-09-30T18:48:46.992254+00:00","enabled":true}, 
 {"id":17,"first_name":"Diego","last_name":"Morales","phone":"+52 55 4455 6677","supervisor_id":2,"departamento":"Tecnología","area":"Sistemas","puesto":"Supervisor de Conciliación","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.013395+00:00","modified_at":"2026-09-30T18:48:47.013395+00:00","enabled":true}, 
 {"id":18,"first_name":"Valeria","last_name":"Ortiz","phone":"+52 55 5566 7788","supervisor_id":8,"departamento":"Finanzas","area":"Conciliación Bancaria","puesto":"Analista de Conciliación","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.037405+00:00","modified_at":"2026-09-30T18:48:47.037405+00:00","enabled":true}, 
 {"id":19,"first_name":"Ricardo","last_name":"Jiménez","phone":"+52 55 6677 8899","supervisor_id":2,"departamento":"Auditoría Interna","area":"Cumplimiento","puesto":"Auditor de Procesos","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.058815+00:00","modified_at":"2026-09-30T18:48:47.058815+00:00","enabled":true}, 
 {"id":20,"first_name":"Andrés","last_name":"Molina","phone":"+52 55 8899 0011","supervisor_id":2,"departamento":"Tecnología","area":"Sistemas","puesto":"Supervisor de Conciliación","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.08171+00:00","modified_at":"2026-09-30T18:48:47.08171+00:00","enabled":true}, 
 {"id":21,"first_name":"Karla","last_name":"Delgado","phone":"+52 55 9900 1122","supervisor_id":8,"departamento":"Finanzas","area":"Conciliación Bancaria","puesto":"Analista de Conciliación","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.101335+00:00","modified_at":"2026-09-30T18:48:47.101335+00:00","enabled":true}, 
 {"id":22,"first_name":"Emilio","last_name":"Navarro","phone":"+52 55 0011 2233","supervisor_id":2,"departamento":"Auditoría Interna","area":"Cumplimiento","puesto":"Auditor de Procesos","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.12067+00:00","modified_at":"2026-09-30T18:48:47.12067+00:00","enabled":true}, 
 {"id":23,"first_name":"Paola","last_name":"Aguilar","phone":"+52 55 1234 0011","supervisor_id":8,"departamento":"Recursos Humanos","area":"Contabilidad","puesto":"Analista de Conciliación","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.141741+00:00","modified_at":"2026-09-30T18:48:47.141741+00:00","enabled":true}, 
 {"id":24,"first_name":"Héctor","last_name":"Ibarra","phone":"+52 55 2345 0022","supervisor_id":8,"departamento":"Finanzas","area":"Conciliación Bancaria","puesto":"Analista de Conciliación","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.161377+00:00","modified_at":"2026-09-30T18:48:47.161377+00:00","enabled":true}, 
 {"id":25,"first_name":"Renata","last_name":"Campos","phone":"+52 55 3456 0033","supervisor_id":2,"departamento":"Operaciones","area":"Tesorería","puesto":"Supervisor de Tesorería","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.183543+00:00","modified_at":"2026-09-30T18:48:47.183543+00:00","enabled":true}, 
 {"id":26,"first_name":"Iván","last_name":"Salazar","phone":"+52 55 4567 0044","supervisor_id":8,"departamento":"Finanzas","area":"Conciliación Bancaria","puesto":"Analista de Conciliación","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.208049+00:00","modified_at":"2026-09-30T18:48:47.208049+00:00","enabled":true}, 
 {"id":27,"first_name":"Camila","last_name":"Rangel","phone":"+52 55 5678 0055","supervisor_id":2,"departamento":"Auditoría Interna","area":"Cumplimiento","puesto":"Auditor de Procesos","employee_code":null,"hire_date":null,"contract_end_date":null,"birth_date":null,"ssn":null,"gender":null,"city":null,"state":null,"postal_code":null,"street1":null,"street2":null,"interior_number":null,"exterior_number":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.230617+00:00","modified_at":"2026-09-30T18:48:47.230617+00:00","enabled":true}]$seed$::json) ON CONFLICT (id) DO NOTHING;
INSERT INTO app_user SELECT * FROM json_populate_recordset(null::app_user, $seed$[{"id":2,"email":"admin@conciliacion.mx","password_hash":"$2a$06$xVMIlZ4iFahZ9Ki4gJUbNOswQPmjwFt9VcQ51r210JOFh7h5lpQzG","empleado_id":2,"status":"ACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":"2026-10-06T23:41:44.217314+00:00","created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.37537+00:00","modified_at":"2026-10-06T23:41:44.217318+00:00","enabled":true,"email_verified":true}, 
 {"id":3,"email":"carlos.medina@conciliacion.mx","password_hash":"$2a$06$i0OlRpvoQU5xw47AdUzvcePxRpCNAJhB8LSvuadM2XL1kzjeqAEMW","empleado_id":3,"status":"ACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":"2026-10-06T23:39:49.809044+00:00","created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.394004+00:00","modified_at":"2026-10-06T23:39:49.809048+00:00","enabled":true,"email_verified":false}, 
 {"id":4,"email":"roberto.sanchez@conciliacion.mx","password_hash":"$2a$06$TxgTX/5VinOaONg4bXJFfOcLsFfyVRdP3VTYkkGq3aHQAAaPvSzrm","empleado_id":4,"status":"ACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":"2026-09-30T22:29:38.773465+00:00","created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.403252+00:00","modified_at":"2026-09-30T22:29:38.773465+00:00","enabled":true,"email_verified":false}, 
 {"id":5,"email":"gabriela.vargas@conciliacion.mx","password_hash":"$2a$10$5hRX6JVUCrydEWCXuT2dIeRQvt8qDRkpxM7vOJ4VFZIMK2JKpZQ0a","empleado_id":5,"status":"ACTIVE","failed_attempts":4,"must_change_password":false,"locked_at":null,"last_login_at":"2026-10-01T22:55:20.388535+00:00","created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.412707+00:00","modified_at":"2026-10-06T23:39:44.216575+00:00","enabled":true,"email_verified":false}, 
 {"id":6,"email":"laura.pineda@conciliacion.mx","password_hash":"$2a$06$T6ZjuCAVbTKhIGMhB6En3epN0Icst0h4MdeDtXfmvkIQ3OT0pCEtO","empleado_id":6,"status":"ACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":"2026-10-01T22:54:04.483417+00:00","created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.428371+00:00","modified_at":"2026-10-01T22:54:04.48342+00:00","enabled":true,"email_verified":false}, 
 {"id":7,"email":"analista@conciliacion.mx","password_hash":"$2a$06$4.OJ.rgU1/I9FXbsCBtP9uMGSgMtFwwEJ8wz9wVhwWWIEUD0nHJKq","empleado_id":7,"status":"ACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.699627+00:00","modified_at":"2026-09-30T19:33:09.930678+00:00","enabled":true,"email_verified":true}, 
 {"id":8,"email":"daniela.torres@conciliacion.mx","password_hash":"$2a$06$zOvbTSawtp5HLY/iERnB.ezxnZ4NrEVluo6sfNh8wdiK7LtURqNRe","empleado_id":8,"status":"ACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.80269+00:00","modified_at":"2026-09-30T18:48:46.80269+00:00","enabled":true,"email_verified":true}, 
 {"id":9,"email":"jorge.ramirez@conciliacion.mx","password_hash":"$2a$06$wr9kx0vhg4bcZTiGzjRM0uN.dQbJhH6/QG0GrUnCsFIGYFolEKOaC","empleado_id":9,"status":"ACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.825413+00:00","modified_at":"2026-09-30T18:48:46.825413+00:00","enabled":true,"email_verified":true}, 
 {"id":10,"email":"marina.lopez@conciliacion.mx","password_hash":"$2a$06$jAVDpYj9GASQ5FA7oQmCb.LbJRqGGBopsrXn/4NOQCY3Glsbtwd7K","empleado_id":10,"status":"LOCKED","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.848529+00:00","modified_at":"2026-09-30T18:48:46.848529+00:00","enabled":true,"email_verified":true}, 
 {"id":11,"email":"sofia.hernandez@conciliacion.mx","password_hash":"$2a$06$/ExdAUVzGMBPtMYdi5n9Iuy9LBUBiXVqobrB.LxpsGBAYe1Hlna6C","empleado_id":11,"status":"ACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.874532+00:00","modified_at":"2026-09-30T18:48:46.874532+00:00","enabled":true,"email_verified":false}, 
 {"id":12,"email":"luis.fernandez@conciliacion.mx","password_hash":"$2a$06$flKKWemN1HuMVj5aABnzkOuN7Sg.Qrsf7ZEaD6Y8dVJVXQbgcdvcm","empleado_id":12,"status":"INACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.901291+00:00","modified_at":"2026-09-30T18:48:46.901291+00:00","enabled":true,"email_verified":true}, 
 {"id":13,"email":"fernanda.cruz@conciliacion.mx","password_hash":"$2a$06$m4glykIKzO7aGcpyq.NdzeBBRHMXVQqw96Ntc2mIMlA5dLPV993U6","empleado_id":13,"status":"ACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.926181+00:00","modified_at":"2026-09-30T18:48:46.926181+00:00","enabled":true,"email_verified":true}, 
 {"id":14,"email":"patricia.gomez@conciliacion.mx","password_hash":"$2a$06$jbhgYnbdUYY.j1m9dXoUOOpRqH9Ix7qK7C7OFJoNnaWjnqgHj054C","empleado_id":14,"status":"ACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.947339+00:00","modified_at":"2026-09-30T18:48:46.947339+00:00","enabled":true,"email_verified":true}, 
 {"id":15,"email":"fernando.castillo@conciliacion.mx","password_hash":"$2a$06$F/TiuMbHsib5b.X3kMaruOQtZ8bV7gZcCzkA3R2WkmAkFOka4ePGe","empleado_id":15,"status":"INACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.969119+00:00","modified_at":"2026-09-30T18:48:46.969119+00:00","enabled":true,"email_verified":true}, 
 {"id":16,"email":"alejandra.reyes@conciliacion.mx","password_hash":"$2a$06$n/qDBH2G6QMErQJymEIvHejZR3uR5LkfdIUVWHqrJtL8NFxudgo2W","empleado_id":16,"status":"ACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.992254+00:00","modified_at":"2026-09-30T18:48:46.992254+00:00","enabled":true,"email_verified":false}, 
 {"id":17,"email":"diego.morales@conciliacion.mx","password_hash":"$2a$06$Jubzi7iUpoAeZtcXcgvnheVaXwMsd7m/dfFu7OIGckISp67jcXg/G","empleado_id":17,"status":"ACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.013395+00:00","modified_at":"2026-09-30T18:48:47.013395+00:00","enabled":true,"email_verified":true}, 
 {"id":18,"email":"valeria.ortiz@conciliacion.mx","password_hash":"$2a$06$DMYchDs9BAyS83LDZP4bqe7pISrCEjZ3WftsJiQSE8iaP70eN9l1u","empleado_id":18,"status":"LOCKED","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.037405+00:00","modified_at":"2026-09-30T18:48:47.037405+00:00","enabled":true,"email_verified":true}, 
 {"id":19,"email":"ricardo.jimenez@conciliacion.mx","password_hash":"$2a$06$pLAAWmfKPhqFnKbufZ8jLutxzqB7OjS/Q6VlyYddY5JPnnAzEgABO","empleado_id":19,"status":"ACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.058815+00:00","modified_at":"2026-10-06T23:42:03.551301+00:00","enabled":true,"email_verified":true}, 
 {"id":20,"email":"andres.molina@conciliacion.mx","password_hash":"$2a$06$JMzWmhxGPTzAhJo93YFXQ.Eq2bTs/6MMVKHVRdBtors9DYtBz5EaC","empleado_id":20,"status":"INACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.08171+00:00","modified_at":"2026-09-30T18:48:47.08171+00:00","enabled":true,"email_verified":true}, 
 {"id":21,"email":"karla.delgado@conciliacion.mx","password_hash":"$2a$06$4gJcINNgHWfMb4Nqio.3AeOLxjHaU7bPM/X4l1x8DQX0wfcEPMnVi","empleado_id":21,"status":"ACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.101335+00:00","modified_at":"2026-09-30T18:48:47.101335+00:00","enabled":true,"email_verified":true}, 
 {"id":22,"email":"emilio.navarro@conciliacion.mx","password_hash":"$2a$06$Fu7m0wsaOztsTRzGo6x.PunD0rNGq/.Om9tXyze4lIOHBTTwu3IjC","empleado_id":22,"status":"ACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.12067+00:00","modified_at":"2026-09-30T18:48:47.12067+00:00","enabled":true,"email_verified":true}, 
 {"id":23,"email":"paola.aguilar@conciliacion.mx","password_hash":"$2a$06$Uv5TaeLVBIvZhuBR.XBSg.7du5pj/U0nCyiqPu9fMoQT4oTFzXTWy","empleado_id":23,"status":"ACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.141741+00:00","modified_at":"2026-09-30T19:33:48.759017+00:00","enabled":true,"email_verified":true}, 
 {"id":24,"email":"hector.ibarra@conciliacion.mx","password_hash":"$2a$06$8co2adU60XidTf5NjgvxYOIhhQRC.YA6WZl4mdgzrjrh2rnBKdl1q","empleado_id":24,"status":"LOCKED","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.161377+00:00","modified_at":"2026-09-30T18:48:47.161377+00:00","enabled":true,"email_verified":true}, 
 {"id":25,"email":"renata.campos@conciliacion.mx","password_hash":"$2a$06$fREJ1lh8LfLZub8LJ0BE1.5cMplA8YgFL9pEp7zV8g69MWnZ.N2XC","empleado_id":25,"status":"ACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.183543+00:00","modified_at":"2026-09-30T18:48:47.183543+00:00","enabled":true,"email_verified":true}, 
 {"id":26,"email":"ivan.salazar@conciliacion.mx","password_hash":"$2a$06$C5EWbpFLmy7iBH9VKcL8HuI3oP/jUh2u1EDGP6q/p6kElXZbTAtP2","empleado_id":26,"status":"INACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.208049+00:00","modified_at":"2026-09-30T18:48:47.208049+00:00","enabled":true,"email_verified":true}, 
 {"id":27,"email":"camila.rangel@conciliacion.mx","password_hash":"$2a$06$Fgt798u4BNqVJ.XC5EZ/LOnt6t1O5RVAUjIO8JCE/6XgxghXhd.qK","empleado_id":27,"status":"ACTIVE","failed_attempts":0,"must_change_password":false,"locked_at":null,"last_login_at":null,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.230617+00:00","modified_at":"2026-09-30T18:48:47.230617+00:00","enabled":true,"email_verified":true}]$seed$::json) ON CONFLICT (id) DO NOTHING;
INSERT INTO empleado_subsidiaria SELECT * FROM json_populate_recordset(null::empleado_subsidiaria, $seed$[{"empleado_id":2,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.440192+00:00","modified_at":"2026-09-30T18:14:37.440192+00:00","enabled":true}, 
 {"empleado_id":3,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.440192+00:00","modified_at":"2026-09-30T18:14:37.440192+00:00","enabled":true}, 
 {"empleado_id":4,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.440192+00:00","modified_at":"2026-09-30T18:14:37.440192+00:00","enabled":true}, 
 {"empleado_id":5,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.440192+00:00","modified_at":"2026-09-30T18:14:37.440192+00:00","enabled":true}, 
 {"empleado_id":6,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.440192+00:00","modified_at":"2026-09-30T18:14:37.440192+00:00","enabled":true}, 
 {"empleado_id":7,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.779339+00:00","modified_at":"2026-09-30T18:48:46.779339+00:00","enabled":true}, 
 {"empleado_id":8,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.814013+00:00","modified_at":"2026-09-30T18:48:46.814013+00:00","enabled":true}, 
 {"empleado_id":9,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.836914+00:00","modified_at":"2026-09-30T18:48:46.836914+00:00","enabled":true}, 
 {"empleado_id":10,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.8612+00:00","modified_at":"2026-09-30T18:48:46.8612+00:00","enabled":true}, 
 {"empleado_id":11,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.886339+00:00","modified_at":"2026-09-30T18:48:46.886339+00:00","enabled":true}, 
 {"empleado_id":12,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.911671+00:00","modified_at":"2026-09-30T18:48:46.911671+00:00","enabled":true}, 
 {"empleado_id":13,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.936722+00:00","modified_at":"2026-09-30T18:48:46.936722+00:00","enabled":true}, 
 {"empleado_id":14,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.957484+00:00","modified_at":"2026-09-30T18:48:46.957484+00:00","enabled":true}, 
 {"empleado_id":15,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.980516+00:00","modified_at":"2026-09-30T18:48:46.980516+00:00","enabled":true}, 
 {"empleado_id":16,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.003445+00:00","modified_at":"2026-09-30T18:48:47.003445+00:00","enabled":true}, 
 {"empleado_id":17,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.024791+00:00","modified_at":"2026-09-30T18:48:47.024791+00:00","enabled":true}, 
 {"empleado_id":18,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.047448+00:00","modified_at":"2026-09-30T18:48:47.047448+00:00","enabled":true}, 
 {"empleado_id":19,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.068152+00:00","modified_at":"2026-09-30T18:48:47.068152+00:00","enabled":true}, 
 {"empleado_id":20,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.091235+00:00","modified_at":"2026-09-30T18:48:47.091235+00:00","enabled":true}, 
 {"empleado_id":21,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.112695+00:00","modified_at":"2026-09-30T18:48:47.112695+00:00","enabled":true}, 
 {"empleado_id":22,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.131564+00:00","modified_at":"2026-09-30T18:48:47.131564+00:00","enabled":true}, 
 {"empleado_id":23,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.150825+00:00","modified_at":"2026-09-30T18:48:47.150825+00:00","enabled":true}, 
 {"empleado_id":24,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.17209+00:00","modified_at":"2026-09-30T18:48:47.17209+00:00","enabled":true}, 
 {"empleado_id":25,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.194212+00:00","modified_at":"2026-09-30T18:48:47.194212+00:00","enabled":true}, 
 {"empleado_id":26,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.21779+00:00","modified_at":"2026-09-30T18:48:47.21779+00:00","enabled":true}, 
 {"empleado_id":27,"subsidiaria_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.239971+00:00","modified_at":"2026-09-30T18:48:47.239971+00:00","enabled":true}]$seed$::json) ON CONFLICT DO NOTHING;
INSERT INTO empleado_ubicacion SELECT * FROM json_populate_recordset(null::empleado_ubicacion, $seed$[{"empleado_id":2,"ubicacion_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":2,"ubicacion_id":2,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":2,"ubicacion_id":3,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":2,"ubicacion_id":4,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":3,"ubicacion_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":3,"ubicacion_id":2,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":3,"ubicacion_id":3,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":3,"ubicacion_id":4,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":4,"ubicacion_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":4,"ubicacion_id":2,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":4,"ubicacion_id":3,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":4,"ubicacion_id":4,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":5,"ubicacion_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":5,"ubicacion_id":2,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":5,"ubicacion_id":3,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":5,"ubicacion_id":4,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":6,"ubicacion_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":6,"ubicacion_id":2,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":6,"ubicacion_id":3,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":6,"ubicacion_id":4,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:14:37.446477+00:00","modified_at":"2026-09-30T18:14:37.446477+00:00","enabled":true}, 
 {"empleado_id":7,"ubicacion_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.795643+00:00","modified_at":"2026-09-30T18:48:46.795643+00:00","enabled":true}, 
 {"empleado_id":8,"ubicacion_id":2,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.819522+00:00","modified_at":"2026-09-30T18:48:46.819522+00:00","enabled":true}, 
 {"empleado_id":9,"ubicacion_id":3,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.842204+00:00","modified_at":"2026-09-30T18:48:46.842204+00:00","enabled":true}, 
 {"empleado_id":10,"ubicacion_id":4,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.868241+00:00","modified_at":"2026-09-30T18:48:46.868241+00:00","enabled":true}, 
 {"empleado_id":11,"ubicacion_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.893679+00:00","modified_at":"2026-09-30T18:48:46.893679+00:00","enabled":true}, 
 {"empleado_id":12,"ubicacion_id":2,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.9218+00:00","modified_at":"2026-09-30T18:48:46.9218+00:00","enabled":true}, 
 {"empleado_id":13,"ubicacion_id":3,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.942931+00:00","modified_at":"2026-09-30T18:48:46.942931+00:00","enabled":true}, 
 {"empleado_id":14,"ubicacion_id":4,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.963177+00:00","modified_at":"2026-09-30T18:48:46.963177+00:00","enabled":true}, 
 {"empleado_id":15,"ubicacion_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:46.987899+00:00","modified_at":"2026-09-30T18:48:46.987899+00:00","enabled":true}, 
 {"empleado_id":16,"ubicacion_id":2,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.009334+00:00","modified_at":"2026-09-30T18:48:47.009334+00:00","enabled":true}, 
 {"empleado_id":17,"ubicacion_id":3,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.031947+00:00","modified_at":"2026-09-30T18:48:47.031947+00:00","enabled":true}, 
 {"empleado_id":18,"ubicacion_id":4,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.053318+00:00","modified_at":"2026-09-30T18:48:47.053318+00:00","enabled":true}, 
 {"empleado_id":19,"ubicacion_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.077154+00:00","modified_at":"2026-09-30T18:48:47.077154+00:00","enabled":true}, 
 {"empleado_id":20,"ubicacion_id":2,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.096866+00:00","modified_at":"2026-09-30T18:48:47.096866+00:00","enabled":true}, 
 {"empleado_id":21,"ubicacion_id":3,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.116703+00:00","modified_at":"2026-09-30T18:48:47.116703+00:00","enabled":true}, 
 {"empleado_id":22,"ubicacion_id":4,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.136022+00:00","modified_at":"2026-09-30T18:48:47.136022+00:00","enabled":true}, 
 {"empleado_id":23,"ubicacion_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.155196+00:00","modified_at":"2026-09-30T18:48:47.155196+00:00","enabled":true}, 
 {"empleado_id":24,"ubicacion_id":2,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.17646+00:00","modified_at":"2026-09-30T18:48:47.17646+00:00","enabled":true}, 
 {"empleado_id":25,"ubicacion_id":3,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.203937+00:00","modified_at":"2026-09-30T18:48:47.203937+00:00","enabled":true}, 
 {"empleado_id":26,"ubicacion_id":4,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.224714+00:00","modified_at":"2026-09-30T18:48:47.224714+00:00","enabled":true}, 
 {"empleado_id":27,"ubicacion_id":1,"created_by":null,"modified_by":null,"created_at":"2026-09-30T18:48:47.249588+00:00","modified_at":"2026-09-30T18:48:47.249588+00:00","enabled":true}]$seed$::json) ON CONFLICT DO NOTHING;

INSERT INTO app_user_role (user_id, role_id, enabled)
SELECT u.id, r.id, x.enabled FROM json_to_recordset($seed$[{"email":"admin@conciliacion.mx","role_code":"ADMIN","enabled":true}, 
 {"email":"carlos.medina@conciliacion.mx","role_code":"ALTAS","enabled":true}, 
 {"email":"roberto.sanchez@conciliacion.mx","role_code":"TESORERIA","enabled":true}, 
 {"email":"gabriela.vargas@conciliacion.mx","role_code":"CONTABILIDAD","enabled":true}, 
 {"email":"laura.pineda@conciliacion.mx","role_code":"COSTOS","enabled":true}, 
 {"email":"analista@conciliacion.mx","role_code":"TESORERIA","enabled":true}, 
 {"email":"daniela.torres@conciliacion.mx","role_code":"TESORERIA","enabled":true}, 
 {"email":"jorge.ramirez@conciliacion.mx","role_code":"TESORERIA","enabled":true}, 
 {"email":"marina.lopez@conciliacion.mx","role_code":"TESORERIA","enabled":true}, 
 {"email":"sofia.hernandez@conciliacion.mx","role_code":"TESORERIA","enabled":true}, 
 {"email":"luis.fernandez@conciliacion.mx","role_code":"TESORERIA","enabled":true}, 
 {"email":"fernanda.cruz@conciliacion.mx","role_code":"TESORERIA","enabled":true}, 
 {"email":"patricia.gomez@conciliacion.mx","role_code":"ALTAS","enabled":true}, 
 {"email":"fernando.castillo@conciliacion.mx","role_code":"TESORERIA","enabled":true}, 
 {"email":"alejandra.reyes@conciliacion.mx","role_code":"CONTABILIDAD","enabled":true}, 
 {"email":"diego.morales@conciliacion.mx","role_code":"TESORERIA","enabled":true}, 
 {"email":"valeria.ortiz@conciliacion.mx","role_code":"TESORERIA","enabled":true}, 
 {"email":"ricardo.jimenez@conciliacion.mx","role_code":"ALTAS","enabled":true}, 
 {"email":"andres.molina@conciliacion.mx","role_code":"TESORERIA","enabled":true}, 
 {"email":"karla.delgado@conciliacion.mx","role_code":"TESORERIA","enabled":true}, 
 {"email":"emilio.navarro@conciliacion.mx","role_code":"ALTAS","enabled":true}, 
 {"email":"paola.aguilar@conciliacion.mx","role_code":"CONTABILIDAD","enabled":true}, 
 {"email":"hector.ibarra@conciliacion.mx","role_code":"TESORERIA","enabled":true}, 
 {"email":"renata.campos@conciliacion.mx","role_code":"TESORERIA","enabled":true}, 
 {"email":"ivan.salazar@conciliacion.mx","role_code":"TESORERIA","enabled":true}, 
 {"email":"camila.rangel@conciliacion.mx","role_code":"ALTAS","enabled":true}]$seed$::json) AS x(email text, role_code text, enabled boolean)
JOIN app_user u ON u.email = x.email JOIN app_role r ON r.code = x.role_code
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO app_user_permission (user_id, permission_id, enabled)
SELECT u.id, p.id, x.enabled FROM json_to_recordset($seed$[{"email":"roberto.sanchez@conciliacion.mx","perm_code":"manage_differences","enabled":true}, 
 {"email":"roberto.sanchez@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"gabriela.vargas@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"roberto.sanchez@conciliacion.mx","perm_code":"import_settlements","enabled":true}, 
 {"email":"admin@conciliacion.mx","perm_code":"manage_users","enabled":true}, 
 {"email":"carlos.medina@conciliacion.mx","perm_code":"manage_users","enabled":true}, 
 {"email":"gabriela.vargas@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"carlos.medina@conciliacion.mx","perm_code":"manage_roles","enabled":true}, 
 {"email":"laura.pineda@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"admin@conciliacion.mx","perm_code":"import_settlements","enabled":true}, 
 {"email":"admin@conciliacion.mx","perm_code":"view_audit_log","enabled":true}, 
 {"email":"admin@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"admin@conciliacion.mx","perm_code":"manage_differences","enabled":true}, 
 {"email":"admin@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"carlos.medina@conciliacion.mx","perm_code":"view_audit_log","enabled":true}, 
 {"email":"admin@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"roberto.sanchez@conciliacion.mx","perm_code":"view_reconciliation","enabled":true}, 
 {"email":"admin@conciliacion.mx","perm_code":"view_reconciliation","enabled":true}, 
 {"email":"admin@conciliacion.mx","perm_code":"manage_roles","enabled":true}, 
 {"email":"roberto.sanchez@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"karla.delgado@conciliacion.mx","perm_code":"view_reconciliation","enabled":true}, 
 {"email":"ricardo.jimenez@conciliacion.mx","perm_code":"view_audit_log","enabled":true}, 
 {"email":"renata.campos@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"fernanda.cruz@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"andres.molina@conciliacion.mx","perm_code":"view_reconciliation","enabled":true}, 
 {"email":"diego.morales@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"fernanda.cruz@conciliacion.mx","perm_code":"import_settlements","enabled":true}, 
 {"email":"emilio.navarro@conciliacion.mx","perm_code":"manage_roles","enabled":true}, 
 {"email":"fernando.castillo@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"valeria.ortiz@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"fernanda.cruz@conciliacion.mx","perm_code":"view_reconciliation","enabled":true}, 
 {"email":"emilio.navarro@conciliacion.mx","perm_code":"view_audit_log","enabled":true}, 
 {"email":"ivan.salazar@conciliacion.mx","perm_code":"manage_differences","enabled":true}, 
 {"email":"hector.ibarra@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"jorge.ramirez@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"karla.delgado@conciliacion.mx","perm_code":"manage_differences","enabled":true}, 
 {"email":"renata.campos@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"karla.delgado@conciliacion.mx","perm_code":"import_settlements","enabled":true}, 
 {"email":"fernando.castillo@conciliacion.mx","perm_code":"manage_differences","enabled":true}, 
 {"email":"daniela.torres@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"hector.ibarra@conciliacion.mx","perm_code":"import_settlements","enabled":true}, 
 {"email":"jorge.ramirez@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"marina.lopez@conciliacion.mx","perm_code":"manage_differences","enabled":true}, 
 {"email":"patricia.gomez@conciliacion.mx","perm_code":"view_audit_log","enabled":true}, 
 {"email":"valeria.ortiz@conciliacion.mx","perm_code":"view_reconciliation","enabled":true}, 
 {"email":"luis.fernandez@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"andres.molina@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"luis.fernandez@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"sofia.hernandez@conciliacion.mx","perm_code":"manage_differences","enabled":true}, 
 {"email":"renata.campos@conciliacion.mx","perm_code":"manage_differences","enabled":true}, 
 {"email":"diego.morales@conciliacion.mx","perm_code":"manage_differences","enabled":true}, 
 {"email":"luis.fernandez@conciliacion.mx","perm_code":"manage_differences","enabled":true}, 
 {"email":"daniela.torres@conciliacion.mx","perm_code":"manage_differences","enabled":true}, 
 {"email":"marina.lopez@conciliacion.mx","perm_code":"import_settlements","enabled":true}, 
 {"email":"renata.campos@conciliacion.mx","perm_code":"view_reconciliation","enabled":true}, 
 {"email":"ivan.salazar@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"fernanda.cruz@conciliacion.mx","perm_code":"manage_differences","enabled":true}, 
 {"email":"paola.aguilar@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"daniela.torres@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"ivan.salazar@conciliacion.mx","perm_code":"import_settlements","enabled":true}, 
 {"email":"analista@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"fernando.castillo@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"sofia.hernandez@conciliacion.mx","perm_code":"import_settlements","enabled":true}, 
 {"email":"marina.lopez@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"andres.molina@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"patricia.gomez@conciliacion.mx","perm_code":"manage_users","enabled":true}, 
 {"email":"jorge.ramirez@conciliacion.mx","perm_code":"import_settlements","enabled":true}, 
 {"email":"fernanda.cruz@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"jorge.ramirez@conciliacion.mx","perm_code":"manage_differences","enabled":true}, 
 {"email":"camila.rangel@conciliacion.mx","perm_code":"view_audit_log","enabled":true}, 
 {"email":"sofia.hernandez@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"andres.molina@conciliacion.mx","perm_code":"manage_differences","enabled":true}, 
 {"email":"andres.molina@conciliacion.mx","perm_code":"import_settlements","enabled":true}, 
 {"email":"paola.aguilar@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"ricardo.jimenez@conciliacion.mx","perm_code":"manage_roles","enabled":true}, 
 {"email":"diego.morales@conciliacion.mx","perm_code":"import_settlements","enabled":true}, 
 {"email":"valeria.ortiz@conciliacion.mx","perm_code":"import_settlements","enabled":true}, 
 {"email":"patricia.gomez@conciliacion.mx","perm_code":"manage_roles","enabled":true}, 
 {"email":"karla.delgado@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"luis.fernandez@conciliacion.mx","perm_code":"import_settlements","enabled":true}, 
 {"email":"renata.campos@conciliacion.mx","perm_code":"import_settlements","enabled":true}, 
 {"email":"marina.lopez@conciliacion.mx","perm_code":"view_reconciliation","enabled":true}, 
 {"email":"analista@conciliacion.mx","perm_code":"import_settlements","enabled":true}, 
 {"email":"luis.fernandez@conciliacion.mx","perm_code":"view_reconciliation","enabled":true}, 
 {"email":"sofia.hernandez@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"alejandra.reyes@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"ricardo.jimenez@conciliacion.mx","perm_code":"manage_users","enabled":true}, 
 {"email":"jorge.ramirez@conciliacion.mx","perm_code":"view_reconciliation","enabled":true}, 
 {"email":"camila.rangel@conciliacion.mx","perm_code":"manage_users","enabled":true}, 
 {"email":"analista@conciliacion.mx","perm_code":"manage_differences","enabled":true}, 
 {"email":"daniela.torres@conciliacion.mx","perm_code":"import_settlements","enabled":true}, 
 {"email":"sofia.hernandez@conciliacion.mx","perm_code":"view_reconciliation","enabled":true}, 
 {"email":"diego.morales@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"marina.lopez@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"emilio.navarro@conciliacion.mx","perm_code":"manage_users","enabled":true}, 
 {"email":"analista@conciliacion.mx","perm_code":"view_reconciliation","enabled":true}, 
 {"email":"hector.ibarra@conciliacion.mx","perm_code":"manage_differences","enabled":true}, 
 {"email":"hector.ibarra@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"fernando.castillo@conciliacion.mx","perm_code":"view_reconciliation","enabled":true}, 
 {"email":"daniela.torres@conciliacion.mx","perm_code":"view_reconciliation","enabled":true}, 
 {"email":"alejandra.reyes@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"ivan.salazar@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"valeria.ortiz@conciliacion.mx","perm_code":"manage_differences","enabled":true}, 
 {"email":"valeria.ortiz@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"karla.delgado@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"hector.ibarra@conciliacion.mx","perm_code":"view_reconciliation","enabled":true}, 
 {"email":"camila.rangel@conciliacion.mx","perm_code":"manage_roles","enabled":true}, 
 {"email":"diego.morales@conciliacion.mx","perm_code":"view_reconciliation","enabled":true}, 
 {"email":"analista@conciliacion.mx","perm_code":"view_catalogs","enabled":true}, 
 {"email":"ivan.salazar@conciliacion.mx","perm_code":"view_reconciliation","enabled":true}, 
 {"email":"fernando.castillo@conciliacion.mx","perm_code":"import_settlements","enabled":true}, 
 {"email":"karla.delgado@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"alejandra.reyes@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"jorge.ramirez@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"sofia.hernandez@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"marina.lopez@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"roberto.sanchez@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"diego.morales@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"valeria.ortiz@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"analista@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"ivan.salazar@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"andres.molina@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"fernando.castillo@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"laura.pineda@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"paola.aguilar@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"renata.campos@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"gabriela.vargas@conciliacion.mx","perm_code":"export_reports","enabled":true}, 
 {"email":"laura.pineda@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"hector.ibarra@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"fernanda.cruz@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"luis.fernandez@conciliacion.mx","perm_code":"view_dashboard","enabled":true}, 
 {"email":"daniela.torres@conciliacion.mx","perm_code":"view_dashboard","enabled":true}]$seed$::json) AS x(email text, perm_code text, enabled boolean)
JOIN app_user u ON u.email = x.email JOIN app_permission p ON p.code = x.perm_code
ON CONFLICT (user_id, permission_id) DO NOTHING;


-- Segunda subsidiaria con sus tiendas reales de Facturiza (coctel_midd/docs/datos_prueba_ubicaciones.sql) —
-- permite probar el filtro de ubicaciones por subsidiaria en el alta/edición de usuarios.
INSERT INTO subsidiaria (id, brand_id_api, nombre, razon_social, nit)
VALUES (2, 2, 'Hipermar Fish', 'HICO FISH SAS', '900665499-1') ON CONFLICT DO NOTHING;
INSERT INTO ubicacion (id, subsidiaria_id, store_id_api, nombre, prefijo_fiscal) VALUES
  (5, 2, 3, 'Hipermar Sede 123', 'H23E'),
  (6, 2, 4, 'Tienda 4 (prueba)', 'H24E')
ON CONFLICT DO NOTHING;
-- Roberto Sánchez (Tesorería) pertenece también a Hipermar Fish (multi-subsidiaria).
INSERT INTO empleado_subsidiaria (empleado_id, subsidiaria_id) VALUES (4, 2) ON CONFLICT DO NOTHING;
INSERT INTO empleado_ubicacion (empleado_id, ubicacion_id) VALUES (4, 5) ON CONFLICT DO NOTHING;

-- Catálogos organizacionales (Core: GET /catalogs/cargos|puestos|departamentos|areas). Nacen VACÍOS en DEV
-- (los entrega el cliente); estos valores salen de los textos que tenían las 26 cuentas antes de que el
-- backend retirara department/area/jobTitle, más los ejemplos de coctel_midd/docs/datos_prueba_organizacion.sql.
INSERT INTO cargo (nombre) VALUES ('Gerente'), ('Coordinador'), ('Analista'), ('Auxiliar') ON CONFLICT (nombre) DO NOTHING;
INSERT INTO puesto (nombre) VALUES ('Analista de Conciliación'), ('Supervisor de Conciliación'), ('Supervisor de Tesorería'), ('Auditor de Procesos'), ('Administrador de Plataforma'), ('Cajero') ON CONFLICT (nombre) DO NOTHING;
INSERT INTO departamento (nombre) VALUES ('Finanzas'), ('Tecnología'), ('Auditoría Interna'), ('Recursos Humanos'), ('Operaciones') ON CONFLICT (nombre) DO NOTHING;
INSERT INTO area (nombre) VALUES ('Conciliación Bancaria'), ('Tesorería'), ('Contabilidad'), ('Sistemas'), ('Cumplimiento') ON CONFLICT (nombre) DO NOTHING;

-- Asignación por empleado (varios de cada uno por persona son válidos).
INSERT INTO empleado_cargo (empleado_id, cargo_id)
SELECT x.empleado_id, c.id FROM json_to_recordset($seed$[{"empleado_id": 2, "nombre": "Gerente"}, {"empleado_id": 3, "nombre": "Auxiliar"}, {"empleado_id": 4, "nombre": "Auxiliar"}, {"empleado_id": 5, "nombre": "Auxiliar"}, {"empleado_id": 6, "nombre": "Auxiliar"}, {"empleado_id": 7, "nombre": "Analista"}, {"empleado_id": 8, "nombre": "Coordinador"}, {"empleado_id": 9, "nombre": "Analista"}, {"empleado_id": 10, "nombre": "Analista"}, {"empleado_id": 11, "nombre": "Analista"}, {"empleado_id": 12, "nombre": "Coordinador"}, {"empleado_id": 13, "nombre": "Analista"}, {"empleado_id": 14, "nombre": "Analista"}, {"empleado_id": 15, "nombre": "Analista"}, {"empleado_id": 16, "nombre": "Analista"}, {"empleado_id": 17, "nombre": "Coordinador"}, {"empleado_id": 18, "nombre": "Analista"}, {"empleado_id": 19, "nombre": "Analista"}, {"empleado_id": 20, "nombre": "Coordinador"}, {"empleado_id": 21, "nombre": "Analista"}, {"empleado_id": 22, "nombre": "Analista"}, {"empleado_id": 23, "nombre": "Analista"}, {"empleado_id": 24, "nombre": "Analista"}, {"empleado_id": 25, "nombre": "Coordinador"}, {"empleado_id": 26, "nombre": "Analista"}, {"empleado_id": 27, "nombre": "Analista"}, {"empleado_id": 8, "nombre": "Analista"}]$seed$::json) AS x(empleado_id bigint, nombre text)
JOIN cargo c ON c.nombre = x.nombre
ON CONFLICT DO NOTHING;
INSERT INTO empleado_puesto (empleado_id, puesto_id)
SELECT x.empleado_id, c.id FROM json_to_recordset($seed$[{"empleado_id": 2, "nombre": "Administrador de Plataforma"}, {"empleado_id": 7, "nombre": "Analista de Conciliación"}, {"empleado_id": 8, "nombre": "Supervisor de Conciliación"}, {"empleado_id": 9, "nombre": "Analista de Conciliación"}, {"empleado_id": 10, "nombre": "Analista de Conciliación"}, {"empleado_id": 11, "nombre": "Analista de Conciliación"}, {"empleado_id": 12, "nombre": "Supervisor de Tesorería"}, {"empleado_id": 13, "nombre": "Analista de Conciliación"}, {"empleado_id": 14, "nombre": "Auditor de Procesos"}, {"empleado_id": 15, "nombre": "Analista de Conciliación"}, {"empleado_id": 16, "nombre": "Analista de Conciliación"}, {"empleado_id": 17, "nombre": "Supervisor de Conciliación"}, {"empleado_id": 18, "nombre": "Analista de Conciliación"}, {"empleado_id": 19, "nombre": "Auditor de Procesos"}, {"empleado_id": 20, "nombre": "Supervisor de Conciliación"}, {"empleado_id": 21, "nombre": "Analista de Conciliación"}, {"empleado_id": 22, "nombre": "Auditor de Procesos"}, {"empleado_id": 23, "nombre": "Analista de Conciliación"}, {"empleado_id": 24, "nombre": "Analista de Conciliación"}, {"empleado_id": 25, "nombre": "Supervisor de Tesorería"}, {"empleado_id": 26, "nombre": "Analista de Conciliación"}, {"empleado_id": 27, "nombre": "Auditor de Procesos"}]$seed$::json) AS x(empleado_id bigint, nombre text)
JOIN puesto c ON c.nombre = x.nombre
ON CONFLICT DO NOTHING;
INSERT INTO empleado_departamento (empleado_id, departamento_id)
SELECT x.empleado_id, c.id FROM json_to_recordset($seed$[{"empleado_id": 2, "nombre": "Tecnología"}, {"empleado_id": 3, "nombre": "Recursos Humanos"}, {"empleado_id": 4, "nombre": "Finanzas"}, {"empleado_id": 5, "nombre": "Finanzas"}, {"empleado_id": 6, "nombre": "Operaciones"}, {"empleado_id": 7, "nombre": "Finanzas"}, {"empleado_id": 8, "nombre": "Finanzas"}, {"empleado_id": 9, "nombre": "Finanzas"}, {"empleado_id": 10, "nombre": "Finanzas"}, {"empleado_id": 11, "nombre": "Finanzas"}, {"empleado_id": 12, "nombre": "Finanzas"}, {"empleado_id": 13, "nombre": "Finanzas"}, {"empleado_id": 14, "nombre": "Auditoría Interna"}, {"empleado_id": 15, "nombre": "Finanzas"}, {"empleado_id": 16, "nombre": "Finanzas"}, {"empleado_id": 17, "nombre": "Tecnología"}, {"empleado_id": 18, "nombre": "Finanzas"}, {"empleado_id": 19, "nombre": "Auditoría Interna"}, {"empleado_id": 20, "nombre": "Tecnología"}, {"empleado_id": 21, "nombre": "Finanzas"}, {"empleado_id": 22, "nombre": "Auditoría Interna"}, {"empleado_id": 23, "nombre": "Recursos Humanos"}, {"empleado_id": 24, "nombre": "Finanzas"}, {"empleado_id": 25, "nombre": "Operaciones"}, {"empleado_id": 26, "nombre": "Finanzas"}, {"empleado_id": 27, "nombre": "Auditoría Interna"}]$seed$::json) AS x(empleado_id bigint, nombre text)
JOIN departamento c ON c.nombre = x.nombre
ON CONFLICT DO NOTHING;
INSERT INTO empleado_area (empleado_id, area_id)
SELECT x.empleado_id, c.id FROM json_to_recordset($seed$[{"empleado_id": 2, "nombre": "Sistemas"}, {"empleado_id": 4, "nombre": "Tesorería"}, {"empleado_id": 5, "nombre": "Contabilidad"}, {"empleado_id": 6, "nombre": "Contabilidad"}, {"empleado_id": 7, "nombre": "Conciliación Bancaria"}, {"empleado_id": 8, "nombre": "Conciliación Bancaria"}, {"empleado_id": 9, "nombre": "Conciliación Bancaria"}, {"empleado_id": 10, "nombre": "Conciliación Bancaria"}, {"empleado_id": 11, "nombre": "Conciliación Bancaria"}, {"empleado_id": 12, "nombre": "Tesorería"}, {"empleado_id": 13, "nombre": "Conciliación Bancaria"}, {"empleado_id": 14, "nombre": "Cumplimiento"}, {"empleado_id": 15, "nombre": "Conciliación Bancaria"}, {"empleado_id": 16, "nombre": "Contabilidad"}, {"empleado_id": 17, "nombre": "Sistemas"}, {"empleado_id": 18, "nombre": "Conciliación Bancaria"}, {"empleado_id": 19, "nombre": "Cumplimiento"}, {"empleado_id": 20, "nombre": "Sistemas"}, {"empleado_id": 21, "nombre": "Conciliación Bancaria"}, {"empleado_id": 22, "nombre": "Cumplimiento"}, {"empleado_id": 23, "nombre": "Contabilidad"}, {"empleado_id": 24, "nombre": "Conciliación Bancaria"}, {"empleado_id": 25, "nombre": "Tesorería"}, {"empleado_id": 26, "nombre": "Conciliación Bancaria"}, {"empleado_id": 27, "nombre": "Cumplimiento"}, {"empleado_id": 5, "nombre": "Tesorería"}]$seed$::json) AS x(empleado_id bigint, nombre text)
JOIN area c ON c.nombre = x.nombre
ON CONFLICT DO NOTHING;

-- Permisos especiales (app_user_special_permission, DEV 3852101): los permisos efectivos de cada cuenta que
-- NINGUNO de sus roles otorga (p. ej. un permiso agregado a mano a una persona). Editar un rol no se los quita.
INSERT INTO app_user_special_permission (user_id, permission_id)
SELECT up.user_id, up.permission_id
FROM app_user_permission up
WHERE NOT EXISTS (
  SELECT 1 FROM app_user_role ur
  JOIN app_role_permission rp ON rp.role_id = ur.role_id
  WHERE ur.user_id = up.user_id AND rp.permission_id = up.permission_id
)
ON CONFLICT DO NOTHING;

-- Las secuencias deben ir por delante de los ids sembrados a mano
SELECT setval(pg_get_serial_sequence('empleado', 'id'), (SELECT max(id) FROM empleado));
SELECT setval(pg_get_serial_sequence('app_user', 'id'), (SELECT max(id) FROM app_user));
SELECT setval(pg_get_serial_sequence('subsidiaria', 'id'), (SELECT max(id) FROM subsidiaria));
SELECT setval(pg_get_serial_sequence('ubicacion', 'id'), (SELECT max(id) FROM ubicacion));
SELECT setval(pg_get_serial_sequence('app_role', 'id'), (SELECT max(id) FROM app_role));

COMMIT;
