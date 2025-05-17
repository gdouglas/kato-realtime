import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LuX } from 'react-icons/lu';
import { katoCaseDetails, CaseParticipant } from '@/app/cases/kato/katoCaseData';

interface CaseInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CaseInfoModal: React.FC<CaseInfoModalProps> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={onClose} // Close on overlay click
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="bg-white shadow-xl rounded-lg p-8 max-w-2xl w-full relative max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside modal
          >
            <button 
              onClick={onClose} 
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 transition-colors z-10"
              aria-label="Close modal"
            >
              <LuX size={24} />
            </button>

            <h1 className="text-3xl font-bold mb-6 text-center text-blue-600">{katoCaseDetails.mainTitle}</h1>
            
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2 text-gray-700">{katoCaseDetails.practiceSection.title}</h2>
              <p className="text-md leading-relaxed">
                {katoCaseDetails.practiceSection.content}
              </p>
            </div>

            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2 text-gray-700">{katoCaseDetails.successSection.title}</h2>
              {Array.isArray(katoCaseDetails.successSection.content) ? (
                <ul className="list-disc list-inside text-md leading-relaxed space-y-1">
                  {katoCaseDetails.successSection.content.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-md leading-relaxed">{katoCaseDetails.successSection.content}</p>
              )}
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-2 text-gray-700">{katoCaseDetails.participantsSection.title}</h2>
              <div className="space-y-3">
                {katoCaseDetails.participantsSection.participants.map((participant: CaseParticipant, index: number) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-md">
                    <h3 className={`text-lg font-medium text-${participant.color || 'gray-700'}`}>{participant.role}</h3>
                    <p className="text-sm text-gray-600">{participant.description}</p>
                  </div>
                ))}
              </div>
            </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CaseInfoModal; 