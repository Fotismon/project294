'use client'

import React from 'react'

interface MetricCardProps {
  label: string
  value: string | number
  unit?: string
  subValue?: string
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
  size?: 'sm' | 'md' | 'lg'
}

export function MetricCard({ 
  label, 
  value, 
  unit, 
  subValue, 
  variant = 'default',
  size = 'md'
}: MetricCardProps) {
  const variantClasses = {
    default: 'border-border',
    success: 'border-success/50 bg-success/5',
    warning: 'border-warning/50 bg-warning/5',
    error: 'border-error/50 bg-error/5',
    info: 'border-info/50 bg-info/5'
  }

  const valueVariantClasses = {
    default: 'text-text-primary',
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-error',
    info: 'text-info'
  }

  const sizeClasses = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-5'
  }

  const labelSizeClasses = {
    sm: 'text-xs',
    md: 'text-xs',
    lg: 'text-sm'
  }

  const valueSizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl'
  }

  return (
    <div className={`
      border rounded-lg bg-surface-elevated/50
      ${variantClasses[variant]}
      ${sizeClasses[size]}
    `}>
      <p className={`text-text-secondary uppercase tracking-wider ${labelSizeClasses[size]}`}>
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`font-semibold ${valueVariantClasses[variant]} ${valueSizeClasses[size]}`}>
          {value}
        </span>
        {unit && (
          <span className="text-text-muted text-sm">{unit}</span>
        )}
      </div>
      {subValue && (
        <p className="text-text-muted text-xs mt-1">{subValue}</p>
      )}
    </div>
  )
}