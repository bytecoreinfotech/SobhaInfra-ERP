import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCompanyProfiles, saveCompanyProfile, deleteCompanyProfile, getActiveCompanyId, setActiveCompanyId as persistActiveCompanyId } from '../lib/db';

const CompanyContext = createContext({});

export const CompanyProvider = ({ children }) => {
  const [companyProfiles, setCompanyProfiles] = useState([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState(getActiveCompanyId());
  const [loading, setLoading] = useState(true);

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
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = () => useContext(CompanyContext);
export default CompanyContext;
