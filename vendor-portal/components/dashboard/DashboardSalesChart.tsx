"use client"

import { useMemo } from "react"
import { Text, clx } from "@medusajs/ui"

export type SalesChartPoint = {
  key: string
  label: string
  sales: number
  orders: number
}

type DashboardSalesChartProps = {
  series: SalesChartPoint[]
  className?: string
  formatValue?: (amount: number) => string
}

const DashboardSalesChart = ({
  series,
  className,
  formatValue = (n) => String(n),
}: DashboardSalesChartProps) => {
  const { path, areaPath, points, max } = useMemo(() => {
    const width = 560
    const height = 180
    const padX = 12
    const padY = 16
    const maxSales = Math.max(...series.map((d) => d.sales), 1)
    const step = series.length > 1 ? (width - padX * 2) / (series.length - 1) : 0

    const coords = series.map((day, index) => {
      const x = padX + index * step
      const y = height - padY - (day.sales / maxSales) * (height - padY * 2)
      return { x, y, day }
    })

    const line = coords
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
      .join(" ")

    const area =
      coords.length > 0
        ? `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${(height - padY).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(height - padY).toFixed(1)} Z`
        : ""

    return { path: line, areaPath: area, points: coords, max: maxSales, width, height }
  }, [series])

  const width = 560
  const height = 180

  return (
    <div className={clx("w-full", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-44 w-full overflow-visible"
        role="img"
        aria-label="Sales performance last 7 days"
      >
        <defs>
          <linearGradient id="dashboardSalesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = 16 + (1 - fraction) * (height - 32)
          return (
            <line
              key={fraction}
              x1={12}
              x2={width - 12}
              y1={y}
              y2={y}
              stroke="currentColor"
              className="text-zinc-200 dark:text-ui-border-base"
              strokeDasharray="4 4"
            />
          )
        })}
        <path d={areaPath} fill="url(#dashboardSalesFill)" />
        <path
          d={path}
          fill="none"
          stroke="#059669"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point) => (
          <circle
            key={point.day.key}
            cx={point.x}
            cy={point.y}
            r={3.5}
            fill="#fff"
            stroke="#059669"
            strokeWidth="2"
          >
            <title>
              {point.day.label}: {formatValue(point.day.sales)} · {point.day.orders} orders
            </title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between gap-1 px-1">
        {series.map((day) => (
          <Text
            key={day.key}
            size="xsmall"
            className="min-w-0 flex-1 truncate text-center text-zinc-500 dark:text-ui-fg-muted"
          >
            {day.label}
          </Text>
        ))}
      </div>
      <Text size="xsmall" className="mt-2 text-zinc-400 dark:text-ui-fg-muted">
        Peak day up to {formatValue(max)}
      </Text>
    </div>
  )
}

export default DashboardSalesChart
