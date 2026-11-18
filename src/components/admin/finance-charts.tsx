"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

export function ServiceProfitChart({ data }: { data: Array<{ service: string; revenue: number; estimatedCost: number; actualCost: number; profit: number }> }) {
  return <div className="h-[270px] w-full" aria-label="Grafik pendapatan dan biaya berdasarkan layanan">
    {data.length ? <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 2 }}>
        <CartesianGrid stroke="#E8EEF7" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="service" tick={{ fill: "#64748B", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#64748B", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(value: number) => `${Math.round(value / 1_000_000)} jt`} />
        <Tooltip formatter={(value) => money(Number(value ?? 0))} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Bar dataKey="revenue" name="Pendapatan terealisasi" fill="#1974FF" radius={[5, 5, 0, 0]} />
        <Bar dataKey="estimatedCost" name="Estimasi biaya" fill="#FF8518" radius={[5, 5, 0, 0]} />
        <Bar dataKey="actualCost" name="Biaya aktual" fill="#0A2E63" radius={[5, 5, 0, 0]} />
      </BarChart>
    </ResponsiveContainer> : <div className="flex h-full items-center justify-center text-xs text-slate-400">Belum ada data layanan pada periode ini.</div>}
  </div>;
}

export function CashflowChart({ data }: { data: Array<{ date: string; income: number; outflow: number }> }) {
  return <div className="h-[230px] w-full" aria-label="Grafik arus kas harian">
    {data.length ? <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 2 }}>
        <CartesianGrid stroke="#E8EEF7" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: "#64748B", fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#64748B", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(value: number) => `${Math.round(value / 1_000_000)} jt`} />
        <Tooltip formatter={(value) => money(Number(value ?? 0))} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Line type="monotone" dataKey="income" name="Kas masuk" stroke="#1974FF" strokeWidth={2.5} dot={false} />
        <Line type="monotone" dataKey="outflow" name="Refund & biaya" stroke="#FF8518" strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer> : <div className="flex h-full items-center justify-center text-xs text-slate-400">Belum ada arus kas pada periode ini.</div>}
  </div>;
}
