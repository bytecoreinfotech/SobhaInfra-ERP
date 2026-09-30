import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, Sparkles } from 'lucide-react';

const FinancialYearContext = createContext({});

// Calculate current Indian FY start year (Apr 1 - Mar 31)
export const getIndianFYStartYear = (date = new Date()) => {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
};

// Generate standard Indian Financial Years list
export const buildFYOptions = () => {
  const curStart = getIndianFYStartYear();
  
  const years = [
    curStart + 1, // Next FY (e.g. 2027-28)
    curStart,     // Current FY (e.g. 2026-27)
    curStart - 1, // Last FY (e.g. 2025-26)
    curStart - 2, // e.g. 2024-25
    curStart - 3, // e.g. 2023-24
    curStart - 4, // e.g. 2022-23
  ];

  const fyList = years.map(startY => {
    const endY = startY + 1;
    const endShort = String(endY).slice(2);
    const isCurrent = startY === curStart;
    return {
      id: String(startY),
      startYear: startY,
      endYear: endY,
      label: `FY ${startY}-${endShort}${isCurrent ? ' (Current)' : ''}`,
      shortLabel: `FY ${startY}-${endShort}`,
      periodText: `01-Apr-${startY} to 31-Mar-${endY}`,
      startDate: `${startY}-04-01`,
      endDate: `${endY}-03-31`,
      isCurrent,
      isAll: false,
    };
  });

  return [
    {
      id: 'all',
      startYear: null,
      endYear: null,
      label: 'All Financial Years (All Time)',
      shortLabel: 'All FY (Lifetime)',
      periodText: 'Cumulative lifetime records without FY restriction',
      startDate: null,
      endDate: null,
      isCurrent: false,
      isAll: true,
    },
    ...fyList,
  ];
};

export const FinancialYearProvider = ({ children }) => {
  const curStartYear = useMemo(() => getIndianFYStartYear(), []);
  const fyOptions = useMemo(() => buildFYOptions(), []);

  const [activeFYId, setActiveFYIdState] = useState(() => {
    try {
      const stored = localStorage.getItem('erppro_active_fy');
      if (stored && (stored === 'all' || fyOptions.some(f => f.id === stored))) {
        return stored;
      }
    } catch {}
    return String(curStartYear);
  });

  const [switchToast, setSwitchToast] = useState(null);

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'erppro_active_fy' && e.newValue) {
        setActiveFYIdState(e.newValue);
      }
    };

    const handleCustomEvent = (e) => {
      if (e.detail?.fyId) {
        setActiveFYIdState(e.detail.fyId);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('erppro:fy_changed', handleCustomEvent);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('erppro:fy_changed', handleCustomEvent);
    };
  }, []);

  const setActiveFY = useCallback((id) => {
    const validId = fyOptions.some(f => f.id === id) ? id : String(curStartYear);
    setActiveFYIdState(validId);
    try {
      localStorage.setItem('erppro_active_fy', validId);
    } catch {}

    const targetOpt = fyOptions.find(f => f.id === validId) || fyOptions[1];
    setSwitchToast({
      label: targetOpt.label,
      shortLabel: targetOpt.shortLabel,
      period: targetOpt.periodText,
      isAll: targetOpt.isAll,
    });

    window.dispatchEvent(new CustomEvent('erppro:fy_changed', { detail: { fyId: validId } }));

    setTimeout(() => {
      setSwitchToast(null);
    }, 2800);
  }, [curStartYear, fyOptions]);

  const activeFY = useMemo(() => {
    return fyOptions.find(f => f.id === activeFYId) || fyOptions.find(f => f.id === String(curStartYear)) || fyOptions[1];
  }, [activeFYId, fyOptions, curStartYear]);

  const isAllYears = activeFYId === 'all';

  // Helper function to check if a date falls in the selected FY
  const isDateInFY = useCallback((dateInput, overrideFYId = null) => {
    const fyToCheck = overrideFYId 
      ? fyOptions.find(f => f.id === overrideFYId) || activeFY
      : activeFY;

    if (!fyToCheck || fyToCheck.isAll) return true;
    if (!dateInput) return false;

    let dStr = '';
    if (typeof dateInput === 'string') {
      const match = dateInput.match(/^(\d{4}-\d{2}-\d{2})/);
      dStr = match ? match[1] : dateInput.slice(0, 10);
    } else if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
      dStr = dateInput.toISOString().slice(0, 10);
    }

    if (!dStr) return false;
    return dStr >= fyToCheck.startDate && dStr <= fyToCheck.endDate;
  }, [activeFY, fyOptions]);

  // Helper to filter array of objects by date
  const filterByFY = useCallback((items = [], getDateFn, overrideFYId = null) => {
    if (!Array.isArray(items)) return [];
    const fyToCheck = overrideFYId 
      ? fyOptions.find(f => f.id === overrideFYId) || activeFY
      : activeFY;

    if (!fyToCheck || fyToCheck.isAll) return items;

    return items.filter(item => {
      const d = typeof getDateFn === 'function' 
        ? getDateFn(item)
        : (item?.invoice_date || item?.due_date || item?.created_at || item?.date);
      return isDateInFY(d, fyToCheck.id);
    });
  }, [activeFY, fyOptions, isDateInFY]);

  return (
    <FinancialYearContext.Provider
      value={{
        activeFYId,
        activeFY,
        fyOptions,
        setActiveFYId: setActiveFY,
        isAllYears,
        isDateInFY,
        filterByFY,
        currentFYStartYear: curStartYear,
      }}
    >
      {/* Animated FY Switching Banner / Toast */}
      {switchToast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'linear-gradient(135deg, #ffffff, #f8fafc)',
            color: '#0f172a',
            padding: '9px 20px',
            borderRadius: '9999px',
            border: '1.5px solid rgba(16, 185, 129, 0.35)',
            boxShadow: '0 12px 32px rgba(16, 185, 129, 0.18), 0 4px 12px rgba(15, 23, 42, 0.06)',
            backdropFilter: 'blur(12px)',
            animation: 'companySwitchPulse 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
            }}
          >
            <Calendar size={16} color="#ffffff" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
            <span style={{ fontSize: '10px', color: '#059669', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Active Financial Year
            </span>
            <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b', letterSpacing: '-0.01em' }}>
              {switchToast.label}
            </span>
            {switchToast.period && (
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 500 }}>
                {switchToast.period}
              </span>
            )}
          </div>
          <Sparkles size={15} color="#10b981" style={{ marginLeft: 2 }} />
        </div>
      )}
      {children}
    </FinancialYearContext.Provider>
  );
};

export const useFinancialYear = () => useContext(FinancialYearContext);
export default FinancialYearContext;
