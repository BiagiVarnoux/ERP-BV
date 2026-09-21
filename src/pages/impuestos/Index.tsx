// src/pages/impuestos/Index.tsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LibroFiscal } from '@/components/impuestos/LibroFiscal';

export default function ImpuestosPage() {
  return (
    <Routes>
      <Route index element={<Navigate to="compras" replace />} />
      <Route path="compras" element={<LibroFiscal tipo="compra" />} />
      <Route path="ventas"  element={<LibroFiscal tipo="venta" />} />
      <Route path="*" element={<Navigate to="compras" replace />} />
    </Routes>
  );
}
