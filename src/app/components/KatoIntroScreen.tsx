import React from 'react';
import { katoCaseDetails, CaseParticipant } from '@/app/cases/kato/katoCaseData';

interface KatoIntroScreenProps {
  onStartWithPatient: () => void;
  onStartWithPreceptor: () => void;
}

const KatoIntroScreen: React.FC<KatoIntroScreenProps> = ({ onStartWithPatient, onStartWithPreceptor }) => {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100 p-8 text-gray-800">
      <div className="bg-white shadow-xl rounded-lg p-10 max-w-2xl w-full">
        <h1 className="text-4xl font-bold mb-6 text-center text-blue-600">{katoCaseDetails.mainTitle}</h1>
        
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-3 text-gray-700">{katoCaseDetails.practiceSection.title}</h2>
          <p className="text-lg leading-relaxed">
            {katoCaseDetails.practiceSection.content}
          </p>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-3 text-gray-700">{katoCaseDetails.successSection.title}</h2>
          {Array.isArray(katoCaseDetails.successSection.content) ? (
            <ul className="list-disc list-inside text-lg leading-relaxed space-y-1">
              {katoCaseDetails.successSection.content.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-lg leading-relaxed">{katoCaseDetails.successSection.content}</p>
          )}
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-3 text-gray-700">{katoCaseDetails.participantsSection.title}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            {katoCaseDetails.participantsSection.participants.map((participant: CaseParticipant, index: number) => (
              <div key={index}>
                <h3 className={`text-xl font-medium mb-1 text-${participant.color || 'gray-700'}`}>{participant.role}</h3>
                <p className="text-base">{participant.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mt-10">
          <button
            onClick={onStartWithPreceptor}
            className="px-8 py-3 bg-purple-500 text-white font-semibold rounded-lg shadow-md hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-opacity-75 transition-colors w-full sm:w-auto"
          >
            Ask the Preceptor Something
          </button>
          <button
            onClick={onStartWithPatient}
            className="px-8 py-3 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75 transition-colors w-full sm:w-auto"
          >
            Meet the Patient!
          </button>
        </div>
      </div>
    </div>
  );
};

export default KatoIntroScreen; 