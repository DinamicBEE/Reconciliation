-- Ventas de PRUEBA para la DB local de desarrollo (GET /sales del Core Service). NO es una migración del backend.
-- En DEV las ventas solo llegan por la captura desde Facturiza (POST /sales/capture), que necesita credenciales
-- que el entorno local no tiene; este archivo siembra documentos con la misma forma que deja la captura, para
-- probar el listado, sus filtros y la paginación del Resumen de venta.
--
-- Determinista (sin random): 7 días (05 al 11-Oct-2026) × cada ubicación habilitada × 4 documentos. Uno de cada
-- 23 es nota crédito; uno de cada 7 tiene pago mixto (2 medios); el estado de conciliación rota entre los 3.
-- Idempotente: los folios de prueba empiezan con "D" y la llave natural evita duplicados.
-- Se aplica después de seed-demo-users.sql (necesita las ubicaciones sembradas).
BEGIN;

-- Clientes: el consumidor final genérico (222222222222) y algunos con cédula/NIT.
INSERT INTO customer (identification_type_id, document, check_digit, first_name, last_name, email, is_final_consumer)
SELECT t.id, v.document, v.check_digit, v.first_name, v.last_name, v.email, v.final_consumer
FROM (VALUES
  ('13', '222222222222', NULL, 'CONSUMIDOR FINAL', NULL, NULL, TRUE),
  ('13', '1020304050', NULL, 'María Fernanda', 'Ruiz', 'mafe.ruiz@example.com', FALSE),
  ('13', '79865432', NULL, 'Diego', 'Salinas', 'diego.salinas@example.com', FALSE),
  ('13', '52345678', NULL, 'Ana Paola', 'Cortés', 'ana.cortes@example.com', FALSE),
  ('31', '900123456', '7', 'Restaurante La Bahía SAS', NULL, 'compras@labahia.example.com', FALSE),
  ('31', '830987654', '1', 'Eventos del Caribe SAS', NULL, 'pagos@eventoscaribe.example.com', FALSE)
) AS v (type_code, document, check_digit, first_name, last_name, email, final_consumer)
JOIN catalog_identification_type t ON t.code = v.type_code
ON CONFLICT DO NOTHING;

-- Documentos.
WITH gen AS (
  SELECT u.id AS ubicacion_id, u.prefijo_fiscal AS prefix, d::date AS business_date,
         row_number() OVER (ORDER BY u.id, d, n) AS rn
  FROM ubicacion u
  CROSS JOIN generate_series(DATE '2026-10-05', DATE '2026-10-11', INTERVAL '1 day') AS d
  CROSS JOIN generate_series(1, 4) AS n
  WHERE u.enabled
),
priced AS (
  SELECT g.*,
         round((15000 + (g.rn * 7919) % 185000)::numeric, 2) AS subtotal,
         CASE WHEN g.rn % 11 = 0 THEN round((2000 + (g.rn * 131) % 6000)::numeric, 2) ELSE 0 END AS charges
  FROM gen g
)
INSERT INTO sale_document (ubicacion_id, doc_type, prefix, folio, business_date, business_time, customer_id,
                           reconciliation_status_id, subtotal, total_taxes, total_charges, total)
SELECT p.ubicacion_id,
       CASE WHEN p.rn % 23 = 0 THEN 2 ELSE 1 END,
       p.prefix,
       'D' || lpad(p.rn::text, 5, '0'),
       p.business_date,
       TIME '08:00' + ((p.rn * 37) % 720) * INTERVAL '1 minute',
       c.id,
       s.id,
       p.subtotal,
       round(p.subtotal * 0.19, 2),
       p.charges,
       p.subtotal + round(p.subtotal * 0.19, 2) + p.charges
FROM priced p
JOIN customer c ON c.document = (ARRAY['222222222222', '222222222222', '1020304050', '222222222222', '79865432',
                                       '52345678', '222222222222', '900123456', '830987654'])[(p.rn % 9) + 1]
JOIN catalog_reconciliation_status s
  ON s.code = (ARRAY['por_conciliar', 'conciliado', 'por_conciliar', 'conciliado', 'desconciliado'])[(p.rn % 5) + 1]
ON CONFLICT (ubicacion_id, doc_type, prefix, folio) DO NOTHING;

-- Pagos: uno por documento; 1 de cada 7 es mixto (60 % / 40 % con dos medios distintos).
WITH docs AS (
  SELECT d.id, d.total, substring(d.folio FROM 2)::int AS rn
  FROM sale_document d
  WHERE d.folio LIKE 'D%' AND NOT EXISTS (SELECT 1 FROM sale_payment sp WHERE sp.document_id = d.id)
),
media AS (SELECT array_agg(id ORDER BY code) AS ids FROM catalog_tender_media WHERE NOT pending_review)
INSERT INTO sale_payment (document_id, seq, tender_media_id, amount)
SELECT docs.id, 1, media.ids[(docs.rn % array_length(media.ids, 1)) + 1],
       CASE WHEN docs.rn % 7 = 0 THEN round(docs.total * 0.6, 2) ELSE docs.total END
FROM docs, media
UNION ALL
SELECT docs.id, 2, media.ids[((docs.rn + 2) % array_length(media.ids, 1)) + 1],
       docs.total - round(docs.total * 0.6, 2)
FROM docs, media
WHERE docs.rn % 7 = 0;

-- Impuesto (IVA 19 %, tributo 01) por documento.
INSERT INTO sale_tax (document_id, seq, tax_code, rate, base_amount, amount)
SELECT d.id, 1, '01', 19, d.subtotal, d.total_taxes
FROM sale_document d
WHERE d.folio LIKE 'D%' AND NOT EXISTS (SELECT 1 FROM sale_tax t WHERE t.document_id = d.id);

COMMIT;
