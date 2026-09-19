# Diseño: Usuarios y Permisos (RBAC por puestos)

> Estado: **propuesta para aprobación**. No se ha aplicado ninguna migración.
> Objetivo: reemplazar el ACL-por-usuario actual por roles ("puestos") como dato,
> multi-puesto por persona, administrables por el owner desde la UI, **sin cambiar
> la capa que lee permisos** (materialización sobre `member_permissions`).

---

## 1. Diagnóstico del estado actual (con datos reales)

Hoy existe:
- Enum `company_role`: `owner, manager, accountant, auditor, viewer, custom`.
- Tabla `member_permissions`: 1 fila por (miembro × módulo) con 6 booleanos
  (`can_view, can_create, can_edit, can_delete, can_approve, can_export`).
- `default_permissions_for_role(role)`: plantillas **hardcodeadas en SQL** que
  siembran permisos al crear un miembro.
- `owner` tiene bypass total (fallback en frontend). Los no-owner leen todo de
  `member_permissions`.

Problemas comprobados:
1. **El rol es una semilla desechable.** Al editar cualquier checkbox el miembro
   pasa a `custom` y se pierde la identidad del rol. No hay fuente única por puesto.
2. **En la práctica es un ACL por usuario.** En la empresa `…001`: 2 owners y 5
   `custom` (cero manager/accountant/auditor/viewer). Y los 5 `custom` **no son
   iguales**: 4 son vendedores (solo `catalogo_ventas` ver) y 1 es casi un admin
   (inventory/sales/customers/shipments/licitaciones/investments + receivables/
   payables ver). Un admin y 4 vendedores en la misma bolsa `custom`.
3. **`custom` está sobrecargado como "vendedor".** El selector de comisiones hace
   `role === 'custom'`. Por eso el admin (andybauvar) aparece como vendedor.
4. **`Aprobar` y `Exportar` son ruido**: 0 usos en el código (`create/edit/delete`
   sí se usan).
5. **Perfil y ciclo de vida débiles**: `display_name` nulo en todos; los usuarios
   se **borran** (hard delete), no se **desactivan** — malo para datos contables.

---

## 2. Principios de diseño

- **Roles como dato, no como código.** El owner define puestos desde la UI.
- **Multi-puesto.** Una persona puede tener varios (contador + licitaciones);
  permiso efectivo = **unión**.
- **Excepciones por persona** (override tri-estado) para no perder flexibilidad fina.
- **No tocar la capa de lectura.** `can()`, `get_my_permissions`, los guards y RPCs
  siguen leyendo `member_permissions`. Solo cambia **cómo se escribe**: al asignar/
  editar puestos, un RPC **materializa** el efectivo en `member_permissions`.
- **"Vendedor" es un atributo del puesto** (`es_vendedor`), desacoplado de `custom`.
- **Migración con garantía de cero cambios de acceso** (nadie gana ni pierde
  permisos al migrar).

---

## 3. Modelo de datos

### 3.1 Tablas nuevas (todas company-scoped, con RLS owner-only)

```sql
-- Puestos (roles) definidos por empresa
CREATE TABLE permission_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nombre       text NOT NULL,
  descripcion  text,
  es_vendedor  boolean NOT NULL DEFAULT false,   -- cuenta para comisiones
  es_sistema   boolean NOT NULL DEFAULT false,   -- semilla; no borrable (sí editable)
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, nombre)
);

-- Grilla de permisos de cada puesto (module × acciones)
CREATE TABLE template_permissions (
  template_id  uuid NOT NULL REFERENCES permission_templates(id) ON DELETE CASCADE,
  module       erp_module NOT NULL,
  can_view     boolean NOT NULL DEFAULT false,
  can_create   boolean NOT NULL DEFAULT false,
  can_edit     boolean NOT NULL DEFAULT false,
  can_delete   boolean NOT NULL DEFAULT false,
  can_approve  boolean NOT NULL DEFAULT false,  -- se mantiene por compat; oculto en UI
  can_export   boolean NOT NULL DEFAULT false,  -- idem
  PRIMARY KEY (template_id, module)
);

-- Asignación miembro ↔ puestos (muchos a muchos)
CREATE TABLE member_templates (
  company_member_id uuid NOT NULL REFERENCES company_members(id) ON DELETE CASCADE,
  template_id       uuid NOT NULL REFERENCES permission_templates(id) ON DELETE CASCADE,
  PRIMARY KEY (company_member_id, template_id)
);

-- Excepciones por persona (tri-estado: NULL = heredar del/los puesto/s)
CREATE TABLE member_permission_overrides (
  company_member_id uuid NOT NULL REFERENCES company_members(id) ON DELETE CASCADE,
  module            erp_module NOT NULL,
  can_view    boolean,   -- NULL=heredar, true=forzar sí, false=forzar no
  can_create  boolean,
  can_edit    boolean,
  can_delete  boolean,
  can_approve boolean,
  can_export  boolean,
  PRIMARY KEY (company_member_id, module)
);
```

### 3.2 Cambios a `company_members`

```sql
ALTER TABLE company_members ADD COLUMN activo      boolean NOT NULL DEFAULT true;
ALTER TABLE company_members ADD COLUMN es_vendedor boolean NOT NULL DEFAULT false; -- materializado
```

- `activo` habilita **desactivar** en vez de borrar (loadAccess ignora inactivos).
- `es_vendedor` = ¿tiene algún puesto con `es_vendedor=true`? Se materializa aquí
  para lecturas baratas y para desacoplar del rol. Lo recalcula el RPC de recompute.

### 3.3 `member_permissions` (existente) pasa a ser tabla **materializada**

Sigue siendo lo que lee la app. Deja de editarse a mano desde la UI; la escribe el
RPC de recompute a partir de puestos + overrides. Sus 6 columnas no cambian.

`role_typed` se conserva **solo** para distinguir `owner` del resto (el bypass de
owner sigue igual). Deja de manejar la semántica de permisos.

---

## 4. Algoritmo de permiso efectivo (materialización)

Para un miembro **no-owner**, por cada `module m` y cada `action a`:

```
base(m,a)     = OR sobre todos sus puestos ACTIVOS asignados de template_permissions
override(m,a) = member_permission_overrides(m).a          -- NULL | true | false
efectivo(m,a) = COALESCE(override(m,a), base(m,a), false)
```

- Se **materializa** en `member_permissions` (upsert por módulo).
- `es_vendedor(miembro) = EXISTS puesto activo asignado con es_vendedor=true` →
  se escribe en `company_members.es_vendedor`.
- **Owner**: no se materializa nada; mantiene el fallback total del frontend (igual
  que hoy).

Recompute se dispara en:
- Asignar/quitar puestos a un miembro → recompute de ese miembro.
- Editar la grilla o `es_vendedor` de un puesto → recompute de **todos** los
  miembros que lo tienen.
- Editar overrides de un miembro → recompute de ese miembro.
- Alta de miembro (onboarding) → asignar puesto por defecto + recompute.

---

## 5. RPCs (todos `SECURITY DEFINER SET search_path='public'`, owner de la empresa)

Internos:
- `recompute_member_permissions(p_member_id uuid)` — recalcula y materializa
  `member_permissions` + `company_members.es_vendedor` de ese miembro.
- `recompute_template_members(p_template_id uuid)` — recompute de todos los miembros
  que tienen ese puesto (para cuando cambia la grilla del puesto).

Administración (llaman al recompute correspondiente al final):
- `create_permission_template(p_company_id, p_nombre, p_descripcion, p_es_vendedor)`
- `update_permission_template(p_template_id, p_nombre, p_descripcion, p_es_vendedor)`
- `set_template_permissions(p_template_id, p_grid jsonb)` — grilla completa del puesto.
- `delete_permission_template(p_template_id)` — bloquea si `es_sistema` o si está
  asignado (o reasigna/limpia según decisión).
- `assign_member_templates(p_member_id, p_template_ids uuid[])` — reemplaza el set.
- `set_member_overrides(p_member_id, p_overrides jsonb)`
- `set_member_active(p_member_id, p_activo boolean)`
- `set_member_display_name(p_member_id, p_nombre text)`

Lectura para la UI de administración:
- `get_company_templates(p_company_id)` — puestos + grillas + `es_vendedor` (owner-only).
- `get_member_assignments(p_company_id)` — por miembro: puestos asignados + overrides.

Sin cambios: `get_my_permissions` (sigue leyendo `member_permissions`),
`get_company_members_basic` (resolución de identidad, ya corregido).

---

## 6. RLS (patrón estándar del proyecto)

- `permission_templates`, `template_permissions`, `member_templates`,
  `member_permission_overrides`: política **owner-only** de la empresa
  (vía `company_id` directo o join al `template`/`member`). Es configuración de
  administración; los miembros no la leen directo (la UI de admin es owner-only).
- `member_permissions`: se mantiene su política actual (la lee `get_my_permissions`).
- Defensa en profundidad: los RPC igual validan que quien llama es owner de la
  empresa objetivo (no confiar solo en RLS).

---

## 7. Integración con onboarding (no romper lo que ya funciona)

- `create_my_company` → owner (sin cambios; owner no usa puestos).
- `redeem_invitation_code` → hoy hace `assign_default_permissions(member, role)`.
  Nuevo: al unir un miembro, **asignar un puesto por defecto** (p. ej. el código de
  invitación lleva un `template_id`) y llamar `recompute_member_permissions`. Si no
  se elige puesto, queda sin permisos (igual que hoy un `custom`), y el owner le
  asigna puesto después.
- Se respeta la regla ya documentada: `role_typed` explícito en todo INSERT a
  `company_members`; recargar tras crear membresía. Ver `CLAUDE.md`.

---

## 8. Puestos semilla iniciales (editables por el owner)

Grillas propuestas (V=ver, C=crear, E=editar, D=eliminar). Se siembran con
`es_sistema=true`. Punto de partida; el owner las ajusta.

| Puesto | es_vendedor | Módulos y acciones |
|---|---|---|
| **Administrador** | no | Todo (V/C/E/D) excepto `settings` y `holding` (o incluidos, ver §14) |
| **Contador** | no | accounts, journal, ledger, auxiliary_ledgers, reports, fiscal_years, receivables, payables → V/C/E (D en journal/aux/receivables/payables); inventory, sales, customers, shipments → V |
| **Vendedor** | **sí** | catalogo_ventas → V; sales → V/C; customers → V |
| **Adquisiciones** | no | shipments → V/C/E/D; inventory → V/C/E; payables → V/C; reports → V |
| **Licitaciones** | no | licitaciones → V/C/E/D; customers → V; receivables → V; reports → V |
| **Solo lectura** | no | reports, journal, ledger, accounts, auxiliary_ledgers → V |

---

## 9. Plan de migración de datos (garantía de cero cambios)

Objetivo: **nadie gana ni pierde acceso** al migrar.

Por cada empresa:
1. Sembrar los 6 puestos del §8 (idempotente por `UNIQUE(company_id, nombre)`).
2. Por cada miembro **no-owner** con permisos actuales:
   a. Calcular su efectivo actual (lo que tiene en `member_permissions`).
   b. Elegir puesto(s) candidato(s) por mejor coincidencia (p. ej. los 4 vendedores
      → "Vendedor"; el admin → "Administrador").
   c. Calcular el **diff** entre el efectivo actual y la unión de los puestos
      candidatos; **guardar el diff como overrides** (forzar sí/no) solo donde
      difiere. Así el efectivo materializado queda **idéntico** al actual.
   d. `es_vendedor` del miembro se preserva según el estado actual (ver §14: decidir
      si el admin sigue contando como vendedor o no).
3. Recompute de todos → `member_permissions` reescrito, idéntico bit a bit al previo.
4. Verificación automatizada: comparar `member_permissions` antes/después; debe ser
   igual. Si algo difiere, abortar.

Nota sobre los datos reales (empresa …001): 4 miembros caen limpio en "Vendedor"
(solo `catalogo_ventas` V) → sin overrides; 1 (andybauvar) cae en "Administrador"
con overrides mínimos donde difiera.

---

## 10. UI / UX (Usuarios, owner-only)

Dos secciones:

**A. Puestos**
- Lista de puestos (nombre, descripción, badge "Vendedor", "Sistema").
- Crear/editar puesto: nombre, descripción, toggle "cuenta como vendedor", y la
  **grilla módulo × 4 acciones** (V/C/E/D). `Aprobar`/`Exportar` ocultos.
- Borrar (deshabilitado en puestos de sistema o asignados).

**B. Miembros**
- Por miembro: **nombre editable**, email, estado **Activo/Inactivo** (toggle).
- **Puestos asignados** (multiselección de puestos).
- **Permisos efectivos** (grilla de solo lectura, calculada) para transparencia.
- **Excepciones** (avanzado, colapsable): forzar sí/no por módulo (overrides).
- Reemplaza el flujo actual del dropdown "Rol → custom".

---

## 11. Cobertura de backup (regla 2 del proyecto)

Agregar a las **3** ubicaciones (cliente `backupService.ts`, servidor
`build_company_backup`, y `validateBackupFile`):
- `permission_templates`, `template_permissions`, `member_templates`,
  `member_permission_overrides`.
- Orden FK en restore: templates → template_permissions → member_templates /
  member_permission_overrides.
- `member_permissions` ya está en el backup; se mantiene (es un snapshot consistente).
- Las columnas nuevas de `company_members` (`activo`, `es_vendedor`) viajan con esa
  tabla, ya cubierta.

---

## 12. Fases de implementación

1. **Base de datos**: enum/columnas + 4 tablas + RLS + RPCs (recompute + admin) +
   seed de puestos + **migración con verificación de cero cambios**. Backup (3 sitios).
2. **UI de administración**: secciones Puestos y Miembros; ocultar Aprobar/Exportar;
   activar/desactivar; nombre.
3. **Limpieza**: reemplazar `role==='custom'` por `es_vendedor` en el selector de
   comisiones; retirar `default_permissions_for_role`/`assign_default_permissions`
   una vez que onboarding use puestos.
4. **(Posterior, fuera de este alcance)** Alcance de datos: que un vendedor vea solo
   sus ventas/comisiones (canal/`vendedor_member_id`). El modelo lo deja preparado.

---

## 13. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Es el núcleo de auth (con bugs históricos) | Fases; la lectura no cambia; migración con verificación bit a bit |
| Recompute olvidado en algún disparador | Lista explícita §4; tests de que asignar/editar recalcula |
| RLS mal puesta en tablas nuevas | Patrón estándar owner-only + validación en RPC (defensa en profundidad) |
| Onboarding se rompe | `redeem_invitation_code` asigna puesto + recompute; respetar reglas de `role_typed` |
| Backup desincronizado | Añadir a las 3 ubicaciones en el mismo PR |
| Perder permisos finos actuales | Overrides preservan el estado exacto en la migración |

---

## 14. Decisiones abiertas (para confirmar antes de Fase 1)

1. **`Aprobar`/`Exportar`**: ¿ocultar (mantener columnas) o eliminar del todo?
   (Recomiendo ocultar: no rompe nada y se pueden cablear a futuro.)
2. **andybauvar (el "custom" admin)**: al migrar, ¿lo tratamos como **Administrador**
   (deja de contar como vendedor en comisiones) o sigue siendo también **Vendedor**?
3. **Administrador y `settings`/`holding`**: ¿el puesto Administrador incluye
   Configuración y Holding, o esos quedan solo para el owner?
4. **Desactivar usuarios**: confirmar que querés `activo` (soft) y conservar el
   borrado duro solo como acción excepcional.
5. **Nombres de los 6 puestos**: ¿los dejamos como en §8 o ajustás alguno?
```
