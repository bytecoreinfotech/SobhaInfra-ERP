/**
 * SobhaInfra ERP — Holiday & Non-Working Day Engine
 * Handles Indian Gazetted Holidays, Company-Specific Holidays, Sunday detection,
 * and smart task allocation scheduling for exceptional vs routine cases.
 */

// 2026-2027 Gazetted & Public Holidays in India (ISO YYYY-MM-DD)
const DEFAULT_HOLIDAYS_2026 = {
  '2026-01-26': 'Republic Day',
  '2026-02-15': 'Maha Shivratri',
  '2026-03-04': 'Holi',
  '2026-03-21': 'Id-ul-Fitr (Eid)',
  '2026-04-03': 'Good Friday',
  '2026-04-14': 'Dr. B.R. Ambedkar Jayanti',
  '2026-05-01': 'May Day (Labour Day)',
  '2026-05-27': 'Bakrid (Eid ul-Adha)',
  '2026-08-15': 'Independence Day',
  '2026-08-28': 'Raksha Bandhan',
  '2026-09-04': 'Janmashtami',
  '2026-09-21': 'Milad-un-Nabi',
  '2026-10-02': 'Mahatma Gandhi Jayanti',
  '2026-10-19': 'Maha Navami',
  '2026-10-20': 'Dussehra (Vijayadashami)',
  '2026-11-08': 'Diwali (Deepawali)',
  '2026-11-09': 'Govardhan Puja',
  '2026-11-10': 'Bhai Dooj',
  '2026-11-24': 'Guru Nanak Jayanti',
  '2026-12-25': 'Christmas Day'
};

const DEFAULT_HOLIDAYS_2027 = {
  '2027-01-26': 'Republic Day',
  '2027-03-23': 'Holi',
  '2027-08-15': 'Independence Day',
  '2027-10-02': 'Mahatma Gandhi Jayanti',
  '2027-10-28': 'Diwali',
  '2027-12-25': 'Christmas Day'
};

const HOLIDAYS_MAP = {
  ...DEFAULT_HOLIDAYS_2026,
  ...DEFAULT_HOLIDAYS_2027
};

const CUSTOM_HOLIDAYS_KEY = 'erppro_custom_company_holidays';

/**
 * Retrieve all registered holidays (defaults + custom company additions)
 */
export function getAllHolidays() {
  let custom = {};
  try {
    const raw = localStorage.getItem(CUSTOM_HOLIDAYS_KEY);
    if (raw) custom = JSON.parse(raw);
  } catch {}
  return { ...HOLIDAYS_MAP, ...custom };
}

/**
 * Register or update a custom company holiday
 */
export function addCompanyHoliday(dateStr, holidayName) {
  if (!dateStr || !holidayName) return false;
  try {
    const holidays = getAllHolidays();
    holidays[dateStr] = holidayName.trim();
    localStorage.setItem(CUSTOM_HOLIDAYS_KEY, JSON.stringify(holidays));
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a date string (YYYY-MM-DD) falls on a Sunday
 */
export function isSunday(dateStr) {
  if (!dateStr) return false;
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length < 3) return false;
  // Year, Month (0-indexed), Day
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.getDay() === 0;
}

/**
 * Check if a date string (YYYY-MM-DD) is a registered holiday
 */
export function getHolidayInfo(dateStr) {
  if (!dateStr) return { isHoliday: false, name: null };
  const cleanDate = dateStr.split('T')[0];
  const holidays = getAllHolidays();
  const name = holidays[cleanDate];
  return {
    isHoliday: Boolean(name),
    name: name || null
  };
}

const WORKING_DAY_OVERRIDES_KEY = 'sobhainfra_working_day_overrides';

/**
 * Retrieve all registered Special Working Day overrides (e.g. working Sundays, office open on holidays)
 */
export function getWorkingDayOverrides() {
  try {
    const raw = localStorage.getItem(WORKING_DAY_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Declare a specific Sunday or Holiday as a Special Working Day (Office Open as regular)
 * or revoke an override.
 */
export function setWorkingDayOverride(dateStr, isWorkingDay = true, reason = 'Office Open as Regular (Working Day)') {
  if (!dateStr) return false;
  const cleanDate = dateStr.split('T')[0];
  try {
    const current = getWorkingDayOverrides();
    if (isWorkingDay) {
      current[cleanDate] = {
        isWorkingDay: true,
        reason: reason.trim(),
        declaredAt: new Date().toISOString()
      };
    } else {
      delete current[cleanDate];
    }
    localStorage.setItem(WORKING_DAY_OVERRIDES_KEY, JSON.stringify(current));
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear a specific working day override
 */
export function clearWorkingDayOverride(dateStr) {
  return setWorkingDayOverride(dateStr, false);
}

/**
 * Check if a date string is declared as a special working day
 */
export function isSpecialWorkingDay(dateStr) {
  if (!dateStr) return false;
  const cleanDate = dateStr.split('T')[0];
  const overrides = getWorkingDayOverrides();
  return Boolean(overrides[cleanDate]?.isWorkingDay);
}

/**
 * Check complete day status: Sunday, Holiday, or Regular Working Day
 */
export function checkDayStatus(dateStr) {
  if (!dateStr) {
    return {
      isNonWorking: false,
      isSunday: false,
      isHoliday: false,
      isDeclaredWorkingDay: false,
      reason: null,
      nextWorkingDate: null
    };
  }
  const cleanDate = dateStr.split('T')[0];
  const sun = isSunday(cleanDate);
  const holiday = getHolidayInfo(cleanDate);
  const overrides = getWorkingDayOverrides();
  const overrideInfo = overrides[cleanDate];
  const isDeclaredWorkingDay = Boolean(overrideInfo?.isWorkingDay);

  let rawReason = null;
  if (sun && holiday.isHoliday) {
    rawReason = `Sunday & ${holiday.name}`;
  } else if (sun) {
    rawReason = 'Sunday';
  } else if (holiday.isHoliday) {
    rawReason = holiday.name;
  }

  // If declared as a special working day (Office Open as Regular), it is NOT non-working!
  const isNonWorking = (sun || holiday.isHoliday) && !isDeclaredWorkingDay;

  let reason = rawReason;
  if (isDeclaredWorkingDay) {
    reason = overrideInfo?.reason || `Office Open as Regular (${rawReason || 'Working Day'})`;
  }

  const nextWorkingDate = isNonWorking ? getNextWorkingDay(cleanDate) : cleanDate;

  return {
    isNonWorking,
    isSunday: sun,
    isHoliday: holiday.isHoliday,
    holidayName: holiday.name,
    isDeclaredWorkingDay,
    overrideReason: overrideInfo?.reason || null,
    rawReason,
    reason,
    nextWorkingDate
  };
}

/**
 * Find the next business/working day by skipping Sundays and registered Holidays
 */
export function getNextWorkingDay(dateStr) {
  if (!dateStr) {
    const today = new Date();
    dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }
  const parts = dateStr.split('T')[0].split('-');
  let d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

  // Advance by 1 day at a time until a non-Sunday, non-holiday is found (max 14 days lookahead)
  for (let i = 0; i < 14; i++) {
    d.setDate(d.getDate() + 1);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    const checkStr = `${yr}-${mo}-${da}`;

    const isSun = d.getDay() === 0;
    const isHol = Boolean(getAllHolidays()[checkStr]);

    if (!isSun && !isHol) {
      return checkStr;
    }
  }

  // Safety fallback: tomorrow
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 1);
  return `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, '0')}-${String(fallback.getDate()).padStart(2, '0')}`;
}

/**
 * Check if a task or routine template is flagged for exceptional Sunday/Holiday execution
 * (e.g. emergency concrete curing, material unloading, 24x7 security, weekend duty).
 */
export function isHolidayExceptionalTask(item) {
  if (!item) return false;
  if (item.run_on_holidays === true || item.is_holiday_work === true) return true;
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const tagMatch = tags.some(t => /holiday|sunday|weekend|emergency|urgent|24x7|security|shift|duty/i.test(t));
  if (tagMatch) return true;
  const title = (item.title || '').toLowerCase();
  return /emergency|unloading|security|24x7|shift duty|weekend work|holiday task/i.test(title);
}

