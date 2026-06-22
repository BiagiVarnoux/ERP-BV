// src/services/pdfService.ts
import jsPDF from 'jspdf';
import autoTable, { RowInput } from 'jspdf-autotable';
import { fmt } from '@/accounting/utils';

interface ReportHeader {
  title: string;
  subtitle?: string;
  date?: string;
  period?: string;
}

function addReportHeader(doc: jsPDF, header: ReportHeader): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(header.title, pageWidth / 2, y, { align: 'center' });
  y += 8;

  // Subtitle
  if (header.subtitle) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(header.subtitle, pageWidth / 2, y, { align: 'center' });
    y += 6;
  }

  // Date/Period
  if (header.date || header.period) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text(header.date || header.period || '', pageWidth / 2, y, { align: 'center' });
    y += 4;
  }

  // Line separator
  y += 4;
  doc.setLineWidth(0.5);
  doc.line(20, y, pageWidth - 20, y);
  
  return y + 10;
}

function addFooter(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Página ${i} de ${pageCount} - Generado: ${new Date().toLocaleString('es')}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }
}

export interface TrialBalanceRow {
  id: string;
  name: string;
  debit: number;
  credit: number;
  balance: number;
}

export function exportTrialBalanceToPDF(
  rows: TrialBalanceRow[],
  totals: { debit: number; credit: number },
  period: string
): void {
  const doc = new jsPDF();
  
  const startY = addReportHeader(doc, {
    title: 'Balance de Comprobación',
    period: `Período: ${period}`,
  });

  autoTable(doc, {
    startY,
    head: [['Código', 'Cuenta', 'Debe', 'Haber', 'Saldo']],
    body: rows.map(r => [
      r.id,
      r.name,
      r.debit ? fmt(r.debit) : '',
      r.credit ? fmt(r.credit) : '',
      fmt(r.balance),
    ]),
    foot: [[
      '', 'TOTALES',
      fmt(totals.debit),
      fmt(totals.credit),
      fmt(totals.debit - totals.credit),
    ]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [66, 66, 66] },
    footStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 25 },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
  });

  addFooter(doc);
  doc.save(`balance-comprobacion-${period.replace(/\s/g, '-')}.pdf`);
}

export interface IncomeStatementData {
  ingresosDetalle: Array<{ id: string; name: string; amount: number }>;
  gastosDetalle: Array<{ id: string; name: string; amount: number }>;
  ingresos: number;
  gastos: number;
  utilidad: number;
}

export interface NIIFIncomeStatementData {
  ingresosOperativos: Array<{ id: string; name: string; amount: number }>;
  devoluciones: Array<{ id: string; name: string; amount: number }>;
  ingresosNetos: number;
  otrosIngresosOperativos: Array<{ id: string; name: string; amount: number }>;
  totalIngresosOperativos: number;
  costoVentas: Array<{ id: string; name: string; amount: number }>;
  totalCostoVentas: number;
  utilidadBruta: number;
  margenBruto: number;
  gastosOperativos: Array<{ id: string; name: string; amount: number }>;
  depreciacionAmortizacion: Array<{ id: string; name: string; amount: number }>;
  totalGastosOperativosSinDA: number;
  totalDA: number;
  totalGastosOperativos: number;
  ebitda: number;
  margenEbitda: number;
  ebit: number;
  margenOperativo: number;
  ingresosFinancieros: Array<{ id: string; name: string; amount: number }>;
  gastosFinancieros: Array<{ id: string; name: string; amount: number }>;
  resultadoFinanciero: number;
  ebt: number;
  extraordinarios: Array<{ id: string; name: string; amount: number }>;
  totalExtraordinarios: number;
  utilidadAntesImpuestos: number;
  impuestosCuentas: Array<{ id: string; name: string; amount: number }>;
  impuesto: number;
  utilidadNeta: number;
  margenNeto: number;
}

export function exportIncomeStatementNIIFToPDF(data: NIIFIncomeStatementData, period: string, previousData?: NIIFIncomeStatementData): void {
  const doc = new jsPDF();
  let startY = addReportHeader(doc, { title: 'Estado de Resultados (NIIF)', period: `Período: ${period}` });

  const hasPrev = !!previousData;
  const head = hasPrev
    ? [['Código', 'Concepto', 'Actual', 'Anterior', 'Var.']]
    : [['Código', 'Concepto', 'Monto']];

  const fmtRow = (id: string, name: string, amount: number, prevAmount?: number, isExpense = false) => {
    const val = isExpense ? `(${fmt(amount)})` : fmt(amount);
    if (!hasPrev) return [id, name, val];
    const prevVal = prevAmount !== undefined ? (isExpense ? `(${fmt(prevAmount)})` : fmt(prevAmount)) : '—';
    const varPct = prevAmount && prevAmount !== 0 ? `${(((amount - prevAmount) / Math.abs(prevAmount)) * 100).toFixed(1)}%` : '—';
    return [id, name, val, prevVal, varPct];
  };

  const sectionHeader = (title: string, color: [number, number, number]) => {
    const colSpan = hasPrev ? 5 : 3;
    return [{ content: title, colSpan, styles: { fillColor: color, fontStyle: 'bold' } }];
  };

  const highlightRow = (label: string, value: number, margin?: number, color: [number, number, number] = [200, 220, 255], prevValue?: number) => {
    const text = margin !== undefined ? `${fmt(value)} (${margin.toFixed(1)}%)` : fmt(value);
    const colSpan = 2;
    const row: any[] = [
      { content: label, colSpan, styles: { fillColor: color, fontStyle: 'bold' } },
      { content: text, styles: { fillColor: color, fontStyle: 'bold' } },
    ];
    if (hasPrev) {
      const prevText = prevValue !== undefined ? fmt(prevValue) : '—';
      const varPct = prevValue !== undefined && prevValue !== 0 ? `${(((value - prevValue) / Math.abs(prevValue)) * 100).toFixed(1)}%` : '—';
      row.push({ content: prevText, styles: { fillColor: color } });
      row.push({ content: varPct, styles: { fillColor: color } });
    }
    return row;
  };

  const body: any[] = [];

  // 1. Ingresos Operativos
  body.push(sectionHeader('1. INGRESOS OPERATIVOS', [200, 230, 200]));
  data.ingresosOperativos.forEach(v => {
    const prev = previousData?.ingresosOperativos.find(p => p.id === v.id);
    body.push(fmtRow(v.id, v.name, v.amount, prev?.amount));
  });
  if (data.devoluciones.length > 0) {
    data.devoluciones.forEach(d => {
      const prev = previousData?.devoluciones.find(p => p.id === d.id);
      body.push(fmtRow(d.id, `(-) ${d.name}`, d.amount, prev?.amount, true));
    });
  }
  if (data.otrosIngresosOperativos.length > 0) {
    data.otrosIngresosOperativos.forEach(o => {
      const prev = previousData?.otrosIngresosOperativos.find(p => p.id === o.id);
      body.push(fmtRow(o.id, o.name, o.amount, prev?.amount));
    });
  }
  body.push(highlightRow('Total Ingresos Operativos', data.totalIngresosOperativos, undefined, [180, 220, 180], previousData?.totalIngresosOperativos));

  // 2. Costo de Ventas
  body.push(sectionHeader('2. (-) COSTO DE VENTAS', [255, 230, 200]));
  data.costoVentas.forEach(c => {
    const prev = previousData?.costoVentas.find(p => p.id === c.id);
    body.push(fmtRow(c.id, c.name, c.amount, prev?.amount, true));
  });

  // Utilidad Bruta
  body.push(highlightRow('UTILIDAD BRUTA', data.utilidadBruta, data.margenBruto, [200, 220, 255], previousData?.utilidadBruta));

  // 3. Gastos Operativos
  body.push(sectionHeader('3. (-) GASTOS OPERATIVOS', [230, 200, 240]));
  data.gastosOperativos.forEach(g => {
    const prev = previousData?.gastosOperativos.find(p => p.id === g.id);
    body.push(fmtRow(g.id, g.name, g.amount, prev?.amount, true));
  });
  if (data.depreciacionAmortizacion.length > 0) {
    data.depreciacionAmortizacion.forEach(d => {
      const prev = previousData?.depreciacionAmortizacion.find(p => p.id === d.id);
      body.push(fmtRow(d.id, `D&A: ${d.name}`, d.amount, prev?.amount, true));
    });
  }

  // EBITDA
  body.push(highlightRow('EBITDA', data.ebitda, data.margenEbitda, [200, 240, 240], previousData?.ebitda));

  // EBIT
  body.push(highlightRow('EBIT (Resultado Operativo)', data.ebit, data.margenOperativo, [200, 220, 255], previousData?.ebit));

  // 4. Resultado Financiero
  if (data.ingresosFinancieros.length > 0 || data.gastosFinancieros.length > 0) {
    body.push(sectionHeader('4. RESULTADO FINANCIERO', [220, 220, 230]));
    data.ingresosFinancieros.forEach(f => {
      const prev = previousData?.ingresosFinancieros.find(p => p.id === f.id);
      body.push(fmtRow(f.id, `(+) ${f.name}`, f.amount, prev?.amount));
    });
    data.gastosFinancieros.forEach(f => {
      const prev = previousData?.gastosFinancieros.find(p => p.id === f.id);
      body.push(fmtRow(f.id, `(-) ${f.name}`, f.amount, prev?.amount, true));
    });
    body.push(highlightRow('Resultado Financiero', data.resultadoFinanciero, undefined, [220, 220, 230], previousData?.resultadoFinanciero));
  }

  // EBT
  body.push(highlightRow('EBT (Antes de Impuestos)', data.ebt, undefined, [255, 243, 205], previousData?.ebt));

  // 5. Extraordinarios
  if (data.extraordinarios.length > 0) {
    body.push(sectionHeader('5. (-) PARTIDAS EXTRAORDINARIAS', [230, 230, 230]));
    data.extraordinarios.forEach(e => {
      const prev = previousData?.extraordinarios.find(p => p.id === e.id);
      body.push(fmtRow(e.id, e.name, e.amount, prev?.amount, true));
    });
  }

  // 6. Impuestos
  if (data.impuestosCuentas.length > 0) {
    body.push(sectionHeader('6. (-) IMPUESTOS', [255, 200, 200]));
    data.impuestosCuentas.forEach(t => {
      const prev = previousData?.impuestosCuentas.find(p => p.id === t.id);
      body.push(fmtRow(t.id, t.name, t.amount, prev?.amount, true));
    });
  }

  // Utilidad Neta
  const netColor: [number, number, number] = data.utilidadNeta >= 0 ? [200, 230, 200] : [255, 200, 200];
  body.push(highlightRow('UTILIDAD NETA', data.utilidadNeta, data.margenNeto, netColor, previousData?.utilidadNeta));

  const colStyles: Record<number, any> = { 0: { cellWidth: 25 }, 2: { halign: 'right' } };
  if (hasPrev) {
    colStyles[3] = { halign: 'right' };
    colStyles[4] = { halign: 'right' };
  }

  autoTable(doc, { startY, head, body, styles: { fontSize: 9 }, headStyles: { fillColor: [66, 66, 66] }, columnStyles: colStyles });
  addFooter(doc);
  doc.save(`estado-resultados-niif-${period.replace(/\s/g, '-')}.pdf`);
}

export interface BalanceSheetData {
  activosDetalle: Array<{ id: string; name: string; balance: number }>;
  pasivosDetalle: Array<{ id: string; name: string; balance: number }>;
  patrimonioDetalle: Array<{ id: string; name: string; balance: number }>;
  utilidadAcumulada: number;
  totalActivo: number;
  totalPasivo: number;
  totalPatrimonio: number;
}

export interface BalanceSheetNIIFData {
  activosCorrientes: Array<{ id: string; name: string; balance: number }>;
  totalActivosCorrientes: number;
  activosNoCorrientes: Array<{ id: string; name: string; balance: number }>;
  totalActivosNoCorrientes: number;
  totalActivo: number;
  pasivosCorrientes: Array<{ id: string; name: string; balance: number }>;
  totalPasivosCorrientes: number;
  pasivosNoCorrientes: Array<{ id: string; name: string; balance: number }>;
  totalPasivosNoCorrientes: number;
  totalPasivo: number;
  patrimonioDetalle: Array<{ id: string; name: string; balance: number }>;
  utilidadesAcumuladasDesplegado: number;  // saldo Pn.2 + I-G de años anteriores
  resultadoEjercicio: number;              // I-G del año fiscal de bsDate únicamente
  fiscalYear: number;                      // año de la gestión (para el label)
  totalPatrimonio: number;
  razonCorriente: number | null;
  razonEndeudamiento: number;
  capitalTrabajo: number;
}

export function exportBalanceSheetNIIFToPDF(data: BalanceSheetNIIFData, date: string): void {
  const doc = new jsPDF();
  let startY = addReportHeader(doc, { title: 'Balance General (NIIF)', date: `Al: ${date}` });

  const body: any[] = [
    [{ content: 'ACTIVOS CORRIENTES', colSpan: 3, styles: { fillColor: [200, 220, 255], fontStyle: 'bold' } }],
    ...data.activosCorrientes.map(a => [a.id, a.name, fmt(a.balance)]),
    ['', { content: 'Subtotal Corrientes', styles: { fontStyle: 'bold' } }, { content: fmt(data.totalActivosCorrientes), styles: { fontStyle: 'bold' } }],
    [{ content: 'ACTIVOS NO CORRIENTES', colSpan: 3, styles: { fillColor: [200, 200, 240], fontStyle: 'bold' } }],
    ...data.activosNoCorrientes.map(a => [a.id, a.name, fmt(a.balance)]),
    ['', { content: 'Subtotal No Corrientes', styles: { fontStyle: 'bold' } }, { content: fmt(data.totalActivosNoCorrientes), styles: { fontStyle: 'bold' } }],
    [{ content: 'TOTAL ACTIVOS', colSpan: 2, styles: { fillColor: [150, 200, 255], fontStyle: 'bold' } }, { content: fmt(data.totalActivo), styles: { fillColor: [150, 200, 255], fontStyle: 'bold' } }],
    [{ content: 'PASIVOS CORRIENTES', colSpan: 3, styles: { fillColor: [255, 230, 200], fontStyle: 'bold' } }],
    ...data.pasivosCorrientes.map(p => [p.id, p.name, fmt(p.balance)]),
    [{ content: 'PASIVOS NO CORRIENTES', colSpan: 3, styles: { fillColor: [255, 220, 180], fontStyle: 'bold' } }],
    ...data.pasivosNoCorrientes.map(p => [p.id, p.name, fmt(p.balance)]),
    ['', { content: 'Total Pasivos', styles: { fontStyle: 'bold' } }, { content: fmt(data.totalPasivo), styles: { fontStyle: 'bold' } }],
    [{ content: 'PATRIMONIO', colSpan: 3, styles: { fillColor: [230, 200, 240], fontStyle: 'bold' } }],
    ...data.patrimonioDetalle.map(p => [p.id, p.name, fmt(p.balance)]),
    ['Pn.2', 'Utilidades Acumuladas', fmt(data.utilidadesAcumuladasDesplegado)],
    ['—', `Resultado del Ejercicio ${data.fiscalYear}`, fmt(data.resultadoEjercicio)],
    ['', { content: 'Total Patrimonio', styles: { fontStyle: 'bold' } }, { content: fmt(data.totalPatrimonio), styles: { fontStyle: 'bold' } }],
    [{ content: 'TOTAL PASIVO + PATRIMONIO', colSpan: 2, styles: { fillColor: [200, 200, 200], fontStyle: 'bold' } }, { content: fmt(data.totalPasivo + data.totalPatrimonio), styles: { fillColor: [200, 200, 200], fontStyle: 'bold' } }],
  ];

  autoTable(doc, { startY, head: [['Código', 'Cuenta', 'Saldo']], body, styles: { fontSize: 9 }, headStyles: { fillColor: [66, 66, 66] }, columnStyles: { 0: { cellWidth: 25 }, 2: { halign: 'right' } } });

  // @ts-ignore
  startY = doc.lastAutoTable.finalY + 10;
  autoTable(doc, { startY, body: [
    ['Razón Corriente', data.razonCorriente !== null ? `${data.razonCorriente.toFixed(2)}x` : 'N/A'],
    ['Razón Endeudamiento', `${data.razonEndeudamiento.toFixed(1)}%`],
    ['Capital de Trabajo', fmt(data.capitalTrabajo)],
  ], head: [['Indicador', 'Valor']], styles: { fontSize: 10 }, headStyles: { fillColor: [100, 100, 100] }, columnStyles: { 1: { halign: 'right' } } });

  addFooter(doc);
  doc.save(`balance-general-niif-${date}.pdf`);
}

export interface CashFlowNIIFData {
  metodo: 'directo' | 'indirecto';
  initialCashBalance: number;
  operacionDetalle: Array<{ id: string; name: string; amount: number }>;
  flujoOperacion: number;
  inversionDetalle: Array<{ id: string; name: string; amount: number }>;
  flujoInversion: number;
  financiacionDetalle: Array<{ id: string; name: string; amount: number }>;
  flujoFinanciacion: number;
  flujoNeto: number;
  finalCashBalance: number;
  ratioCobertura: number | null;
  // Indirect method fields
  utilidadNeta?: number;
  ajustesNoMonetarios?: Array<{ id: string; name: string; amount: number }>;
  totalAjustesNoMonetarios?: number;
  variacionesCapitalTrabajo?: Array<{ id: string; name: string; amount: number }>;
  totalVariacionesCT?: number;
  flujoOperativoIndirecto?: number;
}

export function exportCashFlowNIIFToPDF(data: CashFlowNIIFData, period: string): void {
  const doc = new jsPDF();
  const metodoLabel = data.metodo === 'indirecto' ? 'Método Indirecto' : 'Método Directo';
  let startY = addReportHeader(doc, { title: 'Estado de Flujo de Efectivo (NIC 7)', subtitle: metodoLabel, period: `Período: ${period}` });

  autoTable(doc, { startY, body: [['SALDO INICIAL DE EFECTIVO', fmt(data.initialCashBalance)]], styles: { fontSize: 11, fontStyle: 'bold' }, bodyStyles: { fillColor: [230, 230, 230] }, columnStyles: { 1: { halign: 'right' } } });
  // @ts-ignore
  startY = doc.lastAutoTable.finalY + 6;

  if (data.metodo === 'indirecto') {
    // Indirect operating section
    const indirectBody: any[] = [];
    indirectBody.push([{ content: 'Utilidad Neta del Período', styles: { fontStyle: 'bold' } }, '', fmt(data.utilidadNeta ?? 0)]);

    if (data.ajustesNoMonetarios && data.ajustesNoMonetarios.length > 0) {
      indirectBody.push([{ content: '(+) Ajustes por partidas no monetarias', colSpan: 3, styles: { fillColor: [240, 240, 240], fontStyle: 'italic' } }]);
      for (const item of data.ajustesNoMonetarios) {
        indirectBody.push([item.id, item.name, (item.amount >= 0 ? '+' : '') + fmt(item.amount)]);
      }
      indirectBody.push(['', { content: 'Subtotal Ajustes No Monetarios', styles: { fontStyle: 'bold' } }, (data.totalAjustesNoMonetarios! >= 0 ? '+' : '') + fmt(data.totalAjustesNoMonetarios!)]);
    }

    if (data.variacionesCapitalTrabajo && data.variacionesCapitalTrabajo.length > 0) {
      indirectBody.push([{ content: '(+/-) Variaciones en Capital de Trabajo', colSpan: 3, styles: { fillColor: [240, 240, 240], fontStyle: 'italic' } }]);
      for (const item of data.variacionesCapitalTrabajo) {
        const label = item.amount >= 0 ? `Disminución en ${item.name}` : `(Aumento) en ${item.name}`;
        indirectBody.push([item.id, label, (item.amount >= 0 ? '+' : '') + fmt(item.amount)]);
      }
      indirectBody.push(['', { content: 'Subtotal Variaciones C.T.', styles: { fontStyle: 'bold' } }, (data.totalVariacionesCT! >= 0 ? '+' : '') + fmt(data.totalVariacionesCT!)]);
    }

    autoTable(doc, {
      startY,
      head: [['ACTIVIDADES DE OPERACIÓN (Método Indirecto)', '', '']],
      body: indirectBody,
      foot: [['', 'Flujo Neto de Operación', (data.flujoOperacion >= 0 ? '+' : '') + fmt(data.flujoOperacion)]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [33, 150, 243] },
      footStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 25 }, 2: { halign: 'right' } },
    });
    // @ts-ignore
    startY = doc.lastAutoTable.finalY + 6;
  } else {
    // Direct operating section
    if (data.operacionDetalle.length > 0) {
      autoTable(doc, { startY, head: [['ACTIVIDADES DE OPERACIÓN', '', '']], body: data.operacionDetalle.map(i => [i.id, i.name, (i.amount >= 0 ? '+' : '') + fmt(i.amount)]),
        foot: [['', 'Flujo Neto', (data.flujoOperacion >= 0 ? '+' : '') + fmt(data.flujoOperacion)]], styles: { fontSize: 9 }, headStyles: { fillColor: [33, 150, 243] as [number, number, number] },
        footStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold' }, columnStyles: { 0: { cellWidth: 25 }, 2: { halign: 'right' } } });
      // @ts-ignore
      startY = doc.lastAutoTable.finalY + 6;
    }
  }

  // Investment & Financing (same for both methods)
  const sections = [
    { title: 'ACTIVIDADES DE INVERSIÓN', items: data.inversionDetalle, total: data.flujoInversion, color: [156, 39, 176] },
    { title: 'ACTIVIDADES DE FINANCIACIÓN', items: data.financiacionDetalle, total: data.flujoFinanciacion, color: [255, 152, 0] },
  ];

  for (const sec of sections) {
    if (sec.items.length > 0) {
      autoTable(doc, { startY, head: [[sec.title, '', '']], body: sec.items.map(i => [i.id, i.name, (i.amount >= 0 ? '+' : '') + fmt(i.amount)]),
        foot: [['', 'Flujo Neto', (sec.total >= 0 ? '+' : '') + fmt(sec.total)]], styles: { fontSize: 9 }, headStyles: { fillColor: sec.color as [number, number, number] },
        footStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold' }, columnStyles: { 0: { cellWidth: 25 }, 2: { halign: 'right' } } });
      // @ts-ignore
      startY = doc.lastAutoTable.finalY + 6;
    }
  }

  autoTable(doc, { startY, body: [['VARIACIÓN NETA DE EFECTIVO', (data.flujoNeto >= 0 ? '+' : '') + fmt(data.flujoNeto)], ['SALDO FINAL DE EFECTIVO', fmt(data.finalCashBalance)]],
    styles: { fontSize: 11, fontStyle: 'bold' }, bodyStyles: { fillColor: [200, 220, 255] }, columnStyles: { 1: { halign: 'right' } } });

  if (data.ratioCobertura !== null) {
    // @ts-ignore
    startY = doc.lastAutoTable.finalY + 8;
    autoTable(doc, { startY, body: [['Ratio de Cobertura de Efectivo', `${data.ratioCobertura.toFixed(2)}x`]], head: [['Indicador', 'Valor']], styles: { fontSize: 10 }, headStyles: { fillColor: [100, 100, 100] }, columnStyles: { 1: { halign: 'right' } } });
  }

  addFooter(doc);
  doc.save(`flujo-efectivo-nic7-${data.metodo}-${period.replace(/\s/g, '-')}.pdf`);
}

export interface JournalEntryPDF {
  id: string;
  date: string;
  memo?: string;
  void_of?: string;
  lines: Array<{
    account_id: string;
    account_name: string;
    debit: number;
    credit: number;
    line_memo?: string;
  }>;
}

export function exportJournalToPDF(
  entries: JournalEntryPDF[],
  period: string
): void {
  const doc = new jsPDF();
  
  const startY = addReportHeader(doc, {
    title: 'Libro Diario',
    period: `Período: ${period}`,
  });

  const body: any[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const entry of entries) {
    // Entry header row
    body.push([
      { content: entry.id, styles: { fontStyle: 'bold' } },
      { content: entry.date, styles: { fontStyle: 'bold' } },
      { content: entry.memo || '', colSpan: 3 },
    ]);

    // Entry lines
    for (const line of entry.lines) {
      body.push([
        '',
        line.account_id,
        line.account_name,
        line.debit ? fmt(line.debit) : '',
        line.credit ? fmt(line.credit) : '',
      ]);
      totalDebit += line.debit;
      totalCredit += line.credit;
    }

    // Separator row
    body.push([{ content: '', colSpan: 5, styles: { minCellHeight: 2 } }]);
  }

  autoTable(doc, {
    startY,
    head: [['ID', 'Fecha', 'Cuenta', 'Debe', 'Haber']],
    body,
    foot: [['', '', 'TOTALES', fmt(totalDebit), fmt(totalCredit)]],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [66, 66, 66] },
    footStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 25 },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
  });

  addFooter(doc);
  doc.save(`libro-diario-${period.replace(/\s/g, '-')}.pdf`);
}

export interface CashFlowData {
  initialCashBalance: number;
  operacionDetalle: Array<{ id: string; name: string; amount: number }>;
  inversionDetalle: Array<{ id: string; name: string; amount: number }>;
  financiacionDetalle: Array<{ id: string; name: string; amount: number }>;
  flujoOperacion: number;
  flujoInversion: number;
  flujoFinanciacion: number;
  flujoNeto: number;
  finalCashBalance: number;
}

export function exportCashFlowToPDF(data: CashFlowData, period: string): void {
  const doc = new jsPDF();
  
  let startY = addReportHeader(doc, {
    title: 'Estado de Flujo de Caja',
    period: `Período: ${period}`,
  });

  // Initial Balance
  autoTable(doc, {
    startY,
    body: [['SALDO INICIAL DE EFECTIVO', fmt(data.initialCashBalance)]],
    styles: { fontSize: 11, fontStyle: 'bold' },
    bodyStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0] },
    columnStyles: { 1: { halign: 'right' } },
  });

  // @ts-ignore
  startY = doc.lastAutoTable.finalY + 8;

  // Operating Activities
  if (data.operacionDetalle.length > 0) {
    autoTable(doc, {
      startY,
      head: [['ACTIVIDADES DE OPERACIÓN', '', '']],
      body: data.operacionDetalle.map(i => [i.id, i.name, (i.amount >= 0 ? '+' : '') + fmt(i.amount)]),
      foot: [['', 'Flujo Neto de Operación', (data.flujoOperacion >= 0 ? '+' : '') + fmt(data.flujoOperacion)]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [33, 150, 243] },
      footStyles: { fillColor: [200, 220, 255], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 25 }, 2: { halign: 'right' } },
    });
    // @ts-ignore
    startY = doc.lastAutoTable.finalY + 6;
  }

  // Investment Activities
  if (data.inversionDetalle.length > 0) {
    autoTable(doc, {
      startY,
      head: [['ACTIVIDADES DE INVERSIÓN', '', '']],
      body: data.inversionDetalle.map(i => [i.id, i.name, (i.amount >= 0 ? '+' : '') + fmt(i.amount)]),
      foot: [['', 'Flujo Neto de Inversión', (data.flujoInversion >= 0 ? '+' : '') + fmt(data.flujoInversion)]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [156, 39, 176] },
      footStyles: { fillColor: [230, 200, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 25 }, 2: { halign: 'right' } },
    });
    // @ts-ignore
    startY = doc.lastAutoTable.finalY + 6;
  }

  // Financing Activities
  if (data.financiacionDetalle.length > 0) {
    autoTable(doc, {
      startY,
      head: [['ACTIVIDADES DE FINANCIACIÓN', '', '']],
      body: data.financiacionDetalle.map(i => [i.id, i.name, (i.amount >= 0 ? '+' : '') + fmt(i.amount)]),
      foot: [['', 'Flujo Neto de Financiación', (data.flujoFinanciacion >= 0 ? '+' : '') + fmt(data.flujoFinanciacion)]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [255, 152, 0] },
      footStyles: { fillColor: [255, 230, 200], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 25 }, 2: { halign: 'right' } },
    });
    // @ts-ignore
    startY = doc.lastAutoTable.finalY + 6;
  }

  // Net Cash Flow
  autoTable(doc, {
    startY,
    body: [['FLUJO NETO TOTAL', (data.flujoNeto >= 0 ? '+' : '') + fmt(data.flujoNeto)]],
    styles: { fontSize: 11, fontStyle: 'bold' },
    bodyStyles: { 
      fillColor: data.flujoNeto >= 0 ? [200, 230, 200] : [255, 200, 200],
      textColor: [0, 0, 0],
    },
    columnStyles: { 1: { halign: 'right' } },
  });

  // @ts-ignore
  startY = doc.lastAutoTable.finalY + 8;

  // Final Balance
  autoTable(doc, {
    startY,
    body: [
      ['SALDO FINAL DE EFECTIVO', fmt(data.finalCashBalance)],
      ['Verificación: Inicial + Flujo = Final', `${fmt(data.initialCashBalance)} + ${fmt(data.flujoNeto)} = ${fmt(data.finalCashBalance)}`],
    ],
    styles: { fontSize: 10 },
    bodyStyles: { fillColor: [200, 220, 255], textColor: [0, 0, 0] },
    columnStyles: { 1: { halign: 'right' } },
  });

  addFooter(doc);
  doc.save(`flujo-caja-${period.replace(/\s/g, '-')}.pdf`);
}

export interface ChartOfAccountsRow {
  id: string;
  name: string;
  type: string;
  normal_side: string;
  is_active: boolean;
  clasificacion_resultado?: string | null;
  subclasificacion_resultado?: string | null;
  clasificacion_flujo?: string | null;
  is_cash_equivalent?: boolean;
  is_current?: boolean | null;
  es_partida_no_monetaria?: boolean;
  es_capital_trabajo?: boolean;
  es_financiera?: boolean;
  es_extraordinaria?: boolean;
  afecta_ebitda?: boolean;
}

export function exportChartOfAccountsToPDF(accounts: ChartOfAccountsRow[]): void {
  const doc = new jsPDF('landscape');
  const startY = addReportHeader(doc, { title: 'Plan de Cuentas', date: new Date().toLocaleDateString('es') });

  const boolLabel = (v?: boolean | null) => v === true ? 'Sí' : v === false ? 'No' : '—';

  autoTable(doc, {
    startY,
    head: [['Código', 'Nombre', 'Tipo', 'Lado', 'Estado', 'Clasif. Resultado', 'Subclas.', 'Flujo', 'Efectivo', 'Corriente', 'No Mon.', 'Financ.', 'Extrao.', 'EBITDA']],
    body: accounts.map(a => [
      a.id,
      a.name,
      a.type,
      a.normal_side,
      a.is_active ? 'Activa' : 'Inactiva',
      a.clasificacion_resultado || '—',
      a.subclasificacion_resultado || '—',
      a.clasificacion_flujo || '—',
      boolLabel(a.is_cash_equivalent),
      boolLabel(a.is_current),
      boolLabel(a.es_partida_no_monetaria),
      boolLabel(a.es_financiera),
      boolLabel(a.es_extraordinaria),
      boolLabel(a.afecta_ebitda),
    ]),
    styles: { fontSize: 7 },
    headStyles: { fillColor: [66, 66, 66], fontSize: 7 },
    columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 35 } },
  });

  addFooter(doc);
  doc.save('plan-de-cuentas.pdf');
}

// ─── Estado de Cambios en el Patrimonio ──────────────────────────────────────

export interface EquityChangesPDFData {
  columns: Array<{ accountId: string; accountName: string }>;
  rows: Array<{
    label: string;
    rowType: string;
    values: Record<string, number>;
    total: number;
    isBold?: boolean;
    isHighlighted?: boolean;
  }>;
  periodLabel: string;
}

export function exportEquityChangesToPDF(data: EquityChangesPDFData, period: string): void {
  const doc = new jsPDF({ orientation: data.columns.length > 3 ? 'landscape' : 'portrait' });
  let startY = addReportHeader(doc, {
    title: 'Estado de Cambios en el Patrimonio',
    period: `Período: ${period}`,
  });

  const fmt = (n: number) =>
    n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const colHeaders = [
    'Concepto',
    ...data.columns.map(c => c.accountName),
    'Total',
  ];

  const body = data.rows.map(row => {
    const cells: any[] = [
      {
        content: row.label,
        styles: {
          fontStyle: row.isBold ? 'bold' : 'normal',
          fillColor: row.isHighlighted ? [230, 240, 255] : row.rowType === 'opening' ? [240, 240, 240] : undefined,
        },
      },
      ...data.columns.map(col => {
        const val = row.values[col.accountId];
        return {
          content: val !== undefined && val !== 0 ? `${val > 0 ? '+' : ''}${fmt(val)}` : '—',
          styles: {
            halign: 'right' as const,
            fontStyle: row.isBold ? 'bold' : 'normal',
            textColor: val > 0 ? [0, 120, 0] : val < 0 ? [180, 0, 0] : [150, 150, 150],
            fillColor: row.isHighlighted ? [230, 240, 255] : row.rowType === 'opening' ? [240, 240, 240] : undefined,
          },
        };
      }),
      {
        content: row.total !== 0 ? `${row.total > 0 ? '+' : ''}${fmt(row.total)}` : '—',
        styles: {
          halign: 'right' as const,
          fontStyle: 'bold' as const,
          textColor: row.total > 0 ? [0, 120, 0] : row.total < 0 ? [180, 0, 0] : [150, 150, 150],
          fillColor: row.isHighlighted ? [230, 240, 255] : row.rowType === 'opening' ? [240, 240, 240] : undefined,
        },
      },
    ];
    return cells;
  });

  (doc as any).autoTable({
    startY,
    head: [colHeaders],
    body,
    headStyles: { fillColor: [66, 66, 66], fontSize: 9 },
    styles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 55 } },
  });

  addFooter(doc);
  doc.save(`estado-cambios-patrimonio-${period.replace(/\s/g, '-').toLowerCase()}.pdf`);
}

// ─── Exportar Embarque a PDF ──────────────────────────────────────────────────

export interface ShipmentPDFData {
  numero: string;
  descripcion?: string;
  status: string;
  created_at: string;
  tc_paralelo: number;
  tc_oficial: number;
  flete_total_bs?: number;
  flete_fecha?: string;
  metodo_peso?: string;
  tarifa_manipuleo_por_kg: number;
  products: Array<{
    nombre: string;
    categoria: string;
    cantidad: number;
    precio_usd: number;
    precio_usd_total?: number;
    tax_pct: number;
    fecha_compra: string;
    tiene_bateria: boolean;
    costo_bateria: number;
    ga_pct: number;
    ga_monto?: number;
    iva_monto?: number;
    m1?: number;
    m2?: number;
    m3?: number;
    peso_bruto?: number;
    precio_bs_pagado?: number;
    precio_bs_pagado_total?: number;
    tc_producto?: number;
  }>;
  gastos_aduana: Array<{ concepto: string; monto: number; fecha: string }>;
  costos?: Array<{
    nombre: string;
    cantidad: number;
    precioBs: number;
    envio: number;
    ga: number;
    iva: number;
    manipuleo: number;
    bateria: number;
    costo_unitario: number;
  }>;
  /** Si es true, el PDF muestra el costo unitario sumando el IVA (no contable, solo informativo). */
  includeIVA?: boolean;
}

// Colores por sección del embarque
const CLR = {
  navy:     [15, 52, 96]   as [number, number, number],
  blue:     [30, 100, 220] as [number, number, number],
  purple:   [100, 60, 180] as [number, number, number],
  orange:   [190, 100, 20] as [number, number, number],
  red:      [160, 40, 40]  as [number, number, number],
  green:    [30, 140, 70]  as [number, number, number],
  gray:     [80, 80, 80]   as [number, number, number],
  lightblue:[220, 232, 255] as [number, number, number],
  lightgray:[240, 240, 242] as [number, number, number],
  totalrow: [210, 225, 210] as [number, number, number],
};

function shipmentSectionTitle(doc: jsPDF, title: string, y: number, color: [number,number,number]): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(...color);
  doc.rect(14, y - 4, pageWidth - 28, 7, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(title, 17, y + 0.5);
  doc.setTextColor(0, 0, 0);
  return y + 7;
}

export function exportShipmentToPDF(data: ShipmentPDFData): void {
  const doc = new jsPDF('p', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  const ML = 14; // margin left
  const MR = 14; // margin right

  // ── Pre-calcular totales ──────────────────────────────────────────────────
  const totalUnidades  = data.products.reduce((s, p) => s + p.cantidad, 0);
  const totalUSD       = data.products.reduce((s, p) =>
    s + (p.precio_usd_total != null ? p.precio_usd_total : p.precio_usd * p.cantidad), 0);
  const totalBsPagado  = data.products.reduce((s, p) =>
    s + (p.precio_bs_pagado_total != null ? p.precio_bs_pagado_total
       : p.precio_bs_pagado != null ? p.precio_bs_pagado * p.cantidad : 0), 0);
  const totalGA        = data.products.reduce((s, p) => s + (p.ga_monto ?? 0), 0);
  const totalIVA       = data.products.reduce((s, p) => s + (p.iva_monto ?? 0), 0);
  const totalGastos    = data.gastos_aduana.reduce((s, g) => s + g.monto, 0);
  const includeIVA = data.includeIVA === true;
  const adjustedCosto = (c: NonNullable<ShipmentPDFData['costos']>[number]) =>
    includeIVA ? c.costo_unitario + c.iva : c.costo_unitario;
  const totalCostoFinal = data.costos?.reduce((s, c) => s + adjustedCosto(c) * c.cantidad, 0);
  const hasTributos    = data.products.some(p => p.ga_monto || p.iva_monto);
  const hasMedias      = data.products.some(p => p.m1 || p.m2 || p.m3 || p.peso_bruto);
  const isClosed       = !!data.costos && data.costos.length > 0;

  // ── ENCABEZADO ────────────────────────────────────────────────────────────
  // Barra superior navy
  doc.setFillColor(...CLR.navy);
  doc.rect(0, 0, pageWidth, 24, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(`Embarque ${data.numero}${includeIVA ? '  (con IVA)' : ''}`, ML, 11);

  // Descripción
  if (data.descripcion) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(data.descripcion, ML, 17);
  }

  // Estado (badge derecha)
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const statusText = `● ${data.status}`;
  const statusW = doc.getTextWidth(statusText) + 6;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(pageWidth - MR - statusW, 8, statusW, 8, 2, 2, 'F');
  doc.setTextColor(...CLR.navy);
  doc.text(statusText, pageWidth - MR - statusW + 3, 13.5);

  // Fecha creación
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 200, 230);
  doc.setFontSize(8);
  doc.text(`Creado: ${data.created_at}  ·  Generado: ${new Date().toLocaleDateString('es-BO')}`, ML, 22);

  doc.setTextColor(0, 0, 0);
  let currentY = 30;

  // ── RESUMEN EJECUTIVO ──────────────────────────────────────────────────────
  currentY = shipmentSectionTitle(doc, 'RESUMEN EJECUTIVO', currentY, CLR.navy);
  currentY += 2;

  // Fila de tarjetas de resumen (tabla de 2 columnas: etiqueta | valor)
  const summaryLeft: Array<[string, string]> = [
    ['Productos distintos', `${data.products.length} ítems (${totalUnidades} unidades)`],
    ['Total compra (USD)', `$${totalUSD.toLocaleString('es-BO', {minimumFractionDigits:2, maximumFractionDigits:2})}`],
    ['Total compra (Bs pagado)', totalBsPagado > 0 ? fmt(totalBsPagado) : `≈ ${fmt(totalUSD * data.tc_paralelo)}  (estimado a T/C paralelo)`],
    ['Flete total', data.flete_total_bs != null ? `${fmt(data.flete_total_bs)} Bs` : 'No registrado'],
  ];
  const summaryRight: Array<[string, string]> = [
    ['Tributos (GA + IVA)', hasTributos ? `${fmt(totalGA + totalIVA)} Bs` : 'No registrados'],
    ['Gastos de aduana', data.gastos_aduana.length > 0 ? `${fmt(totalGastos)} Bs` : 'No registrados'],
    [includeIVA ? 'Costo total final (con IVA)' : 'Costo total final', isClosed ? `${fmt(totalCostoFinal!)} Bs` : 'Embarque no cerrado'],
    ['Estado del embarque', data.status],
  ];

  // Renderizar como dos tablas side-by-side simuladas con una tabla de 4 columnas
  const summaryBody = summaryLeft.map(([lk, lv], i) => {
    const [rk, rv] = summaryRight[i] ?? ['', ''];
    return [
      { content: lk, styles: { fontStyle: 'bold' as const, fillColor: CLR.lightgray, cellWidth: 42 } },
      { content: lv, styles: { fillColor: CLR.lightgray } },
      { content: rk, styles: { fontStyle: 'bold' as const, fillColor: [248, 248, 248] as [number,number,number], cellWidth: 42 } },
      { content: rv, styles: { fillColor: [248, 248, 248] as [number,number,number] } },
    ];
  });

  autoTable(doc, {
    startY: currentY,
    body: summaryBody,
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 42 }, 2: { cellWidth: 42 } },
    margin: { left: ML, right: MR },
    tableLineColor: [200, 200, 210],
    tableLineWidth: 0.2,
  });
  currentY = (doc as any).lastAutoTable.finalY + 6;

  // ── DATOS GENERALES ────────────────────────────────────────────────────────
  currentY = shipmentSectionTitle(doc, 'DATOS GENERALES DEL EMBARQUE', currentY, CLR.gray);
  currentY += 2;

  const metodoLabel: Record<string, string> = {
    automatico:      'Automático (mayor entre volumen y bruto)',
    peso_volumen:    'Peso Volumétrico',
    peso_bruto:      'Peso Bruto',
  };

  const generalBody: any[] = [
    [
      { content: 'T/C Paralelo', styles: { fontStyle: 'bold' as const } }, String(data.tc_paralelo),
      { content: 'T/C Oficial', styles: { fontStyle: 'bold' as const } }, String(data.tc_oficial),
    ],
    [
      { content: 'Tarifa Manipuleo', styles: { fontStyle: 'bold' as const } }, `${data.tarifa_manipuleo_por_kg} Bs/kg`,
      { content: 'Método de Peso', styles: { fontStyle: 'bold' as const } }, metodoLabel[data.metodo_peso ?? 'automatico'] ?? (data.metodo_peso ?? 'Automático'),
    ],
  ];
  if (data.flete_total_bs != null || data.flete_fecha) {
    generalBody.push([
      { content: 'Flete Total', styles: { fontStyle: 'bold' as const } },
      data.flete_total_bs != null ? `${fmt(data.flete_total_bs)} Bs` : '—',
      { content: 'Fecha de Flete', styles: { fontStyle: 'bold' as const } },
      data.flete_fecha ?? '—',
    ]);
  }

  autoTable(doc, {
    startY: currentY,
    body: generalBody,
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 38, fillColor: CLR.lightgray }, 2: { cellWidth: 38, fillColor: CLR.lightgray } },
    margin: { left: ML, right: MR },
    tableLineColor: [200, 200, 210],
    tableLineWidth: 0.2,
  });
  currentY = (doc as any).lastAutoTable.finalY + 6;

  // ── PRODUCTOS ─────────────────────────────────────────────────────────────
  currentY = shipmentSectionTitle(doc, `PRODUCTOS (${data.products.length} ítems · ${totalUnidades} unidades)`, currentY, CLR.blue);
  currentY += 2;

  const productBody: any[][] = data.products.map((p, i) => {
    const usdTotal = p.precio_usd_total != null ? p.precio_usd_total : p.precio_usd * p.cantidad;
    const bsTotal  = p.precio_bs_pagado_total != null ? p.precio_bs_pagado_total
                   : p.precio_bs_pagado != null ? p.precio_bs_pagado * p.cantidad : null;
    return [
      { content: String(i + 1), styles: { halign: 'center' as const, fillColor: CLR.lightblue } },
      p.nombre || '—',
      p.categoria,
      { content: String(p.cantidad), styles: { halign: 'center' as const } },
      { content: `$${fmt(p.precio_usd)}`, styles: { halign: 'right' as const } },
      { content: `$${fmt(usdTotal)}`, styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      { content: bsTotal != null ? fmt(bsTotal) : '—', styles: { halign: 'right' as const } },
      { content: p.tc_producto ? String(p.tc_producto) : '—', styles: { halign: 'center' as const } },
      { content: `${p.ga_pct}%`, styles: { halign: 'center' as const } },
      p.fecha_compra,
    ];
  });

  // Fila de totales
  const totalBsPagadoStr = totalBsPagado > 0 ? fmt(totalBsPagado) : '—';
  productBody.push([
    { content: '', styles: { fillColor: CLR.totalrow } },
    { content: 'TOTALES', colSpan: 3, styles: { fontStyle: 'bold' as const, fillColor: CLR.totalrow } },
    '',
    { content: `$${fmt(totalUSD)}`, styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: CLR.totalrow } },
    { content: `$${fmt(totalUSD)}`, styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: CLR.totalrow } },
    { content: totalBsPagadoStr, styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: CLR.totalrow } },
    { content: '', styles: { fillColor: CLR.totalrow } },
    { content: '', styles: { fillColor: CLR.totalrow } },
    { content: '', styles: { fillColor: CLR.totalrow } },
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Producto', 'Categoría', 'Cant.', 'USD Unit.', 'USD Total', 'Bs Pagado', 'T/C', 'GA%', 'F. Compra']],
    body: productBody as any,
    headStyles: { fillColor: CLR.blue, fontSize: 8, textColor: [255,255,255] },
    styles: { fontSize: 8, cellPadding: 2.2 },
    columnStyles: {
      0: { cellWidth: 8 },
      3: { cellWidth: 12 },
      4: { cellWidth: 20 },
      5: { cellWidth: 22 },
      6: { cellWidth: 22 },
      7: { cellWidth: 14 },
      8: { cellWidth: 12 },
      9: { cellWidth: 20 },
    },
    margin: { left: ML, right: MR },
  });
  currentY = (doc as any).lastAutoTable.finalY + 6;

  // ── MEDIDAS Y PESOS ────────────────────────────────────────────────────────
  if (hasMedias) {
    currentY = shipmentSectionTitle(doc, 'MEDIDAS Y PESOS', currentY, CLR.purple);
    currentY += 2;

    const medidasBody = data.products.map((p, i) => {
      const pesoVol = (p.m1 && p.m2 && p.m3) ? (p.m1 * p.m2 * p.m3) / 5000 : null;
      const pesoEfectivo = pesoVol != null && p.peso_bruto != null
        ? Math.max(pesoVol, p.peso_bruto)
        : pesoVol ?? p.peso_bruto ?? null;
      return [
        { content: String(i + 1), styles: { halign: 'center' as const, fillColor: CLR.lightblue } },
        p.nombre || '—',
        { content: p.m1 ? String(p.m1) : '—', styles: { halign: 'center' as const } },
        { content: p.m2 ? String(p.m2) : '—', styles: { halign: 'center' as const } },
        { content: p.m3 ? String(p.m3) : '—', styles: { halign: 'center' as const } },
        { content: p.peso_bruto ? String(p.peso_bruto) : '—', styles: { halign: 'center' as const } },
        { content: pesoVol != null ? pesoVol.toFixed(2) : '—', styles: { halign: 'center' as const } },
        { content: pesoEfectivo != null ? pesoEfectivo.toFixed(2) : '—', styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [['#', 'Producto', 'M1 (cm)', 'M2 (cm)', 'M3 (cm)', 'Peso Bruto (kg)', 'Peso Vol. (kg)', 'Peso Efectivo (kg)']],
      body: medidasBody,
      headStyles: { fillColor: CLR.purple, fontSize: 8, textColor: [255,255,255] },
      styles: { fontSize: 8, cellPadding: 2.2 },
      columnStyles: { 0: { cellWidth: 8 } },
      margin: { left: ML, right: MR },
    });
    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── TRIBUTOS ADUANEROS ────────────────────────────────────────────────────
  if (hasTributos) {
    currentY = shipmentSectionTitle(doc, 'TRIBUTOS ADUANEROS (DIM)', currentY, CLR.orange);
    currentY += 2;

    const tribBody: any[][] = data.products
      .filter(p => p.ga_monto || p.iva_monto)
      .map((p, i) => [
        { content: String(i + 1), styles: { halign: 'center' as const, fillColor: CLR.lightblue } },
        p.nombre || '—',
        { content: `${p.ga_pct}%`, styles: { halign: 'center' as const } },
        { content: fmt(p.ga_monto ?? 0), styles: { halign: 'right' as const } },
        { content: fmt(p.iva_monto ?? 0), styles: { halign: 'right' as const } },
        { content: fmt((p.ga_monto ?? 0) + (p.iva_monto ?? 0)), styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      ]);

    tribBody.push([
      { content: '', styles: { fillColor: CLR.totalrow } },
      { content: 'TOTAL', styles: { fontStyle: 'bold' as const, fillColor: CLR.totalrow } },
      { content: '', styles: { fillColor: CLR.totalrow } },
      { content: fmt(totalGA), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: CLR.totalrow } },
      { content: fmt(totalIVA), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: CLR.totalrow } },
      { content: fmt(totalGA + totalIVA), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: CLR.totalrow } },
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['#', 'Producto', 'GA %', 'GA (Bs)', 'IVA (Bs)', 'Total Tributos (Bs)']],
      body: tribBody as any,
      headStyles: { fillColor: CLR.orange, fontSize: 8, textColor: [255,255,255] },
      styles: { fontSize: 8, cellPadding: 2.2 },
      columnStyles: {
        0: { cellWidth: 8 },
        2: { cellWidth: 18 },
        3: { cellWidth: 30 },
        4: { cellWidth: 30 },
        5: { cellWidth: 38 },
      },
      margin: { left: ML, right: MR },
    });
    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── GASTOS DE ADUANA ───────────────────────────────────────────────────────
  if (data.gastos_aduana.length > 0) {
    currentY = shipmentSectionTitle(doc, 'GASTOS DE ADUANA / MANIPULEO', currentY, CLR.red);
    currentY += 2;

    const gastosBody: any[][] = data.gastos_aduana.map(g => [
      g.concepto,
      { content: fmt(g.monto), styles: { halign: 'right' as const } },
      g.fecha,
    ]);
    gastosBody.push([
      { content: 'TOTAL', styles: { fontStyle: 'bold' as const, fillColor: CLR.totalrow } },
      { content: fmt(totalGastos), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: CLR.totalrow } },
      { content: '', styles: { fillColor: CLR.totalrow } },
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Concepto', 'Monto (Bs)', 'Fecha']],
      body: gastosBody as any,
      headStyles: { fillColor: CLR.red, fontSize: 8, textColor: [255,255,255] },
      styles: { fontSize: 8, cellPadding: 2.2 },
      columnStyles: { 1: { cellWidth: 40 }, 2: { cellWidth: 30 } },
      margin: { left: ML, right: MR },
    });
    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── COSTOS FINALES ─────────────────────────────────────────────────────────
  if (isClosed && data.costos && data.costos.length > 0) {
    currentY = shipmentSectionTitle(doc, includeIVA
      ? 'COSTOS FINALES POR PRODUCTO (con IVA — solo informativo, no contable)'
      : 'COSTOS FINALES POR PRODUCTO (Embarque Cerrado)', currentY, CLR.green);
    currentY += 2;

    const costBody: any[][] = data.costos.map((c, i) => {
      const costoUnit = adjustedCosto(c);
      return [
      { content: String(i + 1), styles: { halign: 'center' as const, fillColor: CLR.lightblue } },
      c.nombre || '—',
      { content: String(c.cantidad), styles: { halign: 'center' as const } },
      { content: fmt(c.precioBs), styles: { halign: 'right' as const } },
      { content: fmt(c.envio), styles: { halign: 'right' as const } },
      { content: fmt(c.ga), styles: { halign: 'right' as const } },
      { content: fmt(c.iva), styles: { halign: 'right' as const, fontStyle: includeIVA ? ('bold' as const) : ('normal' as const) } },
      { content: fmt(c.manipuleo), styles: { halign: 'right' as const } },
      { content: c.bateria > 0 ? fmt(c.bateria) : '—', styles: { halign: 'right' as const } },
      { content: fmt(costoUnit), styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      { content: fmt(costoUnit * c.cantidad), styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
    ]; });

    costBody.push([
      { content: '', styles: { fillColor: CLR.totalrow } },
      { content: 'GRAN TOTAL', colSpan: 2, styles: { fontStyle: 'bold' as const, fillColor: CLR.totalrow } },
      '', '', '', '', '', '', '',
      { content: '', styles: { fillColor: CLR.totalrow } },
      { content: fmt(totalCostoFinal!), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: CLR.totalrow } },
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['#', 'Producto', 'Cant.', 'Precio Bs', 'Envío', 'GA', 'IVA', 'Manipuleo', 'Batería', 'Costo Unit.', 'Costo Total']],
      body: costBody as any,
      headStyles: { fillColor: CLR.green, fontSize: 8, textColor: [255,255,255] },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 8 }, 2: { cellWidth: 12 } },
      margin: { left: ML, right: MR },
    });
  }

  // ── PIE DE PÁGINA ─────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const ph = doc.internal.pageSize.getHeight();
    doc.setFillColor(...CLR.navy);
    doc.rect(0, ph - 10, pageWidth, 10, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 200, 230);
    doc.text(
      `Embarque ${data.numero}  ·  Página ${i} de ${pageCount}  ·  ERP BV  ·  ${new Date().toLocaleString('es-BO')}`,
      pageWidth / 2, ph - 3.5,
      { align: 'center' }
    );
    doc.setTextColor(0, 0, 0);
  }

  doc.save(`embarque-${data.numero.toLowerCase()}${includeIVA ? '-con-iva' : ''}.pdf`);
}

// ─── Exportar Cotización de Licitación a PDF ──────────────────────────────────

export interface CotizacionProductoPDF {
  nombre: string;
  cantidad: number;
  precio_usd: number;
  tc: number;
  total_individual: number;
  precio_piso: number;
  precio_ofertado: number;
  total_ofertado: number;
  ganancia: number;
  roi: number;
}

export interface CotizacionResumenPDF {
  total_import: number;
  total_ofertado: number;
  iva_pagar: number;
  it_pagar: number;
  costos: number;
  ganancia: number;
  roi: number;
}

export interface CotizacionPDFData {
  licitacion: {
    nombre: string;
    entidad?: string;
    numero_sicoes?: string;
    tipo_proceso: string;
    fecha_presentacion?: string;
    precio_referencial?: number;
  };
  productos: CotizacionProductoPDF[];
  resumen: CotizacionResumenPDF;
}

const LIC_CLR = {
  navy:      [15, 52, 96]    as [number, number, number],
  teal:      [14, 116, 144]  as [number, number, number],
  green:     [22, 101, 52]   as [number, number, number],
  red:       [153, 27, 27]   as [number, number, number],
  amber:     [146, 64, 14]   as [number, number, number],
  lightgray: [243, 244, 246] as [number, number, number],
  totalrow:  [209, 233, 222] as [number, number, number],
};

export function exportCotizacionToPDF(data: CotizacionPDFData): void {
  const doc = new jsPDF('landscape', 'mm', 'letter');
  const pageWidth  = doc.internal.pageSize.getWidth();
  const ML = 12;
  const MR = 12;

  const fmtN = (n: number) =>
    n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (n: number) =>
    `${(n * 100).toFixed(1)}%`;

  // ── ENCABEZADO ───────────────────────────────────────────────────────────────
  doc.setFillColor(...LIC_CLR.navy);
  doc.rect(0, 0, pageWidth, 22, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text('Cotización de Licitación', ML, 10);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 210, 235);
  const meta = [
    data.licitacion.entidad && `Entidad: ${data.licitacion.entidad}`,
    data.licitacion.numero_sicoes && `N° SICOES: ${data.licitacion.numero_sicoes}`,
    data.licitacion.tipo_proceso && `Tipo: ${data.licitacion.tipo_proceso}`,
    data.licitacion.fecha_presentacion && `Presentación: ${data.licitacion.fecha_presentacion}`,
  ].filter(Boolean).join('   ·   ');
  doc.text(meta || '', ML, 17);

  // Precio referencial (badge derecha)
  if (data.licitacion.precio_referencial) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const refTxt = `Precio Ref: Bs ${fmtN(data.licitacion.precio_referencial)}`;
    doc.setFillColor(255, 255, 255);
    const rw = doc.getTextWidth(refTxt) + 8;
    doc.roundedRect(pageWidth - MR - rw, 7, rw, 9, 2, 2, 'F');
    doc.setTextColor(...LIC_CLR.navy);
    doc.text(refTxt, pageWidth - MR - rw + 4, 13);
  }

  doc.setTextColor(0, 0, 0);

  // Título de la licitación
  let currentY = 27;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text(data.licitacion.nombre, ML, currentY);
  currentY += 7;

  doc.setLineWidth(0.4);
  doc.setDrawColor(...LIC_CLR.navy);
  doc.line(ML, currentY, pageWidth - MR, currentY);
  currentY += 5;

  // ── TABLA DE PRODUCTOS ───────────────────────────────────────────────────────
  const prodBody: any[][] = data.productos.map((p, i) => {
    const isBad = p.ganancia < 0;
    const color = isBad ? LIC_CLR.red : LIC_CLR.green;
    return [
      { content: String(i + 1), styles: { halign: 'center' as const } },
      p.nombre || '—',
      { content: String(p.cantidad), styles: { halign: 'center' as const } },
      { content: `$${fmtN(p.precio_usd)}`, styles: { halign: 'right' as const } },
      { content: `${p.tc}`, styles: { halign: 'center' as const } },
      { content: `Bs ${fmtN(p.total_individual)}`, styles: { halign: 'right' as const } },
      { content: `Bs ${fmtN(p.precio_piso)}`, styles: { halign: 'right' as const, textColor: LIC_CLR.amber } },
      { content: `Bs ${fmtN(p.precio_ofertado)}`, styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      { content: `Bs ${fmtN(p.total_ofertado)}`, styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      { content: `Bs ${fmtN(p.ganancia)}`, styles: { halign: 'right' as const, textColor: color, fontStyle: 'bold' as const } },
      { content: fmtPct(p.roi), styles: { halign: 'center' as const, textColor: color, fontStyle: 'bold' as const } },
    ];
  });

  // Fila de totales resumen
  const hasNegGanancia = data.resumen.ganancia < 0;
  prodBody.push([
    { content: '', styles: { fillColor: LIC_CLR.totalrow } },
    { content: 'TOTALES', styles: { fontStyle: 'bold' as const, fillColor: LIC_CLR.totalrow } },
    { content: `${data.productos.reduce((s, p) => s + p.cantidad, 0)}`, styles: { halign: 'center' as const, fillColor: LIC_CLR.totalrow, fontStyle: 'bold' as const } },
    { content: '', styles: { fillColor: LIC_CLR.totalrow } },
    { content: '', styles: { fillColor: LIC_CLR.totalrow } },
    { content: `Bs ${fmtN(data.resumen.total_import)}`, styles: { halign: 'right' as const, fillColor: LIC_CLR.totalrow, fontStyle: 'bold' as const } },
    { content: '', styles: { fillColor: LIC_CLR.totalrow } },
    { content: '', styles: { fillColor: LIC_CLR.totalrow } },
    { content: `Bs ${fmtN(data.resumen.total_ofertado)}`, styles: { halign: 'right' as const, fillColor: LIC_CLR.totalrow, fontStyle: 'bold' as const } },
    { content: `Bs ${fmtN(data.resumen.ganancia)}`, styles: { halign: 'right' as const, fillColor: LIC_CLR.totalrow, fontStyle: 'bold' as const, textColor: hasNegGanancia ? LIC_CLR.red : LIC_CLR.green } },
    { content: fmtPct(data.resumen.roi), styles: { halign: 'center' as const, fillColor: LIC_CLR.totalrow, fontStyle: 'bold' as const, textColor: hasNegGanancia ? LIC_CLR.red : LIC_CLR.green } },
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Producto', 'Q', 'USD Unit.', 'T/C', 'Costo Unit. (Bs)', 'Precio Piso', 'Ofertado Unit.', 'Total Ofertado', 'Ganancia', 'ROI']],
    body: prodBody as any,
    headStyles: { fillColor: LIC_CLR.teal, fontSize: 8, textColor: [255, 255, 255] },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    columnStyles: {
      0:  { cellWidth: 8 },
      2:  { cellWidth: 12 },
      3:  { cellWidth: 22 },
      4:  { cellWidth: 14 },
      5:  { cellWidth: 28 },
      6:  { cellWidth: 24 },
      7:  { cellWidth: 28 },
      8:  { cellWidth: 28 },
      9:  { cellWidth: 26 },
      10: { cellWidth: 16 },
    },
    margin: { left: ML, right: MR },
  });

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY + 7;

  // ── RESUMEN DE IMPUESTOS ─────────────────────────────────────────────────────
  doc.setFillColor(...LIC_CLR.navy);
  doc.rect(ML, currentY - 3, pageWidth - ML - MR, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('RESUMEN FINANCIERO', ML + 2, currentY + 0.5);
  doc.setTextColor(0, 0, 0);
  currentY += 7;

  const summaryData = [
    ['Costo de importación', `Bs ${fmtN(data.resumen.total_import)}`],
    ['Total ofertado', `Bs ${fmtN(data.resumen.total_ofertado)}`],
    ['IVA a pagar (crédito fiscal)', `Bs ${fmtN(data.resumen.iva_pagar)}`],
    ['IT a pagar (3%)', `Bs ${fmtN(data.resumen.it_pagar)}`],
    ['Costos totales', `Bs ${fmtN(data.resumen.costos)}`],
    ['Ganancia neta', `Bs ${fmtN(data.resumen.ganancia)}`],
    ['ROI global', fmtPct(data.resumen.roi)],
  ];

  autoTable(doc, {
    startY: currentY,
    body: summaryData.map(([k, v], idx) => {
      const isGanancia = idx === 5;
      const isRoi = idx === 6;
      const isBad = (isGanancia || isRoi) && data.resumen.ganancia < 0;
      return [
        { content: k, styles: { fontStyle: (idx >= 4 ? 'bold' : 'normal') as any, fillColor: idx % 2 === 0 ? LIC_CLR.lightgray : undefined } },
        { content: v, styles: {
            halign: 'right' as const,
            fontStyle: (idx >= 4 ? 'bold' : 'normal') as any,
            fillColor: idx % 2 === 0 ? LIC_CLR.lightgray : undefined,
            textColor: (isGanancia || isRoi) ? (isBad ? LIC_CLR.red : LIC_CLR.green) : undefined,
          }
        },
      ];
    }),
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 40 } },
    margin: { left: ML, right: MR },
    tableWidth: 115,
  });

  // ── PIE DE PÁGINA ────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const ph = doc.internal.pageSize.getHeight();
    doc.setFillColor(...LIC_CLR.navy);
    doc.rect(0, ph - 9, pageWidth, 9, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 210, 235);
    doc.text(
      `${data.licitacion.nombre}  ·  Cotización  ·  Página ${i} de ${pageCount}  ·  ERP BV  ·  ${new Date().toLocaleString('es-BO')}`,
      pageWidth / 2,
      ph - 3,
      { align: 'center' }
    );
    doc.setTextColor(0, 0, 0);
  }

  const slug = data.licitacion.numero_sicoes
    ? data.licitacion.numero_sicoes.toLowerCase().replace(/\s+/g, '-')
    : 'cotizacion';
  doc.save(`cotizacion-${slug}-${new Date().toISOString().split('T')[0]}.pdf`);
}

// ─── Análisis de Inversión ──────────────────────────────────────────────────────

export interface InvestmentPDFItem {
  nombre: string;
  modalidad: 'con_factura' | 'sin_factura';
  cantidad: number;
  costo_unitario: number;
  inversion: number;
  precio_con_factura: number;
  precio_sin_factura: number;
  ingreso_total: number;
  ganancia: number;
  roi: number;
  // temporal
  ciclo_meses: number;
  roi_anualizado: number;          // teórico
  roi_anualizado_realista: number; // con FUC
  meses_recuperacion: number;
  van: number;
  tir_anual: number;
}

export interface InvestmentPDFData {
  analysis: {
    nombre: string;
    notas?: string;
    estado: string;
    costo_capital_anual: number;
    plazo_importacion_meses: number;
  };
  items: InvestmentPDFItem[];
  resumen: {
    inversion: number;
    ingreso_total: number;
    costos: number;
    ganancia: number;
    roi: number;
    ciclo_meses: number;
    roi_anualizado: number;          // teórico
    roi_anualizado_realista: number; // con FUC
    fuc_pct: number;
    van: number;
    tir_anual: number;
  };
}

export function exportInvestmentAnalysisToPDF(data: InvestmentPDFData): void {
  const doc = new jsPDF('landscape', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  const ML = 12;
  const MR = 12;

  const fmtN = (n: number) =>
    isFinite(n) ? n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const fmtPct = (n: number) => (isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—');
  const fmtMes = (n: number) => (isFinite(n) ? `${fmtN(n)} m` : '—');

  // ── ENCABEZADO ───────────────────────────────────────────────────────────────
  doc.setFillColor(...LIC_CLR.navy);
  doc.rect(0, 0, pageWidth, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text('Análisis de Inversión', ML, 10);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 210, 235);
  const meta = [
    `Estado: ${data.analysis.estado}`,
    `Costo de capital: ${data.analysis.costo_capital_anual}% anual`,
    `Plazo importación: ${data.analysis.plazo_importacion_meses} m`,
  ].join('   ·   ');
  doc.text(meta, ML, 17);
  doc.setTextColor(0, 0, 0);

  let currentY = 27;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text(data.analysis.nombre || 'Análisis', ML, currentY);
  currentY += 6;
  if (data.analysis.notas) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(data.analysis.notas, ML, currentY);
    currentY += 5;
  }
  doc.setLineWidth(0.4);
  doc.setDrawColor(...LIC_CLR.navy);
  doc.line(ML, currentY, pageWidth - MR, currentY);
  currentY += 5;

  // ── TABLA 1: PRODUCTOS Y RENTABILIDAD ────────────────────────────────────────
  const prodBody: RowInput[] = data.items.map((p, i) => {
    const color = p.ganancia < 0 ? LIC_CLR.red : LIC_CLR.green;
    return [
      { content: String(i + 1), styles: { halign: 'center' as const } },
      `${p.nombre || '—'}  (${p.modalidad === 'sin_factura' ? 's/factura' : 'c/factura'})`,
      { content: String(p.cantidad), styles: { halign: 'center' as const } },
      { content: `Bs ${fmtN(p.costo_unitario)}`, styles: { halign: 'right' as const } },
      { content: `Bs ${fmtN(p.inversion)}`, styles: { halign: 'right' as const } },
      { content: `Bs ${fmtN(p.precio_con_factura)}`, styles: { halign: 'right' as const } },
      { content: `Bs ${fmtN(p.precio_sin_factura)}`, styles: { halign: 'right' as const } },
      { content: `Bs ${fmtN(p.ingreso_total)}`, styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      { content: `Bs ${fmtN(p.ganancia)}`, styles: { halign: 'right' as const, textColor: color, fontStyle: 'bold' as const } },
      { content: fmtPct(p.roi), styles: { halign: 'center' as const, textColor: color, fontStyle: 'bold' as const } },
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Producto', 'Q', 'Costo Unit.', 'Inversión', 'P. c/Factura', 'P. s/Factura', 'Ingreso', 'Ganancia', 'ROI']],
    body: prodBody,
    headStyles: { fillColor: LIC_CLR.teal, fontSize: 8, textColor: [255, 255, 255] },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    margin: { left: ML, right: MR },
  });
  // @ts-expect-error lastAutoTable lo agrega el plugin jspdf-autotable en runtime
  currentY = doc.lastAutoTable.finalY + 7;

  // ── TABLA 2: ANÁLISIS TEMPORAL ───────────────────────────────────────────────
  doc.setFillColor(...LIC_CLR.navy);
  doc.rect(ML, currentY - 3, pageWidth - ML - MR, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('RENTABILIDAD AJUSTADA POR TIEMPO', ML + 2, currentY + 0.5);
  doc.setTextColor(0, 0, 0);
  currentY += 7;

  const tiempoBody: RowInput[] = data.items.map((p, i) => {
    const vanColor = p.van < 0 ? LIC_CLR.red : LIC_CLR.green;
    return [
      { content: String(i + 1), styles: { halign: 'center' as const } },
      p.nombre || '—',
      { content: fmtMes(p.ciclo_meses), styles: { halign: 'center' as const } },
      { content: fmtPct(p.roi_anualizado_realista), styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
      { content: fmtPct(p.roi_anualizado), styles: { halign: 'center' as const } },
      { content: fmtMes(p.meses_recuperacion), styles: { halign: 'center' as const } },
      { content: `Bs ${fmtN(p.van)}`, styles: { halign: 'right' as const, textColor: vanColor, fontStyle: 'bold' as const } },
      { content: fmtPct(p.tir_anual), styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Producto', 'Ciclo de caja', 'ROI anual. realista', 'ROI anual. teórico', 'Recuperación', 'VAN', 'TIR anual']],
    body: tiempoBody,
    headStyles: { fillColor: LIC_CLR.teal, fontSize: 8, textColor: [255, 255, 255] },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    margin: { left: ML, right: MR },
  });
  // @ts-expect-error lastAutoTable lo agrega el plugin jspdf-autotable en runtime
  currentY = doc.lastAutoTable.finalY + 7;

  // ── RESUMEN FINANCIERO ───────────────────────────────────────────────────────
  doc.setFillColor(...LIC_CLR.navy);
  doc.rect(ML, currentY - 3, pageWidth - ML - MR, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('RESUMEN GLOBAL', ML + 2, currentY + 0.5);
  doc.setTextColor(0, 0, 0);
  currentY += 7;

  const r = data.resumen;
  const bad = r.ganancia < 0;
  const summaryData: [string, string, boolean?][] = [
    ['Inversión total', `Bs ${fmtN(r.inversion)}`],
    ['Ingreso total esperado', `Bs ${fmtN(r.ingreso_total)}`],
    ['Costos totales', `Bs ${fmtN(r.costos)}`],
    ['Ganancia neta', `Bs ${fmtN(r.ganancia)}`, true],
    ['ROI simple', fmtPct(r.roi), true],
    ['Ciclo de caja (ponderado)', fmtMes(r.ciclo_meses)],
    [`ROI anualizado realista (FUC ${r.fuc_pct}%)`, fmtPct(r.roi_anualizado_realista), true],
    ['ROI anualizado teórico', fmtPct(r.roi_anualizado)],
    [`VAN (a ${data.analysis.costo_capital_anual}% anual)`, `Bs ${fmtN(r.van)}`, true],
    ['TIR anual', fmtPct(r.tir_anual), true],
  ];

  autoTable(doc, {
    startY: currentY,
    body: summaryData.map(([k, v, highlight], idx): RowInput => [
      { content: k, styles: { fontStyle: highlight ? 'bold' : 'normal', fillColor: idx % 2 === 0 ? LIC_CLR.lightgray : undefined } },
      { content: v, styles: {
          halign: 'right' as const,
          fontStyle: highlight ? 'bold' : 'normal',
          fillColor: idx % 2 === 0 ? LIC_CLR.lightgray : undefined,
          textColor: highlight ? (bad ? LIC_CLR.red : LIC_CLR.green) : undefined,
        } },
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 75 }, 1: { cellWidth: 45 } },
    margin: { left: ML, right: MR },
    tableWidth: 120,
  });

  // ── PIE DE PÁGINA ────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const ph = doc.internal.pageSize.getHeight();
    doc.setFillColor(...LIC_CLR.navy);
    doc.rect(0, ph - 9, pageWidth, 9, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 210, 235);
    doc.text(
      `${data.analysis.nombre}  ·  Análisis de Inversión  ·  Página ${i} de ${pageCount}  ·  ERP BV  ·  ${new Date().toLocaleString('es-BO')}`,
      pageWidth / 2,
      ph - 3,
      { align: 'center' },
    );
    doc.setTextColor(0, 0, 0);
  }

  const slug = (data.analysis.nombre || 'analisis').toLowerCase().replace(/\s+/g, '-').slice(0, 40);
  doc.save(`analisis-inversion-${slug}-${new Date().toISOString().split('T')[0]}.pdf`);
}
