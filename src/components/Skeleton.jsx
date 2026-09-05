import React from 'react';

/**
 * Basic Skeleton block with shimmer
 */
export function Skeleton({
  width = '100%',
  height = '16px',
  borderRadius = 'var(--radius-sm, 6px)',
  className = '',
  style = {},
  ...props
}) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{
        display: 'inline-block',
        width,
        height,
        borderRadius,
        ...style
      }}
      {...props}
    />
  );
}

/**
 * Skeleton for Stats KPI Grid Cards
 */
export function SkeletonStats({ count = 4 }) {
  return (
    <div className="stats-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="stat-card" style={{ pointerEvents: 'none' }}>
          <div className="stat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ width: '70%' }}>
              <Skeleton width="60%" height="12px" style={{ marginBottom: '8px' }} />
              <Skeleton width="85%" height="28px" borderRadius="8px" style={{ marginBottom: '6px' }} />
              <Skeleton width="45%" height="11px" />
            </div>
            <Skeleton width="40px" height="40px" borderRadius="10px" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Pixel-Perfect Skeleton Table Rows
 * Renders multiple realistic rows matching column layouts
 */
export function SkeletonTableRows({
  columns = 7,
  rows = 8,
  customRenderers = null
}) {
  const colCount = Array.isArray(columns) ? columns.length : columns;

  return (
    <>
      {Array.from({ length: rows }).map((_, rIdx) => {
        // Vary widths slightly per row for hyper-realistic look
        const seed = (rIdx % 4);
        const wOffset = seed * 8;

        return (
          <tr key={rIdx} style={{ borderBottom: '1px solid var(--border-color)' }}>
            {Array.from({ length: colCount }).map((_, cIdx) => {
              if (customRenderers && customRenderers[cIdx]) {
                return (
                  <td key={cIdx} style={{ verticalAlign: 'middle', padding: '0.75rem 0.85rem' }}>
                    {customRenderers[cIdx](rIdx)}
                  </td>
                );
              }

              // Column 0: ID / Code pill
              if (cIdx === 0) {
                return (
                  <td key={cIdx} style={{ verticalAlign: 'middle', padding: '0.75rem 0.85rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <Skeleton width={`${85 + (seed * 6)}px`} height="15px" borderRadius="4px" />
                      <Skeleton width="45px" height="10px" borderRadius="3px" style={{ opacity: 0.6 }} />
                    </div>
                  </td>
                );
              }

              // Column 1: Client / Name with avatar
              if (cIdx === 1) {
                return (
                  <td key={cIdx} style={{ verticalAlign: 'middle', padding: '0.75rem 0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Skeleton width="28px" height="28px" borderRadius="50%" style={{ flexShrink: 0 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '100px' }}>
                        <Skeleton width={`${110 + wOffset}px`} height="14px" borderRadius="4px" />
                        <Skeleton width={`${70 + (seed * 10)}px`} height="10px" borderRadius="3px" style={{ opacity: 0.6 }} />
                      </div>
                    </div>
                  </td>
                );
              }

              // Column 2: Amount / Currency
              if (cIdx === 2) {
                return (
                  <td key={cIdx} style={{ verticalAlign: 'middle', padding: '0.75rem 0.85rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <Skeleton width={`${75 + (seed * 10)}px`} height="16px" borderRadius="4px" />
                      <Skeleton width="50px" height="10px" borderRadius="3px" style={{ opacity: 0.6 }} />
                    </div>
                  </td>
                );
              }

              // Column 3: Status Badge
              if (cIdx === 3) {
                return (
                  <td key={cIdx} style={{ verticalAlign: 'middle', padding: '0.75rem 0.85rem' }}>
                    <Skeleton width="72px" height="22px" borderRadius="9999px" />
                  </td>
                );
              }

              // Column 4: Date / Due
              if (cIdx === 4) {
                return (
                  <td key={cIdx} style={{ verticalAlign: 'middle', padding: '0.75rem 0.85rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <Skeleton width="80px" height="13px" borderRadius="4px" />
                      <Skeleton width="60px" height="10px" borderRadius="3px" style={{ opacity: 0.6 }} />
                    </div>
                  </td>
                );
              }

              // Column 5: Reminders / Secondary status
              if (cIdx === 5) {
                return (
                  <td key={cIdx} style={{ verticalAlign: 'middle', padding: '0.75rem 0.85rem' }}>
                    <Skeleton width="65px" height="20px" borderRadius="6px" />
                  </td>
                );
              }

              // Last column: Actions (Buttons)
              if (cIdx === colCount - 1) {
                return (
                  <td key={cIdx} style={{ verticalAlign: 'middle', padding: '0.75rem 0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Skeleton width="30px" height="30px" borderRadius="6px" />
                      <Skeleton width="30px" height="30px" borderRadius="6px" />
                      <Skeleton width="70px" height="30px" borderRadius="6px" />
                    </div>
                  </td>
                );
              }

              // Generic column
              return (
                <td key={cIdx} style={{ verticalAlign: 'middle', padding: '0.75rem 0.85rem' }}>
                  <Skeleton width={`${80 + wOffset}px`} height="14px" borderRadius="4px" />
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

/**
 * Pixel-Perfect Skeleton Table Component
 * Includes:
 * 1. .glass-card.table-container with responsive horizontal scrolling
 * 2. Real header titles or custom columns
 * 3. Realistic rows
 * 4. Realistic pagination footer with items count, row selector, and pagination buttons
 */
export function SkeletonTable({
  columns = ['Invoice #', 'Client', 'Amount', 'Status', 'Due / Overdue', 'Reminders', 'Actions'],
  rows = 8,
  minWidth = '900px',
  withPagination = true,
  paginationLabel = 'invoices',
  pageSize = 25
}) {
  return (
    <div className="glass-card table-container" style={{ overflowX: 'auto', position: 'relative' }}>
      <table className="data-table" style={{ minWidth, width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map((col, idx) => (
              <th
                key={idx}
                style={{
                  padding: '0.6rem 0.85rem',
                  color: 'var(--text-muted)',
                  fontSize: '0.73rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  whiteSpace: 'nowrap'
                }}
              >
                {typeof col === 'string' ? col : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <SkeletonTableRows columns={columns} rows={rows} />
        </tbody>
      </table>

      {/* Pagination Footer Skeleton */}
      {withPagination && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.75rem 1.25rem',
            borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-tertiary)',
            flexWrap: 'wrap',
            gap: '0.75rem',
            fontSize: '0.78rem'
          }}
        >
          {/* Item count text skeleton */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Showing</span>
            <Skeleton width="22px" height="14px" borderRadius="3px" />
            <span style={{ color: 'var(--text-muted)' }}>to</span>
            <Skeleton width="22px" height="14px" borderRadius="3px" />
            <span style={{ color: 'var(--text-muted)' }}>of</span>
            <Skeleton width="30px" height="14px" borderRadius="3px" />
            <span style={{ color: 'var(--text-muted)' }}>{paginationLabel}</span>
          </div>

          {/* Rows & Page Controls Skeleton */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Rows:</span>
              {[25, 50, 100, 'All'].map((size) => (
                <div
                  key={size}
                  style={{
                    padding: '0.15rem 0.45rem',
                    fontSize: '0.72rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    background: size === 25 ? 'rgba(99,102,241,0.2)' : 'transparent',
                    color: size === 25 ? 'var(--accent-primary)' : 'var(--text-muted)',
                    opacity: 0.8
                  }}
                >
                  {size}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-card)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.4
                }}
              >
                ‹
              </div>
              <Skeleton width="42px" height="18px" borderRadius="4px" />
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-card)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.4
                }}
              >
                ›
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Skeleton for Cards / Kanban Items
 */
export function SkeletonCard({ height = '120px' }) {
  return (
    <div
      className="glass-card"
      style={{
        padding: '1rem',
        marginBottom: '0.75rem',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        minHeight: height
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width="45%" height="16px" borderRadius="4px" />
        <Skeleton width="22%" height="18px" borderRadius="9999px" />
      </div>
      <Skeleton width="80%" height="12px" borderRadius="4px" />
      <Skeleton width="60%" height="12px" borderRadius="4px" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '0.5rem' }}>
        <Skeleton width="30%" height="12px" borderRadius="4px" />
        <Skeleton width="24px" height="24px" borderRadius="50%" />
      </div>
    </div>
  );
}

export default Skeleton;
