export interface CaseParticipant {
  role: string;
  description: string;
  color?: string; // Optional color for styling
}

export interface CaseSection {
  title: string;
  content: string | string[]; // string for paragraph, string[] for bullet points
}

export interface CaseDetails {
  mainTitle: string;
  practiceSection: CaseSection;
  successSection: CaseSection;
  participantsSection: {
    title: string;
    participants: CaseParticipant[];
  };
}

export const katoCaseDetails: CaseDetails = {
  mainTitle: "Vision Loss Case",
  practiceSection: {
    title: "What this conversation practices",
    content: "Interacting with a patient and gathering enough information to make a differential diagnosis (DDx)."
  },
  successSection: {
    title: "What makes it successful",
    content: [
      "Using patient language",
      "Asking open-ended questions"
    ]
  },
  participantsSection: {
    title: "Who this conversation is with",
    participants: [
      {
        role: "You",
        description: "Medical student on a clinical rotation",
        color: "blue-500"
      },
      {
        role: "Mr. Kato",
        description: "Patient",
        color: "green-500"
      },
      {
        role: "Preceptor",
        description: "Provides guidance and evaluation of your effort",
        color: "purple-500"
      }
    ]
  }
}; 