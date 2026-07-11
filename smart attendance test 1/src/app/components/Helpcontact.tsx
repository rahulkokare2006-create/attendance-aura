import React from 'react';
import { motion } from 'motion/react';
import { Mail, Phone, Building2, ArrowLeft, MessageCircle } from 'lucide-react';
import { Card } from './ui/card';
import { useTheme } from './ThemeContext';

interface HelpContactProps {
  onBack: () => void;
}

const companies = [
  {
    name: 'SHILARKO Pvt. Ltd.',
    person: 'Rahul Kokare',
    email: 'shilarkotech@gmail.com',
    phone: '6362617733',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    name: 'KUVIRA SOLUTIONS Pvt. Ltd.',
    person: 'Kushal Shetty',
    email: 'kuvirasolutions@gmail.com',
    phone: '6360107733',
    color: 'from-purple-500 to-pink-500',
  },
];

export default function HelpContact({ onBack }: HelpContactProps) {
  const { isDarkMode } = useTheme();
  const cardBg = isDarkMode ? 'bg-white/10 backdrop-blur-xl border-white/20' : 'bg-white border-gray-200';
  const textColor = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextColor = isDarkMode ? 'text-white/60' : 'text-gray-500';

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto">
      {/* Back button */}
      <button onClick={onBack}
        className={`flex items-center gap-2 mb-6 text-sm ${subTextColor} hover:${textColor} transition-colors`}>
        <ArrowLeft size={18} /> Back
      </button>

      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30">
          <MessageCircle className="w-10 h-10 text-white" />
        </div>
        <h2 className={`text-2xl font-bold ${textColor}`}>Help & Support</h2>
        <p className={`${subTextColor} mt-2`}>Need help? Reach out to our support teams below.</p>
      </div>

      {/* Company Cards */}
      <div className="space-y-4">
        {companies.map((company, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}>
            <Card className={`${cardBg} overflow-hidden`}>
              {/* Color bar */}
              <div className={`bg-gradient-to-r ${company.color} h-2`} />
              <div className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${company.color} flex items-center justify-center shadow`}>
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className={`font-bold text-lg ${textColor}`}>{company.name}</h3>
                    <p className={`text-sm font-medium ${isDarkMode ? 'text-blue-300' : 'text-blue-600'}`}>{company.person}</p>
                    <p className={`text-xs ${subTextColor}`}>Technical Support</p>
                  </div>
                </div>

                <div className="space-y-3 mb-5">
                  <div className={`flex items-center gap-3 ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'} rounded-xl p-3`}>
                    <Mail className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'} shrink-0`} />
                    <span className={`text-sm ${textColor} break-all`}>{company.email}</span>
                  </div>
                  <div className={`flex items-center gap-3 ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'} rounded-xl p-3`}>
                    <Phone className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-500'} shrink-0`} />
                    <span className={`text-sm ${textColor}`}>+91 {company.phone}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <a href={`mailto:${company.email}`}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all
                      bg-gradient-to-r ${company.color} text-white hover:opacity-90 shadow`}>
                    <Mail size={16} /> Send Email
                  </a>
                  <a href={`tel:+91${company.phone}`}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all border
                      ${isDarkMode ? 'border-white/20 text-white hover:bg-white/10' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                    <Phone size={16} /> Call Now
                  </a>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Footer note */}
      <p className={`text-center text-xs ${subTextColor} mt-6`}>
        Support available Monday–Saturday, 9 AM – 6 PM IST
      </p>
    </motion.div>
  );
}
