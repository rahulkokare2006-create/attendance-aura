import React, { useState, useEffect } from 'react';

interface CustomSelectProps {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  customPlaceholder?: string;
  required?: boolean;
  inputBg?: string;
  textColor?: string;
  className?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select option...',
  customPlaceholder = 'Enter custom value...',
  required = false,
  inputBg = 'bg-gray-50 border-gray-300 text-gray-900',
  textColor = 'text-gray-900',
  className = '',
}) => {
  const isPredefined = options.some(opt => opt.value === value);
  const [selectedOpt, setSelectedOpt] = useState<string>(() => {
    if (!value) return '';
    return isPredefined ? value : 'Other';
  });
  const [customVal, setCustomVal] = useState<string>(() => {
    return isPredefined ? '' : value;
  });

  useEffect(() => {
    if (value && !options.some(opt => opt.value === value)) {
      setSelectedOpt('Other');
      setCustomVal(value);
    } else if (value && options.some(opt => opt.value === value)) {
      setSelectedOpt(value);
      setCustomVal('');
    } else if (!value) {
      setSelectedOpt('');
      setCustomVal('');
    }
  }, [value, options]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedOpt(val);
    if (val !== 'Other') {
      setCustomVal('');
      onChange(val);
    } else {
      onChange(customVal.trim());
    }
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomVal(val);
    onChange(val);
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && <label className={`text-sm font-medium ${textColor} block`}>{label}</label>}
      <select
        value={selectedOpt}
        onChange={handleSelectChange}
        required={required && !value}
        className={`${inputBg} w-full p-2.5 rounded-lg border text-sm font-medium cursor-pointer`}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        <option value="Other">Other...</option>
      </select>

      {selectedOpt === 'Other' && (
        <input
          type="text"
          value={customVal}
          onChange={handleCustomChange}
          onBlur={() => onChange(customVal.trim())}
          required={required}
          placeholder={customPlaceholder}
          className={`${inputBg} w-full p-2.5 rounded-lg border text-sm mt-1.5 focus:ring-2 focus:ring-blue-500`}
        />
      )}
    </div>
  );
};

export default CustomSelect;
