# План реализации недостающих отчётов

## Контекст

**Текущие данные в rkeeper_data.db:**

- `rkeeper_sales` (12k строк) — WAITER, DISH, QUANTITY, PAYSUM, PRLISTSUM, CATEGPATH, TABLE, CHECKNUM, SHIFTDATE
- `rkeeper_sales_bronze` (185k строк) — то же + ORDERNAME, TAXESADDED, DISHCREATOR, COMBODISH, STATUS
- `rkeeper_payments` — WAITER, BASICSUM, ORIGINALSUM, PAYLINETYPE, CARDNUM, OPENTIME, ORDERNAME, SHIFTDATE
- `rkeeper_operations` — DISH, OPERATION, QNT, TABLENAME, WAITER, MANAGER, ORDERSUMBEFORE/ORDERSUMAFTER, SOURCEORDER, SOURCETABLE
- `MENUITEMS`, `DISHGROUPS`, `PRICES`, `EMPLOYEES` — справочники

**Архитектура:** SQLite (turso/libsql) → `src/lib/rkeeper-data.ts` (кэш: in-memory + Redis) → Route Handler `/api/rkeeper/*` → React Query → Dashboard UI.

**Стек:** Next.js App Router, Tailwind v4, shadcn/ui, Recharts, React Query, Zustand, nuqs.

---

## 1. Двойной ABC-анализ + Go-list (как в MOZG)

**Суть:** Классифицировать блюда по двум осям — выручка (A/B/C) и маржинальность (A/B/C). Получается матрица 3×3. Для каждой категории — рекомендация официантам (Go-list).

**Данные:** `rkeeper_sales` — PAYSUM (выручка), PRLISTSUM (себестоимость?). Маржа = (PAYSUM - PRLISTSUM) / PAYSUM.

**SQL:**
```sql
SELECT DISH,
       SUM(PAYSUM) as revenue,
       SUM(PRLISTSUM) as cost,
       SUM(QUANTITY) as qty,
       (SUM(PAYSUM) - SUM(PRLISTSUM)) / NULLIF(SUM(PAYSUM), 0) * 100 as margin_pct
FROM rkeeper_sales
WHERE date(SHIFTDATE) BETWEEN :from AND :to
GROUP BY DISH
```

**Файлы:**
- `src/lib/rkeeper-data.ts` → функция `getAbcAnalysis()`
- `src/app/api/rkeeper/abc-analysis/route.ts`
- `src/features/abc-analysis/api/types.ts`, `service.ts`, `queries.ts`
- `src/features/abc-analysis/components/abc-matrix.tsx` — тепловая карта 3×3
- `src/features/abc-analysis/components/go-list.tsx` — рекомендации
- `src/app/dashboard/abc-analysis/page.tsx`

**UI:** Матричная таблица + цветовая индикация + список Go-list для официантов.

**Сложность:** ⭐⭐ (2-3 дня)

---

## 2. Like4Like — аналитический куб (как в Ресталитике)

**Суть:** Сравнительный анализ: выбери период А, период Б, группировку (ресторан, блюдо, категория, тип оплаты, официант) — получишь дельту.

**Данные:** `rkeeper_sales` / `rkeeper_payments` с группировкой по выбранному измерению.

**API:** Параметры: `dimension`, `period_a_from`, `period_a_to`, `period_b_from`, `period_b_to`.

**SQL:**
```sql
SELECT :dimension as label,
       SUM(CASE WHEN date(SHIFTDATE) BETWEEN :a_from AND :a_to THEN PAYSUM ELSE 0 END) as period_a,
       SUM(CASE WHEN date(SHIFTDATE) BETWEEN :b_from AND :b_to THEN PAYSUM ELSE 0 END) as period_b
FROM rkeeper_sales
GROUP BY label
```

**Файлы:**
- `src/lib/rkeeper-data.ts` → `getComparisonSales()`
- `src/app/api/rkeeper/comparison/route.ts`
- `src/features/comparison/` — селекторы периодов, UI с таблицей + bar chart
- `src/app/dashboard/comparison/page.tsx`

**Сложность:** ⭐⭐⭐ (3-4 дня)

---

## 3. Склад / Анализ списаний + Инвентаризация (как в MOZG)

### 3а. Анализ списаний

**Суть:** Какие блюда/продукты списываются, по каким причинам, динамика.

**Данные:** `rkeeper_operations` с `OPERATION = 'Writeoff'` (или аналогичные коды списания).

**SQL:**
```sql
SELECT OPERATION, DISH, SUM(QNT) as total_qty, COUNT(*) as ops_count
FROM rkeeper_operations
WHERE OPERATION LIKE '%write%' OR OPERATION LIKE '%спис%'
  AND date(SHIFTDATE) BETWEEN :from AND :to
GROUP BY OPERATION, DISH
ORDER BY total_qty DESC
```

### 3б. Эффективность товарных остатков

**Суть:** Оборачиваемость блюд/ингредиентов, дни до списания.

**Данные:** Нужна таблица остатков. Если её нет в rkeeper_data.db — добавить через ETL из RK7 (таблицы Rests/StoreRemains).

**Файлы:**
- `src/lib/rkeeper-data.ts` → `getWriteoffs()`, `getInventoryEfficiency()`
- `src/app/api/rkeeper/writeoffs/route.ts`, `inventory-efficiency/route.ts`
- Дашборд с pie chart по причинам, trend по дням

**Сложность:** ⭐⭐⭐ (4-5 дней, зависит от наличия данных об остатках)

---

## 4. Анализ изменения закупочных цен (как в MOZG)

**Суть:** Динамика цен поставщиков на ингредиенты.

**Данные:** Нужен источник закупочных цен. В RK7 есть справочники поставщиков, но ценовые данные могут быть в 1С или отдельной таблице. Если нет — нужно добавить ETL выгрузку из RK7 (PurchasePrices / SupplyDocs).

**Без источника (MVP):** Сравнение PRLISTSUM (цены продажи) по периодам — proxy-метрика.

**План:**
1. Исследовать, какие таблицы в RK7 содержат закупочные цены (PriceList, SupplyInvoice)
2. Добавить ETL-выгрузку
3. Построить график изменения цен по выбранным ингредиентам

**Сложность:** ⭐⭐⭐⭐ (5-7 дней, требуется доработка ETL)

---

## 5. Лайн-чек (как в MOZG)

**Суть:** Чек-лист контроля качества — проверка стандартов работы.

**Данные:** Не из RK7. Это пользовательский контент (создание шаблонов чек-листов, заполнение, отчёт).

**План:**
1. Таблица `checklist_templates` (id, name, items JSON)
2. Таблица `checklist_results` (id, template_id, date, results JSON, inspector)
3. API CRUD для шаблонов и результатов
4. UI: конструктор чек-листов + мобильная форма заполнения + дашборд

**Сложность:** ⭐⭐⭐⭐ (5-6 дней)

---

## 6. Маркетинговая аналитика / Посещаемость (как в MOZG + Ресталитика)

### 6а. Трафик гостей

**Суть:** Количество гостей, заполняемость, часы пик.

**Данные:** Из `rkeeper_sales` — количество чеков и позиций как proxy. Из RK7 можно выгружать данные о количестве гостей (GuestCount).

**SQL (MVP):**
```sql
SELECT date(SHIFTDATE) as dt,
       SUM(CHECKS_COUNT) as checks,
       SUM(QUANTITY) as items
FROM rkeeper_sales_gold
WHERE date(SHIFTDATE) BETWEEN :from AND :to
GROUP BY dt
```

### 6б. Эффективность акций / скидок

**Данные:** `rkeeper_payments` с `PAYLINETYPE` (скидки, бонусы), `DISCOUNTS` таблица.

**SQL:**
```sql
SELECT PAYLINETYPE, SUM(BASICSUM) as sum, SUM(ORIGINALSUM) as original
FROM rkeeper_payments
WHERE PAYLINETYPE LIKE '%скидк%'
  AND date(SHIFTDATE) BETWEEN :from AND :to
GROUP BY PAYLINETYPE
```

### 6в. Продажи по часам

**Данные:** `rkeeper_sales` — `SHIFTDATE` + час.

**SQL:**
```sql
SELECT CAST(strftime('%H', SHIFTDATE) AS INTEGER) as hour,
       SUM(PAYSUM) as revenue, SUM(CHECKS_COUNT) as checks
FROM rkeeper_sales_gold
WHERE date(SHIFTDATE) BETWEEN :from AND :to
GROUP BY hour ORDER BY hour
```

**Файлы:** Каждый под-отчёт как отдельный компонент, объединены в `/dashboard/analytics/`.

**Сложность:** ⭐⭐ (2-3 дня на всё)

---

## 7. Генератор отчётов (как в MOZG)

**Суть:** Пользователь выбирает измерения (DISH, CATEGPATH, WAITER) и метрики (PAYSUM, QUANTITY, CHECKS_COUNT) — система строит таблицу + график.

**План:**
1. Backend: API `POST /api/rkeeper/custom-report` с payload `{dimensions, metrics, filters, sort}`
2. SQL-генератор на основе выбранных полей
3. UI: drag-and-drop селекторы полей + предпросмотр
4. Сохранение шаблонов отчётов

**Быстрый MVP:** AI-генерация отчёта через Mastra/hermes-agent (уже есть SQL-аналитик).

**Файлы:**
- `src/lib/report-builder.ts` — построитель SQL из JSON-конфига
- `src/app/api/rkeeper/custom-report/route.ts`
- `src/features/report-builder/` — конструктор
- `src/app/dashboard/report-builder/page.tsx`

**Сложность:** ⭐⭐⭐⭐ (5-7 дней)

---

## 8. Авторассылка «Итоги дня» (как в Ресталитике)

**Суть:** Ежедневная сводка ключевых метрик в Telegram/email.

**План:**
1. Cron-задание (через `cronjob` в Hermes) на каждый вечер
2. Сбор ключевых метрик за сегодня vs вчера vs неделю назад
3. Формирование сообщения (выручка, средний чек, топ-3 блюда, топ-3 официанта)
4. Доставка в Telegram через Hermes Gateway

**Уже есть инфраструктура:** Hermes cron + gateway.

**Файлы:**
- `.hermes/cron/daily-digest.sh` — скрипт сбора метрик
- Настройка `cronjob` с `no_agent=True` или с AI-агентами (Hermes cron)

**Сложность:** ⭐ (1 день, но нужны настройки доставки)

---

## 9. Кастомизируемые дашборды / OLAP (как в iiko)

**Суть:** Пользователь собирает дашборд из виджетов drag-and-drop, настраивает размеры и расположение.

**План:**
1. Backend: CRUD для шаблонов дашбордов (JSON-схема расположения виджетов)
2. Виджеты: существующие Recharts-компоненты сделать переиспользуемыми
3. Библиотека виджетов для выбора
4. Grid layout (react-grid-layout или react-resizable-panels)
5. Сохранение состояния (Redux/Zustand + БД)

**Файлы:**
- `src/features/dashboard-builder/` — ядро
- `src/app/dashboard/custom/` — страница
- API: `/api/dashboard-templates/` CRUD

**Сложность:** ⭐⭐⭐⭐⭐ (7-10 дней)

---

## 10. Портфельный анализ меню (как в MOZG)

**Суть:** Анализ структуры меню — группировка блюд по категориям, сравнение доли в выручке vs доле в количестве vs маржинальности.

**Данные:** `rkeeper_sales` + `MENUITEMS` (иерархия через `DISHGROUPS`).

**SQL:**
```sql
SELECT MI.HighLevelGroup1 as group_name,
       SUM(S.PAYSUM) as revenue,
       SUM(S.QUANTITY) as qty,
       (SUM(S.PAYSUM) - SUM(S.PRLISTSUM)) / NULLIF(SUM(S.PAYSUM), 0) * 100 as margin
FROM rkeeper_sales S
JOIN MENUITEMS MI ON S.DISH = MI.Name
WHERE date(S.SHIFTDATE) BETWEEN :from AND :to
GROUP BY MI.HighLevelGroup1
```

**UI:** Пузырьковая диаграмма (Bubble chart): ось X — доля в выручке, Y — маржа, размер — количество продаж.

**Сложность:** ⭐⭐ (2-3 дня)

---

## 11. Себестоимость / Фудкост расширенный

**Текущий:** Базовый фудкост уже есть.

**Расширение:**
- Калькуляция себестоимости по рецептурам (нужны данные из RK7 — Recipes/Ingredients)
- Динамика фудкоста по дням/неделям
- План-факт фудкоста
- Фудкост по категориям блюд

**Данные:** Сейчас фудкост считается как PRLISTSUM/PAYSUM. Для точного расчёта нужны рецептуры из RK7.

**Сложность:** ⭐⭐⭐ (3-5 дней, зависит от данных рецептур)

---

## 12. Финансовая отчётность P&L / EBITDA (как в iiko)

**Суть:** Прибыль-убыток: выручка - себестоимость = валовая прибыль - ФОТ - аренда - прочие = EBITDA.

**Данные:** Выручка и себестоимость из RK7 + ручной ввод или интеграция с 1С для накладных расходов.

**План:**
1. Таблица `finance_categories` и `finance_entries` для дополнительных расходов
2. Форма ввода накладных расходов (аренда, ФОТ, маркетинг)
3. Автоматический сбор выручки и фудкоста из RK7
4. Отчёт P&L с drill-down

**Файлы:**
- `src/features/finance/`
- `src/app/dashboard/finance/page.tsx`

**Сложность:** ⭐⭐⭐ (4-5 дней)

---

## Приоритетность

| Приоритет | Что | Почему |
|-----------|-----|--------|
| **P0** | ABC-анализ + Go-list | Ключевая фишка MOZG, максимум ценности при минимуме усилий |
| **P0** | Авторассылка «Итоги дня» | Быстрая победа, вовлекает пользователей |
| **P1** | Like4Like-куб | Уникальная фича Ресталитики, сильная ценность |
| **P1** | Посещаемость + почасовка | Базовые метрики, данные уже есть |
| **P2** | Списания + инвентаризация | Данные частично есть |
| **P2** | Портфельный анализ меню | На已有的 данных |
| **P3** | Генератор отчётов | Сложно, но AI-помощник уже есть |
| **P3** | Кастомизируемые дашборды | Долго, но сильный Wow-фактор |
| **P4** | Закупочные цены | Требует доработки ETL |
| **P4** | P&L / EBITDA | Требует ручного ввода или интеграции |
| **P4** | Лайн-чек | Отдельный функционал, не core |

---

## Итоговая карта данных (что откуда брать)

| Отчёт | Таблица | Ключевые поля |
|-------|---------|---------------|
| ABC-анализ | rkeeper_sales | DISH, PAYSUM, PRLISTSUM, QUANTITY |
| Like4Like | rkeeper_sales + payments | PAYSUM, BASICSUM, CATEGPATH, WAITER |
| Списания | rkeeper_operations | DISH, OPERATION, QNT |
| Посещаемость | rkeeper_sales_gold | CHECKS_COUNT, SHIFTDATE |
| Почасовка | rkeeper_sales_gold | SHIFTDATE → час |
| Маркетинг/скидки | rkeeper_payments | PAYLINETYPE (скидки), BASICSUM |
| Премии | rkeeper_payments | WAITER, BASICSUM (уже есть) |
| Подозрительные | rkeeper_operations | OPERATION, ORDERSUMBEFORE/AFTER (уже есть) |
| Меню | MENUITEMS + DISHGROUPS | HighLevelGroup, Parent, Name |
| Прогноз | rkeeper_sales_gold | trend-based (уже есть) |
| Портфель меню | rkeeper_sales + MENUITEMS | категории, маржа, доля |

---

## Быстрый старт (что делать в первую очередь)

1. **ABC-анализ** — добавляешь SQL-запрос, 2 Recharts-компонента (матрица + bar), 1 страницу
2. **Авторассылка** — cronjob через Hermes с готовым SQL-шаблоном
3. **Почасовка** — один SQL `GROUP BY strftime('%H', SHIFTDATE)` + AreaChart
4. **Like4Like** — два пикера дат + выбор dimension + дельта-таблица
