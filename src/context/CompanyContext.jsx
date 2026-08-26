import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCompanyProfiles, saveCompanyProfile, deleteCompanyProfile, getActiveCompanyId, setActiveCompanyId as persistActiveCompanyId } from '../lib/db';
import { Building2, CheckCircle2, Sparkles } from 'lucide-react';

const CompanyContext = createContext({});

export const CompanyProvider = ({ children }) => {
  const [companyProfiles, setCompanyProfiles] = useState([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState(getActiveCompanyId());
  const [loading, setLoading] = useState(true);
  const [switchToast, setSwitchToast] = useState(null);

  const loadCompanies = async () => {
    try {
      const { data } = await getCompanyProfiles();
      if (data && data.length > 0) {
        setCompanyProfiles(data);
      }
    } catch (err) {
      console.warn('[CompanyContext] loadCompanies failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();

    const handleStorage = (e) => {
      if (e.key === 'erppro_active_company_id') {
        setActiveCompanyIdState(e.newValue || 'all');
      }
    };

    const handleCustomChange = (e) => {
      if (e.detail?.companyId) {
        setActiveCompanyIdState(e.detail.companyId);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('erppro:company_changed', handleCustomChange);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('erppro:company_changed', handleCustomChange);
    };
  }, []);

  const setActiveCompany = (id) => {
    setActiveCompanyIdState(id);
    persistActiveCompanyId(id);

    // Trigger visual switching feedback animation
    const targetComp = id === 'all'
      ? { company_name: 'All Companies (Consolidated)' }
      : (companyProfiles.find(c => c.id === id) || { company_name: 'Selected Company' });

    setSwitchToast({
      name: targetComp.company_name,
      isAll: id === 'all',
    });

    window.dispatchEvent(new CustomEvent('erppro:company_changed', { detail: { companyId: id } }));

    setTimeout(() => {
      setSwitchToast(null);
    }, 2800);
  };

  const handleSaveProfile = async (profile) => {
    const res = await saveCompanyProfile(profile);
    await loadCompanies();
    return res;
  };

  const handleDeleteProfile = async (id) => {
    const res = await deleteCompanyProfile(id);
    if (activeCompanyId === id) {
      setActiveCompany('all');
    }
    await loadCompanies();
    return res;
  };

  const activeCompany = activeCompanyId === 'all' 
    ? null 
    : (companyProfiles.find(c => c.id === activeCompanyId) || companyProfiles.find(c => c.is_default) || null);

  const isConsolidated = activeCompanyId === 'all';

  return (
    <CompanyContext.Provider
      value={{
        companyProfiles,
        activeCompanyId,
        activeCompany,
        isConsolidated,
        setActiveCompanyId: setActiveCompany,
        refreshCompanies: loadCompanies,
        saveCompany: handleSaveProfile,
        deleteCompany: handleDeleteProfile,
        loading,
      }}
    >
      {/* Animated Company Switching Banner / Toast (Light Theme) */}
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
            border: '1.5px solid rgba(99, 102, 241, 0.3)',
            boxShadow: '0 12px 32px rgba(99, 102, 241, 0.16), 0 4px 12px rgba(15, 23, 42, 0.06)',
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
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.4)',
            }}
          >
            <Building2 size={16} color="#ffffff" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
            <span style={{ fontSize: '10px', color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Active Workspace
            </span>
            <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b', letterSpacing: '-0.01em' }}>
              {switchToast.name}
            </span>
          </div>
          <Sparkles size={15} color="#6366f1" style={{ marginLeft: 2 }} />
        </div>
      )}
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = () => useContext(CompanyContext);
export default CompanyContext;

