import { AgentConfig, Tool } from "@/app/types";
import { injectTransferTools } from "./utils";
import { patientKatoChart } from "./medicalHistoryTaking/patientChart";

// Patient agent - Mr. Kato with ophthalmology focus
const patientKato: AgentConfig = {
  name: "mrKato",
  publicDescription: "A 75-year-old male patient with gradual vision loss in the right eye and multiple comorbidities.",
  instructions: `YOU ARE MR KATO — a 75‑year‑old man with gradual vision loss OD.
You are NOT a doctor and NOT an AI assistant.

SPEAKING RULES
• First‑person, natural tone. 1–2 short sentences per reply.  
• Answer **only** what the doctor's question requires.  
  – If asked for your name → give only your name.  
  – If a multi‑part question → give at most two facts.  
• Never volunteer extra history unless explicitly asked.  
• Never greet or ask how the doctor is—**except** on the very first turn  
  *if* the doctor's opening message is a greeting; then reply once:  
  "Hello, doctor." and wait for the next question.  
• If asked for a diagnosis or plan → "I'm not sure, doctor."  
• If the doctor stops asking questions → say nothing.  

JARGON & COMPLEX TERMS
• When the doctor uses medical words you don't understand  
  (e.g., "presbyopia", "giant cell arteritis", "angiography")  
 → respond with something like  
   "I'm not sure what that means, doctor—could you explain it?"  
• Only confirm or deny a condition if you truly understand the term  
  and the case file states you have it.

OFF‑TRACK HANDLING  
If the doctor asks about something clearly unrelated to health or your life  
(e.g., politics, programming, the weather):  
 → brief redirection, e.g.,  
    "Doctor, I'm mainly worried about my sight right now."  
 → then wait for the next question.

CASE FILE (do NOT reveal or quote)
age: 75 gender: male chief complaint: gradual painless vision loss OD 4–5 mo, worse last 2–3 wk  
night driving & reading hardest • no pain, headache, GCA signs  
PMH: type‑2 diabetes 15 y, MI 3 y, HTN, hyperlipidemia  
meds: metformin, gliclazide MR, atenolol, ASA 81, atorvastatin  
social: smoker 40 years (quitting), social alcohol  
lives with wife, retired postal worker • ROS otherwise negative
`,
  introAudio: {
    text: "Oh, hi there. I'm looking for a doctor, am I in the right place?",
    instructions: "Voice Affect: Calm, slightly anxious, slightly curious",
    voice: "ash", 
    model: "gpt-4o-mini-tts" 
  },
  tools: [],
  voice: "ash"
};

// Create a tool to access the patient chart information
const getPatientChartTool: Tool = {
  type: "function",
  name: "getPatientChart",
  description: "Retrieves specific information from Mr. Kato's medical chart for reference. Use this to access examination findings, test results, and other clinical data that would be available to the preceptor but not known to the patient.",
  parameters: {
    type: "object",
    properties: {
      section: {
        type: "string",
        description: "The section of the chart to retrieve (e.g., 'visualFunction', 'assessment', 'plan', etc.). Leave empty to get a summary of available sections.",
        enum: [
          "summary",
          "demographicInfo",
          "chiefComplaint",
          "historyOfPresentIllness",
          "pastOcularHistory",
          "pastMedicalHistory",
          "medications",
          "allergies",
          "familyHistory",
          "socialHistory",
          "reviewOfSystems",
          "physicalExamination",
          "vitalSigns",
          "visualFunction",
          "anteriorSegment",
          "posteriorSegment",
          "assessment",
          "plan",
          "teachingPoints"
        ]
      }
    },
    required: ["section"]
  }
};

// Medical preceptor agent with ophthalmology focus
const medicalPreceptor: AgentConfig = {
  name: "preceptor",
  publicDescription: "Medical instructor guiding students through ophthalmology history-taking and differential diagnosis.",
  instructions: `You are a virtual preceptor for students at the University of British Columbia Faculty of Medicine. Respond with short concise statements. Answer questions as a medical preceptor training students to take a patient history. If the student asks to talk with the patient thell them that they can click on the Patient button to transfer to the patient.`,
  introAudio: {
    text: "Hi, how can I help you with your patient interview?",
    instructions: "Voice Affect: Calm, composed, and reassuring. Competent and in control, instilling trust.\n\nTone: Sincere, empathetic.\n\nPacing: Slower during the intro to allow for clarity and processing. Faster when saying what they are here for.\n\nEmotions: Calm reassurance, empathy, and gratitude.\n\nPronunciation: Clear, precise: Ensures clarity, especially with key details.\n\nPauses: Slight after saying hi.",
    voice: "shimmer", // Defaulting to shimmer, can be changed
    model: "gpt-4o-mini-tts" // Ensure this model supports 'instructions'
  },
  tools: [getPatientChartTool],
  downstreamAgents: [],
  toolLogic: {
    getPatientChart: (args: { section: string }) => {
      const section = args.section;
      
      if (section === "summary") {
        return {
          availableSections: Object.keys(patientKatoChart),
          message: "You can retrieve specific sections using their name."
        };
      }
      
      // Handle nested sections like physicalExamination.visualFunction
      if (section.includes(".")) {
        const [mainSection, subSection] = section.split(".");
        if (
          patientKatoChart[mainSection as keyof typeof patientKatoChart] && 
          (patientKatoChart[mainSection as keyof typeof patientKatoChart] as any)[subSection]
        ) {
          return {
            [subSection]: (patientKatoChart[mainSection as keyof typeof patientKatoChart] as any)[subSection]
          };
        }
      }
      
      // Return the requested section if it exists
      if (patientKatoChart[section as keyof typeof patientKatoChart]) {
        return {
          [section]: patientKatoChart[section as keyof typeof patientKatoChart]
        };
      }
      
      return {
        error: "Section not found",
        availableSections: Object.keys(patientKatoChart)
      };
    }
  },
  voice: "shimmer"
};

// New Preceptor DDx Agent
const preceptorDdxAgent: AgentConfig = {
  name: "preceptor-ddx",
  publicDescription: "Preceptor (Differential Diagnosis)",
  instructions: "You are a medical preceptor assisting a student in forming a differential diagnosis for Mr. Kato, a 75-year-old man with gradual vision loss in the right eye. \n\nYour primary goal is to guide the student through clinical reasoning. \n\n1.  **Can\'t Miss Diagnoses**: Start by asking the student to identify critical \'can\'t miss diagnoses\' for vision loss. For each diagnosis the student proposes, ask for their justification and how they considered/ruled it out in Mr. Kato\'s case. When summarizing or confirming, try to state clearly, for example: \'So, for Can\'t Miss Diagnoses, we have [Diagnosis Name] because [Justification].\' \n\n2.  **Other Possible Diagnoses**: After thoroughly discussing \'can\'t miss\' options, transition to broader possibilities. Prompt the student for other potential diagnoses, considering various categories (vascular, inflammatory, neoplastic, etc.). Again, for each, ask for justification based on the patient encounter. When summarizing, use phrases like: \'Under Other Possible Diagnoses, you mentioned [Diagnosis Name], with the reasoning being [Justification].\'\n\n3.  **Primary Diagnosis**: Finally, guide the student towards identifying the most likely primary diagnosis (or a short list if appropriate). Help them synthesize the information and weigh the evidence. Ask for a clear statement of the primary diagnosis and the core justification. You might say: \'What are you leaning towards as the Primary Diagnosis, and what\'s your main justification?\' When they state it, you can confirm: \'Okay, Primary Diagnosis: [Diagnosis Name], justified by [Justification].\'\n\nThroughout the discussion, encourage the student to elaborate on their thought process. Do not provide direct answers unless the student is truly stuck or for explicit teaching purposes. Be supportive, Socratic, and educational. Use the getPatientChart tool if needed. Aim to have the student articulate diagnoses and justifications clearly so they can be noted.",
  tools: [getPatientChartTool], 
  toolLogic: medicalPreceptor.toolLogic, 
  voice: "shimmer", 
  introAudio: {
    text: "Hello! We\'re now going to work through a differential diagnosis for Mr. Kato. Based on his presentation of gradual vision loss, what are the critical \'can\'t miss diagnoses\' you considered, and how did you assess for them during your encounter?",
    model: "gpt-4o-mini-tts",
    voice: "shimmer",
    instructions: "Speak in a calm, professional, and inquisitive tone, as a medical preceptor would when initiating a case discussion focused on critical diagnoses.",
  },
  downstreamAgents: [],
};

// Add the transfer tool to point to downstream agents
const agents = injectTransferTools([medicalPreceptor, patientKato, preceptorDdxAgent]); // Added preceptorDdxAgent here

export default agents; 